import { BaseService } from './base.service';

export class RfqService extends BaseService {
  constructor() {
    super();
  }

  async searchRfqs(where: any, skip: number, take: number) {
    return this.prisma.rfq.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } });
  }

  async countRfqs(where: any) {
    return this.prisma.rfq.count({ where });
  }
}

export const rfqService = new RfqService();
import { PrismaClient, Rfq, Quote, QuoteItem } from '@prisma/client';
import { BaseService } from './base.service';
import { logger } from '../utils/logger';
import { NotificationService } from './notification.service';

export interface CreateRfqData {
  title: string;
  description?: string;
  categoryId: string;
  subcategoryId?: string;
  quantity?: number;
  budgetMin?: number;
  budgetMax?: number;
  deliveryTimeline?: string;
  deliveryLocation?: string;
  expiresAt?: Date;
}

export interface UpdateRfqData extends Partial<CreateRfqData> {
  status?: string;
}

export interface CreateQuoteData {
  rfqId: string;
  sellerId: string;
  totalPrice: number;
  deliveryTimeline?: string;
  termsConditions?: string;
  validUntil?: Date;
  items: {
    productId: string;
    quantity: number;
    unitPrice: number;
  }[];
}

export interface UpdateQuoteData {
  totalPrice?: number;
  deliveryTimeline?: string;
  termsConditions?: string;
  validUntil?: Date;
  status?: string;
}

export interface RfqFilters {
  buyerId?: string;
  categoryId?: string;
  subcategoryId?: string;
  status?: string;
  budgetMin?: number;
  budgetMax?: number;
  expiresAfter?: Date;
  expiresBefore?: Date;
}

export interface QuoteFilters {
  rfqId?: string;
  sellerId?: string;
  status?: string;
  validAfter?: Date;
  validBefore?: Date;
}

export class RfqService extends BaseService {
  private notificationService: NotificationService;

  constructor() {
    super();
    this.notificationService = new NotificationService();
  }

  // RFQ Methods
  async createRfq(buyerId: string, data: CreateRfqData): Promise<Rfq> {
    try {
      const rfq = await this.prisma.rfq.create({
        data: {
          ...data,
          buyerId,
          status: 'active',
          expiresAt: data.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
        },
        include: {
          buyer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              email: true,
            },
          },
          category: true,
          subcategory: true,
        },
      });

      // Notify relevant sellers
      await this.notifyRelevantSellers(rfq);

