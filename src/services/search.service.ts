import { Client } from '@elastic/elasticsearch';
import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';
import { config } from '@/config/environment';
import * as natural from 'natural';
import compromise from 'compromise';
// AWS services removed - using MinIO for storage

const prisma = new PrismaClient();

// Initialize Elasticsearch client
const elasticsearch = new Client({
  node: config.elasticsearch?.url || 'http://localhost:9200',
  auth: config.elasticsearch?.auth ? {
    username: config.elasticsearch.auth.username,
    password: config.elasticsearch.auth.password,
  } : undefined,
});

// AWS services removed - using MinIO for storage instead

// Initialize NLP components
const stemmer = natural.PorterStemmer;
const tokenizer = new natural.WordTokenizer();
const sentiment = new natural.SentimentAnalyzer('English', stemmer, 'afinn');

export interface SearchFilters {
  query?: string;
  categoryId?: string;
  subcategoryId?: string;
  location?: {
    latitude: number;
    longitude: number;
    radius?: number; // in kilometers
  };
  priceRange?: {
    min?: number;
    max?: number;
  };
  isService?: boolean;
  verificationTier?: string[];
  sortBy?: 'relevance' | 'price' | 'distance' | 'rating' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  searchType?: 'text' | 'voice' | 'visual' | 'natural';
  language?: 'en' | 'hi' | 'ta' | 'te' | 'bn' | 'mr';
  imageUrl?: string; // For visual search
  voiceQuery?: string; // For voice search
}

export interface VoiceSearchRequest {
  audioData: Buffer;
  language: 'en' | 'hi' | 'ta' | 'te' | 'bn' | 'mr';
  format: 'wav' | 'mp3' | 'ogg';
  encoding?: string;
  sampleRate?: number;
}

export interface VisualSearchRequest {
  imageUrl: string;
  searchType: 'similar' | 'text' | 'labels';
}

export interface NaturalLanguageQuery {
  originalQuery: string;
  processedQuery: string;
  intent: 'search' | 'compare' | 'buy' | 'info';
  entities: {
    product?: string;
    category?: string;
    price?: number;
    location?: string;
    brand?: string;
    features?: string[];
  };
  sentiment: 'positive' | 'negative' | 'neutral';
}

export interface SearchResult {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  isService: boolean;
  seller: {
    id: string;
    businessName: string;
    verificationTier: string;
    isVerified: boolean;
    location?: {
      latitude: number;
      longitude: number;
      address: string;
    };
  };
  category: {
    id: string;
    name: string;
    slug: string;
  };
  subcategory?: {
    id: string;
    name: string;
    slug: string;
  };
  media: Array<{
    url: string;
    mediaType: string;
    altText?: string;
  }>;
  distance?: number; // in kilometers
  score?: number; // relevance score
}

export interface NearbyBusinessResult {
  id: string;
  businessName: string;
  verificationTier: string;
  isVerified: boolean;
  location: {
    latitude: number;
    longitude: number;
    address: string;
  };
  distance: number;
  categories: string[];
  productCount: number;
  rating?: number;
  reviewCount?: number;
}

export class SearchService {
  private static readonly PRODUCTS_INDEX = 'vikareta_products';
  private static readonly BUSINESSES_INDEX = 'vikareta_businesses';
  
  // Language mappings for multi-language support
  private static readonly LANGUAGE_MAPPINGS = {
    'hi': { // Hindi
      'search': 'खोज',
      'buy': 'खरीद',
      'price': 'कीमत',
      'cheap': 'सस्ता',
      'expensive': 'महंगा',
      'good': 'अच्छा',
      'bad': 'बुरा',
      'near': 'पास',
      'far': 'दूर'
    },
    'ta': { // Tamil
      'search': 'தேடல்',
      'buy': 'வாங்க',
      'price': 'விலை',
      'cheap': 'மலிவான',
      'expensive': 'விலை உயர்ந்த',
      'good': 'நல்ல',
      'bad': 'கெட்ட',
      'near': 'அருகில்',
      'far': 'தூரம்'
    },
    'te': { // Telugu
      'search': 'వెతకండి',
      'buy': 'కొనుగోలు',
      'price': 'ధర',
      'cheap': 'చౌక',
      'expensive': 'ఖరీదైన',
      'good': 'మంచి',
      'bad': 'చెడు',
      'near': 'దగ్గర',
      'far': 'దూరం'
    },
    'bn': { // Bengali
      'search': 'অনুসন্ধান',
      'buy': 'কিনুন',
      'price': 'দাম',
      'cheap': 'সস্তা',
      'expensive': 'দামী',
      'good': 'ভাল',
      'bad': 'খারাপ',
      'near': 'কাছে',
      'far': 'দূরে'
    },
    'mr': { // Marathi
      'search': 'शोध',
      'buy': 'खरेदी',
      'price': 'किंमत',
      'cheap': 'स्वस्त',
      'expensive': 'महाग',
      'good': 'चांगला',
      'bad': 'वाईट',
      'near': 'जवळ',
      'far': 'दूर'
    }
  };

