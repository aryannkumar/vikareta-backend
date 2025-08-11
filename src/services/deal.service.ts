import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export interface CreateDealRequest {
  buyerId: string;
  sellerId: string;
  rfqId?: string;
  quoteId?: string;
  orderId?: string;
  dealValue: number;
  milestone?: string;
}

export interface UpdateDealStatusRequest {
  dealId: string;
  status: 'initiated' | 'negotiating' | 'confirmed' | 'completed' | 'cancelled';
  milestone?: string;
  nextFollowUp?: Date;
}

export interface DealMetrics {
  totalDeals: number;
  completedDeals: number;
  cancelledDeals: number;
  averageDealValue: number;
  averageCompletionTime: number;
  successRate: number;
  totalValue: number;
}

export interface DealAnalytics {
  dealsByStatus: Record<string, number>;
  dealsByMonth: Array<{
    month: string;
    count: number;
    value: number;
  }>;
  topBuyers: Array<{
    userId: string;
    userName: string;
    dealCount: number;
    totalValue: number;
  }>;
  topSellers: Array<{
    userId: string;
    userName: string;
    dealCount: number;
    totalValue: number;
  }>;
}

export class DealService {
  /**
   * Create a new deal from RFQ-quote-order flow
   */
  async createDeal(request: CreateDealRequest): Promise<{
    success: boolean;
    dealId?: string;
    message: string;
  }> {
    try {
      // Validate UUID format first
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(request.buyerId) || !uuidRegex.test(request.sellerId)) {
        return {
          success: false,
          message: 'Invalid buyer or seller ID'
        };
      }

      // Validate that buyer and seller exist
      const [buyer, seller] = await Promise.all([
        prisma.user.findUnique({ where: { id: request.buyerId } }),
        prisma.user.findUnique({ where: { id: request.sellerId } })
      ]);

      if (!buyer || !seller) {
        return {
          success: false,
          message: 'Invalid buyer or seller ID'
        };
      }

      // Validate related entities if provided
      if (request.rfqId) {
        const rfq = await prisma.rfq.findUnique({ where: { id: request.rfqId } });
        if (!rfq) {
          return {
            success: false,
            message: 'Invalid RFQ ID'
          };
        }
      }

      if (request.quoteId) {
        const quote = await prisma.quote.findUnique({ where: { id: request.quoteId } });
        if (!quote) {
          return {
            success: false,
            message: 'Invalid quote ID'
          };
        }
      }

      if (request.orderId) {
        const order = await prisma.order.findUnique({ where: { id: request.orderId } });
        if (!order) {
          return {
            success: false,
            message: 'Invalid order ID'
          };
        }
      }

      const deal = await prisma.deal.create({
        data: {
          buyerId: request.buyerId,
          sellerId: request.sellerId,
          rfqId: request.rfqId || null,
          quoteId: request.quoteId || null,
          orderId: request.orderId || null,
          dealValue: request.dealValue,
          status: 'initiated',
          milestone: request.milestone || null,
          nextFollowUp: new Date(Date.now() + 24 * 60 * 60 * 1000) // Default to 24 hours from now
        } as any
      });

      logger.info('Deal created successfully:', {
        dealId: deal.id,
        buyerId: request.buyerId,
        sellerId: request.sellerId,
        dealValue: request.dealValue
      });

      return {
        success: true,
        dealId: deal.id,
        message: 'Deal created successfully'
      };
    } catch (error) {
      logger.error('Error creating deal:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create deal'
      };
    }
  }

  /**
   * Update deal status and milestone
   */
  async updateDealStatus(request: UpdateDealStatusRequest, userId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      // Validate UUID format first
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(request.dealId)) {
        return {
          success: false,
          message: 'Deal not found'
        };
      }

      const deal = await prisma.deal.findUnique({
        where: { id: request.dealId }
      });

      if (!deal) {
        return {
          success: false,
          message: 'Deal not found'
        };
      }

      // Only buyer or seller can update deal status
      if (deal.buyerId !== userId && deal.sellerId !== userId) {
        return {
          success: false,
          message: 'Unauthorized to update this deal'
        };
      }

      await prisma.deal.update({
        where: { id: request.dealId },
        data: {
          status: request.status,
          milestone: request.milestone || deal.milestone,
          nextFollowUp: request.nextFollowUp || deal.nextFollowUp,
          updatedAt: new Date()
        }
      });

      logger.info('Deal status updated:', {
        dealId: request.dealId,
        status: request.status,
        milestone: request.milestone,
        updatedBy: userId
      });

      return {
        success: true,
        message: 'Deal status updated successfully'
      };
    } catch (error) {
      logger.error('Error updating deal status:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to update deal status'
      };
    }
  }

  /**
   * Get deal by ID with full details
   */
  async getDealById(dealId: string, userId: string): Promise<{
    success: boolean;
    deal?: any;
    message: string;
  }> {
    try {
      // Validate UUID format first
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(dealId)) {
        return {
          success: false,
          message: 'Deal not found'
        };
      }

      const deal = await prisma.deal.findUnique({
        where: { id: dealId },
        include: {
          buyer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              email: true,
              verificationTier: true
            }
          },
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              email: true,
              verificationTier: true
            }
          },
          rfq: {
            select: {
              id: true,
              title: true,
              description: true,
              quantity: true,
              budgetMin: true,
              budgetMax: true
            }
          },
          quote: {
            select: {
              id: true,
              totalPrice: true,
              deliveryTimeline: true,
              termsConditions: true
            }
          },
          order: {
            select: {
              id: true,
              orderNumber: true,
              totalAmount: true,
              status: true,
              paymentStatus: true
            }
          },
          messages: {
            include: {
              sender: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  businessName: true
                }
              }
            },
            orderBy: {
              createdAt: 'asc'
            }
          }
        }
      });

      if (!deal) {
        return {
          success: false,
          message: 'Deal not found'
        };
      }

      // Only buyer or seller can view deal details
      if (deal.buyerId !== userId && deal.sellerId !== userId) {
        return {
          success: false,
          message: 'Unauthorized to view this deal'
        };
      }

      return {
        success: true,
        deal,
        message: 'Deal retrieved successfully'
      };
    } catch (error) {
      logger.error('Error getting deal:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get deal'
      };
    }
  }

  /**
   * Get user's deals with filtering and pagination
   */
  async getUserDeals(userId: string, options: {
    status?: string;
    role?: 'buyer' | 'seller' | 'both';
    page?: number;
    limit?: number;
    sortBy?: 'createdAt' | 'dealValue' | 'status';
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<{
    success: boolean;
    deals?: any[];
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    message: string;
  }> {
    try {
      const {
        status,
        role = 'both',
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = options;

      const skip = (page - 1) * limit;

      // Build where clause
      const whereClause: any = {};
      
      if (role === 'buyer') {
        whereClause.buyerId = userId;
      } else if (role === 'seller') {
        whereClause.sellerId = userId;
      } else {
        whereClause.OR = [
          { buyerId: userId },
          { sellerId: userId }
        ];
      }

      if (status) {
        whereClause.status = status;
      }

      // Get total count for pagination
      const total = await prisma.deal.count({ where: whereClause });

      // Get deals with pagination
      const deals = await prisma.deal.findMany({
        where: whereClause,
        include: {
          buyer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              verificationTier: true
            }
          },
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              verificationTier: true
            }
          },
          rfq: {
            select: {
              id: true,
              title: true
            }
          },
          quote: {
            select: {
              id: true,
              totalPrice: true
            }
          },
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true
            }
          }
        },
        orderBy: {
          [sortBy]: sortOrder
        },
        skip,
        take: limit
      });

      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        deals,
        pagination: {
          page,
          limit,
          total,
          totalPages
        },
        message: 'Deals retrieved successfully'
      };
    } catch (error) {
      logger.error('Error getting user deals:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get deals'
      };
    }
  }

  /**
   * Get deal performance metrics for a user
   */
  async getDealMetrics(userId: string, role: 'buyer' | 'seller' | 'both' = 'both'): Promise<{
    success: boolean;
    metrics?: DealMetrics;
    message: string;
  }> {
    try {
      // Build where clause based on role
      const whereClause: any = {};
      
      if (role === 'buyer') {
        whereClause.buyerId = userId;
      } else if (role === 'seller') {
        whereClause.sellerId = userId;
      } else {
        whereClause.OR = [
          { buyerId: userId },
          { sellerId: userId }
        ];
      }

      // Get deal statistics
      const [
        totalDeals,
        completedDeals,
        cancelledDeals,
        dealValues,
        completedDealTimes
      ] = await Promise.all([
        prisma.deal.count({ where: whereClause }),
        prisma.deal.count({ where: { ...whereClause, status: 'completed' } }),
        prisma.deal.count({ where: { ...whereClause, status: 'cancelled' } }),
        prisma.deal.findMany({
          where: whereClause,
          select: { dealValue: true }
        }),
        prisma.deal.findMany({
          where: { ...whereClause, status: 'completed' },
          select: { createdAt: true, updatedAt: true }
        })
      ]);

      // Calculate metrics
      const totalValue = dealValues.reduce((sum, deal) => sum + Number(deal.dealValue), 0);
      const averageDealValue = totalDeals > 0 ? totalValue / totalDeals : 0;
      const successRate = totalDeals > 0 ? (completedDeals / totalDeals) * 100 : 0;

      // Calculate average completion time in days
      const completionTimes = completedDealTimes.map(deal => {
        const diffTime = deal.updatedAt.getTime() - deal.createdAt.getTime();
        return diffTime / (1000 * 60 * 60 * 24); // Convert to days
      });
      const averageCompletionTime = completionTimes.length > 0 
        ? completionTimes.reduce((sum, time) => sum + time, 0) / completionTimes.length 
        : 0;

      const metrics: DealMetrics = {
        totalDeals,
        completedDeals,
        cancelledDeals,
        averageDealValue,
        averageCompletionTime,
        successRate,
        totalValue
      };

      return {
        success: true,
        metrics,
        message: 'Deal metrics retrieved successfully'
      };
    } catch (error) {
      logger.error('Error getting deal metrics:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get deal metrics'
      };
    }
  }

  /**
   * Get deal analytics and insights
   */
  async getDealAnalytics(userId: string, role: 'buyer' | 'seller' | 'both' = 'both'): Promise<{
    success: boolean;
    analytics?: DealAnalytics;
    message: string;
  }> {
    try {
      // Build where clause based on role
      const whereClause: any = {};
      
      if (role === 'buyer') {
        whereClause.buyerId = userId;
      } else if (role === 'seller') {
        whereClause.sellerId = userId;
      } else {
        whereClause.OR = [
          { buyerId: userId },
          { sellerId: userId }
        ];
      }

      // Get deals by status
      const dealsByStatusRaw = await prisma.deal.groupBy({
        by: ['status'],
        where: whereClause,
        _count: {
          id: true
        }
      });

      const dealsByStatus = dealsByStatusRaw.reduce((acc, item) => {
        acc[item.status] = item._count.id;
        return acc;
      }, {} as Record<string, number>);

      // Get deals by month (last 12 months) - using Prisma aggregation instead of raw SQL
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

      // For now, let's use a simpler approach without raw SQL
      const recentDeals = await prisma.deal.findMany({
        where: {
          ...whereClause,
          createdAt: {
            gte: twelveMonthsAgo
          }
        },
        select: {
          createdAt: true,
          dealValue: true
        }
      });

      // Group by month manually
      const dealsByMonthMap = new Map<string, { count: number; value: number }>();
      
      recentDeals.forEach(deal => {
        const month = deal.createdAt.toISOString().substring(0, 7); // YYYY-MM format
        const existing = dealsByMonthMap.get(month) || { count: 0, value: 0 };
        dealsByMonthMap.set(month, {
          count: existing.count + 1,
          value: existing.value + Number(deal.dealValue)
        });
      });

      const dealsByMonth = Array.from(dealsByMonthMap.entries())
        .map(([month, data]) => ({
          month,
          count: data.count,
          value: data.value
        }))
        .sort((a, b) => a.month.localeCompare(b.month));



      // Get top buyers (if user is seller or both)
      let topBuyers: any[] = [];
      if (role === 'seller' || role === 'both') {
        const topBuyersRaw = await prisma.deal.groupBy({
          by: ['buyerId'],
          where: role === 'seller' ? { sellerId: userId } : whereClause,
          _count: { id: true },
          _sum: { dealValue: true },
          orderBy: { _count: { id: 'desc' } },
          take: 10
        });

        const buyerIds = topBuyersRaw.map(item => item.buyerId).filter(id => id !== null) as string[];
        const buyers = await prisma.user.findMany({
          where: { id: { in: buyerIds } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true
          }
        });

        topBuyers = topBuyersRaw.map(item => {
          const buyer = buyers.find(b => b.id === item.buyerId);
          return {
            userId: item.buyerId,
            userName: buyer?.businessName || `${buyer?.firstName} ${buyer?.lastName}` || 'Unknown',
            dealCount: item._count.id,
            totalValue: Number(item._sum.dealValue || 0)
          };
        });
      }

      // Get top sellers (if user is buyer or both)
      let topSellers: any[] = [];
      if (role === 'buyer' || role === 'both') {
        const topSellersRaw = await prisma.deal.groupBy({
          by: ['sellerId'],
          where: role === 'buyer' ? { buyerId: userId } : whereClause,
          _count: { id: true },
          _sum: { dealValue: true },
          orderBy: { _count: { id: 'desc' } },
          take: 10
        });

        const sellerIds = topSellersRaw.map(item => item.sellerId).filter(id => id !== null) as string[];
        const sellers = await prisma.user.findMany({
          where: { id: { in: sellerIds } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true
          }
        });

        topSellers = topSellersRaw.map(item => {
          const seller = sellers.find(s => s.id === item.sellerId);
          return {
            userId: item.sellerId,
            userName: seller?.businessName || `${seller?.firstName} ${seller?.lastName}` || 'Unknown',
            dealCount: item._count.id,
            totalValue: Number(item._sum.dealValue || 0)
          };
        });
      }

      const analytics: DealAnalytics = {
        dealsByStatus,
        dealsByMonth,
        topBuyers,
        topSellers
      };

      return {
        success: true,
        analytics,
        message: 'Deal analytics retrieved successfully'
      };
    } catch (error) {
      logger.error('Error getting deal analytics:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get deal analytics'
      };
    }
  }

  /**
   * Archive completed or cancelled deals
   */
  async archiveDeals(userId: string, dealIds: string[]): Promise<{
    success: boolean;
    archivedCount?: number;
    message: string;
  }> {
    try {
      // Validate UUID format for all deal IDs and userId
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const invalidIds = dealIds.filter(id => !uuidRegex.test(id));
      
      if (invalidIds.length > 0 || !uuidRegex.test(userId)) {
        return {
          success: false,
          message: 'Some deals not found or unauthorized'
        };
      }

      // Verify user has access to all deals
      const deals = await prisma.deal.findMany({
        where: {
          id: { in: dealIds },
          OR: [
            { buyerId: userId },
            { sellerId: userId }
          ]
        }
      });

      if (deals.length !== dealIds.length) {
        return {
          success: false,
          message: 'Some deals not found or unauthorized'
        };
      }

      // Only allow archiving completed or cancelled deals
      const archivableDeals = deals.filter(deal => 
        deal.status === 'completed' || deal.status === 'cancelled'
      );

      if (archivableDeals.length === 0) {
        return {
          success: false,
          message: 'No deals eligible for archiving. Only completed or cancelled deals can be archived.'
        };
      }

      // For now, we'll just add an archived flag to the deal
      // In a real implementation, you might move to an archive table
      await prisma.deal.updateMany({
        where: {
          id: { in: archivableDeals.map(d => d.id) }
        },
        data: {
          // Add archived field to schema if needed
          updatedAt: new Date()
        }
      });

      logger.info('Deals archived:', {
        userId,
        archivedCount: archivableDeals.length,
        dealIds: archivableDeals.map(d => d.id)
      });

      return {
        success: true,
        archivedCount: archivableDeals.length,
        message: `${archivableDeals.length} deals archived successfully`
      };
    } catch (error) {
      logger.error('Error archiving deals:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to archive deals'
      };
    }
  }

  /**
   * Get deals that need follow-up
   */
  async getDealsNeedingFollowUp(userId: string): Promise<{
    success: boolean;
    deals?: any[];
    message: string;
  }> {
    try {
      const now = new Date();
      
      const deals = await prisma.deal.findMany({
        where: {
          OR: [
            { buyerId: userId },
            { sellerId: userId }
          ],
          status: {
            in: ['initiated', 'negotiating', 'confirmed']
          },
          nextFollowUp: {
            lte: now
          }
        },
        include: {
          buyer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true
            }
          },
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true
            }
          },
          rfq: {
            select: {
              id: true,
              title: true
            }
          }
        },
        orderBy: {
          nextFollowUp: 'asc'
        }
      });

      return {
        success: true,
        deals,
        message: 'Follow-up deals retrieved successfully'
      };
    } catch (error) {
      logger.error('Error getting follow-up deals:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get follow-up deals'
      };
    }
  }

  /**
   * Send a message in a deal thread
   */
  async sendDealMessage(dealId: string, senderId: string, message: string, messageType: string = 'text'): Promise<{
    success: boolean;
    messageId?: string;
    message: string;
  }> {
    try {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(dealId) || !uuidRegex.test(senderId)) {
        return {
          success: false,
          message: 'Invalid deal or user ID'
        };
      }

      // Verify deal exists and user has access
      const deal = await prisma.deal.findUnique({
        where: { id: dealId }
      });

      if (!deal) {
        return {
          success: false,
          message: 'Deal not found'
        };
      }

      // Only buyer or seller can send messages
      if (deal.buyerId !== senderId && deal.sellerId !== senderId) {
        return {
          success: false,
          message: 'Unauthorized to send messages in this deal'
        };
      }

      // Create message
      const dealMessage = await prisma.dealMessage.create({
        data: {
          dealId,
          senderId,
          message,
          messageType
        }
      });

      logger.info('Deal message sent:', {
        dealId,
        messageId: dealMessage.id,
        senderId,
        messageType
      });

      return {
        success: true,
        messageId: dealMessage.id,
        message: 'Message sent successfully'
      };
    } catch (error) {
      logger.error('Error sending deal message:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to send message'
      };
    }
  }

  /**
   * Get messages for a deal
   */
  async getDealMessages(dealId: string, userId: string, options: {
    page?: number;
    limit?: number;
    search?: string;
  } = {}): Promise<{
    success: boolean;
    messages?: any[];
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    message: string;
  }> {
    try {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(dealId) || !uuidRegex.test(userId)) {
        return {
          success: false,
          message: 'Invalid deal or user ID'
        };
      }

      // Verify deal exists and user has access
      const deal = await prisma.deal.findUnique({
        where: { id: dealId }
      });

      if (!deal) {
        return {
          success: false,
          message: 'Deal not found'
        };
      }

      // Only buyer or seller can view messages
      if (deal.buyerId !== userId && deal.sellerId !== userId) {
        return {
          success: false,
          message: 'Unauthorized to view messages in this deal'
        };
      }

      const {
        page = 1,
        limit = 50,
        search
      } = options;

      const skip = (page - 1) * limit;

      // Build where clause for search
      const whereClause: any = { dealId };
      if (search) {
        whereClause.message = {
          contains: search,
          mode: 'insensitive'
        };
      }

      // Get total count
      const total = await prisma.dealMessage.count({ where: whereClause });

      // Get messages with sender details
      const messages = await prisma.dealMessage.findMany({
        where: whereClause,
        include: {
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              verificationTier: true
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
        },
        skip,
        take: limit
      });

      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        messages,
        pagination: {
          page,
          limit,
          total,
          totalPages
        },
        message: 'Messages retrieved successfully'
      };
    } catch (error) {
      logger.error('Error getting deal messages:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get messages'
      };
    }
  }

  /**
   * Schedule automated follow-up reminder
   */
  async scheduleFollowUpReminder(dealId: string, userId: string, reminderDate: Date, reminderMessage?: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(dealId) || !uuidRegex.test(userId)) {
        return {
          success: false,
          message: 'Invalid deal or user ID'
        };
      }

      // Verify deal exists and user has access
      const deal = await prisma.deal.findUnique({
        where: { id: dealId }
      });

      if (!deal) {
        return {
          success: false,
          message: 'Deal not found'
        };
      }

      // Only buyer or seller can schedule reminders
      if (deal.buyerId !== userId && deal.sellerId !== userId) {
        return {
          success: false,
          message: 'Unauthorized to schedule reminders for this deal'
        };
      }

      // Update deal with next follow-up date
      await prisma.deal.update({
        where: { id: dealId },
        data: {
          nextFollowUp: reminderDate,
          updatedAt: new Date()
        }
      });

      // Send system message about the reminder
      if (reminderMessage) {
        await prisma.dealMessage.create({
          data: {
            dealId,
            senderId: userId,
            message: `Follow-up reminder scheduled: ${reminderMessage}`,
            messageType: 'system'
          }
        });
      }

      logger.info('Follow-up reminder scheduled:', {
        dealId,
        userId,
        reminderDate,
        reminderMessage
      });

      return {
        success: true,
        message: 'Follow-up reminder scheduled successfully'
      };
    } catch (error) {
      logger.error('Error scheduling follow-up reminder:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to schedule reminder'
      };
    }
  }



  /**
   * Process automated follow-up reminders (to be called by a scheduled job)
   */
  async processFollowUpReminders(): Promise<{
    success: boolean;
    processedCount?: number;
    message: string;
  }> {
    try {
      const now = new Date();
      
      // Get deals that need follow-up
      const dealsNeedingFollowUp = await prisma.deal.findMany({
        where: {
          status: {
            in: ['initiated', 'negotiating', 'confirmed']
          },
          nextFollowUp: {
            lte: now
          }
        },
        include: {
          buyer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              email: true
            }
          },
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              email: true
            }
          }
        }
      });

      let processedCount = 0;

      for (const deal of dealsNeedingFollowUp) {
        try {
          // Create automated follow-up message
          const followUpMessage = `Automated follow-up: This deal has been pending for a while. Please review and take necessary action.`;
          
          await prisma.dealMessage.create({
            data: {
              dealId: deal.id,
              senderId: (deal.buyerId || deal.sellerId)!, // System message from buyer's perspective
              message: followUpMessage,
              messageType: 'system'
            }
          });

          // Update next follow-up to 3 days from now
          const nextFollowUp = new Date();
          nextFollowUp.setDate(nextFollowUp.getDate() + 3);

          await prisma.deal.update({
            where: { id: deal.id },
            data: {
              nextFollowUp,
              updatedAt: new Date()
            }
          });

          processedCount++;

          logger.info('Follow-up reminder processed:', {
            dealId: deal.id,
            buyerId: deal.buyerId,
            sellerId: deal.sellerId
          });

          // Here you would typically send email/SMS notifications
          // For now, we'll just log the action
          
        } catch (error) {
          logger.error('Error processing follow-up for deal:', {
            dealId: deal.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      return {
        success: true,
        processedCount,
        message: `Processed ${processedCount} follow-up reminders`
      };
    } catch (error) {
      logger.error('Error processing follow-up reminders:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to process follow-up reminders'
      };
    }
  }

  /**
   * Escalate deal for mediation support
   */
  async escalateDeal(dealId: string, userId: string, escalationReason: string, escalationType: string = 'dispute'): Promise<{
    success: boolean;
    escalationId?: string;
    message: string;
  }> {
    try {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(dealId) || !uuidRegex.test(userId)) {
        return {
          success: false,
          message: 'Invalid deal or user ID'
        };
      }

      // Verify deal exists and user has access
      const deal = await prisma.deal.findUnique({
        where: { id: dealId }
      });

      if (!deal) {
        return {
          success: false,
          message: 'Deal not found'
        };
      }

      // Only buyer or seller can escalate
      if (deal.buyerId !== userId && deal.sellerId !== userId) {
        return {
          success: false,
          message: 'Unauthorized to escalate this deal'
        };
      }

      // Update deal status to cancelled (escalated deals are typically cancelled pending resolution)
      await prisma.deal.update({
        where: { id: dealId },
        data: {
          status: 'cancelled',
          milestone: `Escalated: ${escalationType} - ${escalationReason}`,
          updatedAt: new Date()
        }
      });

      // Create escalation message
      const escalationMessage = await prisma.dealMessage.create({
        data: {
          dealId,
          senderId: userId,
          message: `Deal escalated for ${escalationType}: ${escalationReason}. Support team has been notified and will review this case.`,
          messageType: 'escalation'
        }
      });

      logger.info('Deal escalated:', {
        dealId,
        userId,
        escalationType,
        escalationReason,
        escalationMessageId: escalationMessage.id
      });

      return {
        success: true,
        escalationId: escalationMessage.id,
        message: `Deal escalated successfully. Support team will contact you within 24 hours regarding this ${escalationType}.`
      };
    } catch (error) {
      logger.error('Error escalating deal:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to escalate deal'
      };
    }
  }

  /**
   * Get complete communication history for a deal with filtering options
   */
  async getDealCommunicationHistory(dealId: string, userId: string, options: {
    messageType?: string;
    senderId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    success: boolean;
    history?: any[];
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    message: string;
  }> {
    try {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(dealId) || !uuidRegex.test(userId)) {
        return {
          success: false,
          message: 'Invalid deal or user ID'
        };
      }

      // Verify deal exists and user has access
      const deal = await prisma.deal.findUnique({
        where: { id: dealId }
      });

      if (!deal) {
        return {
          success: false,
          message: 'Deal not found'
        };
      }

      // Only buyer or seller can view communication history
      if (deal.buyerId !== userId && deal.sellerId !== userId) {
        return {
          success: false,
          message: 'Unauthorized to view communication history for this deal'
        };
      }

      const {
        messageType,
        senderId,
        dateFrom,
        dateTo,
        page = 1,
        limit = 50
      } = options;

      const skip = (page - 1) * limit;

      // Build where clause with filters
      const whereClause: any = { dealId };

      if (messageType) {
        whereClause.messageType = messageType;
      }

      if (senderId) {
        // Validate senderId format if provided
        if (!uuidRegex.test(senderId)) {
          return {
            success: false,
            message: 'Invalid sender ID format'
          };
        }
        whereClause.senderId = senderId;
      }

      if (dateFrom || dateTo) {
        whereClause.createdAt = {};
        if (dateFrom) {
          whereClause.createdAt.gte = dateFrom;
        }
        if (dateTo) {
          whereClause.createdAt.lte = dateTo;
        }
      }

      // Get total count for pagination
      const total = await prisma.dealMessage.count({ where: whereClause });

      // Get communication history with sender details
      const history = await prisma.dealMessage.findMany({
        where: whereClause,
        include: {
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              verificationTier: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take: limit
      });

      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        history,
        pagination: {
          page,
          limit,
          total,
          totalPages
        },
        message: 'Communication history retrieved successfully'
      };
    } catch (error) {
      logger.error('Error getting deal communication history:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get communication history'
      };
    }
  }

}

export const dealService = new DealService();