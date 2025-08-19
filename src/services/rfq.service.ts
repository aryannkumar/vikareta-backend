import { PrismaClient } from '@prisma/client';
import type { Rfq } from '@prisma/client';
import { logger } from '@/utils/logger';
import { whatsAppService } from './WhatsAppService';

const prisma = new PrismaClient();

// Enhanced interfaces combining both services
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

export interface ServiceRfqData {
  title: string;
  description: string;
  categoryId: string;
  subcategoryId?: string;
  serviceType: 'one_time' | 'recurring' | 'subscription';
  budgetMin?: number;
  budgetMax?: number;
  preferredLocation: 'online' | 'on_site' | 'both';
  serviceLocation?: string;
  preferredTimeline: string;
  urgency: 'low' | 'medium' | 'high' | 'urgent';
  requirements?: string[];
  attachments?: string[];
  expiresAt?: Date;
}

export interface ProductRfqData {
  title: string;
  description: string;
  categoryId: string;
  subcategoryId?: string;
  quantity: number;
  budgetMin?: number;
  budgetMax?: number;
  deliveryLocation: string;
  deliveryTimeline: string;
  specifications?: string[];
  attachments?: string[];
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
  sellerId?: string;
  categoryId?: string;
  subcategoryId?: string;
  status?: string;
  rfqType?: 'product' | 'service';
  minBudget?: number;
  maxBudget?: number;
  urgency?: 'low' | 'medium' | 'high' | 'urgent';
  location?: string;
  search?: string;
  verificationTier?: string;
  isVerified?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'expiresAt' | 'budgetMax' | 'title' | 'urgency' | 'quoteCount';
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
  category: {
    id: string;
    name: string;
    slug: string;
  };
  subcategory?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  quotes: Array<{
    id: string;
    sellerId: string;
    totalPrice: number;
    status: string;
    createdAt: Date;
    seller?: {
      id: string;
      businessName: string | null;
      firstName: string | null;
      lastName: string | null;
      verificationTier: string;
      isVerified: boolean;
    };
  }>;
  _count?: {
    quotes: number;
  };
}

export interface SellerMatchingCriteria {
  categoryIds: string[];
  subcategoryIds: string[];
  minVerificationTier?: string;
  location?: string;
  maxDistance?: number;
  priceRange?: { min: number; max: number };
}

interface RfqMetadata {
  serviceType?: string;
  preferredLocation?: string;
  urgency?: string;
  requirements?: string[];
  specifications?: string[];
  attachments?: string[];
  unitOfMeasurement?: string;
}

export class RfqService {
  // Helper function to extract metadata from description
  private extractMetadata(description: string): RfqMetadata {
    const serviceMatch = description.match(/\[SERVICE_METADATA\](.*?)\[\/SERVICE_METADATA\]/s);
    const productMatch = description.match(/\[PRODUCT_METADATA\](.*?)\[\/PRODUCT_METADATA\]/s);
    
    try {
      if (serviceMatch) {
        return JSON.parse(serviceMatch[1]);
      } else if (productMatch) {
        return JSON.parse(productMatch[1]);
      }
    } catch (error) {
      logger.warn('Failed to parse metadata from description:', error);
    }
    
    return {};
  }

  // Helper function to clean description (remove metadata)
  private cleanDescription(description: string): string {
    return description
      .replace(/\[SERVICE_METADATA\].*?\[\/SERVICE_METADATA\]/s, '')
      .replace(/\[PRODUCT_METADATA\].*?\[\/PRODUCT_METADATA\]/s, '')
      .trim();
  }

