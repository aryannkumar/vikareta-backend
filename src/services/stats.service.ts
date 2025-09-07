import { BaseService } from './base.service';
import { logger } from '../utils/logger';

export interface PlatformStats {
  successfulDeals: number;
  totalCategories: number;
  totalProducts: number;
  totalSuppliers: number;
}

export class StatsService extends BaseService {
  constructor() {
    super();
  }

  async getPlatformStats(): Promise<PlatformStats> {
    try {
      // Get total categories
      const totalCategories = await this.prisma.category.count({
        where: { isActive: true },
      });

      // Get total products
      const totalProducts = await this.prisma.product.count({
        where: { isActive: true },
      });

      // Get total suppliers (users with seller role)
      const totalSuppliers = await this.prisma.user.count({
        where: {
          userType: 'seller',
          isActive: true,
        },
      });

      // Get successful deals (completed orders)
      const successfulDeals = await this.prisma.order.count({
        where: {
          status: 'completed',
        },
      });

      const stats: PlatformStats = {
        successfulDeals,
        totalCategories,
        totalProducts,
        totalSuppliers,
      };

      logger.info('Platform stats retrieved successfully');
      return stats;
    } catch (error) {
      logger.error('Error fetching platform stats:', error);
      throw error;
    }
  }
}