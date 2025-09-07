import { Client } from '@elastic/elasticsearch';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';

// Create Elasticsearch client
export const elasticsearchClient = new Client({
  node: config.elasticsearch.url,
  auth: config.elasticsearch.username && config.elasticsearch.password ? {
    username: config.elasticsearch.username,
    password: config.elasticsearch.password,
  } : undefined,
  requestTimeout: 30000,
  pingTimeout: 3000,
  maxRetries: 3,
  tls: {
    rejectUnauthorized: false, // Allow self-signed certificates
  },
});

// Elasticsearch indices configuration
export const INDICES = {
  PRODUCTS: 'vikareta_products',
  SERVICES: 'vikareta_services',
  USERS: 'vikareta_users',
  ORDERS: 'vikareta_orders',
  RFQS: 'vikareta_rfqs',
  ANALYTICS: 'vikareta_analytics',
} as const;

// Index mappings
const productMapping = {
  properties: {
    id: { type: 'keyword' },
    title: { 
      type: 'text',
      analyzer: 'standard',
      fields: {
        keyword: { type: 'keyword' },
        suggest: { type: 'completion' }
      }
    },
    description: { 
      type: 'text',
      analyzer: 'standard'
    },
    categoryId: { type: 'keyword' },
    subcategoryId: { type: 'keyword' },
    sellerId: { type: 'keyword' },
    price: { type: 'double' },
    currency: { type: 'keyword' },
    stockQuantity: { type: 'integer' },
    minOrderQuantity: { type: 'integer' },
    sku: { type: 'keyword' },
    isActive: { type: 'boolean' },
    status: { type: 'keyword' },
    images: { type: 'keyword' },
    weight: { type: 'double' },
    isService: { type: 'boolean' },
    createdAt: { type: 'date' },
    updatedAt: { type: 'date' },
    // Nested objects
    seller: {
      type: 'object',
      properties: {
        id: { type: 'keyword' },
        businessName: { type: 'text' },
        location: { type: 'text' },
        city: { type: 'keyword' },
        state: { type: 'keyword' },
        country: { type: 'keyword' },
        verificationTier: { type: 'keyword' },
        isVerified: { type: 'boolean' }
      }
    },
    category: {
      type: 'object',
      properties: {
        id: { type: 'keyword' },
        name: { type: 'text' },
        slug: { type: 'keyword' }
      }
    },
    subcategory: {
      type: 'object',
      properties: {
        id: { type: 'keyword' },
        name: { type: 'text' },
        slug: { type: 'keyword' }
      }
    }
  }
};

const serviceMapping = {
  properties: {
    id: { type: 'keyword' },
    title: { 
      type: 'text',
      analyzer: 'standard',
      fields: {
        keyword: { type: 'keyword' },
        suggest: { type: 'completion' }
      }
    },
    description: { 
      type: 'text',
      analyzer: 'standard'
    },
    categoryId: { type: 'keyword' },
    subcategoryId: { type: 'keyword' },
    providerId: { type: 'keyword' },
    price: { type: 'double' },
    currency: { type: 'keyword' },
    duration: { type: 'text' },
    serviceType: { type: 'keyword' },
    isActive: { type: 'boolean' },
    status: { type: 'keyword' },
    images: { type: 'keyword' },
    availability: { type: 'object' },
    location: { type: 'object' },
    createdAt: { type: 'date' },
    updatedAt: { type: 'date' },
    // Nested objects
    provider: {
      type: 'object',
      properties: {
        id: { type: 'keyword' },
        businessName: { type: 'text' },
        location: { type: 'text' },
        city: { type: 'keyword' },
        state: { type: 'keyword' },
        country: { type: 'keyword' },
        verificationTier: { type: 'keyword' },
        isVerified: { type: 'boolean' }
      }
    }
  }
};

const userMapping = {
  properties: {
    id: { type: 'keyword' },
    email: { type: 'keyword' },
    phone: { type: 'keyword' },
    firstName: { type: 'text' },
    lastName: { type: 'text' },
    businessName: { 
      type: 'text',
      fields: {
        keyword: { type: 'keyword' },
        suggest: { type: 'completion' }
      }
    },
    gstin: { type: 'keyword' },
    userType: { type: 'keyword' },
    role: { type: 'keyword' },
    verificationTier: { type: 'keyword' },
    isVerified: { type: 'boolean' },
    isActive: { type: 'boolean' },
    location: { type: 'text' },
    city: { type: 'keyword' },
    state: { type: 'keyword' },
    country: { type: 'keyword' },
    postalCode: { type: 'keyword' },
    latitude: { type: 'double' },
    longitude: { type: 'double' },
    createdAt: { type: 'date' },
    updatedAt: { type: 'date' }
  }
};

