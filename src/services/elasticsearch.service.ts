import { Client } from '@elastic/elasticsearch';
import { logger } from '../utils/logger';
import { PrismaClient } from '@prisma/client';
import elasticsearchClient, { elasticsearchHelper, INDICES } from '@/config/elasticsearch';

const prisma = new PrismaClient();

export class ElasticsearchService {
    private client: Client;

    constructor() {
        this.client = new Client({
            node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
            requestTimeout: 30000,
            pingTimeout: 3000,
        });
    }

    async initializeIndices(): Promise<void> {
        try {
            // Create products index
            await this.createProductsIndex();
            // Create services index
            await this.createServicesIndex();
            // Create users index
            await this.createUsersIndex();
            logger.info('Elasticsearch indices initialized successfully');
        } catch (error) {
            logger.error('Error initializing Elasticsearch indices:', error);
            throw error;
        }
    }

    private async createProductsIndex(): Promise<void> {
        const indexName = 'products';
        try {
            const exists = await this.client.indices.exists({ index: indexName }) as any;
            const existsFlag = typeof exists === 'boolean' ? exists : exists.body;
            if (!existsFlag) {
                await this.client.indices.create(({
                    index: indexName,
                    body: {
                        settings: {
                            number_of_shards: 1,
                            number_of_replicas: 0,
                            analysis: {
                                analyzer: {
                                    custom_analyzer: {
                                        type: 'custom',
                                        tokenizer: 'standard',
                                        filter: ['lowercase', 'stop', 'snowball'],
                                    },
                                },
                            },
                        },
                        mappings: {
                            properties: {
                                id: { type: 'keyword' },
                                title: { 
                                    type: 'text',
                                    analyzer: 'custom_analyzer',
                                    fields: {
                                        keyword: { type: 'keyword' },
                                    },
                                },
                                description: { 
                                    type: 'text',
                                    analyzer: 'custom_analyzer',
                                },
                                price: { type: 'float' },
                                currency: { type: 'keyword' },
                                status: { type: 'keyword' },
                                isActive: { type: 'boolean' },
                                createdAt: { type: 'date' },
                                updatedAt: { type: 'date' },
                                category: {
                                    properties: {
                                        id: { type: 'keyword' },
                                        name: { type: 'text' },
                                        slug: { type: 'keyword' },
                                    },
                                },
                                subcategory: {
                                    properties: {
                                        id: { type: 'keyword' },
                                        name: { type: 'text' },
                                        slug: { type: 'keyword' },
                                    },
                                },
                                seller: {
                                    properties: {
                                        id: { type: 'keyword' },
                                        businessName: { type: 'text' },
                                        city: { type: 'text' },
                                        state: { type: 'text' },
                                        verificationTier: { type: 'keyword' },
                                        isVerified: { type: 'boolean' },
                                    },
                                },
                            },
                        },
                    },
                }) as any);
                logger.info('Products index created successfully');
            }
        } catch (error) {
            logger.error('Error creating products index:', error);
            throw error;
        }
    }

    private async createServicesIndex(): Promise<void> {
        const indexName = 'services';
        try {
            const exists = await this.client.indices.exists({ index: indexName }) as any;
            const existsFlag = typeof exists === 'boolean' ? exists : exists.body;
            if (!existsFlag) {
                await this.client.indices.create(({
                    index: indexName,
                    body: {
                        settings: {
                            number_of_shards: 1,
                            number_of_replicas: 0,
                            analysis: {
                                analyzer: {
                                    custom_analyzer: {
                                        type: 'custom',
                                        tokenizer: 'standard',
                                        filter: ['lowercase', 'stop', 'snowball'],
                                    },
                                },
                            },
                        },
                        mappings: {
                            properties: {
                                id: { type: 'keyword' },
                                title: { 
                                    type: 'text',
                                    analyzer: 'custom_analyzer',
                                    fields: {
                                        keyword: { type: 'keyword' },
                                    },
                                },
                                description: { 
                                    type: 'text',
                                    analyzer: 'custom_analyzer',
                                },
                                price: { type: 'float' },
                                serviceType: { type: 'keyword' },
                                status: { type: 'keyword' },
                                isActive: { type: 'boolean' },
                                createdAt: { type: 'date' },
                                updatedAt: { type: 'date' },
                                category: {
                                    properties: {
                                        id: { type: 'keyword' },
                                        name: { type: 'text' },
                                        slug: { type: 'keyword' },
                                    },
                                },
                                subcategory: {
                                    properties: {
                                        id: { type: 'keyword' },
                                        name: { type: 'text' },
                                        slug: { type: 'keyword' },
                                    },
                                },
                                provider: {
                                    properties: {
                                        id: { type: 'keyword' },
                                        businessName: { type: 'text' },
                                        city: { type: 'text' },
                                        state: { type: 'text' },
                                        verificationTier: { type: 'keyword' },
                                        isVerified: { type: 'boolean' },
                                    },
                                },
                            },
                        },
                    },
                }) as any);
                logger.info('Services index created successfully');
            }
        } catch (error) {
            logger.error('Error creating services index:', error);
            throw error;
        }
    }

