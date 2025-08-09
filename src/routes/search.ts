import { Router, Request, Response } from 'express';
import { query, body, validationResult } from 'express-validator';
import { SearchService } from '@/services/search.service';
import { logger } from '@/utils/logger';
import multer from 'multer';

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and audio files are allowed'));
    }
  },
});

const router = Router();

// Validation middleware
const handleValidationErrors = (req: Request, res: Response, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        details: errors.array(),
      },
    });
  }
  return next();
};

// GET /api/search/products - Search products with advanced filtering
router.get('/products', [
  query('q').optional().isString().withMessage('Query must be a string'),
  query('categoryId').optional().isUUID().withMessage('Category ID must be a valid UUID'),
  query('subcategoryId').optional().isUUID().withMessage('Subcategory ID must be a valid UUID'),
  query('latitude').optional().isFloat().withMessage('Latitude must be a number'),
  query('longitude').optional().isFloat().withMessage('Longitude must be a number'),
  query('radius').optional().isFloat({ min: 0.1, max: 1000 }).withMessage('Radius must be between 0.1 and 1000 km'),
  query('minPrice').optional().isFloat({ min: 0 }).withMessage('Min price must be non-negative'),
  query('maxPrice').optional().isFloat({ min: 0 }).withMessage('Max price must be non-negative'),
  query('isService').optional().isBoolean().withMessage('isService must be a boolean'),
  query('verificationTier').optional().isString().withMessage('Verification tier must be a string'),
  query('sortBy').optional().isIn(['relevance', 'price', 'distance', 'rating', 'createdAt']).withMessage('Invalid sort field'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('searchType').optional().isIn(['text', 'voice', 'visual', 'natural']).withMessage('Invalid search type'),
  query('language').optional().isIn(['en', 'hi', 'ta', 'te', 'bn', 'mr']).withMessage('Invalid language'),
  query('imageUrl').optional().isURL().withMessage('Image URL must be valid'),
  query('voiceQuery').optional().isString().withMessage('Voice query must be a string'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const filters: any = {
      query: req.query.q as string,
      categoryId: req.query.categoryId as string,
      subcategoryId: req.query.subcategoryId as string,
      isService: req.query.isService === 'true' ? true : req.query.isService === 'false' ? false : undefined,
      sortBy: req.query.sortBy as any || 'relevance',
      sortOrder: req.query.sortOrder as 'asc' | 'desc' || 'desc',
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      searchType: req.query.searchType as any || 'text',
      language: req.query.language as any || 'en',
      imageUrl: req.query.imageUrl as string,
      voiceQuery: req.query.voiceQuery as string,
    };

    // Handle location-based search
    if (req.query.latitude && req.query.longitude) {
      filters.location = {
        latitude: parseFloat(req.query.latitude as string),
        longitude: parseFloat(req.query.longitude as string),
        radius: req.query.radius ? parseFloat(req.query.radius as string) : 50,
      };
    }

    // Handle price range
    if (req.query.minPrice || req.query.maxPrice) {
      filters.priceRange = {};
      if (req.query.minPrice) filters.priceRange.min = parseFloat(req.query.minPrice as string);
      if (req.query.maxPrice) filters.priceRange.max = parseFloat(req.query.maxPrice as string);
    }

    // Handle verification tier filter
    if (req.query.verificationTier) {
      const tiers = (req.query.verificationTier as string).split(',').map(t => t.trim());
      filters.verificationTier = tiers;
    }

    // Use enhanced search for natural language, voice, or visual search
    const result = filters.searchType !== 'text' 
      ? await SearchService.searchWithNLP(filters)
      : await SearchService.searchProducts(filters);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Product search failed:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'SEARCH_FAILED',
        message: 'Product search failed',
      },
    });
  }
});

// GET /api/search/suggestions - Get intelligent search suggestions
router.get('/suggestions', [
  query('q').isString().isLength({ min: 1 }).withMessage('Query is required'),
  query('limit').optional().isInt({ min: 1, max: 20 }).withMessage('Limit must be between 1 and 20'),
  query('language').optional().isIn(['en', 'hi', 'ta', 'te', 'bn', 'mr']).withMessage('Invalid language'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const language = req.query.language as string || 'en';

    const suggestions = await SearchService.getSearchSuggestions(query, limit, language);

    return res.json({
      success: true,
      data: suggestions,
    });
  } catch (error) {
    logger.error('Search suggestions failed:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'SUGGESTIONS_FAILED',
        message: 'Failed to get search suggestions',
      },
    });
  }
});

