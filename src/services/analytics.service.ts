import { PrismaClient } from '@prisma/client';
import { Client } from '@elastic/elasticsearch';
import { logger } from '@/utils/logger';
import { config } from '@/config/environment';

const prisma = new PrismaClient();

// Initialize Elasticsearch client for analytics
const elasticsearch = new Client({
  node: config.elasticsearch?.url || 'http://localhost:9200',
  auth: config.elasticsearch?.auth ? {
    username: config.elasticsearch.auth.username,
    password: config.elasticsearch.auth.password,
  } : undefined,
});

export interface UserBehaviorEvent {
  userId?: string;
  sessionId: string;
  eventType: 'page_view' | 'search' | 'product_view' | 'add_to_cart' | 'purchase' | 'rfq_created' | 'quote_submitted';
  eventData: {
    page?: string;
    searchQuery?: string;
    productId?: string;
    categoryId?: string;
    amount?: number;
    rfqId?: string;
    quoteId?: string;
    [key: string]: any;
  };
  timestamp: Date;
  userAgent?: string;
  ipAddress?: string;
  location?: {
    country?: string;
    state?: string;
    city?: string;
  };
}

export interface AnalyticsFilter {
  startDate: Date;
  endDate: Date;
  userId?: string;
  sellerId?: string;
  categoryId?: string;
  eventType?: string;
  groupBy?: 'day' | 'week' | 'month';
}

export interface BusinessPerformanceMetrics {
  totalRevenue: number;
  totalOrders: number;
  totalProducts: number;
  totalRFQs: number;
  totalQuotes: number;
  conversionRate: number;
  averageOrderValue: number;
  topCategories: Array<{
    categoryId: string;
    categoryName: string;
    revenue: number;
    orderCount: number;
  }>;
  topProducts: Array<{
    productId: string;
    productName: string;
    revenue: number;
    orderCount: number;
  }>;
  revenueByPeriod: Array<{
    period: string;
    revenue: number;
    orderCount: number;
  }>;
}

export interface UserBehaviorAnalytics {
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
  sessionDuration: number;
  bounceRate: number;
  topPages: Array<{
    page: string;
    views: number;
    uniqueViews: number;
  }>;
  topSearchQueries: Array<{
    query: string;
    count: number;
    resultCount: number;
  }>;
  userJourney: Array<{
    step: string;
    users: number;
    dropoffRate: number;
  }>;
}

export interface CustomReportConfig {
  name: string;
  description?: string;
  metrics: string[];
  dimensions: string[];
  filters: Record<string, any>;
  dateRange: {
    startDate: Date;
    endDate: Date;
  };
  groupBy?: 'day' | 'week' | 'month';
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

export class AnalyticsService {
  private static readonly ANALYTICS_INDEX = 'vikareta_analytics';
  private static readonly USER_BEHAVIOR_INDEX = 'vikareta_user_behavior';

  /**
   * Initialize analytics indices
   */
  static async initializeAnalyticsIndices(): Promise<void> {
    try {
      // Create analytics index
      const analyticsIndexExists = await elasticsearch.indices.exists({
        index: this.ANALYTICS_INDEX,
      });

      if (!analyticsIndexExists) {
        await elasticsearch.indices.create({
          index: this.ANALYTICS_INDEX,
          mappings: {
            properties: {
              userId: { type: 'keyword' },
              sellerId: { type: 'keyword' },
              eventType: { type: 'keyword' },
              eventData: { type: 'object' },
              amount: { type: 'float' },
              productId: { type: 'keyword' },
              categoryId: { type: 'keyword' },
              orderId: { type: 'keyword' },
              rfqId: { type: 'keyword' },
              quoteId: { type: 'keyword' },
              timestamp: { type: 'date' },
              location: {
                properties: {
                  country: { type: 'keyword' },
                  state: { type: 'keyword' },
                  city: { type: 'keyword' },
                }
              },
            },
          },
          settings: {
            'index.number_of_shards': 2,
            'index.number_of_replicas': 1,
          },
        });
        logger.info('Analytics index created successfully');
      }

      // Create user behavior index
      const behaviorIndexExists = await elasticsearch.indices.exists({
        index: this.USER_BEHAVIOR_INDEX,
      });

      if (!behaviorIndexExists) {
        await elasticsearch.indices.create({
          index: this.USER_BEHAVIOR_INDEX,
          mappings: {
            properties: {
              userId: { type: 'keyword' },
              sessionId: { type: 'keyword' },
              eventType: { type: 'keyword' },
              eventData: { type: 'object' },
              timestamp: { type: 'date' },
              userAgent: { type: 'text' },
              ipAddress: { type: 'ip' },
              location: {
                properties: {
                  country: { type: 'keyword' },
                  state: { type: 'keyword' },
                  city: { type: 'keyword' },
                }
              },
            },
          },
          settings: {
            'index.number_of_shards': 2,
            'index.number_of_replicas': 1,
          },
        });
        logger.info('User behavior index created successfully');
      }
    } catch (error) {
      logger.error('Failed to initialize analytics indices:', error);
      throw error;
    }
  }

