import { prisma } from '@/config/database';
import { elasticsearchHelper, INDICES } from '@/config/elasticsearch';
import { logger } from '@/utils/logger';

export const syncElasticsearchJob = async (): Promise<void> => {
  try {
    // Sync products
    await syncProducts();
    
    // Sync services
    await syncServices();
    
    // Sync users
    await syncUsers();
    
    // Sync RFQs
    await syncRFQs();
    
    logger.info('Elasticsearch sync completed');
  } catch (error) {
    logger.error('Error in sync Elasticsearch job:', error);
    throw error;
  }
};

const syncProducts = async (): Promise<void> => {
  try {
    // Get recently updated products
    const products = await prisma.product.findMany({
      where: {
        updatedAt: {
          gte: new Date(Date.now() - 30 * 60 * 1000), // Last 30 minutes
        },
      },
      include: {
        seller: {
          select: {
            id: true,
            businessName: true,
            location: true,
            city: true,
            state: true,
            country: true,
            verificationTier: true,
            isVerified: true,
          },
        },
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
      },
    });

    for (const product of products) {
      await elasticsearchHelper.indexDocument(
        INDICES.PRODUCTS,
        product.id,
        product
      );
    }

    logger.info(`Synced ${products.length} products to Elasticsearch`);
  } catch (error) {
    logger.error('Error syncing products to Elasticsearch:', error);
  }
};

const syncServices = async (): Promise<void> => {
  try {
    // Get recently updated services
    const services = await prisma.service.findMany({
      where: {
        updatedAt: {
          gte: new Date(Date.now() - 30 * 60 * 1000), // Last 30 minutes
        },
      },
      include: {
        provider: {
          select: {
            id: true,
            businessName: true,
            location: true,
            city: true,
            state: true,
            country: true,
            verificationTier: true,
            isVerified: true,
          },
        },
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
      },
    });

    for (const service of services) {
      await elasticsearchHelper.indexDocument(
        INDICES.SERVICES,
        service.id,
        service
      );
    }

    logger.info(`Synced ${services.length} services to Elasticsearch`);
  } catch (error) {
    logger.error('Error syncing services to Elasticsearch:', error);
  }
};

const syncUsers = async (): Promise<void> => {
  try {
    // Get recently updated users
    const users = await prisma.user.findMany({
      where: {
        updatedAt: {
          gte: new Date(Date.now() - 30 * 60 * 1000), // Last 30 minutes
        },
      },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        businessName: true,
        gstin: true,
        userType: true,
        role: true,
        verificationTier: true,
        isVerified: true,
        isActive: true,
        location: true,
        city: true,
        state: true,
        country: true,
        postalCode: true,
        latitude: true,
        longitude: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    for (const user of users) {
      await elasticsearchHelper.indexDocument(
        INDICES.USERS,
        user.id,
        user
      );
    }

    logger.info(`Synced ${users.length} users to Elasticsearch`);
  } catch (error) {
    logger.error('Error syncing users to Elasticsearch:', error);
  }
};

const syncRFQs = async (): Promise<void> => {
  try {
    // Get recently updated RFQs
    const rfqs = await prisma.rfq.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 30 * 60 * 1000), // Last 30 minutes
        },
      },
      include: {
        buyer: {
          select: {
            id: true,
            businessName: true,
            location: true,
            city: true,
            state: true,
            country: true,
            verificationTier: true,
            isVerified: true,
          },
        },
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
      },
    });

    for (const rfq of rfqs) {
      await elasticsearchHelper.indexDocument(
        INDICES.RFQS,
        rfq.id,
        rfq
      );
    }

    logger.info(`Synced ${rfqs.length} RFQs to Elasticsearch`);
  } catch (error) {
    logger.error('Error syncing RFQs to Elasticsearch:', error);
  }
};