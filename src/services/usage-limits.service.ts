import { BaseService } from './base.service';
import { logger } from '../utils/logger';

export interface MonthlyUsage {
  userId: string;
  month: string; // Format: YYYY-MM
  rfqPostsCount: number;
  quoteResponsesCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageLimits {
  rfqPostsLimit: number;
  quoteResponsesLimit: number;
}

export class UsageLimitsService extends BaseService {
  private readonly DEFAULT_LIMITS: UsageLimits = {
    rfqPostsLimit: 3,
    quoteResponsesLimit: 5,
  };

  /**
   * Get current month usage for a user
   */
  async getUserMonthlyUsage(userId: string): Promise<MonthlyUsage> {
    const currentMonth = this.getCurrentMonthKey();
    
    let usage = await this.prisma.monthlyUsage.findFirst({
      where: {
        userId,
        month: currentMonth,
      },
    });

    if (!usage) {
      // Create new usage record for current month
      usage = await this.prisma.monthlyUsage.create({
        data: {
          userId,
          month: currentMonth,
          rfqPostsCount: 0,
          quoteResponsesCount: 0,
        },
      });
    }

    return usage;
  }

  /**
   * Get usage limits for a user (currently same for all users)
   */
  async getUserLimits(): Promise<UsageLimits> {
    // In the future, this could be customized based on user subscription tier
    return this.DEFAULT_LIMITS;
  }

  /**
   * Check if user can post an RFQ
   */
  async canPostRfq(userId: string): Promise<{ canPost: boolean; remaining: number; limit: number }> {
    const [usage, limits] = await Promise.all([
      this.getUserMonthlyUsage(userId),
      this.getUserLimits(),
    ]);

    const canPost = usage.rfqPostsCount < limits.rfqPostsLimit;
    const remaining = Math.max(0, limits.rfqPostsLimit - usage.rfqPostsCount);

    return {
      canPost,
      remaining,
      limit: limits.rfqPostsLimit,
    };
  }

  /**
   * Check if user can respond to an RFQ with a quote
   */
  async canRespondToRfq(userId: string): Promise<{ canRespond: boolean; remaining: number; limit: number }> {
    const [usage, limits] = await Promise.all([
      this.getUserMonthlyUsage(userId),
      this.getUserLimits(),
    ]);

    const canRespond = usage.quoteResponsesCount < limits.quoteResponsesLimit;
    const remaining = Math.max(0, limits.quoteResponsesLimit - usage.quoteResponsesCount);

    return {
      canRespond,
      remaining,
      limit: limits.quoteResponsesLimit,
    };
  }

  /**
   * Increment RFQ post count for user
   */
  async incrementRfqPost(userId: string): Promise<MonthlyUsage> {
    const currentMonth = this.getCurrentMonthKey();

    const usage = await this.prisma.monthlyUsage.upsert({
      where: {
        userId_month: {
          userId,
          month: currentMonth,
        },
      },
      update: {
        rfqPostsCount: {
          increment: 1,
        },
      },
      create: {
        userId,
        month: currentMonth,
        rfqPostsCount: 1,
        quoteResponsesCount: 0,
      },
    });

    logger.info(`RFQ post count incremented for user ${userId}, new count: ${usage.rfqPostsCount}`);
    return usage;
  }

  /**
   * Increment quote response count for user
   */
  async incrementQuoteResponse(userId: string): Promise<MonthlyUsage> {
    const currentMonth = this.getCurrentMonthKey();

    const usage = await this.prisma.monthlyUsage.upsert({
      where: {
        userId_month: {
          userId,
          month: currentMonth,
        },
      },
      update: {
        quoteResponsesCount: {
          increment: 1,
        },
      },
      create: {
        userId,
        month: currentMonth,
        rfqPostsCount: 0,
        quoteResponsesCount: 1,
      },
    });

    logger.info(`Quote response count incremented for user ${userId}, new count: ${usage.quoteResponsesCount}`);
    return usage;
  }

  /**
   * Get usage summary for a user
   */
  async getUsageSummary(userId: string): Promise<{
    rfq: { used: number; limit: number; remaining: number };
    quotes: { used: number; limit: number; remaining: number };
    month: string;
  }> {
    const [usage, limits] = await Promise.all([
      this.getUserMonthlyUsage(userId),
      this.getUserLimits(),
    ]);

    return {
      rfq: {
        used: usage.rfqPostsCount,
        limit: limits.rfqPostsLimit,
        remaining: Math.max(0, limits.rfqPostsLimit - usage.rfqPostsCount),
      },
      quotes: {
        used: usage.quoteResponsesCount,
        limit: limits.quoteResponsesLimit,
        remaining: Math.max(0, limits.quoteResponsesLimit - usage.quoteResponsesCount),
      },
      month: usage.month,
    };
  }

  /**
   * Reset usage for a new month (can be used in cron job)
   */
  async resetMonthlyUsage(): Promise<void> {
    const currentMonth = this.getCurrentMonthKey();
    const lastMonth = this.getLastMonthKey();

    // Archive old usage data (optional - you might want to keep historical data)
    await this.prisma.monthlyUsage.updateMany({
      where: {
        month: {
          lt: lastMonth,
        },
      },
      data: {
        // You could mark as archived instead of deleting
        archived: true,
      },
    });

    logger.info(`Monthly usage reset completed for month: ${currentMonth}`);
  }

  /**
   * Get historical usage data for analytics
   */
  async getUserUsageHistory(userId: string, months = 12): Promise<MonthlyUsage[]> {
    const startMonth = this.getMonthKey(new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000));

    return this.prisma.monthlyUsage.findMany({
      where: {
        userId,
        month: {
          gte: startMonth,
        },
      },
      orderBy: {
        month: 'desc',
      },
    });
  }

  /**
   * Helper method to get current month key
   */
  private getCurrentMonthKey(): string {
    return this.getMonthKey(new Date());
  }

  /**
   * Helper method to get last month key
   */
  private getLastMonthKey(): string {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    return this.getMonthKey(lastMonth);
  }

  /**
   * Helper method to format date as month key
   */
  private getMonthKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }
}

export const usageLimitsService = new UsageLimitsService();