import { Client } from '@elastic/elasticsearch';
import { logger } from '../utils/logger';
import { config } from '../config/environment';

export class ElasticsearchService {
  private client: Client;

  constructor() {
    this.client = new Client({
      node: config.elasticsearch.url,
      auth: config.elasticsearch.username && config.elasticsearch.password ? {
        username: config.elasticsearch.username,
        password: config.elasticsearch.password,
      } : undefined,
    });
  }

  async indexProduct(product: any): Promise<void> {
    try {
      await this.client.index({
        index: 'products',
        id: product.id,
        document: {
          id: product.id,
          title: product.title,
          description: product.description,
          price: product.price,
          currency: product.currency,
          category: product.category?.name,
          seller: product.seller?.businessName,
          isActive: product.isActive,
          createdAt: product.createdAt,
        },
      });
      logger.info(`Product indexed: ${product.id}`);
    } catch (error) {
      logger.error('Error indexing product:', error);
      throw error;
    }
  }

  async indexService(service: any): Promise<void> {
    try {
      await this.client.index({
        index: 'services',
        id: service.id,
        document: {
          id: service.id,
          title: service.title,
          description: service.description,
          price: service.price,
          currency: service.currency,
          category: service.category?.name,
          provider: service.provider?.businessName,
          isActive: service.isActive,
          createdAt: service.createdAt,
        },
      });
      logger.info(`Service indexed: ${service.id}`);
    } catch (error) {
      logger.error('Error indexing service:', error);
      throw error;
    }
  }

  async search(query: string, index: string = 'products,services'): Promise<any> {
    try {
      const response = await this.client.search({
        index,
        query: {
          multi_match: {
            query,
            fields: ['title^2', 'description', 'category'],
            type: 'best_fields',
            fuzziness: 'AUTO',
          },
        },
        size: 20,
      });

      return {
        hits: response.hits.hits.map((hit: any) => ({
          ...hit._source,
          _score: hit._score,
        })),
        total: typeof response.hits.total === 'number' 
          ? response.hits.total 
          : response.hits.total?.value || 0,
      };
    } catch (error) {
      logger.error('Error searching:', error);
      throw error;
    }
  }

  async deleteDocument(index: string, id: string): Promise<void> {
    try {
      await this.client.delete({
        index,
        id,
      });
      logger.info(`Document deleted: ${id} from ${index}`);
    } catch (error) {
      logger.error('Error deleting document:', error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.ping();
      return true;
    } catch (error) {
      logger.error('Elasticsearch health check failed:', error);
      return false;
    }
  }
}

export const elasticsearchService = new ElasticsearchService();