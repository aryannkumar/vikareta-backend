import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';

export const updateInventoryJob = async (): Promise<void> => {
  try {
    // Update inventory levels based on recent orders
    await updateInventoryLevels();
    
    // Check for low stock alerts
    await checkLowStockAlerts();
    
    logger.info('Inventory updated successfully');
  } catch (error) {
    logger.error('Error in update inventory job:', error);
    throw error;
  }
};

const updateInventoryLevels = async (): Promise<void> => {
  try {
    // Get recent order items that might affect inventory
    const recentOrderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          createdAt: {
            gte: new Date(Date.now() - 15 * 60 * 1000), // Last 15 minutes
          },
          status: {
            in: ['confirmed', 'processing', 'shipped'],
          },
        },
        productId: {
          not: null,
        },
      },
      include: {
        product: true,
      },
    });

    for (const orderItem of recentOrderItems) {
      if (orderItem.product) {
        // Update product stock
        await prisma.product.update({
          where: { id: orderItem.productId! },
          data: {
            stockQuantity: {
              decrement: orderItem.quantity,
            },
          },
        });

        // Update inventory records if they exist
        await prisma.inventory.updateMany({
          where: {
            productId: orderItem.productId!,
          },
          data: {
            available: {
              decrement: orderItem.quantity,
            },
          },
        });
      }
    }

    logger.info(`Updated inventory for ${recentOrderItems.length} order items`);
  } catch (error) {
    logger.error('Error updating inventory levels:', error);
  }
};

const checkLowStockAlerts = async (): Promise<void> => {
  try {
    // Find products with low stock
    const lowStockProducts = await prisma.product.findMany({
      where: {
        stockQuantity: {
          lte: 10, // Low stock threshold
        },
        isActive: true,
      },
      include: {
        seller: {
          select: {
            id: true,
            email: true,
            businessName: true,
          },
        },
      },
    });

    // Create notifications for low stock products
    for (const product of lowStockProducts) {
      await prisma.notification.create({
        data: {
          userId: product.sellerId,
          title: 'Low Stock Alert',
          message: `Your product "${product.title}" is running low on stock (${product.stockQuantity} remaining)`,
          type: 'low_stock',
          channel: 'in_app',
        },
      });
    }

    if (lowStockProducts.length > 0) {
      logger.info(`Created low stock alerts for ${lowStockProducts.length} products`);
    }
  } catch (error) {
    logger.error('Error checking low stock alerts:', error);
  }
};