// POST /api/search/voice - Voice search
router.post('/voice', upload.single('audio'), [
  body('language').optional().isIn(['en', 'hi', 'ta', 'te', 'bn', 'mr']).withMessage('Invalid language'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_AUDIO',
          message: 'Audio file is required',
        },
      });
    }

    const language = req.body.language || 'en';
    const suggestions = await SearchService.getVoiceSearchSuggestions(req.file.buffer, language);

    return res.json({
      success: true,
      data: {
        suggestions,
        language,
      },
    });
  } catch (error) {
    logger.error('Voice search failed:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'VOICE_SEARCH_FAILED',
        message: 'Voice search processing failed',
      },
    });
  }
});

// POST /api/search/visual - Visual search
router.post('/visual', upload.single('image'), [
  body('searchType').optional().isIn(['similar', 'text', 'labels']).withMessage('Invalid search type'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    if (!req.file && !req.body.imageUrl) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_IMAGE',
          message: 'Image file or URL is required',
        },
      });
    }

    let imageUrl = req.body.imageUrl;
    
    // If file uploaded, you'd typically upload to S3 and get URL
    if (req.file) {
      // For demo purposes, we'll use a placeholder URL
      imageUrl = 'https://example.com/uploaded-image.jpg';
    }

    const searchType = req.body.searchType || 'similar';
    const visualAnalysis = await SearchService.processVisualSearch({
      imageUrl,
      searchType,
    });

    // Perform search based on visual analysis
    const searchResults = await SearchService.searchProducts({
      query: visualAnalysis.searchTerms.join(' '),
      searchType: 'visual',
      limit: 20,
    });

    return res.json({
      success: true,
      data: {
        visualAnalysis,
        searchResults,
      },
    });
  } catch (error) {
    logger.error('Visual search failed:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'VISUAL_SEARCH_FAILED',
        message: 'Visual search processing failed',
      },
    });
  }
});

// POST /api/search/natural - Natural language search
router.post('/natural', [
  body('query').isString().isLength({ min: 1 }).withMessage('Query is required'),
  body('language').optional().isIn(['en', 'hi', 'ta', 'te', 'bn', 'mr']).withMessage('Invalid language'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const { query, language = 'en' } = req.body;

    const nlpAnalysis = await SearchService.processNaturalLanguageQuery(query, language);
    
    const searchResults = await SearchService.searchWithNLP({
      query,
      language,
      searchType: 'natural',
      limit: 20,
    });

    return res.json({
      success: true,
      data: {
        nlpAnalysis,
        searchResults,
      },
    });
  } catch (error) {
    logger.error('Natural language search failed:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'NLP_SEARCH_FAILED',
        message: 'Natural language search processing failed',
      },
    });
  }
});

// GET /api/search/nearby-businesses - Find nearby businesses
router.get('/nearby-businesses', [
  query('latitude').isFloat().withMessage('Latitude is required and must be a number'),
  query('longitude').isFloat().withMessage('Longitude is required and must be a number'),
  query('radius').optional().isFloat({ min: 0.1, max: 1000 }).withMessage('Radius must be between 0.1 and 1000 km'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const latitude = parseFloat(req.query.latitude as string);
    const longitude = parseFloat(req.query.longitude as string);
    const radius = req.query.radius ? parseFloat(req.query.radius as string) : 10;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

    const businesses = await SearchService.findNearbyBusinesses(latitude, longitude, radius, limit);

    return res.json({
      success: true,
      data: businesses,
    });
  } catch (error) {
    logger.error('Nearby businesses search failed:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'NEARBY_SEARCH_FAILED',
        message: 'Failed to find nearby businesses',
      },
    });
  }
});

// GET /api/search/popular - Get popular/trending products
router.get('/popular', [
  query('categoryId').optional().isUUID().withMessage('Category ID must be a valid UUID'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const categoryId = req.query.categoryId as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

    const products = await SearchService.getPopularProducts(categoryId, limit);

    return res.json({
      success: true,
      data: products,
    });
  } catch (error) {
    logger.error('Popular products search failed:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'POPULAR_SEARCH_FAILED',
        message: 'Failed to get popular products',
      },
    });
  }
});

// POST /api/search/reindex - Reindex all products (admin only)
router.post('/reindex', async (req: Request, res: Response) => {
  try {
    // Note: In a real implementation, you'd check for admin authentication
    await SearchService.reindexAllProducts();

    return res.json({
      success: true,
      message: 'Products reindexed successfully',
    });
  } catch (error) {
    logger.error('Reindexing failed:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'REINDEX_FAILED',
        message: 'Failed to reindex products',
      },
    });
  }
});

export { router as searchRoutes };