    private async createUsersIndex(): Promise<void> {
        const indexName = 'users';
        try {
            const exists = await this.client.indices.exists({ index: indexName }) as any;
            const existsFlag = typeof exists === 'boolean' ? exists : exists.body;
            if (!existsFlag) {
                await this.client.indices.create(({
                    index: indexName,
                    body: {
                        settings: {
                            number_of_shards: 1,
                            number_of_replicas: 0,
                            analysis: {
                                analyzer: {
                                    custom_analyzer: {
                                        type: 'custom',
                                        tokenizer: 'standard',
                                        filter: ['lowercase', 'stop'],
                                    },
                                },
                            },
                        },
                        mappings: {
                            properties: {
                                id: { type: 'keyword' },
                                businessName: { 
                                    type: 'text',
                                    analyzer: 'custom_analyzer',
                                    fields: {
                                        keyword: { type: 'keyword' },
                                    },
                                },
                                firstName: { type: 'text' },
                                lastName: { type: 'text' },
                                email: { type: 'keyword' },
                                role: { type: 'keyword' },
                                city: { type: 'text' },
                                state: { type: 'text' },
                                verificationTier: { type: 'keyword' },
                                isVerified: { type: 'boolean' },
                                isActive: { type: 'boolean' },
                                createdAt: { type: 'date' },
                            },
                        },
                    },
                }) as any);
                logger.info('Users index created successfully');
            }
        } catch (error) {
            logger.error('Error creating users index:', error);
            throw error;
        }
    }

    async indexProduct(product: any): Promise<void> {
        try {
            await this.client.index({
                index: 'products',
                id: product.id,
                body: product,
            });
            logger.debug(`Product ${product.id} indexed successfully`);
        } catch (error) {
            logger.error(`Error indexing product ${product.id}:`, error);
            throw error;
        }
    }

    async indexService(service: any): Promise<void> {
        try {
            await this.client.index({
                index: 'services',
                id: service.id,
                body: service,
            });
            logger.debug(`Service ${service.id} indexed successfully`);
        } catch (error) {
            logger.error(`Error indexing service ${service.id}:`, error);
            throw error;
        }
    }

    async indexUser(user: any): Promise<void> {
        try {
            await this.client.index({
                index: 'users',
                id: user.id,
                body: user,
            });
            logger.debug(`User ${user.id} indexed successfully`);
        } catch (error) {
            logger.error(`Error indexing user ${user.id}:`, error);
            throw error;
        }
    }

    async deleteProduct(productId: string): Promise<void> {
        try {
            await this.client.delete({
                index: 'products',
                id: productId,
            });
            logger.debug(`Product ${productId} deleted from index`);
        } catch (error: any) {
            if (error.meta?.statusCode !== 404) {
                logger.error(`Error deleting product ${productId} from index:`, error);
                throw error;
            }
        }
    }

    async deleteService(serviceId: string): Promise<void> {
        try {
            await this.client.delete({
                index: 'services',
                id: serviceId,
            });
            logger.debug(`Service ${serviceId} deleted from index`);
        } catch (error: any) {
            if (error.meta?.statusCode !== 404) {
                logger.error(`Error deleting service ${serviceId} from index:`, error);
                throw error;
            }
        }
    }

