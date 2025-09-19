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

export interface GuestPersonalizationData {
  guestId: string;
  preferences: {
    language: string;
    currency: string;
    theme: 'light' | 'dark' | 'auto';
    location?: {
      country: string;
      city: string;
      timezone: string;
    };
    notifications: {
      email: boolean;
      push: boolean;
      sms: boolean;
    };
  };
  browsingHistory: {
    recentlyViewed: string[]; // Product IDs
    searchHistory: string[];
    categoryViews: Record<string, number>; // Category ID -> view count
  };
  cart: {
    items: Array<{
      productId: string;
      quantity: number;
      addedAt: string;
      variant?: Record<string, any>;
    }>;
    lastUpdated: string;
  };
  wishlist: string[]; // Product IDs
  recommendations: {
    viewedProducts: string[];
    purchasedCategories: string[];
    searchTerms: string[];
  };
  sessionData: {
    createdAt: string;
    lastActivity: string;
    pageViews: number;
    timeSpent: number; // in seconds
    deviceInfo: {
      userAgent: string;
      screenSize: string;
      platform: string;
    };
  };
}

export interface PersonalizationUpdate {
  preferences?: Partial<GuestPersonalizationData['preferences']>;
  browsingHistory?: Partial<GuestPersonalizationData['browsingHistory']>;
  cart?: Partial<GuestPersonalizationData['cart']>;
  wishlist?: string[];
  recommendations?: Partial<GuestPersonalizationData['recommendations']>;
  sessionData?: Partial<GuestPersonalizationData['sessionData']>;
}

export class PersonalizationService extends BaseService {
  private readonly GUEST_DATA_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
  private readonly MAX_RECENTLY_VIEWED = 20;
  private readonly MAX_SEARCH_HISTORY = 10;

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

  // ===== GUEST USER PERSONALIZATION METHODS =====

  /**
   * Create initial personalization data for a guest user
   */
  async createGuestPersonalization(
    guestId: string,
    initialData?: Partial<GuestPersonalizationData>
  ): Promise<GuestPersonalizationData> {
    try {
      const personalizationData: GuestPersonalizationData = {
        guestId,
        preferences: {
          language: initialData?.preferences?.language || 'en',
          currency: initialData?.preferences?.currency || 'USD',
          theme: initialData?.preferences?.theme || 'auto',
          location: initialData?.preferences?.location,
          notifications: {
            email: false,
            push: false,
            sms: false,
            ...initialData?.preferences?.notifications,
          },
        },
        browsingHistory: {
          recentlyViewed: [],
          searchHistory: [],
          categoryViews: {},
          ...initialData?.browsingHistory,
        },
        cart: {
          items: [],
          lastUpdated: new Date().toISOString(),
          ...initialData?.cart,
        },
        wishlist: initialData?.wishlist || [],
        recommendations: {
          viewedProducts: [],
          purchasedCategories: [],
          searchTerms: [],
          ...initialData?.recommendations,
        },
        sessionData: {
          createdAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
          pageViews: 0,
          timeSpent: 0,
          deviceInfo: {
            userAgent: '',
            screenSize: '',
            platform: '',
          },
          ...initialData?.sessionData,
        },
      };

      // Store in Redis with TTL
      await this.cache.setex(
        `guest_personalization:${guestId}`,
        this.GUEST_DATA_TTL,
        JSON.stringify(personalizationData)
      );

      logger.info(`Created personalization data for guest: ${guestId}`);
      return personalizationData;
    } catch (error) {
      logger.error('Failed to create guest personalization:', error);
      throw error;
    }
  }

  /**
   * Get personalization data for a guest user
   */
  async getGuestPersonalization(guestId: string): Promise<GuestPersonalizationData | null> {
    try {
      const data = await this.cache.get(`guest_personalization:${guestId}`);
      if (!data) {
        return null;
      }

      const personalizationData = JSON.parse(data) as GuestPersonalizationData;

      // Update last activity
      personalizationData.sessionData.lastActivity = new Date().toISOString();
      await this.updateGuestPersonalization(guestId, {
        sessionData: { lastActivity: personalizationData.sessionData.lastActivity }
      });

      return personalizationData;
    } catch (error) {
      logger.error('Failed to get guest personalization:', error);
      return null;
    }
  }

