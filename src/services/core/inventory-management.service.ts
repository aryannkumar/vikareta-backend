import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';

export interface InventoryItem {
  productId: string;
  variantId?: string;
  currentStock: number;
  reservedStock: number;
  availableStock: number;
  reorderLevel: number;
  maxStock: number;
  lastRestocked: Date;
  averageDailySales: number;
  daysUntilStockout: number;
}

export interface StockMovement {
  productId: string;
  variantId?: string;
  type: 'in' | 'out' | 'adjustment' | 'reserved' | 'released';
  quantity: number;
  reason: string;
  referenceId?: string;
  referenceType?: string;
  performedBy: string;
}

export interface StockAlert {
  productId: string;
  variantId?: string;
  alertType: 'low_stock' | 'out_of_stock' | 'overstock' | 'reorder_needed';
  currentStock: number;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export class InventoryManagementService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Get comprehensive inventory status
   */
  async getInventoryStatus(sellerId?: string): Promise<{
    totalProducts: number;
    lowStockItems: number;
    outOfStockItems: number;
    overstockItems: number;
    totalValue: number;
    turnoverRate: number;
    alerts: StockAlert[];
  }> {
    try {
      const where: any = { status: 'active' };
      if (sellerId) where.sellerId = sellerId;

      const [products, lowStockCount, outOfStockCount] = await Promise.all([
        this.prisma.product.findMany({
          where,
          include: {
            variants: true,
          },
        }),
        this.prisma.product.count({
          where: { ...where, stockQuantity: { lte: 10 } },
        }),
        this.prisma.product.count({
          where: { ...where, stockQuantity: 0 },
        }),
      ]);

      // Calculate total inventory value
      const totalValue = products.reduce((sum, product) => {
        const productValue = Number(product.price) * product.stockQuantity;
        const variantsValue = product.variants.reduce((vSum, variant) => 
          vSum + (Number(variant.price) * variant.stockQuantity), 0
        );
        return sum + productValue + variantsValue;
      }, 0);

      // Generate alerts
      const alerts = await this.generateStockAlerts(sellerId);

      // Calculate turnover rate (simplified)
      const turnoverRate = await this.calculateInventoryTurnover(sellerId);

      return {
        totalProducts: products.length,
        lowStockItems: lowStockCount,
        outOfStockItems: outOfStockCount,
        overstockItems: 0, // Would need historical data to calculate
        totalValue,
        turnoverRate,
        alerts,
      };
    } catch (error) {
      logger.error('Error getting inventory status:', error);
      throw error;
    }
  }