      logger.info(`RFQ created: ${rfq.id} by buyer: ${buyerId}`);
      return rfq;
    } catch (error) {
      logger.error('Error creating RFQ:', error);
      throw error;
    }
  }

  async updateRfq(rfqId: string, buyerId: string, data: UpdateRfqData): Promise<Rfq> {
    try {
      const rfq = await this.prisma.rfq.update({
        where: {
          id: rfqId,
          buyerId, // Ensure buyer can only update their own RFQs
        },
        data,
        include: {
          buyer: true,
          category: true,
          subcategory: true,
          quotes: {
            include: {
              seller: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  businessName: true,
                },
              },
            },
          },
        },
      });

      logger.info(`RFQ updated: ${rfqId} by buyer: ${buyerId}`);
      return rfq;
    } catch (error) {
      logger.error('Error updating RFQ:', error);
      throw error;
    }
  }

  async getRfqById(rfqId: string): Promise<Rfq | null> {
    try {
      return await this.prisma.rfq.findUnique({
        where: { id: rfqId },
        include: {
          buyer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              email: true,
              phone: true,
              verificationTier: true,
              isVerified: true,
            },
          },
          category: true,
          subcategory: true,
          quotes: {
            include: {
              seller: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  businessName: true,
                  avatar: true,
                  verificationTier: true,
                  isVerified: true,
                },
              },
              items: {
                include: {
                  product: {
                    select: {
                      id: true,
                      title: true,
                      media: { take: 1 },
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
          _count: {
            select: { quotes: true },
          },
        },
      });
    } catch (error) {
      logger.error('Error fetching RFQ:', error);
      throw error;
    }
  }

  async getRfqs(filters: RfqFilters = {}, page = 1, limit = 20): Promise<{
    rfqs: Rfq[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const where: any = {};

      if (filters.buyerId) where.buyerId = filters.buyerId;
      if (filters.categoryId) where.categoryId = filters.categoryId;
      if (filters.subcategoryId) where.subcategoryId = filters.subcategoryId;
      if (filters.status) where.status = filters.status;

      if (filters.budgetMin !== undefined || filters.budgetMax !== undefined) {
        where.OR = [];
        if (filters.budgetMin !== undefined) {
          where.OR.push({ budgetMin: { gte: filters.budgetMin } });
          where.OR.push({ budgetMax: { gte: filters.budgetMin } });
        }
        if (filters.budgetMax !== undefined) {
          where.OR.push({ budgetMin: { lte: filters.budgetMax } });
          where.OR.push({ budgetMax: { lte: filters.budgetMax } });
        }
      }

      if (filters.expiresAfter || filters.expiresBefore) {
        where.expiresAt = {};
        if (filters.expiresAfter) where.expiresAt.gte = filters.expiresAfter;
        if (filters.expiresBefore) where.expiresAt.lte = filters.expiresBefore;
      }

      const [rfqs, total] = await Promise.all([
        this.prisma.rfq.findMany({
          where,
          include: {
            buyer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                businessName: true,
                verificationTier: true,
                isVerified: true,
              },
            },
            category: true,
            subcategory: true,
            _count: {
              select: { quotes: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.rfq.count({ where }),
      ]);

      return {
        rfqs,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error('Error fetching RFQs:', error);
      throw error;
    }
  }

  async closeRfq(rfqId: string, buyerId: string): Promise<Rfq> {
    try {
      const rfq = await this.prisma.rfq.update({
        where: {
          id: rfqId,
          buyerId,
        },
        data: { status: 'closed' },
        include: {
          buyer: true,
          quotes: {
            include: {
              seller: true,
            },
          },
        },
      });

      // Notify sellers who submitted quotes
      for (const quote of rfq.quotes) {
        await this.notificationService.createNotification({
          userId: quote.sellerId,
          title: 'RFQ Closed',
          message: `The RFQ "${rfq.title}" has been closed by the buyer.`,
          type: 'rfq_closed',
          data: { rfqId: rfq.id, quoteId: quote.id },
        });
      }

      logger.info(`RFQ closed: ${rfqId} by buyer: ${buyerId}`);
      return rfq;
    } catch (error) {
      logger.error('Error closing RFQ:', error);
      throw error;
    }
  }

  // Quote Methods
  async createQuote(data: CreateQuoteData): Promise<Quote> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Check if seller already has a quote for this RFQ
        const existingQuote = await tx.quote.findFirst({
          where: {
            rfqId: data.rfqId,
            sellerId: data.sellerId,
          },
        });

        if (existingQuote) {
          throw new Error('You have already submitted a quote for this RFQ');
        }

        // Verify RFQ is still active
        const rfq = await tx.rfq.findUnique({
          where: { id: data.rfqId },
          include: { buyer: true },
        });

        if (!rfq || rfq.status !== 'active') {
          throw new Error('RFQ is not active');
        }

        if (rfq.expiresAt && rfq.expiresAt < new Date()) {
          throw new Error('RFQ has expired');
        }

        // Create quote
        const quote = await tx.quote.create({
          data: {
            rfqId: data.rfqId,
            sellerId: data.sellerId,
            totalPrice: data.totalPrice,
            deliveryTimeline: data.deliveryTimeline,
            termsConditions: data.termsConditions,
            validUntil: data.validUntil || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days default
            status: 'pending',
            items: {
              create: data.items.map(item => ({
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.unitPrice * item.quantity,
              })),
            },
          },
          include: {
            rfq: {
              include: { buyer: true },
            },
            seller: true,
            items: {
              include: {
                product: true,
              },
            },
          },
        });

        // Notify buyer
        const notification = await this.notificationService.createNotification({
          userId: rfq.buyerId,
          title: 'New Quote Received',
          message: `You have received a new quote for your RFQ "${rfq.title}".`,
          type: 'quote_received',
          data: { rfqId: rfq.id, quoteId: quote.id },
        });
        await this.notificationService.sendNotification(notification.id);

        logger.info(`Quote created: ${quote.id} for RFQ: ${data.rfqId} by seller: ${data.sellerId}`);
        return quote;
      });
    } catch (error) {
      logger.error('Error creating quote:', error);
      throw error;
    }
  }

  async updateQuote(quoteId: string, sellerId: string, data: UpdateQuoteData): Promise<Quote> {
    try {
      const quote = await this.prisma.quote.update({
        where: {
          id: quoteId,
          sellerId, // Ensure seller can only update their own quotes
        },
        data,
        include: {
          rfq: {
            include: { buyer: true },
          },
          seller: true,
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      // Notify buyer if quote was updated
      const notification = await this.notificationService.createNotification({
        userId: quote.rfq.buyerId,
        title: 'Quote Updated',
        message: `A quote for your RFQ "${quote.rfq.title}" has been updated.`,
        type: 'quote_updated',
        data: { rfqId: quote.rfqId, quoteId: quote.id },
      });
      await this.notificationService.sendNotification(notification.id);

      logger.info(`Quote updated: ${quoteId} by seller: ${sellerId}`);
      return quote;
    } catch (error) {
      logger.error('Error updating quote:', error);
      throw error;
    }
  }

  async getQuoteById(quoteId: string): Promise<Quote | null> {
    try {
      return await this.prisma.quote.findUnique({
        where: { id: quoteId },
        include: {
          rfq: {
            include: {
              buyer: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  businessName: true,
                  email: true,
                  phone: true,
                },
              },
              category: true,
              subcategory: true,
            },
          },
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              email: true,
              phone: true,
              avatar: true,
              verificationTier: true,
              isVerified: true,
            },
          },
          items: {
            include: {
              product: {
                include: {
                  media: { take: 1 },
                },
              },
            },
          },
          negotiations: {
            orderBy: { createdAt: 'desc' },
            include: {
              fromUser: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  businessName: true,
                },
              },
              toUser: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  businessName: true,
                },
              },
            },
          },
        },
      });
    } catch (error) {
      logger.error('Error fetching quote:', error);
      throw error;
    }
  }

  async getQuotes(filters: QuoteFilters = {}, page = 1, limit = 20): Promise<{
    quotes: Quote[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const where: any = {};

      if (filters.rfqId) where.rfqId = filters.rfqId;
      if (filters.sellerId) where.sellerId = filters.sellerId;
      if (filters.status) where.status = filters.status;

      if (filters.validAfter || filters.validBefore) {
        where.validUntil = {};
        if (filters.validAfter) where.validUntil.gte = filters.validAfter;
        if (filters.validBefore) where.validUntil.lte = filters.validBefore;
      }

      const [quotes, total] = await Promise.all([
        this.prisma.quote.findMany({
          where,
          include: {
            rfq: {
              include: {
                buyer: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    businessName: true,
                  },
                },
                category: true,
              },
            },
            seller: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                businessName: true,
                verificationTier: true,
                isVerified: true,
              },
            },
            items: {
              include: {
                product: {
                  select: {
                    id: true,
                    title: true,
                    media: { take: 1 },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.quote.count({ where }),
      ]);

      return {
        quotes,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error('Error fetching quotes:', error);
      throw error;
    }
  }

  async acceptQuote(quoteId: string, buyerId: string): Promise<Quote> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const quote = await tx.quote.findUnique({
          where: { id: quoteId },
          include: {
            rfq: true,
            seller: true,
          },
        });

        if (!quote || quote.rfq.buyerId !== buyerId) {
          throw new Error('Quote not found or unauthorized');
        }

        if (quote.status !== 'pending') {
          throw new Error('Quote is not in pending status');
        }

        // Update quote status
        const updatedQuote = await tx.quote.update({
          where: { id: quoteId },
          data: { status: 'accepted' },
          include: {
            rfq: {
              include: { buyer: true },
            },
            seller: true,
            items: {
              include: {
                product: true,
              },
            },
          },
        });

        // Reject other quotes for the same RFQ
        await tx.quote.updateMany({
          where: {
            rfqId: quote.rfqId,
            id: { not: quoteId },
            status: 'pending',
          },
          data: { status: 'rejected' },
        });

        // Close the RFQ
        await tx.rfq.update({
          where: { id: quote.rfqId },
          data: { status: 'closed' },
        });

        // Notify seller
        const notification = await this.notificationService.createNotification({
          userId: quote.sellerId,
          title: 'Quote Accepted',
          message: `Your quote for RFQ "${quote.rfq.title}" has been accepted!`,
          type: 'quote_accepted',
          data: { rfqId: quote.rfqId, quoteId: quote.id },
        });
        await this.notificationService.sendNotification(notification.id);

        logger.info(`Quote accepted: ${quoteId} by buyer: ${buyerId}`);
        return updatedQuote;
      });
    } catch (error) {
      logger.error('Error accepting quote:', error);
      throw error;
    }
  }

  async rejectQuote(quoteId: string, buyerId: string, reason?: string): Promise<Quote> {
    try {
      const quote = await this.prisma.quote.update({
        where: {
          id: quoteId,
          rfq: { buyerId },
        },
        data: { status: 'rejected' },
        include: {
          rfq: {
            include: { buyer: true },
          },
          seller: true,
        },
      });

      // Notify seller
      const notification = await this.notificationService.createNotification({
        userId: quote.sellerId,
        title: 'Quote Rejected',
        message: `Your quote for RFQ "${quote.rfq.title}" has been rejected.${reason ? ` Reason: ${reason}` : ''}`,
        type: 'quote_rejected',
        data: { rfqId: quote.rfqId, quoteId: quote.id, reason },
      });
      await this.notificationService.sendNotification(notification.id);

      logger.info(`Quote rejected: ${quoteId} by buyer: ${buyerId}`);
      return quote;
    } catch (error) {
      logger.error('Error rejecting quote:', error);
      throw error;
    }
  }

  private async notifyRelevantSellers(rfq: any): Promise<void> {
    try {
      // Find sellers who have products in the same category
      const sellers = await this.prisma.user.findMany({
        where: {
          userType: 'seller',
          isActive: true,
          products: {
            some: {
              categoryId: rfq.categoryId,
              isActive: true,
            },
          },
        },
        select: { id: true },
      });

      // Send notifications to relevant sellers
      const notifications = sellers.map(seller => ({
        userId: seller.id,
        title: 'New RFQ Available',
        message: `A new RFQ "${rfq.title}" is available in your category.`,
        type: 'new_rfq',
        data: { rfqId: rfq.id, categoryId: rfq.categoryId },
      }));

      await this.notificationService.sendBulkNotifications(notifications);
    } catch (error) {
      logger.error('Error notifying relevant sellers:', error);
    }
  }
}