const rfqMapping = {
  properties: {
    id: { type: 'keyword' },
    buyerId: { type: 'keyword' },
    title: { 
      type: 'text',
      analyzer: 'standard',
      fields: {
        keyword: { type: 'keyword' },
        suggest: { type: 'completion' }
      }
    },
    description: { 
      type: 'text',
      analyzer: 'standard'
    },
    categoryId: { type: 'keyword' },
    subcategoryId: { type: 'keyword' },
    quantity: { type: 'integer' },
    budgetMin: { type: 'double' },
    budgetMax: { type: 'double' },
    deliveryTimeline: { type: 'text' },
    deliveryLocation: { type: 'text' },
    status: { type: 'keyword' },
    expiresAt: { type: 'date' },
    createdAt: { type: 'date' },
    // Nested objects
    buyer: {
      type: 'object',
      properties: {
        id: { type: 'keyword' },
        businessName: { type: 'text' },
        location: { type: 'text' },
        city: { type: 'keyword' },
        state: { type: 'keyword' },
        country: { type: 'keyword' },
        verificationTier: { type: 'keyword' },
        isVerified: { type: 'boolean' }
      }
    }
  }
};

// Elasticsearch helper functions
export const elasticsearchHelper = {
  // Initialize indices
  async initializeIndices(): Promise<void> {
    try {
      const indices = [
        { name: INDICES.PRODUCTS, mapping: productMapping },
        { name: INDICES.SERVICES, mapping: serviceMapping },
        { name: INDICES.USERS, mapping: userMapping },
        { name: INDICES.RFQS, mapping: rfqMapping },
      ];

      for (const index of indices) {
        const exists = (await elasticsearchClient.indices.exists({ index: index.name })) as any;
        const existsFlag = typeof exists === 'boolean' ? exists : exists.body;
        if (!existsFlag) {
          await elasticsearchClient.indices.create(({
            index: index.name,
            body: {
              mappings: index.mapping,
              settings: {
                number_of_shards: 1,
                number_of_replicas: 0,
                analysis: {
                  analyzer: {
                    custom_analyzer: {
                      type: 'custom',
                      tokenizer: 'standard',
                      filter: ['lowercase', 'stop', 'snowball']
                    }
                  }
                }
              }
            }
          }) as any);
          logger.info(`Elasticsearch index created: ${index.name}`);
        }
      }
    } catch (error) {
      logger.error('Failed to initialize Elasticsearch indices:', error);
      throw error;
    }
  },

  // Index document
  async indexDocument(index: string, id: string, document: any): Promise<void> {
    try {
      await elasticsearchClient.index({
        index,
        id,
        body: document,
        refresh: 'wait_for'
      });
    } catch (error) {
      logger.error(`Failed to index document ${id} in ${index}:`, error);
      throw error;
    }
  },

  // Update document
  async updateDocument(index: string, id: string, document: any): Promise<void> {
    try {
      await (elasticsearchClient.update as any)({
        index,
        id,
        body: { doc: document },
        refresh: 'wait_for'
      });
    } catch (error) {
      logger.error(`Failed to update document ${id} in ${index}:`, error);
      throw error;
    }
  },

  // Delete document
  async deleteDocument(index: string, id: string): Promise<void> {
    try {
      await elasticsearchClient.delete({
        index,
        id,
        refresh: 'wait_for'
      });
    } catch (error) {
      logger.error(`Failed to delete document ${id} from ${index}:`, error);
      throw error;
    }
  },

  // Search documents
  async search(index: string, query: any): Promise<any> {
    try {
      const response = await (elasticsearchClient.search as any)({ index, body: query });
      return (response as any).body ?? response;
    } catch (error) {
      logger.error(`Search failed in ${index}:`, error);
      throw error;
    }
  },

  // Bulk operations
  async bulk(operations: any[]): Promise<any> {
    try {
      const response = await (elasticsearchClient.bulk as any)({ body: operations, refresh: 'wait_for' });
      return (response as any).body ?? response;
    } catch (error) {
      logger.error('Bulk operation failed:', error);
      throw error;
    }
  },

  // Get suggestions
  async getSuggestions(index: string, field: string, text: string, size: number = 10): Promise<any[]> {
    try {
      const response = await (elasticsearchClient.search as any)({
        index,
        body: {
          suggest: {
            suggestions: {
              prefix: text,
              completion: {
                field: field,
                size: size
              }
            }
          }
        }
      });
      const body = (response as any).body ?? response;
      return (body?.suggest?.suggestions?.[0]?.options || []).map((option: any) => option._source);
    } catch (error) {
      logger.error(`Failed to get suggestions from ${index}:`, error);
      return [];
    }
  }
};

// Health check
export const checkElasticsearchHealth = async (): Promise<boolean> => {
  try {
    await elasticsearchClient.ping();
    return true;
  } catch (error) {
    logger.error('Elasticsearch health check failed:', error);
    return false;
  }
};

// Initialize Elasticsearch
export const initializeElasticsearch = async (): Promise<void> => {
  try {
    await elasticsearchHelper.initializeIndices();
    logger.info('✅ Elasticsearch initialized successfully');
  } catch (error) {
    logger.error('❌ Elasticsearch initialization failed:', error);
    throw error;
  }
};

export default elasticsearchClient;