import { BaseService } from './base.service';
import { logger } from '../utils/logger';
import type { TrendingCategory, Category } from '@prisma/client';

export interface TrendingCategoryData {
  categoryId: string;
  viewCount: number;
  searchCount: number;
  orderCount: number;
  trendingScore: number;
  growthRate: number;
  period: 'daily' | 'weekly' | 'monthly';
  periodStart: Date;
  periodEnd: Date;
}

export class PersonalizationService extends BaseService {
  constructor() {
    super();
  }

  async getTrendingCategories(
    period: 'daily' | 'weekly' | 'monthly' = 'weekly',
    limit: number = 10
  ): Promise<TrendingCategory[]> {
    try {
      const now = new Date();
      let periodStart: Date;

      // Calculate period dates
      switch (period) {
        case 'daily':
          periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'weekly':
          periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'monthly':
          periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }

      const periodEnd: Date = now;

      // Get trending categories for the period
      const trendingCategories = await this.prisma.trendingCategory.findMany({
        where: {
          period,
          periodStart: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
        include: {
          category: true,
        },
        orderBy: {
          trendingScore: 'desc',
        },
        take: limit,
      });

      // If no trending data exists, generate it
      if (trendingCategories.length === 0) {
        await this.generateTrendingCategories(period, periodStart, periodEnd);
        return this.getTrendingCategories(period, limit);
      }

      return trendingCategories;
    } catch (error) {
      logger.error('Error fetching trending categories:', error);
      throw error;
    }
  }

  async getPersonalizedCategories(
    userId: string | null,
    limit: number = 12
  ): Promise<Category[]> {
    try {
      if (!userId) {
        // Return popular categories for anonymous users
        return this.getPopularCategories(limit);
      }

      // Get user's preferences and behavior
      const userPreferences = await this.prisma.userPreference.findUnique({
        where: { userId },
      });

      const categoryPreferences = await this.prisma.categoryPreference.findMany({
        where: { userId },
        orderBy: { preferenceScore: 'desc' },
        take: 20,
      });

      // If user has preferences, use them
      if ((userPreferences?.preferredCategories?.length ?? 0) > 0 || categoryPreferences.length > 0) {
        return this.getPersonalizedCategoriesFromPreferences(userId, userPreferences, categoryPreferences, limit);
      }

      // Fallback to trending categories
      const trendingCategories = await this.getTrendingCategories('weekly', limit);
      const categoryIds = trendingCategories.map(tc => tc.categoryId);

      return await this.prisma.category.findMany({
        where: {
          id: { in: categoryIds },
          isActive: true,
        },
        orderBy: { sortOrder: 'asc' },
        take: limit,
      });
    } catch (error) {
      logger.error('Error fetching personalized categories:', error);
      // Fallback to popular categories
      return this.getPopularCategories(limit);
    }
  }

  private async getPopularCategories(limit: number): Promise<Category[]> {
    try {
      // Get categories ordered by product/service count and recent activity
      const categories = await this.prisma.category.findMany({
        where: { isActive: true },
        include: {
          _count: {
            select: {
              products: true,
              services: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
        take: limit,
      });

      // Sort by activity (products + services count)
      return categories.sort((a: any, b: any) => {
        const aCount = (a._count?.products || 0) + (a._count?.services || 0);
        const bCount = (b._count?.products || 0) + (b._count?.services || 0);
        return bCount - aCount;
      });
    } catch (error) {
      logger.error('Error fetching popular categories:', error);
      return [];
    }
  }

  private async getPersonalizedCategoriesFromPreferences(
    userId: string,
    userPreferences: any,
    categoryPreferences: any[],
    limit: number
  ): Promise<Category[]> {
    try {
      const preferredCategoryIds = new Set([
        ...(userPreferences?.preferredCategories || []),
        ...categoryPreferences.map((cp: any) => cp.categoryId),
      ]);

      // Get preferred categories first
      const preferredCategories = await this.prisma.category.findMany({
        where: {
          id: { in: Array.from(preferredCategoryIds) },
          isActive: true,
        },
        orderBy: { sortOrder: 'asc' },
      });

      // Fill remaining slots with trending categories
      if (preferredCategories.length < limit) {
        const trendingCategories = await this.getTrendingCategories('weekly', limit - preferredCategories.length);
        const trendingCategoryIds = trendingCategories
          .map(tc => tc.categoryId)
          .filter(id => !preferredCategoryIds.has(id));

        const additionalCategories = await this.prisma.category.findMany({
          where: {
            id: { in: trendingCategoryIds },
            isActive: true,
          },
          orderBy: { sortOrder: 'asc' },
        });

        preferredCategories.push(...additionalCategories);
      }

      return preferredCategories.slice(0, limit);
    } catch (error) {
      logger.error('Error fetching personalized categories from preferences:', error);
      return this.getPopularCategories(limit);
    }
  }

  private async generateTrendingCategories(
    period: 'daily' | 'weekly' | 'monthly',
    periodStart: Date,
    periodEnd: Date
  ): Promise<void> {
    try {
      // Get all active categories
      const categories = await this.prisma.category.findMany({
        where: { isActive: true },
        include: {
          _count: {
            select: {
              products: true,
              services: true,
            },
          },
        },
      });

      // Calculate trending scores based on recent activity
      const previousPeriodStart = new Date(periodStart.getTime() - (periodEnd.getTime() - periodStart.getTime()));

      for (const category of categories) {
        // Get activity counts for current period
        const currentViewCount = await this.getCategoryActivityCount(category.id, 'view', periodStart, periodEnd);
        const currentSearchCount = await this.getCategoryActivityCount(category.id, 'search', periodStart, periodEnd);
        const currentOrderCount = await this.getCategoryActivityCount(category.id, 'order', periodStart, periodEnd);

        // Get activity counts for previous period
        const previousViewCount = await this.getCategoryActivityCount(category.id, 'view', previousPeriodStart, periodStart);
        const previousSearchCount = await this.getCategoryActivityCount(category.id, 'search', previousPeriodStart, periodStart);
        const previousOrderCount = await this.getCategoryActivityCount(category.id, 'order', previousPeriodStart, periodStart);

        // Calculate trending score
        const currentScore = currentViewCount * 0.3 + currentSearchCount * 0.4 + currentOrderCount * 0.3;
        const previousScore = previousViewCount * 0.3 + previousSearchCount * 0.4 + previousOrderCount * 0.3;

        // Calculate growth rate
        const growthRate = previousScore > 0 ? ((currentScore - previousScore) / previousScore) * 100 : 0;

        // Create or update trending category record
        await this.prisma.trendingCategory.upsert({
          where: {
            categoryId_period_periodStart: {
              categoryId: category.id,
              period,
              periodStart,
            },
          },
          update: {
            viewCount: currentViewCount,
            searchCount: currentSearchCount,
            orderCount: currentOrderCount,
            trendingScore: currentScore,
            growthRate,
            periodEnd,
          },
          create: {
            categoryId: category.id,
            viewCount: currentViewCount,
            searchCount: currentSearchCount,
            orderCount: currentOrderCount,
            trendingScore: currentScore,
            growthRate,
            period,
            periodStart,
            periodEnd,
          },
        });
      }

      logger.info(`Generated trending categories for ${period} period`);
    } catch (error) {
      logger.error('Error generating trending categories:', error);
    }
  }

  private async getCategoryActivityCount(
    categoryId: string,
    activityType: 'view' | 'search' | 'order',
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    try {
      switch (activityType) {
        case 'view':
        case 'search': {
          const preferenceCount = await this.prisma.categoryPreference.aggregate({
            where: {
              categoryId,
              updatedAt: {
                gte: startDate,
                lte: endDate,
              },
            },
            _sum: {
              [activityType === 'view' ? 'viewCount' : 'searchCount']: true,
            },
          });
          return preferenceCount._sum?.[activityType === 'view' ? 'viewCount' : 'searchCount'] || 0;
        }

        case 'order': {
          const orderCount = await this.prisma.orderItem.count({
            where: {
              product: {
                categoryId,
              },
              order: {
                createdAt: {
                  gte: startDate,
                  lte: endDate,
                },
              },
            },
          });
          return orderCount;
        }

        default:
          return 0;
      }
    } catch (error) {
      logger.error(`Error getting category ${activityType} count:`, error);
      return 0;
    }
  }

  async trackCategoryInteraction(
    userId: string,
    categoryId: string,
    action: 'view' | 'click' | 'purchase' | 'search'
  ): Promise<void> {
    try {
      // Update category preference
      await this.prisma.categoryPreference.upsert({
        where: {
          userId_categoryId: { userId, categoryId },
        },
        update: {
          [action === 'view' ? 'viewCount' : action === 'click' ? 'clickCount' : action === 'purchase' ? 'purchaseCount' : 'searchCount']: {
            increment: 1,
          },
          lastViewed: action === 'view' ? new Date() : undefined,
          lastPurchased: action === 'purchase' ? new Date() : undefined,
        },
        create: {
          userId,
          categoryId,
          viewCount: action === 'view' ? 1 : 0,
          clickCount: action === 'click' ? 1 : 0,
          purchaseCount: action === 'purchase' ? 1 : 0,
          searchCount: action === 'search' ? 1 : 0,
          firstViewed: action === 'view' ? new Date() : null,
          lastViewed: action === 'view' ? new Date() : null,
          lastPurchased: action === 'purchase' ? new Date() : null,
          preferenceScore: 1.0,
        },
      });

      // Recalculate preference score
      await this.recalculatePreferenceScore(userId, categoryId);

      logger.info(`Tracked ${action} for category ${categoryId} by user ${userId}`);
    } catch (error) {
      logger.error('Error tracking category interaction:', error);
      throw error;
    }
  }

  private async recalculatePreferenceScore(userId: string, categoryId: string): Promise<void> {
    try {
      const pref = await this.prisma.categoryPreference.findUnique({
        where: {
          userId_categoryId: { userId, categoryId },
        },
      });

      if (!pref) return;

      // Simple scoring algorithm: views + clicks*2 + purchases*5 + searches*1.5
      const score = (
        pref.viewCount +
        pref.clickCount * 2 +
        pref.purchaseCount * 5 +
        pref.searchCount * 1.5
      ) / 10; // Normalize

      await this.prisma.categoryPreference.update({
        where: {
          userId_categoryId: { userId, categoryId },
        },
        data: {
          preferenceScore: Math.min(score, 10), // Cap at 10
        },
      });
    } catch (error) {
      logger.error('Error recalculating preference score:', error);
    }
  }
}