  /**
   * Update personalization data for a guest user
   */
  async updateGuestPersonalization(
    guestId: string,
    updates: PersonalizationUpdate
  ): Promise<GuestPersonalizationData | null> {
    try {
      const existingData = await this.getGuestPersonalization(guestId);
      if (!existingData) {
        return null;
      }

      // Merge updates
      const updatedData: GuestPersonalizationData = {
        ...existingData,
        ...updates,
        preferences: { ...existingData.preferences, ...updates.preferences },
        browsingHistory: { ...existingData.browsingHistory, ...updates.browsingHistory },
        cart: {
          ...existingData.cart,
          ...updates.cart,
          lastUpdated: new Date().toISOString(),
        },
        recommendations: { ...existingData.recommendations, ...updates.recommendations },
        sessionData: {
          ...existingData.sessionData,
          lastActivity: new Date().toISOString(),
          ...updates.sessionData,
        },
      };

      // Store updated data
      await this.cache.setex(
        `guest_personalization:${guestId}`,
        this.GUEST_DATA_TTL,
        JSON.stringify(updatedData)
      );

      return updatedData;
    } catch (error) {
      logger.error('Failed to update guest personalization:', error);
      throw error;
    }
  }

  /**
   * Add product to recently viewed
   */
  async addToRecentlyViewed(guestId: string, productId: string): Promise<void> {
    try {
      const data = await this.getGuestPersonalization(guestId);
      if (!data) return;

      // Remove if already exists, then add to front
      const recentlyViewed = data.browsingHistory.recentlyViewed.filter(id => id !== productId);
      recentlyViewed.unshift(productId);

      // Keep only the most recent items
      if (recentlyViewed.length > this.MAX_RECENTLY_VIEWED) {
        recentlyViewed.splice(this.MAX_RECENTLY_VIEWED);
      }

      await this.updateGuestPersonalization(guestId, {
        browsingHistory: { recentlyViewed },
        recommendations: {
          viewedProducts: recentlyViewed.slice(0, 10), // Keep top 10 for recommendations
        },
      });
    } catch (error) {
      logger.error('Failed to add to recently viewed:', error);
    }
  }

  /**
   * Add search term to history
   */
  async addToSearchHistory(guestId: string, searchTerm: string): Promise<void> {
    try {
      const data = await this.getGuestPersonalization(guestId);
      if (!data) return;

      // Remove if already exists, then add to front
      const searchHistory = data.browsingHistory.searchHistory.filter(term => term !== searchTerm);
      searchHistory.unshift(searchTerm);

      // Keep only the most recent searches
      if (searchHistory.length > this.MAX_SEARCH_HISTORY) {
        searchHistory.splice(this.MAX_SEARCH_HISTORY);
      }

      await this.updateGuestPersonalization(guestId, {
        browsingHistory: { searchHistory },
        recommendations: { searchTerms: searchHistory.slice(0, 5) },
      });
    } catch (error) {
      logger.error('Failed to add to search history:', error);
    }
  }

  /**
   * Update category view count
   */
  async updateCategoryView(guestId: string, categoryId: string): Promise<void> {
    try {
      const data = await this.getGuestPersonalization(guestId);
      if (!data) return;

      const categoryViews = { ...data.browsingHistory.categoryViews };
      categoryViews[categoryId] = (categoryViews[categoryId] || 0) + 1;

      await this.updateGuestPersonalization(guestId, {
        browsingHistory: { categoryViews },
      });
    } catch (error) {
      logger.error('Failed to update category view:', error);
    }
  }

  /**
   * Add item to cart
   */
  async addToCart(
    guestId: string,
    productId: string,
    quantity: number = 1,
    variant?: Record<string, any>
  ): Promise<void> {
    try {
      const data = await this.getGuestPersonalization(guestId);
      if (!data) return;

      const existingItemIndex = data.cart.items.findIndex(item => item.productId === productId);

      if (existingItemIndex >= 0) {
        // Update existing item
        data.cart.items[existingItemIndex].quantity += quantity;
      } else {
        // Add new item
        data.cart.items.push({
          productId,
          quantity,
          addedAt: new Date().toISOString(),
          variant,
        });
      }

      await this.updateGuestPersonalization(guestId, {
        cart: { items: data.cart.items },
      });
    } catch (error) {
      logger.error('Failed to add to cart:', error);
    }
  }

  /**
   * Remove item from cart
   */
  async removeFromCart(guestId: string, productId: string): Promise<void> {
    try {
      const data = await this.getGuestPersonalization(guestId);
      if (!data) return;

      data.cart.items = data.cart.items.filter(item => item.productId !== productId);

      await this.updateGuestPersonalization(guestId, {
        cart: { items: data.cart.items },
      });
    } catch (error) {
      logger.error('Failed to remove from cart:', error);
    }
  }