  /**
   * Process natural language query
   */
  static async processNaturalLanguageQuery(
    query: string, 
    language: string = 'en'
  ): Promise<NaturalLanguageQuery> {
    try {
      // Normalize and clean the query
      let processedQuery = query.toLowerCase().trim();
      
      // Translate common terms if not English
      if (language !== 'en' && this.LANGUAGE_MAPPINGS[language as keyof typeof this.LANGUAGE_MAPPINGS]) {
        const translations = this.LANGUAGE_MAPPINGS[language as keyof typeof this.LANGUAGE_MAPPINGS];
        Object.entries(translations).forEach(([english, local]) => {
          processedQuery = processedQuery.replace(new RegExp(local, 'gi'), english);
        });
      }

      // Use compromise for NLP processing
      const doc = compromise(processedQuery);
      
      // Extract entities
      const entities: NaturalLanguageQuery['entities'] = {};
      
      // Extract product names (nouns)
      const nouns = doc.nouns().out('array');
      if (nouns.length > 0) {
        entities.product = nouns[0];
      }
      
      // Extract price information
      const numbers = doc.numbers().out('array');
      const priceKeywords = ['price', 'cost', 'rupees', 'rs', 'inr', 'cheap', 'expensive'];
      if (numbers.length > 0 && priceKeywords.some(keyword => processedQuery.includes(keyword))) {
        entities.price = parseFloat(numbers[0].replace(/[^\d.]/g, ''));
      }
      
      // Extract location
      const places = doc.places().out('array');
      if (places.length > 0) {
        entities.location = places[0];
      }
      
      // Extract features/adjectives
      const adjectives = doc.adjectives().out('array');
      if (adjectives.length > 0) {
        entities.features = adjectives;
      }
      
      // Determine intent
      let intent: NaturalLanguageQuery['intent'] = 'search';
      if (processedQuery.includes('buy') || processedQuery.includes('purchase') || processedQuery.includes('order')) {
        intent = 'buy';
      } else if (processedQuery.includes('compare') || processedQuery.includes('vs') || processedQuery.includes('versus')) {
        intent = 'compare';
      } else if (processedQuery.includes('info') || processedQuery.includes('details') || processedQuery.includes('about')) {
        intent = 'info';
      }
      
      // Analyze sentiment
      const tokens = tokenizer.tokenize(processedQuery) || [];
      const stemmedTokens = tokens.map(token => stemmer.stem(token));
      const sentimentScore = sentiment.getSentiment(stemmedTokens);
      
      let sentimentLabel: 'positive' | 'negative' | 'neutral' = 'neutral';
      if (sentimentScore > 0.1) sentimentLabel = 'positive';
      else if (sentimentScore < -0.1) sentimentLabel = 'negative';
      
      // Build enhanced search query
      let enhancedQuery = processedQuery;
      
      // Add synonyms and related terms
      if (entities.product) {
        const synonyms = await this.getSynonyms(entities.product);
        enhancedQuery += ' ' + synonyms.join(' ');
      }
      
      return {
        originalQuery: query,
        processedQuery: enhancedQuery,
        intent,
        entities,
        sentiment: sentimentLabel,
      };
    } catch (error) {
      logger.error('Natural language processing failed:', error);
      return {
        originalQuery: query,
        processedQuery: query,
        intent: 'search',
        entities: {},
        sentiment: 'neutral',
      };
    }
  }

  /**
   * Get synonyms for a term (simplified implementation)
   */
  private static async getSynonyms(term: string): Promise<string[]> {
    // This is a simplified implementation. In production, you'd use a proper thesaurus API
    const synonymMap: { [key: string]: string[] } = {
      'phone': ['mobile', 'smartphone', 'cellphone', 'device'],
      'laptop': ['computer', 'notebook', 'pc'],
      'car': ['vehicle', 'automobile', 'auto'],
      'house': ['home', 'property', 'residence'],
      'food': ['meal', 'cuisine', 'dish'],
      'clothes': ['clothing', 'apparel', 'garments', 'wear'],
      'book': ['novel', 'publication', 'literature'],
      'medicine': ['drug', 'medication', 'pharmaceutical'],
    };
    
    return synonymMap[term.toLowerCase()] || [];
  }