  // Create Service RFQ
  async createServiceRfq(buyerId: string, data: ServiceRfqData) {
    try {
      // Validate buyer exists
      const buyer = await prisma.user.findUnique({
        where: { id: buyerId },
        select: { id: true, userType: true, isActive: true },
      });

      if (!buyer || buyer.userType !== 'buyer' || !buyer.isActive) {
        throw new Error('Invalid or inactive buyer');
      }

      // Verify category exists
      const category = await prisma.category.findUnique({
        where: { id: data.categoryId },
        select: { id: true, name: true, isActive: true },
      });

      if (!category || !category.isActive) {
        throw new Error('Category not found or inactive');
      }

      // Verify subcategory if provided
      if (data.subcategoryId) {
        const subcategory = await prisma.subcategory.findUnique({
          where: { id: data.subcategoryId },
          select: { id: true, name: true, isActive: true, categoryId: true },
        });

        if (!subcategory || !subcategory.isActive || subcategory.categoryId !== data.categoryId) {
          throw new Error('Invalid subcategory for the selected category');
        }
      }

      // Set expiration date (default 30 days)
      const expiresAt = data.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Create service-specific description with metadata
      const enhancedDescription = `${data.description}\n\n[SERVICE_METADATA]${JSON.stringify({
        serviceType: data.serviceType,
        preferredLocation: data.preferredLocation,
        urgency: data.urgency,
        requirements: data.requirements || [],
        attachments: data.attachments || [],
      })}[/SERVICE_METADATA]`;

      // Create the RFQ
      const rfq = await prisma.rfq.create({
        data: {
          buyerId,
          title: data.title,
          description: enhancedDescription,
          categoryId: data.categoryId,
          subcategoryId: data.subcategoryId,
          budgetMin: data.budgetMin,
          budgetMax: data.budgetMax,
          deliveryTimeline: data.preferredTimeline,
          deliveryLocation: data.serviceLocation,
          expiresAt,
          status: 'active',
          quantity: null, // Service RFQs don't have quantity
        },
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
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          subcategory: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      logger.info(`Service RFQ created: ${rfq.id} by buyer ${buyerId}`);

      // Distribute to matching sellers
      await this.distributeRfqToSellers(rfq.id);

      // Send WhatsApp notification to buyer
      try {
        await whatsAppService.sendOrderNotification({
          buyerId,
          orderId: rfq.id,
          status: 'RFQ Created',
          message: `Your service RFQ "${rfq.title}" has been created successfully.`,
          type: 'rfq_received',
        });
      } catch (error) {
        logger.warn('Failed to send WhatsApp notification:', error);
      }

      return {
        ...rfq,
        description: this.cleanDescription(rfq.description),
        rfqType: 'service' as const,
        serviceType: data.serviceType,
        preferredLocation: data.preferredLocation,
        urgency: data.urgency,
        requirements: data.requirements || [],
        attachments: data.attachments || [],
      };
    } catch (error) {
      logger.error('Error creating service RFQ:', error);
      throw error;
    }
  }

  // Create Product RFQ
  async createProductRfq(buyerId: string, data: ProductRfqData) {
    try {
      // Validate buyer exists
      const buyer = await prisma.user.findUnique({
        where: { id: buyerId },
        select: { id: true, userType: true, isActive: true },
      });

      if (!buyer || buyer.userType !== 'buyer' || !buyer.isActive) {
        throw new Error('Invalid or inactive buyer');
      }

      // Verify category exists
      const category = await prisma.category.findUnique({
        where: { id: data.categoryId },
        select: { id: true, name: true, isActive: true },
      });

      if (!category || !category.isActive) {
        throw new Error('Category not found or inactive');
      }

      // Verify subcategory if provided
      if (data.subcategoryId) {
        const subcategory = await prisma.subcategory.findUnique({
          where: { id: data.subcategoryId },
          select: { id: true, name: true, isActive: true, categoryId: true },
        });

        if (!subcategory || !subcategory.isActive || subcategory.categoryId !== data.categoryId) {
          throw new Error('Invalid subcategory for the selected category');
        }
      }

      // Set expiration date (default 30 days)
      const expiresAt = data.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Create product-specific description with metadata
      const enhancedDescription = `${data.description}\n\n[PRODUCT_METADATA]${JSON.stringify({
        specifications: data.specifications || [],
        attachments: data.attachments || [],
      })}[/PRODUCT_METADATA]`;

      // Create the RFQ
      const rfq = await prisma.rfq.create({
        data: {
          buyerId,
          title: data.title,
          description: enhancedDescription,
          categoryId: data.categoryId,
          subcategoryId: data.subcategoryId,
          quantity: data.quantity,
          budgetMin: data.budgetMin,
          budgetMax: data.budgetMax,
          deliveryTimeline: data.deliveryTimeline,
          deliveryLocation: data.deliveryLocation,
          expiresAt,
          status: 'active',
        },
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
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          subcategory: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      logger.info(`Product RFQ created: ${rfq.id} by buyer ${buyerId}`);

      // Distribute to matching sellers
      await this.distributeRfqToSellers(rfq.id);

      // Send WhatsApp notification to buyer
      try {
        await whatsAppService.sendOrderNotification({
          buyerId,
          orderId: rfq.id,
          status: 'RFQ Created',
          message: `Your product RFQ "${rfq.title}" has been created successfully.`,
          type: 'rfq_received',
        });
      } catch (error) {
        logger.warn('Failed to send WhatsApp notification:', error);
      }

      return {
        ...rfq,
        description: this.cleanDescription(rfq.description),
        rfqType: 'product' as const,
        specifications: data.specifications || [],
        attachments: data.attachments || [],
      };
    } catch (error) {
      logger.error('Error creating product RFQ:', error);
      throw error;
    }
  }

  // Enhanced getRfqs with improved filtering
  async getRfqs(filters: RfqFilters) {
    try {
      const {
        buyerId,
        sellerId,
        categoryId,
        subcategoryId,
        status,
        rfqType,
        minBudget,
        maxBudget,
        location,
        search,
        verificationTier,
        isVerified,
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = filters;

      const skip = (page - 1) * limit;

      // Build complex where clause
      const where: any = {
        // Only show active, non-expired RFQs by default
        status: status || 'active',
        expiresAt: { gt: new Date() },
      };

      if (buyerId) where.buyerId = buyerId;
      if (categoryId) where.categoryId = categoryId;
      if (subcategoryId) where.subcategoryId = subcategoryId;

      // RFQ Type filtering (service vs product based on quantity)
      if (rfqType === 'service') {
        where.quantity = null;
      } else if (rfqType === 'product') {
        where.quantity = { not: null };
      }

      // Budget filtering
      if (minBudget !== undefined || maxBudget !== undefined) {
        where.AND = where.AND || [];
        if (minBudget !== undefined) {
          where.AND.push({
            OR: [
              { budgetMin: { gte: minBudget } },
              { budgetMax: { gte: minBudget } },
            ],
          });
        }
        if (maxBudget !== undefined) {
          where.AND.push({
            OR: [
              { budgetMin: { lte: maxBudget } },
              { budgetMax: { lte: maxBudget } },
            ],
          });
        }
      }

      // Location filtering
      if (location) {
        where.deliveryLocation = { contains: location, mode: 'insensitive' };
      }

      // Search filtering
      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Buyer verification filtering
      if (verificationTier || isVerified !== undefined) {
        where.buyer = {};
        if (verificationTier) where.buyer.verificationTier = verificationTier;
        if (isVerified !== undefined) where.buyer.isVerified = isVerified;
      }

      // Seller-specific filtering (RFQs where seller hasn't quoted yet)
      if (sellerId) {
        where.quotes = {
          none: {
            sellerId,
          },
        };
      }

      // Build orderBy clause
      let orderBy: any = {};
      switch (sortBy) {
        case 'quoteCount':
          orderBy = [
            { quotes: { _count: sortOrder } },
            { createdAt: 'desc' },
          ];
          break;
        default:
          orderBy[sortBy] = sortOrder;
      }

      const [rfqs, total] = await Promise.all([
        prisma.rfq.findMany({
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
                location: true,
              },
            },
            category: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
            subcategory: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
            quotes: {
              select: {
                id: true,
                sellerId: true,
                totalPrice: true,
                status: true,
                createdAt: true,
                seller: {
                  select: {
                    id: true,
                    businessName: true,
                    verificationTier: true,
                  },
                },
              },
              orderBy: { createdAt: 'desc' },
              take: 5,
            },
            _count: {
              select: {
                quotes: true,
              },
            },
          },
          orderBy,
          skip,
          take: limit,
        }),
        prisma.rfq.count({ where }),
      ]);

      // Transform RFQs with enhanced metadata
      const transformedRfqs = rfqs.map(rfq => {
        const metadata = this.extractMetadata(rfq.description || '');
        const isExpired = rfq.expiresAt ? new Date() > rfq.expiresAt : false;
        const daysRemaining = rfq.expiresAt 
          ? Math.max(0, Math.ceil((rfq.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
          : null;

        return {
          ...rfq,
          description: this.cleanDescription(rfq.description || ''),
          rfqType: rfq.quantity ? 'product' : 'service',
          quoteCount: rfq._count.quotes,
          isExpired,
          daysRemaining,
          urgency: metadata.urgency || 'medium',
          serviceType: metadata.serviceType,
          preferredLocation: metadata.preferredLocation,
          requirements: metadata.requirements || [],
          specifications: metadata.specifications || [],
          attachments: metadata.attachments || [],
          averageQuotePrice: rfq.quotes.length > 0 
            ? rfq.quotes.reduce((sum, quote) => sum + Number(quote.totalPrice), 0) / rfq.quotes.length
            : null,
        };
      });

      return {
        rfqs: transformedRfqs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error('Error fetching RFQs:', error);
      throw error;
    }
  }

  // Enhanced getRfqById with access controls
  async getRfqById(rfqId: string, userId?: string) {
    try {
      const rfq = await prisma.rfq.findUnique({
        where: { id: rfqId },
        include: {
          buyer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              verificationTier: true,
              isVerified: true,
              createdAt: true,
              location: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          subcategory: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          quotes: {
            include: {
              seller: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  businessName: true,
                  verificationTier: true,
                  isVerified: true,
                  location: true,
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
                      isService: true,
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!rfq) {
        throw new Error('RFQ not found');
      }

      // Enhanced access control
      const canView = !userId || 
        rfq.buyerId === userId || 
        rfq.quotes.some(q => q.sellerId === userId) ||
        await this.isSellerMatchingRfq(userId, rfqId);
      
      if (userId && !canView) {
        throw new Error('Access denied');
      }

      const metadata = this.extractMetadata(rfq.description || '');
      const isExpired = rfq.expiresAt ? new Date() > rfq.expiresAt : false;
      const daysRemaining = rfq.expiresAt 
        ? Math.max(0, Math.ceil((rfq.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : null;

      return {
        ...rfq,
        description: this.cleanDescription(rfq.description || ''),
        rfqType: rfq.quantity ? 'product' : 'service',
        quoteCount: rfq.quotes.length,
        isExpired,
        daysRemaining,
        urgency: metadata.urgency || 'medium',
        serviceType: metadata.serviceType,
        preferredLocation: metadata.preferredLocation,
        requirements: metadata.requirements || [],
        specifications: metadata.specifications || [],
        attachments: metadata.attachments || [],
        canEdit: userId === rfq.buyerId,
        canQuote: userId !== rfq.buyerId && 
          rfq.status === 'active' && 
          (!rfq.expiresAt || new Date() < rfq.expiresAt) &&
          !rfq.quotes.some(q => q.sellerId === userId),
        averageQuotePrice: rfq.quotes.length > 0 
          ? rfq.quotes.reduce((sum, quote) => sum + Number(quote.totalPrice), 0) / rfq.quotes.length
          : null,
      };
    } catch (error) {
      logger.error('Error fetching RFQ by ID:', error);
      throw error;
    }
  }

  // Distribute RFQ to matching sellers with WhatsApp notifications
  async distributeRfqToSellers(rfqId: string) {
    try {
      const rfq = await prisma.rfq.findUnique({
        where: { id: rfqId },
        include: {
          buyer: true,
          category: true,
          subcategory: true,
        },
      });

      if (!rfq) {
        throw new Error('RFQ not found');
      }

      // Find matching sellers
      const matchingCriteria: SellerMatchingCriteria = {
        categoryIds: [rfq.categoryId],
        subcategoryIds: rfq.subcategoryId ? [rfq.subcategoryId] : [],
        minVerificationTier: 'basic',
      };

      const matchingSellers = await this.findMatchingSellers(matchingCriteria);

      // Send WhatsApp notifications to top matching sellers (limit to 10)
      const topSellers = matchingSellers
        .map(seller => ({
          ...seller,
          matchScore: this.calculateSellerMatchScore(seller, rfq),
        }))
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 10);

      for (const seller of topSellers) {
        try {
          await whatsAppService.sendCustomMessage(seller.id, `New RFQ Available: ${rfq.title}. Check your dashboard for details.`);
        } catch (error) {
          logger.error(`Failed to send WhatsApp notification to seller ${seller.id}:`, error);
        }
      }

      logger.info(`RFQ ${rfqId} distributed to ${matchingSellers.length} sellers`);
      
      return {
        rfq,
        notifiedSellers: topSellers,
        totalMatchingSellers: matchingSellers.length,
      };
    } catch (error) {
      logger.error('Error distributing RFQ to sellers:', error);
      throw error;
    }
  }

  // Find matching sellers based on criteria
  private async findMatchingSellers(criteria: SellerMatchingCriteria) {
    const where: any = {
      userType: 'seller',
      isActive: true,
      isVerified: true,
    };

    if (criteria.minVerificationTier) {
      where.verificationTier = { in: ['premium', 'verified', 'basic'] };
    }

    if (criteria.location) {
      where.location = { contains: criteria.location, mode: 'insensitive' };
    }

    // Find sellers with products in matching categories
    where.products = {
      some: {
        status: 'active',
        OR: [
          { categoryId: { in: criteria.categoryIds } },
          ...(criteria.subcategoryIds.length > 0 ? [{ subcategoryId: { in: criteria.subcategoryIds } }] : []),
        ],
      },
    };

    return prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        businessName: true,
        verificationTier: true,
        location: true,
        products: {
          where: { status: 'active' },
          select: {
            id: true,
            categoryId: true,
            subcategoryId: true,
            price: true,
            isService: true,
          },
        },
      },
      take: 50, // Limit to top 50 matching sellers
    });
  }

  // Calculate seller match score for RFQ
  private calculateSellerMatchScore(seller: any, rfq: any): number {
    let score = 0;

    // Category match
    if (seller.products.some((p: any) => p.categoryId === rfq.categoryId)) score += 50;
    
    // Subcategory match
    if (rfq.subcategoryId && seller.products.some((p: any) => p.subcategoryId === rfq.subcategoryId)) score += 30;
    
    // Service type match
    if (seller.products.some((p: any) => p.isService === (rfq.quantity === null))) score += 20;
    
    // Verification tier bonus
    if (seller.verificationTier === 'premium') score += 15;
    else if (seller.verificationTier === 'verified') score += 10;
    
    return score;
  }

  // Check if seller matches RFQ criteria
  private async isSellerMatchingRfq(sellerId: string, rfqId: string): Promise<boolean> {
    // Simple check based on categories - could be enhanced with a dedicated table
    const seller = await prisma.user.findUnique({
      where: { id: sellerId },
      select: {
        products: {
          select: { categoryId: true, subcategoryId: true },
        },
      },
    });
    
    const rfq = await prisma.rfq.findUnique({
      where: { id: rfqId },
      select: { categoryId: true, subcategoryId: true },
    });
    
    if (!seller || !rfq) return false;
    
    return seller.products.some(p => 
      p.categoryId === rfq.categoryId || p.subcategoryId === rfq.subcategoryId
    );
  }

  // Enhanced analytics with more metrics
  async getRfqAnalytics(buyerId: string) {
    try {
      const [
        totalRfqs,
        activeRfqs,
        expiredRfqs,
        completedRfqs,
        totalQuotes,
        acceptedQuotes,
        avgQuotesPerRfq,
        categoryBreakdown,
        monthlyTrends,
        budgetAnalysis,
      ] = await Promise.all([
        prisma.rfq.count({ where: { buyerId } }),
        prisma.rfq.count({
          where: {
            buyerId,
            status: 'active',
            expiresAt: { gt: new Date() },
          },
        }),
        prisma.rfq.count({
          where: {
            buyerId,
            OR: [
              { status: 'expired' },
              { expiresAt: { lte: new Date() } },
            ],
          },
        }),
        prisma.rfq.count({
          where: { buyerId, status: 'completed' },
        }),
        prisma.quote.count({
          where: { rfq: { buyerId } },
        }),
        prisma.quote.count({
          where: { 
            rfq: { buyerId },
            status: 'accepted',
          },
        }),
        prisma.rfq.findMany({
          where: { buyerId },
          select: { _count: { select: { quotes: true } } },
        }),
        prisma.rfq.groupBy({
          by: ['categoryId'],
          where: { buyerId },
          _count: { id: true },
          _avg: { budgetMax: true },
        }),
        prisma.rfq.groupBy({
          by: ['createdAt'],
          where: {
            buyerId,
            createdAt: { gte: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000) },
          },
          _count: { id: true },
        }),
        prisma.rfq.aggregate({
          where: { buyerId },
          _avg: { budgetMin: true, budgetMax: true },
          _min: { budgetMin: true },
          _max: { budgetMax: true },
        }),
      ]);

      const avgQuotes = avgQuotesPerRfq.length > 0 
        ? avgQuotesPerRfq.reduce((sum, rfq) => sum + rfq._count.quotes, 0) / avgQuotesPerRfq.length 
        : 0;

      return {
        totalRfqs,
        activeRfqs,
        expiredRfqs,
        completedRfqs,
        totalQuotes,
        acceptedQuotes,
        avgQuotesPerRfq: Math.round(avgQuotes * 100) / 100,
        categoryBreakdown,
        monthlyTrends,
        budgetAnalysis,
        responseRate: totalRfqs > 0 ? Math.round((totalQuotes / totalRfqs) * 100) / 100 : 0,
        conversionRate: totalQuotes > 0 ? Math.round((acceptedQuotes / totalQuotes) * 100) / 100 : 0,
        successRate: totalRfqs > 0 ? Math.round((completedRfqs / totalRfqs) * 100) / 100 : 0,
      };
    } catch (error) {
      logger.error('Error fetching RFQ analytics:', error);
      throw error;
    }
  }

  // Cleanup expired RFQs (to be called by a cron job)
  async cleanupExpiredRfqs() {
    try {
      const expiredRfqs = await prisma.rfq.updateMany({
        where: {
          status: 'active',
          expiresAt: { lte: new Date() },
        },
        data: { status: 'expired' },
      });

      logger.info(`Marked ${expiredRfqs.count} RFQs as expired`);
      return expiredRfqs.count;
    } catch (error) {
      logger.error('Error cleaning up expired RFQs:', error);
      throw error;
    }
  }

  // Update RFQ status with enhanced validation
  async updateRfqStatus(rfqId: string, buyerId: string, status: string) {
    try {
      const validStatuses = ['active', 'paused', 'closed', 'expired', 'completed'];
      if (!validStatuses.includes(status)) {
        throw new Error('Invalid status');
      }

      const existingRfq = await prisma.rfq.findFirst({
        where: { id: rfqId, buyerId },
        include: { quotes: { select: { id: true, status: true } } },
      });

      if (!existingRfq) {
        throw new Error('RFQ not found or access denied');
      }

      // Prevent status changes if there are accepted quotes
      if (status === 'closed' && existingRfq.quotes.some(q => q.status === 'accepted')) {
        throw new Error('Cannot close RFQ with accepted quotes');
      }

      const updatedRfq = await prisma.rfq.update({
        where: { id: rfqId },
        data: { status },
        include: {
          buyer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      logger.info(`RFQ status updated: ${rfqId} to ${status} by buyer ${buyerId}`);

      return updatedRfq;
    } catch (error) {
      logger.error('Error updating RFQ status:', error);
      throw error;
    }
  }

  // Extend RFQ expiry with validation
  async extendRfqExpiry(rfqId: string, buyerId: string, newExpiryDate: Date) {
    try {
      const existingRfq = await prisma.rfq.findFirst({
        where: { id: rfqId, buyerId },
      });

      if (!existingRfq) {
        throw new Error('RFQ not found or access denied');
      }

      if (newExpiryDate <= new Date()) {
        throw new Error('New expiry date must be in the future');
      }

      // Limit extension to maximum 90 days from now
      const maxExpiryDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      if (newExpiryDate > maxExpiryDate) {
        throw new Error('Extension cannot exceed 90 days from now');
      }

      const updatedRfq = await prisma.rfq.update({
        where: { id: rfqId },
        data: { expiresAt: newExpiryDate },
      });

      logger.info(`RFQ expiry extended: ${rfqId} to ${newExpiryDate} by buyer ${buyerId}`);

      return updatedRfq;
    } catch (error) {
      logger.error('Error extending RFQ expiry:', error);
      throw error;
    }
  }

  // Get RFQs relevant for a specific seller
  async getRelevantRfqsForSeller(sellerId: string, filters: RfqFilters) {
    try {
      // Add seller-specific filtering
      const sellerFilters = {
        ...filters,
        sellerId,
      };

      return this.getRfqs(sellerFilters);
    } catch (error) {
      logger.error('Error fetching relevant RFQs for seller:', error);
      throw error;
    }
  }

  // Get buyer RFQ statistics
  async getBuyerRfqStats(buyerId: string) {
    try {
      return this.getRfqAnalytics(buyerId);
    } catch (error) {
      logger.error('Error fetching buyer RFQ stats:', error);
      throw error;
    }
  }

  // Update RFQ with enhanced validation
  async updateRfq(rfqId: string, buyerId: string, updateData: UpdateRfqData) {
    try {
      const existingRfq = await prisma.rfq.findFirst({
        where: { id: rfqId, buyerId },
        include: { quotes: { select: { id: true, status: true } } },
      });

      if (!existingRfq) {
        throw new Error('RFQ not found or access denied');
      }

      // Prevent updates if there are accepted quotes
      if (existingRfq.quotes.some(q => q.status === 'accepted')) {
        throw new Error('Cannot update RFQ with accepted quotes');
      }

      const updatedRfq = await prisma.rfq.update({
        where: { id: rfqId },
        data: updateData,
        include: {
          buyer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          subcategory: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      logger.info(`RFQ updated: ${rfqId} by buyer ${buyerId}`);
      return updatedRfq;
    } catch (error) {
      logger.error('Error updating RFQ:', error);
      throw error;
    }
  }

  // Delete RFQ with validation
  async deleteRfq(rfqId: string, buyerId: string) {
    try {
      const existingRfq = await prisma.rfq.findFirst({
        where: { id: rfqId, buyerId },
        include: { quotes: { select: { id: true, status: true } } },
      });

      if (!existingRfq) {
        throw new Error('RFQ not found or access denied');
      }

      // Prevent deletion if there are accepted quotes
      if (existingRfq.quotes.some(q => q.status === 'accepted')) {
        throw new Error('Cannot delete RFQ with accepted quotes');
      }

      await prisma.rfq.delete({
        where: { id: rfqId },
      });

      logger.info(`RFQ deleted: ${rfqId} by buyer ${buyerId}`);
      return { success: true };
    } catch (error) {
      logger.error('Error deleting RFQ:', error);
      throw error;
    }
  }

  // Legacy method for backward compatibility
  async createRfq(buyerId: string, data: CreateRfqData) {
    // Determine if it's a service or product RFQ based on quantity
    if (data.quantity && data.quantity > 0) {
      // Product RFQ
      const productData: ProductRfqData = {
        title: data.title,
        description: data.description || '',
        categoryId: data.categoryId,
        subcategoryId: data.subcategoryId,
        quantity: data.quantity,
        budgetMin: data.budgetMin,
        budgetMax: data.budgetMax,
        deliveryLocation: data.deliveryLocation || '',
        deliveryTimeline: data.deliveryTimeline || '',
        specifications: [],
        attachments: [],
        expiresAt: data.expiresAt,
      };
      return this.createProductRfq(buyerId, productData);
    } else {
      // Service RFQ
      const serviceData: ServiceRfqData = {
        title: data.title,
        description: data.description || '',
        categoryId: data.categoryId,
        subcategoryId: data.subcategoryId,
        serviceType: 'one_time',
        budgetMin: data.budgetMin,
        budgetMax: data.budgetMax,
        preferredLocation: 'both',
        serviceLocation: data.deliveryLocation,
        preferredTimeline: data.deliveryTimeline || '',
        urgency: 'medium',
        requirements: [],
        attachments: [],
        expiresAt: data.expiresAt,
      };
      return this.createServiceRfq(buyerId, serviceData);
    }
  }
}

export const rfqService = new RfqService();
export default rfqService;