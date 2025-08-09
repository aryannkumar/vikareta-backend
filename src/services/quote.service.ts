import { PrismaClient } from '@prisma/client';
import type { Quote } from '@prisma/client';
import { logger } from '@/utils/logger';

const prisma = new PrismaClient();

export interface CreateQuoteData {
  rfqId: string;
  totalPrice: number;
  deliveryTimeline?: string;
  termsConditions?: string;
  validUntil?: Date;
  items: CreateQuoteItemData[];
}

export interface CreateQuoteItemData {
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface UpdateQuoteData {
  totalPrice?: number;
  deliveryTimeline?: string;
  termsConditions?: string;
  status?: string;
  validUntil?: Date;
}

export interface QuoteFilters {
  rfqId?: string;
  sellerId?: string;
  status?: string;
  minPrice?: number;
  maxPrice?: number;
  validOnly?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'totalPrice' | 'validUntil';
  sortOrder?: 'asc' | 'desc';
}

export interface QuoteWithDetails extends Quote {
  seller: {
    id: string;
    businessName: string | null;
    firstName: string | null;
    lastName: string | null;
    verificationTier: string;
    isVerified: boolean;
  };
  rfq: {
    id: string;
    title: string;
    description: string | null;
    categoryId: string;
    subcategoryId: string | null;
    quantity: number | null;
    budgetMin: any; // Prisma Decimal
    budgetMax: any; // Prisma Decimal
    deliveryTimeline: string | null;
    deliveryLocation: string | null;
    status: string;
    buyer: {
      id: string;
      businessName: string | null;
      firstName: string | null;
      lastName: string | null;
      verificationTier: string;
      isVerified: boolean;
    };
  };
  items: Array<{
    id: string;
    productId: string;
    quantity: number;
    unitPrice: any; // Prisma Decimal
    totalPrice: any; // Prisma Decimal
    product: {
      id: string;
      title: string;
      description: string | null;
      price: any; // Prisma Decimal
      stockQuantity: number;
      isService: boolean;
    };
  }>;
}

export interface QuoteComparison {
  quotes: QuoteWithDetails[];
  comparison: {
    lowestPrice: number;
    highestPrice: number;
    averagePrice: number;
    priceRange: number;
    bestValue?: {
      quoteId: string;
      score: number;
      reasons: string[];
    };
  };
}

export class QuoteService {
  /**
   * Create a new quote with structured pricing
   */
  async createQuote(sellerId: string, data: CreateQuoteData): Promise<QuoteWithDetails> {
    try {
      // Validate RFQ exists and is active
      const rfq = await prisma.rfq.findUnique({
        where: { id: data.rfqId },
        include: {
          buyer: true,
        },
      });

      if (!rfq) {
        throw new Error('RFQ not found');
      }

      if (rfq.status !== 'active') {
        throw new Error('RFQ is not active');
      }

      if (rfq.expiresAt && rfq.expiresAt < new Date()) {
        throw new Error('RFQ has expired');
      }

      // Check if seller already quoted for this RFQ
      const existingQuote = await prisma.quote.findFirst({
        where: {
          rfqId: data.rfqId,
          sellerId,
        },
      });

      if (existingQuote) {
        throw new Error('You have already submitted a quote for this RFQ');
      }

      // Validate all products exist and belong to seller
      const productIds = data.items.map(item => item.productId);
      const products = await prisma.product.findMany({
        where: {
          id: { in: productIds },
          sellerId,
          status: 'active',
        },
      });

      if (products.length !== productIds.length) {
        throw new Error('One or more products not found or not owned by seller');
      }

      // Validate stock availability
      for (const item of data.items) {
        const product = products.find(p => p.id === item.productId);
        if (product && !product.isService && product.stockQuantity < item.quantity) {
          throw new Error(`Insufficient stock for product: ${product.title}`);
        }
      }

      // Set default validity to 30 days if not provided
      const validUntil = data.validUntil || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Create quote with items in a transaction
      const quote = await prisma.$transaction(async (tx) => {
        // Create the main quote
        const newQuote = await tx.quote.create({
          data: {
            rfqId: data.rfqId,
            sellerId,
            totalPrice: data.totalPrice,
            deliveryTimeline: data.deliveryTimeline || null,
            termsConditions: data.termsConditions || null,
            validUntil,
            status: 'pending',
          },
        });

        // Create quote items
        await tx.quoteItem.createMany({
          data: data.items.map(item => ({
            quoteId: newQuote.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          })),
        });

        return newQuote;
      });

      logger.info(`Quote created: ${quote.id} by seller ${sellerId} for RFQ ${data.rfqId}`);

      // Get the complete quote with relations for notification
      const completeQuote = await this.getQuoteById(quote.id);

      // Send WhatsApp notification to buyer
      try {
        const { notificationService } = await import('./notification.service');
        
        if (rfq.buyer.phone) {
          const sellerName = completeQuote.seller.businessName || 
            `${completeQuote.seller.firstName || ''} ${completeQuote.seller.lastName || ''}`.trim() || 
            'Anonymous Seller';

          await notificationService.sendQuoteWhatsAppNotification({
            userId: rfq.buyer.id,
            phone: rfq.buyer.phone,
            quoteData: {
              quoteId: completeQuote.id,
              rfqTitle: rfq.title,
              totalPrice: Number(completeQuote.totalPrice),
              deliveryTimeline: completeQuote.deliveryTimeline || undefined,
              validUntil: completeQuote.validUntil || undefined,
              sellerName,
              items: completeQuote.items.map(item => ({
                productName: item.product.title,
                quantity: item.quantity,
                unitPrice: Number(item.unitPrice),
                totalPrice: Number(item.totalPrice)
              }))
            }
          });
        }
      } catch (error) {
        logger.error(`Failed to send WhatsApp quote notification:`, error);
        // Don't fail the quote creation if notification fails
      }

      // Return the complete quote with relations
      return completeQuote;
    } catch (error) {
      logger.error('Error creating quote:', error);
      throw error;
    }
  }