  /**
   * Process voice search query
   */
  static async processVoiceSearch(voiceRequest: VoiceSearchRequest): Promise<string> {
    try {
      logger.info(`Processing voice search in language: ${voiceRequest.language}`);
      
      // Use Google Speech-to-Text API for voice recognition
      const { SpeechClient } = require('@google-cloud/speech');
      const speechClient = new SpeechClient({
        keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE,
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
      });

      // Convert audio data to the format expected by Google Speech API
      const audioBytes = voiceRequest.audioData.toString('base64');
      
      const request = {
        audio: {
          content: audioBytes,
        },
        config: {
          encoding: voiceRequest.encoding || 'WEBM_OPUS',
          sampleRateHertz: voiceRequest.sampleRate || 48000,
          languageCode: voiceRequest.language || 'en-IN',
          alternativeLanguageCodes: ['hi-IN', 'en-US'], // Support Hindi and English
          enableAutomaticPunctuation: true,
          enableWordTimeOffsets: false,
          model: 'latest_short', // Optimized for short audio clips
        },
      };

      // Perform speech recognition
      const [response] = await speechClient.recognize(request);
      const transcription = response.results
        ?.map((result: any) => result.alternatives[0].transcript)
        .join('\n') || '';

      if (!transcription) {
        logger.warn('No transcription received from speech service');
        return '';
      }

      logger.info(`Voice search transcribed: "${transcription}"`);
      
      // Clean and normalize the transcription
      const cleanedTranscription = transcription
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, ' ') // Remove special characters
        .replace(/\s+/g, ' '); // Normalize whitespace

      return cleanedTranscription;
    } catch (error) {
      logger.error('Voice search processing failed:', error);
      
      // Fallback: try to extract text from audio using a simpler method
      // or return empty string to let the client handle the error
      if ((error as any)?.code === 'UNAUTHENTICATED' || (error as any)?.code === 'PERMISSION_DENIED') {
        logger.warn('Speech API authentication failed, voice search disabled');
        return '';
      }
      
      throw error;
    }
  }

  /**
   * Process visual search (mock implementation - AWS Rekognition removed)
   */
  static async processVisualSearch(visualRequest: VisualSearchRequest): Promise<{
    labels: string[];
    text: string[];
    searchTerms: string[];
  }> {
    try {
      const { imageUrl, searchType } = visualRequest;
      
      // Mock implementation since AWS Rekognition is not being used
      const results = {
        labels: [] as string[],
        text: [] as string[],
        searchTerms: [] as string[],
      };
      
      // Mock labels based on search type
      if (searchType === 'similar' || searchType === 'labels') {
        results.labels = [
          'electronics', 'mobile', 'phone', 'device', 'technology',
          'gadget', 'smartphone', 'communication', 'portable'
        ];
      }
      
      // Mock text detection
      if (searchType === 'text') {
        results.text = [
          'brand name', 'model number', 'specifications',
          'price', 'features', 'description'
        ];
      }
      
      // Generate search terms from mock content
      results.searchTerms = [...results.labels, ...results.text]
        .filter(term => term.length > 2)
        .slice(0, 10);
      
      logger.info(`Visual search processed (mock): ${results.searchTerms.length} terms found`);
      return results;
    } catch (error) {
      logger.error('Visual search processing failed:', error);
      throw error;
    }
  }

  /**
   * Enhanced search with natural language processing
   */
  static async searchWithNLP(filters: SearchFilters): Promise<{
    results: SearchResult[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    nlpAnalysis?: NaturalLanguageQuery;
    visualAnalysis?: any;
    aggregations?: any;
  }> {
    try {
      let enhancedFilters = { ...filters };
      let nlpAnalysis: NaturalLanguageQuery | undefined;
      let visualAnalysis: any;
      
      // Process natural language query
      if (filters.query && filters.searchType === 'natural') {
        nlpAnalysis = await this.processNaturalLanguageQuery(
          filters.query, 
          filters.language || 'en'
        );
        enhancedFilters.query = nlpAnalysis.processedQuery;
        
        // Apply NLP insights to filters
        if (nlpAnalysis.entities.price) {
          enhancedFilters.priceRange = {
            ...enhancedFilters.priceRange,
            max: nlpAnalysis.entities.price,
          };
        }
        
        if (nlpAnalysis.entities.location) {
          // In production, you'd geocode the location
          logger.info(`Location entity detected: ${nlpAnalysis.entities.location}`);
        }
      }
      
      // Process voice search
      if (filters.voiceQuery && filters.searchType === 'voice') {
        // This would be implemented with actual voice processing
        enhancedFilters.query = filters.voiceQuery;
      }
      
      // Process visual search
      if (filters.imageUrl && filters.searchType === 'visual') {
        visualAnalysis = await this.processVisualSearch({
          imageUrl: filters.imageUrl,
          searchType: 'similar',
        });
        enhancedFilters.query = visualAnalysis.searchTerms.join(' ');
      }
      
      // Perform the actual search
      const searchResults = await this.searchProducts(enhancedFilters);
      
      return {
        ...searchResults,
        nlpAnalysis,
        visualAnalysis,
      };
    } catch (error) {
      logger.error('Enhanced search with NLP failed:', error);
      throw error;
    }
  }

  /**
   * Initialize Elasticsearch indices
   */
  static async initializeIndices(): Promise<void> {
    try {
      // Create products index
      const productsIndexExists = await elasticsearch.indices.exists({
        index: this.PRODUCTS_INDEX,
      });

      if (!productsIndexExists) {
        await elasticsearch.indices.create({
          index: this.PRODUCTS_INDEX,
          mappings: {
            properties: {
                id: { type: 'keyword' },
                title: { 
                  type: 'text',
                  analyzer: 'multilingual_analyzer',
                  fields: {
                    keyword: { type: 'keyword' },
                    suggest: { type: 'completion' },
                    english: { type: 'text', analyzer: 'english' },
                    hindi: { type: 'text', analyzer: 'hindi' },
                    standard: { type: 'text', analyzer: 'standard' }
                  }
                },
                description: { 
                  type: 'text', 
                  analyzer: 'multilingual_analyzer',
                  fields: {
                    english: { type: 'text', analyzer: 'english' },
                    hindi: { type: 'text', analyzer: 'hindi' }
                  }
                },
                price: { type: 'float' },
                currency: { type: 'keyword' },
                isService: { type: 'boolean' },
                status: { type: 'keyword' },
                categoryId: { type: 'keyword' },
                categoryName: { 
                  type: 'text',
                  analyzer: 'multilingual_analyzer',
                  fields: {
                    keyword: { type: 'keyword' },
                    suggest: { type: 'completion' }
                  }
                },
                subcategoryId: { type: 'keyword' },
                subcategoryName: { 
                  type: 'text',
                  analyzer: 'multilingual_analyzer',
                  fields: {
                    keyword: { type: 'keyword' }
                  }
                },
                sellerId: { type: 'keyword' },
                sellerBusinessName: { 
                  type: 'text',
                  analyzer: 'multilingual_analyzer',
                  fields: {
                    keyword: { type: 'keyword' },
                    suggest: { type: 'completion' }
                  }
                },
                sellerVerificationTier: { type: 'keyword' },
                sellerIsVerified: { type: 'boolean' },
                sellerLocation: { type: 'geo_point' },
                sellerAddress: { type: 'text', analyzer: 'multilingual_analyzer' },
                stockQuantity: { type: 'integer' },
                tags: { type: 'keyword' },
                features: { type: 'text', analyzer: 'multilingual_analyzer' },
                brand: { type: 'keyword' },
                model: { type: 'keyword' },
                specifications: { type: 'object' },
                imageLabels: { type: 'keyword' }, // For visual search
                searchKeywords: { type: 'text', analyzer: 'keyword_analyzer' },
                popularityScore: { type: 'float' },
                qualityScore: { type: 'float' },
                createdAt: { type: 'date' },
                updatedAt: { type: 'date' },
              },
            },
          settings: {
              analysis: {
                analyzer: {
                  multilingual_analyzer: {
                    type: 'custom',
                    tokenizer: 'standard',
                    filter: [
                      'lowercase',
                      'stop',
                      'snowball',
                      'hindi_stop',
                      'hindi_normalization',
                      'indic_normalization'
                    ],
                  },
                  hindi: {
                    type: 'custom',
                    tokenizer: 'standard',
                    filter: [
                      'lowercase',
                      'hindi_stop',
                      'hindi_normalization',
                      'indic_normalization'
                    ],
                  },
                  keyword_analyzer: {
                    type: 'custom',
                    tokenizer: 'keyword',
                    filter: ['lowercase'],
                  },
                },
                filter: {
                  hindi_stop: {
                    type: 'stop',
                    stopwords: ['का', 'के', 'की', 'को', 'से', 'में', 'पर', 'और', 'या', 'है', 'हैं', 'था', 'थे', 'होगा', 'होंगे']
                  },
                  hindi_normalization: {
                    type: 'indic_normalization'
                  },
                  indic_normalization: {
                    type: 'indic_normalization'
                  }
                },
              },
              'index.max_ngram_diff': 50,
            },
        });
        logger.info('Products index created successfully');
      }

      // Create businesses index
      const businessesIndexExists = await elasticsearch.indices.exists({
        index: this.BUSINESSES_INDEX,
      });

      if (!businessesIndexExists) {
        await elasticsearch.indices.create({
          index: this.BUSINESSES_INDEX,
          mappings: {
            properties: {
                id: { type: 'keyword' },
                businessName: { 
                  type: 'text',
                  fields: {
                    keyword: { type: 'keyword' },
                    suggest: { type: 'completion' }
                  }
                },
                verificationTier: { type: 'keyword' },
                isVerified: { type: 'boolean' },
                location: { type: 'geo_point' },
                address: { type: 'text' },
                categories: { type: 'keyword' },
                productCount: { type: 'integer' },
                rating: { type: 'float' },
                reviewCount: { type: 'integer' },
                createdAt: { type: 'date' },
              },
            },
        });
        logger.info('Businesses index created successfully');
      }
    } catch (error) {
      logger.error('Failed to initialize Elasticsearch indices:', error);
      throw error;
    }
  }

  /**
   * Index a product in Elasticsearch
   */
  static async indexProduct(productId: string): Promise<void> {
    try {
      const product = await prisma.product.findUnique({
        where: { id: productId },
        include: {
          seller: {
            select: {
              id: true,
              businessName: true,
              verificationTier: true,
              isVerified: true,
              // Note: In a real implementation, you'd have location data
            },
          },
          category: true,
          subcategory: true,
          media: {
            take: 5,
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      if (!product) {
        throw new Error('Product not found');
      }

      const document = {
        id: product.id,
        title: product.title,
        description: product.description,
        price: Number(product.price),
        currency: product.currency,
        isService: product.isService,
        status: product.status,
        categoryId: product.categoryId,
        categoryName: product.category.name,
        subcategoryId: product.subcategoryId,
        subcategoryName: product.subcategory?.name,
        sellerId: product.sellerId,
        sellerBusinessName: product.seller.businessName,
        sellerVerificationTier: product.seller.verificationTier,
        sellerIsVerified: product.seller.isVerified,
        // sellerLocation: product.seller.location ? {
        //   lat: product.seller.location.latitude,
        //   lon: product.seller.location.longitude,
        // } : null,
        // sellerAddress: product.seller.address,
        stockQuantity: product.stockQuantity,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      };

      await elasticsearch.index({
        index: this.PRODUCTS_INDEX,
        id: productId,
        document: document,
      });

      logger.info(`Product ${productId} indexed successfully`);
    } catch (error) {
      logger.error(`Failed to index product ${productId}:`, error);
      throw error;
    }
  }

  /**
   * Remove product from Elasticsearch index
   */
  static async removeProduct(productId: string): Promise<void> {
    try {
      await elasticsearch.delete({
        index: this.PRODUCTS_INDEX,
        id: productId,
      });

      logger.info(`Product ${productId} removed from index`);
    } catch (error) {
      if ((error as any).meta?.statusCode !== 404) {
        logger.error(`Failed to remove product ${productId} from index:`, error);
        throw error;
      }
    }
  }

  /**
   * Search products with advanced filtering
   */
  static async searchProducts(filters: SearchFilters): Promise<{
    results: SearchResult[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    aggregations?: any;
  }> {
    try {
      const {
        query,
        categoryId,
        subcategoryId,
        location,
        priceRange,
        isService,
        verificationTier,
        sortBy = 'relevance',
        sortOrder = 'desc',
        page = 1,
        limit = 20,
      } = filters;

      const must: any[] = [];
      const filter: any[] = [];
      const should: any[] = [];

      // Enhanced text search with multi-language support
      if (query) {
        const language = filters.language || 'en';
        
        // Multi-language search fields
        const searchFields = [
          'title^4',
          'title.english^3',
          'title.hindi^3',
          'description^2',
          'description.english^2',
          'description.hindi^2',
          'sellerBusinessName^2',
          'categoryName^2',
          'subcategoryName',
          'tags^2',
          'features',
          'brand^3',
          'model^3',
          'searchKeywords^2',
          'imageLabels'
        ];
        
        // Add language-specific boost
        if (language === 'hi') {
          searchFields.push('title.hindi^5', 'description.hindi^3');
        }
        
        must.push({
          multi_match: {
            query,
            fields: searchFields,
            type: 'best_fields',
            fuzziness: 'AUTO',
            operator: 'or',
            minimum_should_match: '75%',
          },
        });
        
        // Add phrase matching for exact matches
        should.push({
          multi_match: {
            query,
            fields: ['title^6', 'description^3'],
            type: 'phrase',
            boost: 2,
          },
        });
        
        // Add prefix matching for autocomplete-like behavior
        should.push({
          multi_match: {
            query,
            fields: ['title.keyword^3', 'categoryName.keyword^2'],
            type: 'phrase_prefix',
            boost: 1.5,
          },
        });
      }

      // Category filters
      if (categoryId) {
        filter.push({ term: { categoryId } });
      }
      if (subcategoryId) {
        filter.push({ term: { subcategoryId } });
      }

      // Service filter
      if (typeof isService === 'boolean') {
        filter.push({ term: { isService } });
      }

      // Price range filter
      if (priceRange) {
        const priceFilter: any = {};
        if (priceRange.min !== undefined) priceFilter.gte = priceRange.min;
        if (priceRange.max !== undefined) priceFilter.lte = priceRange.max;
        filter.push({ range: { price: priceFilter } });
      }

      // Verification tier filter
      if (verificationTier && verificationTier.length > 0) {
        filter.push({ terms: { sellerVerificationTier: verificationTier } });
      }

      // Active products only
      filter.push({ term: { status: 'active' } });
      filter.push({ range: { stockQuantity: { gt: 0 } } });

      // Location-based search
      if (location) {
        const geoQuery = {
          geo_distance: {
            distance: `${location.radius || 50}km`,
            sellerLocation: {
              lat: location.latitude,
              lon: location.longitude,
            },
          },
        };
        filter.push(geoQuery);
      }

      // Build sort
      const sort: any[] = [];
      if (sortBy === 'relevance' && query) {
        sort.push({ _score: { order: sortOrder } });
      } else if (sortBy === 'price') {
        sort.push({ price: { order: sortOrder } });
      } else if (sortBy === 'distance' && location) {
        sort.push({
          _geo_distance: {
            sellerLocation: {
              lat: location.latitude,
              lon: location.longitude,
            },
            order: sortOrder,
            unit: 'km',
          },
        });
      } else if (sortBy === 'createdAt') {
        sort.push({ createdAt: { order: sortOrder } });
      }

      // Default sort by relevance or creation date
      if (sort.length === 0) {
        sort.push({ createdAt: { order: 'desc' } });
      }

      const searchBody: any = {
        query: {
          bool: {
            must: must.length > 0 ? must : [{ match_all: {} }],
            filter,
            should,
          },
        },
        sort,
        from: (page - 1) * limit,
        size: limit,
        _source: true,
      };

      // Add aggregations for faceted search
      searchBody.aggs = {
        categories: {
          terms: { field: 'categoryName', size: 20 },
        },
        priceRanges: {
          range: {
            field: 'price',
            ranges: [
              { to: 1000 },
              { from: 1000, to: 5000 },
              { from: 5000, to: 10000 },
              { from: 10000, to: 50000 },
              { from: 50000 },
            ],
          },
        },
        verificationTiers: {
          terms: { field: 'sellerVerificationTier', size: 10 },
        },
      };

      const response = await elasticsearch.search({
        index: this.PRODUCTS_INDEX,
        ...searchBody,
      });

      const results: SearchResult[] = (response.hits?.hits || []).map((hit: any) => {
        const source = hit._source;
        const result: SearchResult = {
          id: source.id,
          title: source.title,
          description: source.description,
          price: source.price,
          currency: source.currency,
          isService: source.isService,
          seller: {
            id: source.sellerId,
            businessName: source.sellerBusinessName,
            verificationTier: source.sellerVerificationTier,
            isVerified: source.sellerIsVerified,
            location: source.sellerLocation ? {
              latitude: source.sellerLocation.lat,
              longitude: source.sellerLocation.lon,
              address: source.sellerAddress,
            } : undefined,
          },
          category: {
            id: source.categoryId,
            name: source.categoryName,
            slug: source.categoryName.toLowerCase().replace(/\s+/g, '-'),
          },
          subcategory: source.subcategoryId ? {
            id: source.subcategoryId,
            name: source.subcategoryName,
            slug: source.subcategoryName.toLowerCase().replace(/\s+/g, '-'),
          } : undefined,
          media: [], // Would be populated from the database
          score: hit._score,
        };

        // Add distance if location-based search
        if (location && hit.sort && hit.sort.length > 0) {
          result.distance = hit.sort[0];
        }

        return result;
      });

      const total = typeof response.hits?.total === 'object' ? response.hits.total.value : response.hits?.total || 0;
      const totalPages = Math.ceil(total / limit);

      return {
        results,
        total,
        page,
        limit,
        totalPages,
        aggregations: response.aggregations,
      };
    } catch (error) {
      logger.error('Product search failed:', error);
      throw error;
    }
  }

  /**
   * Get intelligent search suggestions with multi-language support
   */
  static async getSearchSuggestions(
    query: string, 
    limit: number = 10,
    language: string = 'en'
  ): Promise<{
    suggestions: string[];
    categories: string[];
    brands: string[];
    trending: string[];
  }> {
    try {
      const response = await elasticsearch.search({
        index: this.PRODUCTS_INDEX,
        suggest: {
          product_suggest: {
            prefix: query,
            completion: {
              field: 'title.suggest',
              size: limit,
            },
          },
          category_suggest: {
            prefix: query,
            completion: {
              field: 'categoryName.suggest',
              size: 5,
            },
          },
          business_suggest: {
            prefix: query,
            completion: {
              field: 'sellerBusinessName.suggest',
              size: 5,
            },
          },
        },
        aggs: {
          popular_terms: {
            terms: {
              field: 'searchKeywords',
              size: 5,
              include: `.*${query}.*`,
            },
          },
          trending_categories: {
            terms: {
              field: 'categoryName.keyword',
              size: 3,
            },
          },
        },
        _source: false,
      });

      const suggestions = (Array.isArray(response.suggest?.product_suggest?.[0]?.options) 
        ? response.suggest.product_suggest[0].options 
        : []).map((option: any) => option.text);
      
      const categories = (Array.isArray(response.suggest?.category_suggest?.[0]?.options) 
        ? response.suggest.category_suggest[0].options 
        : []).map((option: any) => option.text);
      
      const brands = (Array.isArray(response.suggest?.business_suggest?.[0]?.options) 
        ? response.suggest.business_suggest[0].options 
        : []).map((option: any) => option.text);
      
      const trending = (response.aggregations?.popular_terms as any)?.buckets?.map(
        (bucket: any) => bucket.key
      ) || [];

      return {
        suggestions,
        categories,
        brands,
        trending,
      };
    } catch (error) {
      logger.error('Search suggestions failed:', error);
      return {
        suggestions: [],
        categories: [],
        brands: [],
        trending: [],
      };
    }
  }

  /**
   * Get voice search suggestions
   */
  static async getVoiceSearchSuggestions(
    audioData: Buffer,
    language: string = 'en'
  ): Promise<string[]> {
    try {
      // Process voice to text
      const voiceRequest: VoiceSearchRequest = {
        audioData,
        language: language as any,
        format: 'wav',
      };
      
      const transcribedText = await this.processVoiceSearch(voiceRequest);
      
      // Get suggestions based on transcribed text
      const suggestions = await this.getSearchSuggestions(transcribedText, 10, language);
      
      return suggestions.suggestions;
    } catch (error) {
      logger.error('Voice search suggestions failed:', error);
      return [];
    }
  }

  /**
   * Find nearby businesses
   */
  static async findNearbyBusinesses(
    latitude: number,
    longitude: number,
    radius: number = 10,
    limit: number = 20
  ): Promise<NearbyBusinessResult[]> {
    try {
      // For now, we'll use database query since we don't have location data in the schema
      // In a real implementation, you'd have location fields in the user table
      
      // This is a simplified version - you'd need to add location fields to your schema
      const businesses = await prisma.user.findMany({
        where: {
          businessName: { not: null },
          // location: {
          //   // Use PostGIS or similar for geo queries
          // }
        },
        select: {
          id: true,
          businessName: true,
          verificationTier: true,
          isVerified: true,
          products: {
            select: {
              category: {
                select: { name: true }
              }
            }
          },
          _count: {
            select: { products: true }
          }
        },
        take: limit,
      });

      // Transform to NearbyBusinessResult format
      const results: NearbyBusinessResult[] = businesses.map(business => ({
        id: business.id,
        businessName: business.businessName || '',
        verificationTier: business.verificationTier,
        isVerified: business.isVerified,
        location: {
          latitude: 0, // Would come from actual location data
          longitude: 0,
          address: '', // Would come from actual address data
        },
        distance: 0, // Would be calculated from actual coordinates
        categories: Array.from(new Set(business.products.map(p => p.category.name))),
        productCount: business._count.products,
        rating: undefined, // Would come from reviews
        reviewCount: undefined,
      }));

      return results;
    } catch (error) {
      logger.error('Nearby businesses search failed:', error);
      throw error;
    }
  }

  /**
   * Get popular/trending products
   */
  static async getPopularProducts(
    categoryId?: string,
    limit: number = 20
  ): Promise<SearchResult[]> {
    try {
      const filter: any[] = [
        { term: { status: 'active' } },
        { range: { stockQuantity: { gt: 0 } } },
      ];

      if (categoryId) {
        filter.push({ term: { categoryId } });
      }

      const response = await elasticsearch.search({
        index: this.PRODUCTS_INDEX,
        query: {
          bool: { filter },
        },
        sort: [
          { createdAt: { order: 'desc' } }, // Recent products
          { _score: { order: 'desc' } },
        ],
        size: limit,
      });

      return (response.hits?.hits || []).map((hit: any) => {
        const source = hit._source;
        return {
          id: source.id,
          title: source.title,
          description: source.description,
          price: source.price,
          currency: source.currency,
          isService: source.isService,
          seller: {
            id: source.sellerId,
            businessName: source.sellerBusinessName,
            verificationTier: source.sellerVerificationTier,
            isVerified: source.sellerIsVerified,
          },
          category: {
            id: source.categoryId,
            name: source.categoryName,
            slug: source.categoryName.toLowerCase().replace(/\s+/g, '-'),
          },
          subcategory: source.subcategoryId ? {
            id: source.subcategoryId,
            name: source.subcategoryName,
            slug: source.subcategoryName.toLowerCase().replace(/\s+/g, '-'),
          } : undefined,
          media: [],
          score: hit._score,
        };
      });
    } catch (error) {
      logger.error('Popular products search failed:', error);
      throw error;
    }
  }

  /**
   * Bulk index products
   */
  static async bulkIndexProducts(productIds: string[]): Promise<void> {
    try {
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        include: {
          seller: {
            select: {
              id: true,
              businessName: true,
              verificationTier: true,
              isVerified: true,
            },
          },
          category: true,
          subcategory: true,
        },
      });

      const body = products.flatMap(product => [
        { index: { _index: this.PRODUCTS_INDEX, _id: product.id } },
        {
          id: product.id,
          title: product.title,
          description: product.description,
          price: Number(product.price),
          currency: product.currency,
          isService: product.isService,
          status: product.status,
          categoryId: product.categoryId,
          categoryName: product.category.name,
          subcategoryId: product.subcategoryId,
          subcategoryName: product.subcategory?.name,
          sellerId: product.sellerId,
          sellerBusinessName: product.seller.businessName,
          sellerVerificationTier: product.seller.verificationTier,
          sellerIsVerified: product.seller.isVerified,
          stockQuantity: product.stockQuantity,
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
        },
      ]);

      if (body.length > 0) {
        await elasticsearch.bulk({ 
          index: this.PRODUCTS_INDEX,
          operations: body 
        });
        logger.info(`Bulk indexed ${products.length} products`);
      }
    } catch (error) {
      logger.error('Bulk indexing failed:', error);
      throw error;
    }
  }

  /**
   * Reindex all products
   */
  static async reindexAllProducts(): Promise<void> {
    try {
      // Delete existing index
      try {
        await elasticsearch.indices.delete({ index: this.PRODUCTS_INDEX });
      } catch (error) {
        // Index might not exist
      }

      // Recreate index
      await this.initializeIndices();

      // Get all product IDs
      const products = await prisma.product.findMany({
        select: { id: true },
        where: { status: 'active' },
      });

      const productIds = products.map(p => p.id);

      // Bulk index in batches
      const batchSize = 100;
      for (let i = 0; i < productIds.length; i += batchSize) {
        const batch = productIds.slice(i, i + batchSize);
        await this.bulkIndexProducts(batch);
      }

      logger.info(`Reindexed ${productIds.length} products`);
    } catch (error) {
      logger.error('Reindexing failed:', error);
      throw error;
    }
  }
}

export const searchService = new SearchService();