  /**
   * Update cart item quantity
   */
  async updateCartItemQuantity(guestId: string, productId: string, quantity: number): Promise<void> {
    try {
      const data = await this.getGuestPersonalization(guestId);
      if (!data) return;

      const itemIndex = data.cart.items.findIndex(item => item.productId === productId);
      if (itemIndex >= 0) {
        if (quantity <= 0) {
          data.cart.items.splice(itemIndex, 1);
        } else {
          data.cart.items[itemIndex].quantity = quantity;
        }

        await this.updateGuestPersonalization(guestId, {
          cart: { items: data.cart.items },
        });
      }
    } catch (error) {
      logger.error('Failed to update cart item quantity:', error);
    }
  }

  /**
   * Add/remove product from wishlist
   */
  async toggleWishlist(guestId: string, productId: string): Promise<boolean> {
    try {
      const data = await this.getGuestPersonalization(guestId);
      if (!data) return false;

      const isInWishlist = data.wishlist.includes(productId);
      if (isInWishlist) {
        data.wishlist = data.wishlist.filter(id => id !== productId);
      } else {
        data.wishlist.push(productId);
      }

      await this.updateGuestPersonalization(guestId, {
        wishlist: data.wishlist,
      });

      return !isInWishlist; // Return true if added, false if removed
    } catch (error) {
      logger.error('Failed to toggle wishlist:', error);
      return false;
    }
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(
    guestId: string,
    activity: {
      pageViews?: number;
      timeSpent?: number;
      deviceInfo?: Partial<GuestPersonalizationData['sessionData']['deviceInfo']>;
    }
  ): Promise<void> {
    try {
      const data = await this.getGuestPersonalization(guestId);
      if (!data) return;

      const sessionData = { ...data.sessionData };

      if (activity.pageViews !== undefined) {
        sessionData.pageViews += activity.pageViews;
      }

      if (activity.timeSpent !== undefined) {
        sessionData.timeSpent += activity.timeSpent;
      }

      if (activity.deviceInfo) {
        sessionData.deviceInfo = { ...sessionData.deviceInfo, ...activity.deviceInfo };
      }

      await this.updateGuestPersonalization(guestId, { sessionData });
    } catch (error) {
      logger.error('Failed to update session activity:', error);
    }
  }

  /**
   * Get personalized recommendations for a guest user
   */
  async getPersonalizedRecommendations(guestId: string): Promise<{
    recentlyViewed: string[];
    recommendedProducts: string[];
    trendingCategories: string[];
    suggestedSearches: string[];
  }> {
    try {
      const data = await this.getGuestPersonalization(guestId);
      if (!data) {
        return {
          recentlyViewed: [],
          recommendedProducts: [],
          trendingCategories: [],
          suggestedSearches: [],
        };
      }

      // Get trending categories based on view counts
      const trendingCategories = Object.entries(data.browsingHistory.categoryViews)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([categoryId]) => categoryId);

      return {
        recentlyViewed: data.browsingHistory.recentlyViewed.slice(0, 5),
        recommendedProducts: this.generateProductRecommendations(data),
        trendingCategories,
        suggestedSearches: data.browsingHistory.searchHistory.slice(0, 5),
      };
    } catch (error) {
      logger.error('Failed to get personalized recommendations:', error);
      return {
        recentlyViewed: [],
        recommendedProducts: [],
        trendingCategories: [],
        suggestedSearches: [],
      };
    }
  }

  /**
   * Generate product recommendations based on user behavior
   */
  private generateProductRecommendations(data: GuestPersonalizationData): string[] {
    const recommendations = new Set<string>();

    // Add products from recently viewed (similar products could be added here)
    data.browsingHistory.recentlyViewed.slice(0, 3).forEach(productId => {
      recommendations.add(productId);
    });

    // Add products from wishlist
    data.wishlist.slice(0, 3).forEach(productId => {
      recommendations.add(productId);
    });

    // Add products from cart (frequently bought together could be added here)
    data.cart.items.slice(0, 3).forEach(item => {
      recommendations.add(item.productId);
    });

    return Array.from(recommendations).slice(0, 10);
  }

  /**
   * Clear all personalization data for a guest user
   */
  async clearGuestPersonalization(guestId: string): Promise<void> {
    try {
      await this.cache.del(`guest_personalization:${guestId}`);
      logger.info(`Cleared personalization data for guest: ${guestId}`);
    } catch (error) {
      logger.error('Failed to clear guest personalization:', error);
    }
  }

  /**
   * Migrate guest personalization data to registered user
   */
  async migrateGuestToUser(guestId: string, userId: string): Promise<void> {
    try {
      const guestData = await this.getGuestPersonalization(guestId);
      if (!guestData) return;

      // Here you would typically migrate the data to the user's permanent profile
      // For now, we'll just clear the guest data
      await this.clearGuestPersonalization(guestId);

      logger.info(`Migrated guest personalization from ${guestId} to user ${userId}`);
    } catch (error) {
      logger.error('Failed to migrate guest to user:', error);
    }
  }
}