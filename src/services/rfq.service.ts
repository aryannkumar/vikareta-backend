import { PrismaClient } from '@prisma/client';
import type { Rfq, Category } from '@prisma/client';
import { logger } from '@/utils/logger';

const prisma = new PrismaClient();

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

export interface UpdateRfqData {
  title?: string;
  description?: string;
  categoryId?: string;
  subcategoryId?: string;
  quantity?: number;
  budgetMin?: number;
  budgetMax?: number;
  deliveryTimeline?: string;
  deliveryLocation?: string;
  status?: string;
  expiresAt?: Date;
}

export interface RfqFilters {
  buyerId?: string;
  categoryId?: string;
  subcategoryId?: string;
  status?: string;
  minBudget?: number;
  maxBudget?: number;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'expiresAt' | 'budgetMax' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface RfqWithDetails extends Rfq {
  buyer: {
    id: string;
    businessName: string | null;
    firstName: string | null;
    lastName: string | null;
    verificationTier: string;
    isVerified: boolean;
  };
  category: Category;
  subcategory: Category | null;
  quotes: Array<{
    id: string;
    sellerId: string;
    totalPrice: any; // Prisma Decimal type
    status: string;
    createdAt: Date;
    seller: {
      id: string;
      businessName: string | null;
      firstName: string | null;
      lastName: string | null;
      verificationTier: string;
      isVerified: boolean;
    };
  }>;
  _count: {
    quotes: number;
  };
}

export interface SellerMatchCriteria {
  categoryId: string;
  subcategoryId?: string | undefined;
  deliveryLocation?: string | undefined;
  budgetRange?: {
    min?: number;
    max?: number;
  };
}

export class RfqService {
  /**
   * Create a new RFQ with detailed specifications
   */
  async createRfq(buyerId: string, data: CreateRfqData): Promise<RfqWithDetails> {
    try {
      // Validate category exists
      const category = await prisma.category.findUnique({
        where: { id: data.categoryId }
      });

      if (!category) {
        throw new Error('Category not found');
      }

      // Validate subcategory if provided
      if (data.subcategoryId) {
        const subcategory = await prisma.category.findUnique({
          where: { id: data.subcategoryId }
        });

        if (!subcategory) {
          throw new Error('Subcategory not found');
        }
      }

      // Set default expiration to 7 days if not provided
      const expiresAt = data.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      // Create RFQ
      const rfq = await prisma.rfq.create({
        data: {
          buyerId,
          title: data.title,
          description: data.description || null,
          categoryId: data.categoryId,
          subcategoryId: data.subcategoryId || null,
          quantity: data.quantity || null,
          budgetMin: data.budgetMin || null,
          budgetMax: data.budgetMax || null,
          deliveryTimeline: data.deliveryTimeline || null,
          deliveryLocation: data.deliveryLocation || null,
          expiresAt,
          status: 'active',
        },
      });

      logger.info(`RFQ created: ${rfq.id} by buyer ${buyerId}`);

      // Return the complete RFQ with relations
      return await this.getRfqById(rfq.id);
    } catch (error) {
      logger.error('Error creating RFQ:', error);
      throw error;
    }
  }

  /**
   * Get RFQ by ID with all relations
   */
  async getRfqById(rfqId: string): Promise<RfqWithDetails> {
    try {
      const rfq = await prisma.rfq.findUnique({
        where: { id: rfqId },
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
          category: true,
          subcategory: true,
          quotes: {
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
            },
            orderBy: { createdAt: 'desc' },
          },
          _count: {
            select: {
              quotes: true,
            },
          },
        },
      });

      if (!rfq) {
        throw new Error('RFQ not found');
      }