    async deleteUser(userId: string): Promise<void> {
        try {
            await this.client.delete({
                index: 'users',
                id: userId,
            });
            logger.debug(`User ${userId} deleted from index`);
        } catch (error: any) {
            if (error.meta?.statusCode !== 404) {
                logger.error(`Error deleting user ${userId} from index:`, error);
                throw error;
            }
        }
    }

    async bulkIndexProducts(): Promise<void> {
        try {
            const products = await prisma.product.findMany({
                where: {
                    isActive: true,
                },
                include: {
                    category: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                        },
                    },
                    subcategory: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                        },
                    },
                    seller: {
                        select: {
                            id: true,
                            businessName: true,
                            city: true,
                            state: true,
                            verificationTier: true,
                            isVerified: true,
                        },
                    },
                },
            });

            if (products.length === 0) {
                logger.info('No products to index');
                return;
            }

            const body = products.flatMap(product => [
                { index: { _index: 'products', _id: product.id } },
                product,
            ]);

            const response = await this.client.bulk({ body }) as any;
            const respBody = response.body ?? response;
            if (respBody.errors) {
                logger.error('Bulk indexing errors:', respBody.items);
            } else {
                logger.info(`Successfully indexed ${products.length} products`);
            }
        } catch (error) {
            logger.error('Error bulk indexing products:', error);
            throw error;
        }
    }

    async bulkIndexServices(): Promise<void> {
        try {
            const services = await prisma.service.findMany({
                where: {
                    isActive: true,
                },
                include: {
                    category: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                        },
                    },
                    subcategory: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                        },
                    },
                    provider: {
                        select: {
                            id: true,
                            businessName: true,
                            city: true,
                            state: true,
                            verificationTier: true,
                            isVerified: true,
                        },
                    },
                },
            });

            if (services.length === 0) {
                logger.info('No services to index');
                return;
            }

            const body = services.flatMap(service => [
                { index: { _index: 'services', _id: service.id } },
                service,
            ]);

            const response = await this.client.bulk({ body }) as any;
            const respBody = response.body ?? response;
            if (respBody.errors) {
                logger.error('Bulk indexing errors:', respBody.items);
            } else {
                logger.info(`Successfully indexed ${services.length} services`);
            }
        } catch (error) {
            logger.error('Error bulk indexing services:', error);
            throw error;
        }
    }

    async bulkIndexUsers(): Promise<void> {
        try {
            const users = await prisma.user.findMany({
                where: {
                    isActive: true,
                    role: { in: ['SELLER', 'SERVICE_PROVIDER'] },
                },
                select: {
                    id: true,
                    businessName: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    role: true,
                    city: true,
                    state: true,
                    verificationTier: true,
                    isVerified: true,
                    isActive: true,
                    createdAt: true,
                },
            });

            if (users.length === 0) {
                logger.info('No users to index');
                return;
            }

            const body = users.flatMap(user => [
                { index: { _index: 'users', _id: user.id } },
                user,
            ]);

            const response = await this.client.bulk({ body }) as any;
            const respBody = response.body ?? response;
            if (respBody.errors) {
                logger.error('Bulk indexing errors:', respBody.items);
            } else {
                logger.info(`Successfully indexed ${users.length} users`);
            }
        } catch (error) {
            logger.error('Error bulk indexing users:', error);
            throw error;
        }
    }

    async search(index: string, query: any): Promise<any> {
        try {
            const response = await this.client.search({
                index,
                body: query,
            }) as any;
            return response.body ?? response;
        } catch (error) {
            logger.error(`Error searching index ${index}:`, error);
            throw error;
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            const response = await this.client.ping() as any;
            const status = typeof response === 'boolean' ? response : response.statusCode === 200;
            return status;
        } catch (error) {
            logger.error('Elasticsearch health check failed:', error);
            return false;
        }
    }
}

export const elasticsearchService = new ElasticsearchService();

// Re-export for compatibility
export { elasticsearchClient, elasticsearchHelper, INDICES };