  /**
   * Reserve stock for an order
   */
  async reserveStock(items: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
  }>, orderId: string): Promise<{ success: boolean; errors: string[] }> {
    try {
      const errors: string[] = [];

      for (const item of items) {
        if (item.variantId) {
          // Reserve variant stock
          const variant = await this.prisma.productVariant.findUnique({
            where: { id: item.variantId },
          });

          if (!variant || variant.stockQuantity < item.quantity) {
            errors.push(`Insufficient stock for variant ${item.variantId}`);
            continue;
          }

          await this.prisma.productVariant.update({
            where: { id: item.variantId },
            data: {
              stockQuantity: { decrement: item.quantity },
            },
          });
        } else {
          // Reserve product stock
          const product = await this.prisma.product.findUnique({
            where: { id: item.productId },
          });

          if (!product || product.stockQuantity < item.quantity) {
            errors.push(`Insufficient stock for product ${item.productId}`);
            continue;
          }

          await this.prisma.product.update({
            where: { id: item.productId },
            data: {
              stockQuantity: { decrement: item.quantity },
            },
          });
        }

        // Log stock movement
        await this.logStockMovement({
          productId: item.productId,
          variantId: item.variantId,
          type: 'reserved',
          quantity: item.quantity,
          reason: 'Order reservation',
          referenceId: orderId,
          referenceType: 'order',
          performedBy: 'system',
        });
      }

      return {
        success: errors.length === 0,
        errors,
      };
    } catch (error) {
      logger.error('Error reserving stock:', error);
      throw error;
    }
  }

  /**
   * Release reserved stock (e.g., when order is cancelled)
   */
  async releaseStock(items: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
  }>, orderId: string): Promise<void> {
    try {
      for (const item of items) {
        if (item.variantId) {
          await this.prisma.productVariant.update({
            where: { id: item.variantId },
            data: {
              stockQuantity: { increment: item.quantity },
            },
          });
        } else {
          await this.prisma.product.update({
            where: { id: item.productId },
            data: {
              stockQuantity: { increment: item.quantity },
            },
          });
        }

        // Log stock movement
        await this.logStockMovement({
          productId: item.productId,
          variantId: item.variantId,
          type: 'released',
          quantity: item.quantity,
          reason: 'Order cancellation',
          referenceId: orderId,
          referenceType: 'order',
          performedBy: 'system',
        });
      }

      logger.info('Stock released successfully', { orderId, items });
    } catch (error) {
      logger.error('Error releasing stock:', error);
      throw error;
    }
  }

  /**
   * Adjust stock levels manually
   */
  async adjustStock(
    productId: string,
    variantId: string | undefined,
    adjustment: number,
    reason: string,
    performedBy: string
  ): Promise<void> {
    try {
      if (variantId) {
        await this.prisma.productVariant.update({
          where: { id: variantId },
          data: {
            stockQuantity: { increment: adjustment },
          },
        });
      } else {
        await this.prisma.product.update({
          where: { id: productId },
          data: {
            stockQuantity: { increment: adjustment },
          },
        });
      }

      // Log stock movement
      await this.logStockMovement({
        productId,
        variantId,
        type: 'adjustment',
        quantity: Math.abs(adjustment),
        reason,
        performedBy,
      });

      logger.info('Stock adjusted successfully', {
        productId,
        variantId,
        adjustment,
        reason,
      });
    } catch (error) {
      logger.error('Error adjusting stock:', error);
      throw error;
    }
  }

  /**
   * Restock inventory
   */
  async restockInventory(
    productId: string,
    variantId: string | undefined,
    quantity: number,
    cost: number,
    performedBy: string,
    supplierId?: string
  ): Promise<void> {
    try {
      if (variantId) {
        await this.prisma.productVariant.update({
          where: { id: variantId },
          data: {
            stockQuantity: { increment: quantity },
          },
        });
      } else {
        await this.prisma.product.update({
          where: { id: productId },
          data: {
            stockQuantity: { increment: quantity },
          },
        });
      }

      // Log stock movement
      await this.logStockMovement({
        productId,
        variantId,
        type: 'in',
        quantity,
        reason: 'Inventory restock',
        referenceId: supplierId,
        referenceType: 'supplier',
        performedBy,
      });

      logger.info('Inventory restocked successfully', {
        productId,
        variantId,
        quantity,
        cost,
      });
    } catch (error) {
      logger.error('Error restocking inventory:', error);
      throw error;
    }
  }

  /**
   * Generate stock alerts
   */
  async generateStockAlerts(sellerId?: string): Promise<StockAlert[]> {
    try {
      const alerts: StockAlert[] = [];
      const where: any = { status: 'active' };
      if (sellerId) where.sellerId = sellerId;

      const products = await this.prisma.product.findMany({
        where,
        include: {
          variants: true,
        },
      });

      for (const product of products) {
        // Check main product stock
        if (product.stockQuantity <= 0) {
          alerts.push({
            productId: product.id,
            alertType: 'out_of_stock',
            currentStock: product.stockQuantity,
            threshold: 0,
            severity: 'critical',
          });
        } else if (product.stockQuantity <= 10) {
          alerts.push({
            productId: product.id,
            alertType: 'low_stock',
            currentStock: product.stockQuantity,
            threshold: 10,
            severity: product.stockQuantity <= 5 ? 'high' : 'medium',
          });
        }

        // Check variant stock
        for (const variant of product.variants) {
          if (variant.stockQuantity <= 0) {
            alerts.push({
              productId: product.id,
              variantId: variant.id,
              alertType: 'out_of_stock',
              currentStock: variant.stockQuantity,
              threshold: 0,
              severity: 'critical',
            });
          } else if (variant.stockQuantity <= 10) {
            alerts.push({
              productId: product.id,
              variantId: variant.id,
              alertType: 'low_stock',
              currentStock: variant.stockQuantity,
              threshold: 10,
              severity: variant.stockQuantity <= 5 ? 'high' : 'medium',
            });
          }
        }
      }

      return alerts;
    } catch (error) {
      logger.error('Error generating stock alerts:', error);
      throw error;
    }
  }

  /**
   * Get inventory forecast
   */
  async getInventoryForecast(
    productId: string,
    variantId?: string,
    days = 30
  ): Promise<{
    currentStock: number;
    averageDailySales: number;
    forecastedStockout: Date | null;
    recommendedReorderQuantity: number;
    recommendedReorderDate: Date | null;
  }> {
    try {
      // Get current stock
      let currentStock = 0;
      if (variantId) {
        const variant = await this.prisma.productVariant.findUnique({
          where: { id: variantId },
        });
        currentStock = variant?.stockQuantity || 0;
      } else {
        const product = await this.prisma.product.findUnique({
          where: { id: productId },
        });
        currentStock = product?.stockQuantity || 0;
      }

      // Calculate average daily sales (simplified)
      const averageDailySales = await this.calculateAverageDailySales(productId, variantId);

      // Forecast stockout date
      let forecastedStockout: Date | null = null;
      if (averageDailySales > 0) {
        const daysUntilStockout = currentStock / averageDailySales;
        forecastedStockout = new Date();
        forecastedStockout.setDate(forecastedStockout.getDate() + Math.floor(daysUntilStockout));
      }

      // Calculate recommended reorder quantity and date
      const leadTimeDays = 7; // Assume 7 days lead time
      const safetyStock = averageDailySales * 3; // 3 days safety stock
      const recommendedReorderQuantity = Math.ceil(
        (averageDailySales * leadTimeDays) + safetyStock
      );

      let recommendedReorderDate: Date | null = null;
      if (averageDailySales > 0) {
        const daysUntilReorder = Math.max(0, (currentStock - safetyStock) / averageDailySales - leadTimeDays);
        recommendedReorderDate = new Date();
        recommendedReorderDate.setDate(recommendedReorderDate.getDate() + Math.floor(daysUntilReorder));
      }

      return {
        currentStock,
        averageDailySales,
        forecastedStockout,
        recommendedReorderQuantity,
        recommendedReorderDate,
      };
    } catch (error) {
      logger.error('Error getting inventory forecast:', error);
      throw error;
    }
  }

  /**
   * Get inventory valuation
   */
  async getInventoryValuation(sellerId?: string): Promise<{
    totalValue: number;
    valueByCategory: Record<string, number>;
    slowMovingValue: number;
    fastMovingValue: number;
    deadStockValue: number;
  }> {
    try {
      const where: any = { status: 'active' };
      if (sellerId) where.sellerId = sellerId;

      const products = await this.prisma.product.findMany({
        where,
        include: {
          category: true,
          variants: true,
          orderItems: {
            where: {
              order: {
                createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }, // Last 90 days
              },
            },
          },
        },
      });

      let totalValue = 0;
      const valueByCategory: Record<string, number> = {};
      let slowMovingValue = 0;
      let fastMovingValue = 0;
      let deadStockValue = 0;

      for (const product of products) {
        const productValue = Number(product.price) * product.stockQuantity;
        const variantsValue = product.variants.reduce((sum, variant) => 
          sum + (Number(variant.price) * variant.stockQuantity), 0
        );
        const itemValue = productValue + variantsValue;

        totalValue += itemValue;

        // Category breakdown
        const categoryName = product.category.name;
        valueByCategory[categoryName] = (valueByCategory[categoryName] || 0) + itemValue;

        // Movement analysis
        const recentSales = product.orderItems.reduce((sum, item) => sum + item.quantity, 0);
        if (recentSales === 0) {
          deadStockValue += itemValue;
        } else if (recentSales < 5) {
          slowMovingValue += itemValue;
        } else {
          fastMovingValue += itemValue;
        }
      }

      return {
        totalValue,
        valueByCategory,
        slowMovingValue,
        fastMovingValue,
        deadStockValue,
      };
    } catch (error) {
      logger.error('Error getting inventory valuation:', error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private async logStockMovement(movement: StockMovement): Promise<void> {
    try {
      // In a real implementation, you would have a StockMovement model
      logger.info('Stock movement logged', movement);
    } catch (error) {
      logger.error('Error logging stock movement:', error);
    }
  }

  private async calculateAverageDailySales(productId: string, variantId?: string): Promise<number> {
    try {
      const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const where: any = {
        productId,
        order: {
          createdAt: { gte: last30Days },
          status: { in: ['completed', 'delivered'] },
        },
      };

      if (variantId) {
        where.variantId = variantId;
      }

      const orderItems = await this.prisma.orderItem.findMany({
        where,
      });

      const totalSales = orderItems.reduce((sum, item) => sum + item.quantity, 0);
      return totalSales / 30; // Average per day
    } catch (error) {
      logger.error('Error calculating average daily sales:', error);
      return 0;
    }
  }

  private async calculateInventoryTurnover(sellerId?: string): Promise<number> {
    try {
      // Simplified inventory turnover calculation
      // In a real implementation, you would use COGS and average inventory value
      const where: any = { status: 'active' };
      if (sellerId) where.sellerId = sellerId;

      const [products, recentOrders] = await Promise.all([
        this.prisma.product.count({ where }),
        this.prisma.order.count({
          where: {
            sellerId,
            createdAt: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) },
            status: { in: ['completed', 'delivered'] },
          },
        }),
      ]);

      return products > 0 ? recentOrders / products : 0;
    } catch (error) {
      logger.error('Error calculating inventory turnover:', error);
      return 0;
    }
  }
}

export default InventoryManagementService;