      return rfq as any;
    } catch (error) {
      logger.error('Error fetching RFQ:', error);
      throw error;
    }
  }

  /**
   * Get RFQs with filtering, pagination, and sorting
   */
  async getRfqs(filters: RfqFilters = {}): Promise<{
    rfqs: RfqWithDetails[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const {
        buyerId,
        categoryId,
        subcategoryId,
        status = 'active',
        minBudget,
        maxBudget,
        search,
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = filters;

      // Build where clause
      const where: any = {
        status,
        expiresAt: {
          gt: new Date(), // Only show non-expired RFQs
        },
      };

      if (buyerId) where.buyerId = buyerId;
      if (categoryId) where.categoryId = categoryId;
      if (subcategoryId) where.subcategoryId = subcategoryId;

      if (minBudget !== undefined || maxBudget !== undefined) {
        where.OR = [];
        
        if (minBudget !== undefined && maxBudget !== undefined) {
          where.OR.push(
            { budgetMin: { gte: minBudget } },
            { budgetMax: { lte: maxBudget } },
            { AND: [{ budgetMin: { lte: maxBudget } }, { budgetMax: { gte: minBudget } }] }
          );
        } else if (minBudget !== undefined) {
          where.OR.push(
            { budgetMin: { gte: minBudget } },
            { budgetMax: { gte: minBudget } }
          );
        } else if (maxBudget !== undefined) {
          where.OR.push(
            { budgetMin: { lte: maxBudget } },
            { budgetMax: { lte: maxBudget } }
          );
        }
      }

      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Build order by clause
      const orderBy: any = {};
      orderBy[sortBy] = sortOrder;

      // Get total count
      const total = await prisma.rfq.count({ where });

      // Get RFQs with pagination
      const rfqs = await prisma.rfq.findMany({
        where,
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
          category: true,
          subcategory: true,
          quotes: {
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
            },
            orderBy: { createdAt: 'desc' },
          },
          _count: {
            select: {
              quotes: true,
            },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      });

      const totalPages = Math.ceil(total / limit);

      return {
        rfqs: rfqs as any,
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      logger.error('Error fetching RFQs:', error);
      throw error;
    }
  }

  /**
   * Update RFQ
   */
  async updateRfq(rfqId: string, buyerId: string, data: UpdateRfqData): Promise<RfqWithDetails> {
    try {
      // Verify RFQ belongs to buyer
      const existingRfq = await prisma.rfq.findFirst({
        where: { id: rfqId, buyerId },
      });

      if (!existingRfq) {
        throw new Error('RFQ not found or access denied');
      }

      // Check if RFQ is still active and not expired
      if (existingRfq.status !== 'active' || (existingRfq.expiresAt && existingRfq.expiresAt < new Date())) {
        throw new Error('Cannot update expired or inactive RFQ');
      }

      // Validate category if being updated
      if (data.categoryId) {
        const category = await prisma.category.findUnique({
          where: { id: data.categoryId }
        });

        if (!category) {
          throw new Error('Category not found');
        }
      }

      // Validate subcategory if being updated
      if (data.subcategoryId) {
        const subcategory = await prisma.category.findUnique({
          where: { id: data.subcategoryId }
        });

        if (!subcategory) {
          throw new Error('Subcategory not found');
        }
      }

      // Update RFQ
      await prisma.rfq.update({
        where: { id: rfqId },
        data,
      });

      logger.info(`RFQ updated: ${rfqId} by buyer ${buyerId}`);

      return await this.getRfqById(rfqId);
    } catch (error) {
      logger.error('Error updating RFQ:', error);
      throw error;
    }
  }

  /**
   * Delete RFQ (soft delete by setting status to cancelled)
   */
  async deleteRfq(rfqId: string, buyerId: string): Promise<void> {
    try {
      // Verify RFQ belongs to buyer
      const existingRfq = await prisma.rfq.findFirst({
        where: { id: rfqId, buyerId },
      });

      if (!existingRfq) {
        throw new Error('RFQ not found or access denied');
      }

      // Soft delete by setting status to cancelled
      await prisma.rfq.update({
        where: { id: rfqId },
        data: { status: 'cancelled' },
      });

      logger.info(`RFQ cancelled: ${rfqId} by buyer ${buyerId}`);
    } catch (error) {
      logger.error('Error deleting RFQ:', error);
      throw error;
    }
  }

  /**
   * Find relevant sellers based on category, location, and other criteria
   */
  async findRelevantSellers(criteria: SellerMatchCriteria): Promise<Array<{
    id: string;
    businessName: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    verificationTier: string;
    isVerified: boolean;
    products: Array<{
      id: string;
      title: string;
      price: number;
      stockQuantity: number;
    }>;
  }>> {
    try {
      const where: any = {
        verificationTier: {
          in: ['standard', 'enhanced', 'premium'], // Only verified sellers
        },
        isVerified: true,
        products: {
          some: {
            categoryId: criteria.categoryId,
            status: 'active',
          },
        },
      };

      // Add subcategory filter if provided
      if (criteria.subcategoryId) {
        where.products.some.subcategoryId = criteria.subcategoryId;
      }

      // Add budget range filter if provided
      if (criteria.budgetRange) {
        const { min, max } = criteria.budgetRange;
        if (min !== undefined || max !== undefined) {
          where.products.some.price = {};
          if (min !== undefined) where.products.some.price.gte = min;
          if (max !== undefined) where.products.some.price.lte = max;
        }
      }

      const sellers = await prisma.user.findMany({
        where,
        select: {
          id: true,
          businessName: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          verificationTier: true,
          isVerified: true,
          products: {
            where: {
              categoryId: criteria.categoryId,
              subcategoryId: criteria.subcategoryId || null,
              status: 'active',
            },
            select: {
              id: true,
              title: true,
              price: true,
              stockQuantity: true,
            },
            take: 3, // Show top 3 relevant products
          },
        },
        orderBy: [
          { verificationTier: 'desc' }, // Premium sellers first
          { isVerified: 'desc' },
        ],
        take: 50, // Limit to top 50 relevant sellers
      });

      logger.info(`Found ${sellers.length} relevant sellers for category ${criteria.categoryId}`);
      return sellers as any;
    } catch (error) {
      logger.error('Error finding relevant sellers:', error);
      throw error;
    }
  }

  /**
   * Send RFQ to relevant sellers automatically
   */
  async distributeRfqToSellers(rfqId: string): Promise<{
    rfq: RfqWithDetails;
    notifiedSellers: Array<{
      id: string;
      businessName: string | null;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      phone: string | null;
      verificationTier: string;
      isVerified: boolean;
      products: Array<{
        id: string;
        title: string;
        price: number;
        stockQuantity: number;
      }>;
    }>;
  }> {
    try {
      const rfq = await this.getRfqById(rfqId);

      if (!rfq) {
        throw new Error('RFQ not found');
      }

      // Find relevant sellers
      const criteria: SellerMatchCriteria = {
        categoryId: rfq.categoryId,
        subcategoryId: rfq.subcategoryId || undefined,
        deliveryLocation: rfq.deliveryLocation || undefined,
      };

      if (rfq.budgetMin || rfq.budgetMax) {
        criteria.budgetRange = {};
        if (rfq.budgetMin) criteria.budgetRange.min = Number(rfq.budgetMin);
        if (rfq.budgetMax) criteria.budgetRange.max = Number(rfq.budgetMax);
      }

      const relevantSellers = await this.findRelevantSellers(criteria);

      // Send WhatsApp notifications to relevant sellers
      const { notificationService } = await import('./notification.service');
      
      const notificationPromises = relevantSellers.map(async (seller) => {
        if (seller.phone) {
          try {
            const buyerName = rfq.buyer.businessName || 
              `${rfq.buyer.firstName || ''} ${rfq.buyer.lastName || ''}`.trim() || 
              'Anonymous Buyer';

            const budgetRange = rfq.budgetMin && rfq.budgetMax 
              ? `₹${rfq.budgetMin} - ₹${rfq.budgetMax}`
              : rfq.budgetMin 
                ? `₹${rfq.budgetMin}+`
                : rfq.budgetMax 
                  ? `Up to ₹${rfq.budgetMax}`
                  : undefined;

            await notificationService.sendRFQWhatsAppNotification({
              userId: seller.id,
              phone: seller.phone,
              rfqData: {
                rfqId: rfq.id,
                title: rfq.title,
                description: rfq.description || '',
                category: rfq.category.name,
                quantity: rfq.quantity || undefined,
                budgetRange,
                deliveryTimeline: rfq.deliveryTimeline || undefined,
                buyerName,
                expiresAt: rfq.expiresAt || undefined
              }
            });
          } catch (error) {
            logger.error(`Failed to send WhatsApp notification to seller ${seller.id}:`, error);
          }
        }
      });

      // Wait for all notifications to be sent (but don't fail if some fail)
      await Promise.allSettled(notificationPromises);

      logger.info(`RFQ ${rfqId} distributed to ${relevantSellers.length} sellers with WhatsApp notifications`);

      return {
        rfq,
        notifiedSellers: relevantSellers,
      };
    } catch (error) {
      logger.error('Error distributing RFQ to sellers:', error);
      throw error;
    }
  }

  /**
   * Get RFQs relevant to a seller based on their products and categories
   */
  async getRelevantRfqsForSeller(sellerId: string, filters: Omit<RfqFilters, 'buyerId'> = {}): Promise<{
    rfqs: RfqWithDetails[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      // Get seller's product categories
      const sellerProducts = await prisma.product.findMany({
        where: {
          sellerId,
          status: 'active',
        },
        select: {
          categoryId: true,
          subcategoryId: true,
        },
        distinct: ['categoryId', 'subcategoryId'],
      });

      if (sellerProducts.length === 0) {
        return {
          rfqs: [],
          total: 0,
          page: filters.page || 1,
          limit: filters.limit || 20,
          totalPages: 0,
        };
      }

      // Build category filter
      const categoryFilters = sellerProducts.map(product => ({
        categoryId: product.categoryId,
        subcategoryId: product.subcategoryId || undefined,
      }));

      const {
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        search,
        minBudget,
        maxBudget,
      } = filters;

      // Build where clause
      const where: any = {
        status: 'active',
        expiresAt: {
          gt: new Date(), // Only show non-expired RFQs
        },
        OR: categoryFilters.map(filter => ({
          categoryId: filter.categoryId,
          subcategoryId: filter.subcategoryId || null,
        })),
        // Exclude RFQs where seller has already quoted
        quotes: {
          none: {
            sellerId,
          },
        },
      };

      if (minBudget !== undefined || maxBudget !== undefined) {
        const budgetFilter: any = {};
        if (minBudget !== undefined) budgetFilter.gte = minBudget;
        if (maxBudget !== undefined) budgetFilter.lte = maxBudget;
        
        where.OR = [
          { budgetMin: budgetFilter },
          { budgetMax: budgetFilter },
        ];
      }

      if (search) {
        where.AND = [
          where.AND || {},
          {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          },
        ];
      }

      // Build order by clause
      const orderBy: any = {};
      orderBy[sortBy] = sortOrder;

      // Get total count
      const total = await prisma.rfq.count({ where });

      // Get RFQs with pagination
      const rfqs = await prisma.rfq.findMany({
        where,
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
          category: true,
          subcategory: true,
          quotes: {
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
            },
            orderBy: { createdAt: 'desc' },
          },
          _count: {
            select: {
              quotes: true,
            },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      });

      const totalPages = Math.ceil(total / limit);

      return {
        rfqs: rfqs as any,
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      logger.error('Error fetching relevant RFQs for seller:', error);
      throw error;
    }
  }

  /**
   * Handle RFQ expiration and lifecycle management
   */
  async processExpiredRfqs(): Promise<{ expiredCount: number; processedRfqs: string[] }> {
    try {
      // Find all active RFQs that have expired
      const expiredRfqs = await prisma.rfq.findMany({
        where: {
          status: 'active',
          expiresAt: {
            lt: new Date(),
          },
        },
        select: {
          id: true,
          title: true,
          buyerId: true,
          _count: {
            select: {
              quotes: true,
            },
          },
        },
      });

      if (expiredRfqs.length === 0) {
        return { expiredCount: 0, processedRfqs: [] };
      }

      // Update expired RFQs to 'expired' status
      const rfqIds = expiredRfqs.map(rfq => rfq.id);
      
      await prisma.rfq.updateMany({
        where: {
          id: {
            in: rfqIds,
          },
        },
        data: {
          status: 'expired',
        },
      });

      // TODO: Send notifications to buyers about expired RFQs
      // This could include summary of quotes received

      logger.info(`Processed ${expiredRfqs.length} expired RFQs`);

      return {
        expiredCount: expiredRfqs.length,
        processedRfqs: rfqIds,
      };
    } catch (error) {
      logger.error('Error processing expired RFQs:', error);
      throw error;
    }
  }

  /**
   * Get RFQ statistics for a buyer
   */
  async getBuyerRfqStats(buyerId: string): Promise<{
    total: number;
    active: number;
    expired: number;
    cancelled: number;
    totalQuotesReceived: number;
    averageQuotesPerRfq: number;
  }> {
    try {
      const stats = await prisma.rfq.groupBy({
        by: ['status'],
        where: { buyerId },
        _count: {
          id: true,
        },
      });

      const quotesStats = await prisma.quote.aggregate({
        where: {
          rfq: {
            buyerId,
          },
        },
        _count: {
          id: true,
        },
      });

      const totalRfqs = await prisma.rfq.count({
        where: { buyerId },
      });

      const result = {
        total: totalRfqs,
        active: 0,
        expired: 0,
        cancelled: 0,
        totalQuotesReceived: quotesStats._count.id || 0,
        averageQuotesPerRfq: totalRfqs > 0 ? (quotesStats._count.id || 0) / totalRfqs : 0,
      };

      stats.forEach(stat => {
        switch (stat.status) {
          case 'active':
            result.active = stat._count.id;
            break;
          case 'expired':
            result.expired = stat._count.id;
            break;
          case 'cancelled':
            result.cancelled = stat._count.id;
            break;
        }
      });

      return result;
    } catch (error) {
      logger.error('Error fetching buyer RFQ stats:', error);
      throw error;
    }
  }
}

export const rfqService = new RfqService();