  /**
   * Track user behavior event
   */
  static async trackUserBehavior(event: UserBehaviorEvent): Promise<void> {
    try {
      await elasticsearch.index({
        index: this.USER_BEHAVIOR_INDEX,
        document: {
          ...event,
          timestamp: event.timestamp.toISOString(),
        },
      });

      logger.debug(`User behavior tracked: ${event.eventType}`);
    } catch (error) {
      logger.error('Failed to track user behavior:', error);
      // Don't throw error to avoid breaking the main flow
    }
  }

  /**
   * Track business analytics event
   */
  static async trackBusinessEvent(event: {
    userId?: string;
    sellerId?: string;
    eventType: string;
    eventData: Record<string, any>;
    amount?: number;
    productId?: string;
    categoryId?: string;
    orderId?: string;
    rfqId?: string;
    quoteId?: string;
    timestamp?: Date;
  }): Promise<void> {
    try {
      await elasticsearch.index({
        index: this.ANALYTICS_INDEX,
        document: {
          ...event,
          timestamp: (event.timestamp || new Date()).toISOString(),
        },
      });

      logger.debug(`Business event tracked: ${event.eventType}`);
    } catch (error) {
      logger.error('Failed to track business event:', error);
    }
  }

  /**
   * Get business performance metrics
   */
  static async getBusinessPerformanceMetrics(
    sellerId: string,
    filters: AnalyticsFilter
  ): Promise<BusinessPerformanceMetrics> {
    try {
      const { startDate, endDate } = filters;

      // Get basic metrics from database
      const [orders, products, rfqs, quotes] = await Promise.all([
        prisma.order.findMany({
          where: {
            sellerId,
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
            status: 'completed',
          },
          include: {
            items: {
              include: {
                product: {
                  include: {
                    category: true,
                  },
                },
              },
            },
          },
        }),
        prisma.product.count({
          where: {
            sellerId,
            status: 'active',
          },
        }),
        prisma.rfq.count({
          where: {
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
            quotes: {
              some: {
                sellerId,
              },
            },
          },
        }),
        prisma.quote.count({
          where: {
            sellerId,
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
        }),
      ]);

      // Calculate metrics
      const totalRevenue = orders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
      const totalOrders = orders.length;
      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
      const conversionRate = rfqs > 0 ? (totalOrders / rfqs) * 100 : 0;

      // Get top categories
      const categoryRevenue = new Map<string, { name: string; revenue: number; orderCount: number }>();
      orders.forEach(order => {
        order.items.forEach(item => {
          const categoryId = item.product.categoryId;
          const categoryName = item.product.category.name;
          const itemRevenue = Number(item.totalPrice);
          
          if (categoryRevenue.has(categoryId)) {
            const existing = categoryRevenue.get(categoryId)!;
            existing.revenue += itemRevenue;
            existing.orderCount += 1;
          } else {
            categoryRevenue.set(categoryId, {
              name: categoryName,
              revenue: itemRevenue,
              orderCount: 1,
            });
          }
        });
      });

      const topCategories = Array.from(categoryRevenue.entries())
        .map(([categoryId, data]) => ({
          categoryId,
          categoryName: data.name,
          revenue: data.revenue,
          orderCount: data.orderCount,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      // Get top products
      const productRevenue = new Map<string, { name: string; revenue: number; orderCount: number }>();
      orders.forEach(order => {
        order.items.forEach(item => {
          const productId = item.productId;
          const productName = item.product.title;
          const itemRevenue = Number(item.totalPrice);
          
          if (productRevenue.has(productId)) {
            const existing = productRevenue.get(productId)!;
            existing.revenue += itemRevenue;
            existing.orderCount += 1;
          } else {
            productRevenue.set(productId, {
              name: productName,
              revenue: itemRevenue,
              orderCount: 1,
            });
          }
        });
      });

      const topProducts = Array.from(productRevenue.entries())
        .map(([productId, data]) => ({
          productId,
          productName: data.name,
          revenue: data.revenue,
          orderCount: data.orderCount,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      // Get revenue by period using Elasticsearch aggregation
      const periodAggregation = await elasticsearch.search({
        index: this.ANALYTICS_INDEX,
        query: {
          bool: {
            must: [
              { term: { sellerId } },
              { term: { eventType: 'order_completed' } },
              {
                range: {
                  timestamp: {
                    gte: startDate.toISOString(),
                    lte: endDate.toISOString(),
                  },
                },
              },
            ],
          },
        },
        aggs: {
          revenue_by_period: {
            date_histogram: {
              field: 'timestamp',
              calendar_interval: filters.groupBy || 'day',
              format: 'yyyy-MM-dd',
            },
            aggs: {
              total_revenue: {
                sum: { field: 'amount' },
              },
            },
          },
        },
        size: 0,
      });

      const revenueByPeriod = (periodAggregation.aggregations?.revenue_by_period as any)?.buckets?.map((bucket: any) => ({
        period: bucket.key_as_string,
        revenue: bucket.total_revenue.value || 0,
        orderCount: bucket.doc_count,
      })) || [];

      return {
        totalRevenue,
        totalOrders,
        totalProducts: products,
        totalRFQs: rfqs,
        totalQuotes: quotes,
        conversionRate,
        averageOrderValue,
        topCategories,
        topProducts,
        revenueByPeriod,
      };
    } catch (error) {
      logger.error('Failed to get business performance metrics:', error);
      throw error;
    }
  }

  /**
   * Get user behavior analytics
   */
  static async getUserBehaviorAnalytics(filters: AnalyticsFilter): Promise<UserBehaviorAnalytics> {
    try {
      const { startDate, endDate } = filters;

      // Get user behavior data from Elasticsearch
      const behaviorResponse = await elasticsearch.search({
        index: this.USER_BEHAVIOR_INDEX,
        query: {
          range: {
            timestamp: {
              gte: startDate.toISOString(),
              lte: endDate.toISOString(),
            },
          },
        },
        aggs: {
          total_users: {
            cardinality: { field: 'userId' },
          },
          total_sessions: {
            cardinality: { field: 'sessionId' },
          },
          new_users: {
            filter: {
              term: { eventType: 'user_registered' },
            },
            aggs: {
              count: {
                cardinality: { field: 'userId' },
              },
            },
          },
          top_pages: {
            filter: {
              term: { eventType: 'page_view' },
            },
            aggs: {
              pages: {
                terms: {
                  field: 'eventData.page.keyword',
                  size: 10,
                },
                aggs: {
                  unique_views: {
                    cardinality: { field: 'userId' },
                  },
                },
              },
            },
          },
          top_searches: {
            filter: {
              term: { eventType: 'search' },
            },
            aggs: {
              queries: {
                terms: {
                  field: 'eventData.searchQuery.keyword',
                  size: 10,
                },
              },
            },
          },
          session_duration: {
            scripted_metric: {
              init_script: 'state.sessions = [:]',
              map_script: `
                if (state.sessions.containsKey(doc['sessionId'].value)) {
                  state.sessions[doc['sessionId'].value].add(doc['timestamp'].value.millis);
                } else {
                  state.sessions[doc['sessionId'].value] = [doc['timestamp'].value.millis];
                }
              `,
              combine_script: `
                def durations = [];
                for (session in state.sessions.entrySet()) {
                  def times = session.getValue();
                  if (times.size() > 1) {
                    Collections.sort(times);
                    durations.add(times[times.size()-1] - times[0]);
                  }
                }
                return durations;
              `,
              reduce_script: `
                def allDurations = [];
                for (shard in states) {
                  allDurations.addAll(shard);
                }
                if (allDurations.size() == 0) return 0;
                def sum = 0;
                for (duration in allDurations) {
                  sum += duration;
                }
                return sum / allDurations.size();
              `,
            },
          },
        },
        size: 0,
      });

      const aggregations = behaviorResponse.aggregations as any;

      const totalUsers = aggregations.total_users.value || 0;
      const totalSessions = aggregations.total_sessions.value || 0;
      const newUsers = aggregations.new_users.count.value || 0;
      const activeUsers = totalUsers; // Simplified - users who had activity in the period
      const sessionDuration = Math.round((aggregations.session_duration.value || 0) / 1000); // Convert to seconds
      const bounceRate = totalSessions > 0 ? ((totalSessions - totalUsers) / totalSessions) * 100 : 0;

      const topPages = aggregations.top_pages.pages.buckets.map((bucket: any) => ({
        page: bucket.key,
        views: bucket.doc_count,
        uniqueViews: bucket.unique_views.value,
      }));

      const topSearchQueries = aggregations.top_searches.queries.buckets.map((bucket: any) => ({
        query: bucket.key,
        count: bucket.doc_count,
        resultCount: 0, // Would need additional data to calculate
      }));

      // Simplified user journey - would need more complex analysis in production
      const userJourney = [
        { step: 'Landing', users: totalUsers, dropoffRate: 0 },
        { step: 'Search', users: Math.round(totalUsers * 0.8), dropoffRate: 20 },
        { step: 'Product View', users: Math.round(totalUsers * 0.6), dropoffRate: 25 },
        { step: 'Add to Cart', users: Math.round(totalUsers * 0.3), dropoffRate: 50 },
        { step: 'Checkout', users: Math.round(totalUsers * 0.15), dropoffRate: 50 },
        { step: 'Purchase', users: Math.round(totalUsers * 0.1), dropoffRate: 33 },
      ];

      return {
        totalUsers,
        activeUsers,
        newUsers,
        sessionDuration,
        bounceRate,
        topPages,
        topSearchQueries,
        userJourney,
      };
    } catch (error) {
      logger.error('Failed to get user behavior analytics:', error);
      throw error;
    }
  }

  /**
   * Generate custom report
   */
  static async generateCustomReport(config: CustomReportConfig): Promise<{
    data: any[];
    summary: Record<string, any>;
    metadata: {
      generatedAt: Date;
      totalRecords: number;
      config: CustomReportConfig;
    };
  }> {
    try {
      const { metrics, dimensions, filters, dateRange, groupBy, sortBy, sortOrder, limit } = config;

      // Build Elasticsearch query
      const mustClauses: any[] = [
        {
          range: {
            timestamp: {
              gte: dateRange.startDate.toISOString(),
              lte: dateRange.endDate.toISOString(),
            },
          },
        },
      ];

      // Apply filters
      Object.entries(filters).forEach(([field, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            mustClauses.push({ terms: { [field]: value } });
          } else {
            mustClauses.push({ term: { [field]: value } });
          }
        }
      });

      // Build aggregations
      const aggs: any = {};

      // Group by dimension
      if (dimensions.length > 0) {
        const primaryDimension = dimensions[0];
        aggs.grouped_data = {
          terms: {
            field: primaryDimension,
            size: limit || 100,
            order: sortBy ? { [sortBy]: sortOrder || 'desc' } : { _count: 'desc' },
          },
          aggs: {},
        };

        // Add metric aggregations
        metrics.forEach(metric => {
          switch (metric) {
            case 'sum':
              aggs.grouped_data.aggs.total_amount = { sum: { field: 'amount' } };
              break;
            case 'avg':
              aggs.grouped_data.aggs.avg_amount = { avg: { field: 'amount' } };
              break;
            case 'count':
              // Count is automatically included in terms aggregation
              break;
            case 'unique_users':
              aggs.grouped_data.aggs.unique_users = { cardinality: { field: 'userId' } };
              break;
          }
        });

        // Add time-based grouping if specified
        if (groupBy) {
          aggs.grouped_data.aggs.time_series = {
            date_histogram: {
              field: 'timestamp',
              calendar_interval: groupBy,
              format: 'yyyy-MM-dd',
            },
            aggs: {
              total_amount: { sum: { field: 'amount' } },
            },
          };
        }
      }

      // Add summary aggregations
      aggs.summary = {
        global: {},
        aggs: {
          total_records: { value_count: { field: 'timestamp' } },
          total_amount: { sum: { field: 'amount' } },
          avg_amount: { avg: { field: 'amount' } },
          unique_users: { cardinality: { field: 'userId' } },
        },
      };

      const response = await elasticsearch.search({
        index: this.ANALYTICS_INDEX,
        query: {
          bool: { must: mustClauses },
        },
        aggs,
        size: 0,
      });

      const aggregations = response.aggregations as any;

      // Process grouped data
      const data = aggregations.grouped_data?.buckets?.map((bucket: any) => {
        const result: any = {
          [dimensions[0]]: bucket.key,
          count: bucket.doc_count,
        };

        // Add metric values
        if (bucket.total_amount) result.totalAmount = bucket.total_amount.value;
        if (bucket.avg_amount) result.avgAmount = bucket.avg_amount.value;
        if (bucket.unique_users) result.uniqueUsers = bucket.unique_users.value;

        // Add time series data if available
        if (bucket.time_series) {
          result.timeSeries = bucket.time_series.buckets.map((timeBucket: any) => ({
            period: timeBucket.key_as_string,
            count: timeBucket.doc_count,
            totalAmount: timeBucket.total_amount.value,
          }));
        }

        return result;
      }) || [];

      // Process summary
      const summary = {
        totalRecords: aggregations.summary.total_records.value,
        totalAmount: aggregations.summary.total_amount.value,
        avgAmount: aggregations.summary.avg_amount.value,
        uniqueUsers: aggregations.summary.unique_users.value,
      };

      return {
        data,
        summary,
        metadata: {
          generatedAt: new Date(),
          totalRecords: data.length,
          config,
        },
      };
    } catch (error) {
      logger.error('Failed to generate custom report:', error);
      throw error;
    }
  }

  /**
   * Get real-time analytics dashboard data
   */
  static async getRealTimeDashboard(): Promise<{
    activeUsers: number;
    currentSessions: number;
    recentOrders: number;
    recentRevenue: number;
    topProducts: Array<{
      productId: string;
      productName: string;
      views: number;
    }>;
    recentActivity: Array<{
      eventType: string;
      count: number;
      timestamp: Date;
    }>;
  }> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Get real-time metrics from Elasticsearch
      const response = await elasticsearch.search({
        index: this.USER_BEHAVIOR_INDEX,
        query: {
          range: {
            timestamp: {
              gte: oneHourAgo.toISOString(),
            },
          },
        },
        aggs: {
          active_users: {
            cardinality: { field: 'userId' },
          },
          current_sessions: {
            cardinality: { field: 'sessionId' },
          },
          top_products: {
            filter: {
              term: { eventType: 'product_view' },
            },
            aggs: {
              products: {
                terms: {
                  field: 'eventData.productId.keyword',
                  size: 5,
                },
              },
            },
          },
          recent_activity: {
            terms: {
              field: 'eventType',
              size: 10,
            },
          },
        },
        size: 0,
      });

      // Get recent orders from database
      const recentOrders = await prisma.order.count({
        where: {
          createdAt: {
            gte: oneDayAgo,
          },
          status: 'completed',
        },
      });

      const recentRevenue = await prisma.order.aggregate({
        where: {
          createdAt: {
            gte: oneDayAgo,
          },
          status: 'completed',
        },
        _sum: {
          totalAmount: true,
        },
      });

      const aggregations = response.aggregations as any;

      const topProducts = aggregations.top_products.products.buckets.map((bucket: any) => ({
        productId: bucket.key,
        productName: `Product ${bucket.key}`, // Would need to fetch actual names
        views: bucket.doc_count,
      }));

      const recentActivity = aggregations.recent_activity.buckets.map((bucket: any) => ({
        eventType: bucket.key,
        count: bucket.doc_count,
        timestamp: now,
      }));

      return {
        activeUsers: aggregations.active_users.value,
        currentSessions: aggregations.current_sessions.value,
        recentOrders,
        recentRevenue: Number(recentRevenue._sum.totalAmount || 0),
        topProducts,
        recentActivity,
      };
    } catch (error) {
      logger.error('Failed to get real-time dashboard data:', error);
      throw error;
    }
  }

  /**
   * Export analytics data
   */
  static async exportAnalyticsData(
    filters: AnalyticsFilter,
    format: 'csv' | 'json' | 'excel' = 'csv'
  ): Promise<{
    data: any[];
    filename: string;
    contentType: string;
  }> {
    try {
      const { startDate, endDate } = filters;

      // Get data from Elasticsearch
      const response = await elasticsearch.search({
        index: this.ANALYTICS_INDEX,
        query: {
          bool: {
            must: [
              {
                range: {
                  timestamp: {
                    gte: startDate.toISOString(),
                    lte: endDate.toISOString(),
                  },
                },
              },
            ],
          },
        },
        size: 10000, // Adjust based on needs
        sort: [{ timestamp: { order: 'desc' } }],
      });

      const data = (response.hits?.hits || []).map((hit: any) => hit._source);

      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `analytics_export_${timestamp}.${format}`;

      let contentType: string;
      switch (format) {
        case 'json':
          contentType = 'application/json';
          break;
        case 'excel':
          contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          break;
        default:
          contentType = 'text/csv';
      }

      return {
        data,
        filename,
        contentType,
      };
    } catch (error) {
      logger.error('Failed to export analytics data:', error);
      throw error;
    }
  }
}

export const analyticsService = new AnalyticsService();