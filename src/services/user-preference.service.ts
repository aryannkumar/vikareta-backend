import type { UserPreference, CategoryPreference, UserInterest } from '@prisma/client';
import { BaseService } from './base.service';
import { logger } from '../utils/logger';

export interface UserPreferenceData {
  preferredCategories?: string[];
  preferredSubcategories?: string[];
  minPriceRange?: number;
  maxPriceRange?: number;
  preferredPriceRange?: string;
  preferredLocations?: string[];
  deliveryRadius?: number;
  preferredBusinessTypes?: string[];
  preferredIndustries?: string[];
  theme?: string;
  language?: string;
  currency?: string;
  itemsPerPage?: number;
  emailFrequency?: string;
  smsFrequency?: string;
  showRecommended?: boolean;
  showTrending?: boolean;
  showNearby?: boolean;
  showNewArrivals?: boolean;
  profileVisibility?: string;
  showOnlineStatus?: boolean;
  allowMessaging?: boolean;
}

export class UserPreferenceService extends BaseService {
  constructor() {
    super();
  }

  async getUserPreferences(userId: string): Promise<UserPreference | null> {
    try {
      return await this.prisma.userPreference.findUnique({
        where: { userId },
      });
    } catch (error) {
      logger.error('Error fetching user preferences:', error);
      throw error;
    }
  }

  async updateUserPreferences(userId: string, data: UserPreferenceData): Promise<UserPreference> {
    try {
      return await this.prisma.userPreference.upsert({
        where: { userId },
        update: data,
        create: {
          userId,
          ...data,
        },
      });
    } catch (error) {
      logger.error('Error updating user preferences:', error);
      throw error;
    }
  }

  async getCategoryPreferences(userId: string): Promise<CategoryPreference[]> {
    try {
      return await this.prisma.categoryPreference.findMany({
        where: { userId },
        include: {
          category: true,
        },
        orderBy: { preferenceScore: 'desc' },
      });
    } catch (error) {
      logger.error('Error fetching category preferences:', error);
      throw error;
    }
  }

  async updateCategoryPreference(
    userId: string,
    categoryId: string,
    incrementType: 'view' | 'click' | 'purchase' | 'search'
  ): Promise<void> {
    try {
      const existing = await this.prisma.categoryPreference.findUnique({
        where: {
          userId_categoryId: { userId, categoryId },
        },
      });

      const now = new Date();
      const updates: any = {
        lastViewed: incrementType === 'view' ? now : undefined,
        lastPurchased: incrementType === 'purchase' ? now : undefined,
      };

      if (incrementType === 'view') {
        updates.viewCount = { increment: 1 };
      } else if (incrementType === 'click') {
        updates.clickCount = { increment: 1 };
      } else if (incrementType === 'purchase') {
        updates.purchaseCount = { increment: 1 };
      } else if (incrementType === 'search') {
        updates.searchCount = { increment: 1 };
      }

      if (existing) {
        await this.prisma.categoryPreference.update({
          where: {
            userId_categoryId: { userId, categoryId },
          },
          data: updates,
        });
      } else {
        await this.prisma.categoryPreference.create({
          data: {
            userId,
            categoryId,
            viewCount: incrementType === 'view' ? 1 : 0,
            clickCount: incrementType === 'click' ? 1 : 0,
            purchaseCount: incrementType === 'purchase' ? 1 : 0,
            searchCount: incrementType === 'search' ? 1 : 0,
            firstViewed: incrementType === 'view' ? now : null,
            lastViewed: incrementType === 'view' ? now : null,
            lastPurchased: incrementType === 'purchase' ? now : null,
            preferenceScore: 1.0,
          },
        });
      }

      // Recalculate preference score
      await this.recalculatePreferenceScore(userId, categoryId);
    } catch (error) {
      logger.error('Error updating category preference:', error);
      throw error;
    }
  }

  async getUserInterests(userId: string): Promise<UserInterest[]> {
    try {
      return await this.prisma.userInterest.findMany({
        where: { userId, isActive: true },
        orderBy: { strength: 'desc' },
      });
    } catch (error) {
      logger.error('Error fetching user interests:', error);
      throw error;
    }
  }

  async addUserInterest(
    userId: string,
    interestType: string,
    interestValue: string,
    strength: number = 1.0,
    source: string = 'behavior'
  ): Promise<void> {
    try {
      const now = new Date();
      await this.prisma.userInterest.upsert({
        where: {
          userId_interestType_interestValue: {
            userId,
            interestType,
            interestValue,
          },
        },
        update: {
          strength: { increment: strength * 0.1 }, // Gradually increase
          lastObserved: now,
          observationCount: { increment: 1 },
        },
        create: {
          userId,
          interestType,
          interestValue,
          strength,
          confidence: 0.5,
          source,
          firstObserved: now,
          lastObserved: now,
          observationCount: 1,
        },
      });
    } catch (error) {
      logger.error('Error adding user interest:', error);
      throw error;
    }
  }

  async getPersonalizedCategoryRanking(userId: string): Promise<string[]> {
    try {
      const preferences = await this.prisma.categoryPreference.findMany({
        where: { userId },
        orderBy: { preferenceScore: 'desc' },
        take: 20,
      });

      return preferences.map(p => p.categoryId);
    } catch (error) {
      logger.error('Error getting personalized category ranking:', error);
      return [];
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