  /**
   * Get quote by ID with all relations
   */
  async getQuoteById(quoteId: string): Promise<QuoteWithDetails> {
    try {
      const quote = await prisma.quote.findUnique({
        where: { id: quoteId },
        include: {
          seller: {
            select: {
              id: true,
              businessName: true,
              firstName: true,
              lastName: true,
              verificationTier: true,
              isVerified: true,
            },
          },
          rfq: {
            include: {
              buyer: {
                select: {
                  id: true,
                  businessName: true,
                  firstName: true,
                  lastName: true,
                  verificationTier: true,
                  isVerified: true,
                },
              },
            },
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  title: true,
                  description: true,
                  price: true,
                  stockQuantity: true,
                  isService: true,
                },
              },
            },
            orderBy: { productId: 'asc' },
          },
        },
      });

      if (!quote) {
        throw new Error('Quote not found');
      }

      return quote as any;
    } catch (error) {
      logger.error('Error fetching quote:', error);
      throw error;
    }
  }

  /**
   * Get quotes with filtering, pagination, and sorting
   */
  async getQuotes(filters: QuoteFilters = {}): Promise<{
    quotes: QuoteWithDetails[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const {
        rfqId,
        sellerId,
        status = 'pending',
        minPrice,
        maxPrice,
        validOnly = false,
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = filters;

      // Build where clause
      const where: any = {
        status,
      };

      if (rfqId) where.rfqId = rfqId;
      if (sellerId) where.sellerId = sellerId;

      if (validOnly) {
        where.validUntil = {
          gt: new Date(),
        };
      }

      if (minPrice !== undefined || maxPrice !== undefined) {
        where.totalPrice = {};
        if (minPrice !== undefined) where.totalPrice.gte = minPrice;
        if (maxPrice !== undefined) where.totalPrice.lte = maxPrice;
      }

      // Build order by clause
      const orderBy: any = {};
      orderBy[sortBy] = sortOrder;

      // Get total count
      const total = await prisma.quote.count({ where });

      // Get quotes with pagination
      const quotes = await prisma.quote.findMany({
        where,
        include: {
          seller: {
            select: {
              id: true,
              businessName: true,
              firstName: true,
              lastName: true,
              verificationTier: true,
              isVerified: true,
            },
          },
          rfq: {
            include: {
              buyer: {
                select: {
                  id: true,
                  businessName: true,
                  firstName: true,
                  lastName: true,
                  verificationTier: true,
                  isVerified: true,
                },
              },
            },
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  title: true,
                  description: true,
                  price: true,
                  stockQuantity: true,
                  isService: true,
                },
              },
            },
            orderBy: { productId: 'asc' },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      });

      const totalPages = Math.ceil(total / limit);

      return {
        quotes: quotes as any,
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      logger.error('Error fetching quotes:', error);
      throw error;
    }
  }

  /**
   * Update quote
   */
  async updateQuote(quoteId: string, sellerId: string, data: UpdateQuoteData): Promise<QuoteWithDetails> {
    try {
      // Verify quote belongs to seller
      const existingQuote = await prisma.quote.findFirst({
        where: { id: quoteId, sellerId },
        include: { rfq: true },
      });

      if (!existingQuote) {
        throw new Error('Quote not found or access denied');
      }

      // Check if quote is still valid for updates
      if (existingQuote.status !== 'pending') {
        throw new Error('Cannot update quote that is not in pending status');
      }

      if (existingQuote.validUntil && existingQuote.validUntil < new Date()) {
        throw new Error('Cannot update expired quote');
      }

      // Check if RFQ is still active
      if (existingQuote.rfq.status !== 'active') {
        throw new Error('Cannot update quote for inactive RFQ');
      }

      // Update quote
      await prisma.quote.update({
        where: { id: quoteId },
        data,
      });

      logger.info(`Quote updated: ${quoteId} by seller ${sellerId}`);

      return await this.getQuoteById(quoteId);
    } catch (error) {
      logger.error('Error updating quote:', error);
      throw error;
    }
  }

  /**
   * Withdraw quote (soft delete by setting status to withdrawn)
   */
  async withdrawQuote(quoteId: string, sellerId: string): Promise<void> {
    try {
      // Verify quote belongs to seller
      const existingQuote = await prisma.quote.findFirst({
        where: { id: quoteId, sellerId },
      });

      if (!existingQuote) {
        throw new Error('Quote not found or access denied');
      }

      // Check if quote can be withdrawn
      if (existingQuote.status === 'accepted') {
        throw new Error('Cannot withdraw accepted quote');
      }

      // Soft delete by setting status to withdrawn
      await prisma.quote.update({
        where: { id: quoteId },
        data: { status: 'withdrawn' },
      });

      logger.info(`Quote withdrawn: ${quoteId} by seller ${sellerId}`);
    } catch (error) {
      logger.error('Error withdrawing quote:', error);
      throw error;
    }
  }

  /**
   * Accept quote (buyer action)
   */
  async acceptQuote(quoteId: string, buyerId: string): Promise<QuoteWithDetails> {
    try {
      // Verify quote belongs to buyer's RFQ
      const quote = await prisma.quote.findFirst({
        where: {
          id: quoteId,
          rfq: { buyerId },
        },
        include: { rfq: true },
      });

      if (!quote) {
        throw new Error('Quote not found or access denied');
      }

      // Check if quote is still valid
      if (quote.status !== 'pending') {
        throw new Error('Quote is not in pending status');
      }

      if (quote.validUntil && quote.validUntil < new Date()) {
        throw new Error('Quote has expired');
      }

      // Check if RFQ is still active
      if (quote.rfq.status !== 'active') {
        throw new Error('RFQ is not active');
      }

      // Accept quote and reject other quotes for the same RFQ
      await prisma.$transaction(async (tx) => {
        // Accept the selected quote
        await tx.quote.update({
          where: { id: quoteId },
          data: { status: 'accepted' },
        });

        // Reject other pending quotes for the same RFQ
        await tx.quote.updateMany({
          where: {
            rfqId: quote.rfqId,
            id: { not: quoteId },
            status: 'pending',
          },
          data: { status: 'rejected' },
        });

        // Update RFQ status to completed
        await tx.rfq.update({
          where: { id: quote.rfqId },
          data: { status: 'completed' },
        });
      });

      logger.info(`Quote accepted: ${quoteId} by buyer ${buyerId}`);

      return await this.getQuoteById(quoteId);
    } catch (error) {
      logger.error('Error accepting quote:', error);
      throw error;
    }
  }

  /**
   * Reject quote (buyer action)
   */
  async rejectQuote(quoteId: string, buyerId: string, reason?: string): Promise<void> {
    try {
      // Verify quote belongs to buyer's RFQ
      const quote = await prisma.quote.findFirst({
        where: {
          id: quoteId,
          rfq: { buyerId },
        },
      });

      if (!quote) {
        throw new Error('Quote not found or access denied');
      }

      // Check if quote can be rejected
      if (quote.status !== 'pending') {
        throw new Error('Quote is not in pending status');
      }

      // Reject quote
      await prisma.quote.update({
        where: { id: quoteId },
        data: { 
          status: 'rejected',
          termsConditions: reason ? `Rejected: ${reason}` : quote.termsConditions,
        },
      });

      logger.info(`Quote rejected: ${quoteId} by buyer ${buyerId}`);
    } catch (error) {
      logger.error('Error rejecting quote:', error);
      throw error;
    }
  }

  /**
   * Get quotes for comparison with evaluation tools
   */
  async getQuotesForComparison(rfqId: string, buyerId: string): Promise<QuoteComparison> {
    try {
      // Verify RFQ belongs to buyer
      const rfq = await prisma.rfq.findFirst({
        where: { id: rfqId, buyerId },
      });

      if (!rfq) {
        throw new Error('RFQ not found or access denied');
      }

      // Get all valid quotes for the RFQ
      const quotes = await this.getQuotes({
        rfqId,
        status: 'pending',
        validOnly: true,
        limit: 100, // Get all quotes for comparison
      });

      if (quotes.quotes.length === 0) {
        return {
          quotes: [],
          comparison: {
            lowestPrice: 0,
            highestPrice: 0,
            averagePrice: 0,
            priceRange: 0,
          },
        };
      }

      // Calculate comparison metrics
      const prices = quotes.quotes.map(q => Number(q.totalPrice));
      const lowestPrice = Math.min(...prices);
      const highestPrice = Math.max(...prices);
      const averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
      const priceRange = highestPrice - lowestPrice;

      // Calculate best value score (considering price, seller verification, delivery timeline)
      let bestValue: QuoteComparison['comparison']['bestValue'] | undefined;
      let bestScore = 0;

      for (const quote of quotes.quotes) {
        const reasons: string[] = [];
        let score = 0;

        // Price score (lower is better, max 40 points)
        const priceScore = priceRange > 0 ? ((highestPrice - Number(quote.totalPrice)) / priceRange) * 40 : 40;
        score += priceScore;
        if (Number(quote.totalPrice) === lowestPrice) {
          reasons.push('Lowest price');
        }

        // Seller verification score (max 30 points)
        const verificationScores = {
          'basic': 10,
          'standard': 20,
          'enhanced': 25,
          'premium': 30,
        };
        const verificationScore = verificationScores[quote.seller.verificationTier as keyof typeof verificationScores] || 0;
        score += verificationScore;
        if (quote.seller.verificationTier === 'premium') {
          reasons.push('Premium verified seller');
        }

        // Delivery timeline score (max 20 points)
        let deliveryScore = 10; // Default score
        if (quote.deliveryTimeline) {
          const timeline = quote.deliveryTimeline.toLowerCase();
          if (timeline.includes('immediate') || timeline.includes('same day')) {
            deliveryScore = 20;
            reasons.push('Fast delivery');
          } else if (timeline.includes('1 day') || timeline.includes('next day')) {
            deliveryScore = 18;
          } else if (timeline.includes('2-3 days') || timeline.includes('2 days')) {
            deliveryScore = 15;
          }
        }
        score += deliveryScore;

        // Terms and conditions score (max 10 points)
        const termsScore = quote.termsConditions && quote.termsConditions.length > 50 ? 10 : 5;
        score += termsScore;
        if (quote.termsConditions && quote.termsConditions.length > 100) {
          reasons.push('Detailed terms provided');
        }

        if (score > bestScore) {
          bestScore = score;
          bestValue = {
            quoteId: quote.id,
            score,
            reasons,
          };
        }
      }

      return {
        quotes: quotes.quotes,
        comparison: {
          lowestPrice,
          highestPrice,
          averagePrice: Math.round(averagePrice * 100) / 100,
          priceRange,
          ...(bestValue && { bestValue }),
        },
      };
    } catch (error) {
      logger.error('Error getting quotes for comparison:', error);
      throw error;
    }
  }

  /**
   * Handle quote expiration and validity management
   */
  async processExpiredQuotes(): Promise<{ expiredCount: number; processedQuotes: string[] }> {
    try {
      // Find all pending quotes that have expired
      const expiredQuotes = await prisma.quote.findMany({
        where: {
          status: 'pending',
          validUntil: {
            lt: new Date(),
          },
        },
        select: {
          id: true,
          sellerId: true,
          rfqId: true,
        },
      });

      if (expiredQuotes.length === 0) {
        return { expiredCount: 0, processedQuotes: [] };
      }

      // Update expired quotes to 'expired' status
      const quoteIds = expiredQuotes.map(quote => quote.id);
      
      await prisma.quote.updateMany({
        where: {
          id: {
            in: quoteIds,
          },
        },
        data: {
          status: 'expired',
        },
      });

      logger.info(`Processed ${expiredQuotes.length} expired quotes`);

      return {
        expiredCount: expiredQuotes.length,
        processedQuotes: quoteIds,
      };
    } catch (error) {
      logger.error('Error processing expired quotes:', error);
      throw error;
    }
  }

  /**
   * Get quote statistics for a seller
   */
  async getSellerQuoteStats(sellerId: string): Promise<{
    total: number;
    pending: number;
    accepted: number;
    rejected: number;
    expired: number;
    withdrawn: number;
    acceptanceRate: number;
    averageQuoteValue: number;
  }> {
    try {
      const stats = await prisma.quote.groupBy({
        by: ['status'],
        where: { sellerId },
        _count: {
          id: true,
        },
        _avg: {
          totalPrice: true,
        },
      });

      const totalQuotes = await prisma.quote.count({
        where: { sellerId },
      });

      const result = {
        total: totalQuotes,
        pending: 0,
        accepted: 0,
        rejected: 0,
        expired: 0,
        withdrawn: 0,
        acceptanceRate: 0,
        averageQuoteValue: 0,
      };

      let totalValue = 0;
      stats.forEach(stat => {
        switch (stat.status) {
          case 'pending':
            result.pending = stat._count.id;
            break;
          case 'accepted':
            result.accepted = stat._count.id;
            break;
          case 'rejected':
            result.rejected = stat._count.id;
            break;
          case 'expired':
            result.expired = stat._count.id;
            break;
          case 'withdrawn':
            result.withdrawn = stat._count.id;
            break;
        }
        if (stat._avg.totalPrice) {
          totalValue += Number(stat._avg.totalPrice) * stat._count.id;
        }
      });

      result.acceptanceRate = totalQuotes > 0 ? (result.accepted / totalQuotes) * 100 : 0;
      result.averageQuoteValue = totalQuotes > 0 ? totalValue / totalQuotes : 0;

      return result;
    } catch (error) {
      logger.error('Error fetching seller quote stats:', error);
      throw error;
    }
  }
}

export const quoteService = new QuoteService();