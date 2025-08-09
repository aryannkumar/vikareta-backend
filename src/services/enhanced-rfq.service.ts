import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';

const prisma = new PrismaClient();

interface ServiceRfqData {
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

interface ProductRfqData {
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

interface RfqFilters {
  buyerId?: string;
  categoryId?: string;
  subcategoryId?: string;
  status?: string;
  rfqType?: 'product' | 'service';
  minBudget?: number;
  maxBudget?: number;
  urgency?: string;
  location?: string;
  search?: string;
  page: number;
  limit: number;
  sortBy: 'createdAt' | 'expiresAt' | 'budgetMax' | 'title' | 'urgency';
  sortOrder: 'asc' | 'desc';
}

class EnhancedRfqService {
  async createServiceRfq(buyerId: string, data: ServiceRfqData) {
    // Verify category exists
    const category = await prisma.category.findUnique({
      where: { id: data.categoryId },
    });

    if (!category) {
      throw new Error('Category not found');
    }

    // Verify subcategory if provided
    if (data.subcategoryId) {
      const subcategory = await prisma.category.findUnique({
        where: { id: data.subcategoryId },
      });

      if (!subcategory) {
        throw new Error('Subcategory not found');
      }
    }

    // Set expiration date if not provided (default 30 days)
    const expiresAt = data.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const rfq = await prisma.rfq.create({
      data: {
        buyerId,
        title: data.title,
        description: data.description,
        categoryId: data.categoryId,
        subcategoryId: data.subcategoryId,
        budgetMin: data.budgetMin,
        budgetMax: data.budgetMax,
        deliveryTimeline: data.preferredTimeline,
        deliveryLocation: data.serviceLocation,
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

    logger.info(`Service RFQ created: ${rfq.id} by buyer ${buyerId}`);

    return {
      ...rfq,
      rfqType: 'service' as const,
      serviceType: data.serviceType,
      preferredLocation: data.preferredLocation,
      urgency: data.urgency,
      requirements: data.requirements || [],
      attachments: data.attachments || [],
    };
  }

  async createProductRfq(buyerId: string, data: ProductRfqData) {
    // Verify category exists
    const category = await prisma.category.findUnique({
      where: { id: data.categoryId },
    });

    if (!category) {
      throw new Error('Category not found');
    }

    // Verify subcategory if provided
    if (data.subcategoryId) {
      const subcategory = await prisma.category.findUnique({
        where: { id: data.subcategoryId },
      });

      if (!subcategory) {
        throw new Error('Subcategory not found');
      }
    }

    // Set expiration date if not provided (default 30 days)
    const expiresAt = data.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const rfq = await prisma.rfq.create({
      data: {
        buyerId,
        title: data.title,
        description: data.description,
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

    return {
      ...rfq,
      rfqType: 'product' as const,
      specifications: data.specifications || [],
      attachments: data.attachments || [],
    };
  }

  async getRfqs(filters: RfqFilters) {
    const {
      buyerId,
      categoryId,
      subcategoryId,
      status,
      rfqType,
      minBudget,
      maxBudget,
      location,
      search,
      page,
      limit,
      sortBy,
      sortOrder,
    } = filters;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (buyerId) where.buyerId = buyerId;
    if (categoryId) where.categoryId = categoryId;
    if (subcategoryId) where.subcategoryId = subcategoryId;
    if (status) where.status = status;

    if (minBudget !== undefined || maxBudget !== undefined) {
      where.OR = [];
      if (minBudget !== undefined) {
        where.OR.push({ budgetMin: { gte: minBudget } });
        where.OR.push({ budgetMax: { gte: minBudget } });
      }
      if (maxBudget !== undefined) {
        where.OR.push({ budgetMin: { lte: maxBudget } });
        where.OR.push({ budgetMax: { lte: maxBudget } });
      }
    }

    if (location) {
      where.deliveryLocation = { contains: location, mode: 'insensitive' };
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Filter by RFQ type (service vs product) based on category or other criteria
    if (rfqType === 'service') {
      // You might want to have specific service categories
      // For now, we'll use a simple heuristic
      where.quantity = null;
    } else if (rfqType === 'product') {
      where.quantity = { not: null };
    }

    // Build orderBy clause
    let orderBy: any = {};
    if (sortBy === 'urgency') {
      // Custom urgency sorting would need to be implemented
      orderBy = { createdAt: sortOrder };
    } else {
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

    // Transform RFQs to include type and additional metadata
    const transformedRfqs = rfqs.map(rfq => ({
      ...rfq,
      rfqType: rfq.quantity ? 'product' : 'service',
      quoteCount: rfq._count.quotes,
      isExpired: rfq.expiresAt ? new Date() > rfq.expiresAt : false,
      daysRemaining: rfq.expiresAt 
        ? Math.max(0, Math.ceil((rfq.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : null,
    }));

    return {
      rfqs: transformedRfqs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getRfqById(rfqId: string, userId?: string) {
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

    // Check if user has access to view this RFQ
    const canView = !userId || rfq.buyerId === userId || rfq.quotes.some(q => q.sellerId === userId);
    
    if (userId && !canView) {
      throw new Error('Access denied');
    }

    return {
      ...rfq,
      rfqType: rfq.quantity ? 'product' : 'service',
      quoteCount: rfq.quotes.length,
      isExpired: rfq.expiresAt ? new Date() > rfq.expiresAt : false,
      daysRemaining: rfq.expiresAt 
        ? Math.max(0, Math.ceil((rfq.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : null,
      canEdit: userId === rfq.buyerId,
      canQuote: userId !== rfq.buyerId && rfq.status === 'active' && (!rfq.expiresAt || new Date() < rfq.expiresAt),
    };
  }

  async getMatchingRfqsForSeller(sellerId: string, limit: number = 10) {
    // Get seller's products/services to match with relevant RFQs
    const sellerProducts = await prisma.product.findMany({
      where: {
        sellerId,
        status: 'active',
      },
      select: {
        categoryId: true,
        subcategoryId: true,
        isService: true,
        price: true,
      },
    });

    if (sellerProducts.length === 0) {
      return [];
    }

    // Extract unique categories and subcategories
    const categories = [...new Set(sellerProducts.map(p => p.categoryId))];
    const subcategories = [...new Set(sellerProducts.map(p => p.subcategoryId).filter(Boolean))];

    // Find matching RFQs
    const matchingRfqs = await prisma.rfq.findMany({
      where: {
        status: 'active',
        expiresAt: {
          gt: new Date(),
        },
        OR: [
          { categoryId: { in: categories } },
          ...(subcategories.length > 0 ? [{ subcategoryId: { in: subcategories.filter(Boolean) as string[] } }] : []),
        ],
        // Exclude RFQs where seller already quoted
        quotes: {
          none: {
            sellerId,
          },
        },
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
        quotes: {
          select: {
            id: true,
          },
        },
      },
      orderBy: [
        { createdAt: 'desc' },
      ],
      take: limit,
    });

    // Calculate match score and add metadata
    return matchingRfqs.map(rfq => {
      const matchingProducts = sellerProducts.filter(p => 
        p.categoryId === rfq.categoryId || p.subcategoryId === rfq.subcategoryId
      );

      let matchScore = 0;
      if (matchingProducts.some(p => p.categoryId === rfq.categoryId)) matchScore += 50;
      if (matchingProducts.some(p => p.subcategoryId === rfq.subcategoryId)) matchScore += 30;
      
      // Budget match
      if (rfq.budgetMin || rfq.budgetMax) {
        const avgProductPrice = matchingProducts.reduce((sum, p) => sum + Number(p.price), 0) / matchingProducts.length;
        if (rfq.budgetMin && avgProductPrice >= Number(rfq.budgetMin)) matchScore += 10;
        if (rfq.budgetMax && avgProductPrice <= Number(rfq.budgetMax)) matchScore += 10;
      }

      return {
        ...rfq,
        rfqType: rfq.quantity ? 'product' : 'service',
        matchScore,
        quoteCount: rfq.quotes?.length || 0,
        daysRemaining: rfq.expiresAt 
          ? Math.max(0, Math.ceil((rfq.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
          : null,
        matchingProductCount: matchingProducts.length,
      };
    }).sort((a, b) => b.matchScore - a.matchScore);
  }

  async updateRfqStatus(rfqId: string, buyerId: string, status: string) {
    // Verify RFQ exists and belongs to buyer
    const existingRfq = await prisma.rfq.findFirst({
      where: {
        id: rfqId,
        buyerId,
      },
    });

    if (!existingRfq) {
      throw new Error('RFQ not found or access denied');
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
  }

  async extendRfqExpiry(rfqId: string, buyerId: string, newExpiryDate: Date) {
    // Verify RFQ exists and belongs to buyer
    const existingRfq = await prisma.rfq.findFirst({
      where: {
        id: rfqId,
        buyerId,
      },
    });

    if (!existingRfq) {
      throw new Error('RFQ not found or access denied');
    }

    if (newExpiryDate <= new Date()) {
      throw new Error('New expiry date must be in the future');
    }

    const updatedRfq = await prisma.rfq.update({
      where: { id: rfqId },
      data: { expiresAt: newExpiryDate },
    });

    logger.info(`RFQ expiry extended: ${rfqId} to ${newExpiryDate} by buyer ${buyerId}`);

    return updatedRfq;
  }

  async getRfqAnalytics(buyerId: string) {
    const [
      totalRfqs,
      activeRfqs,
      expiredRfqs,
      totalQuotes,
      avgQuotesPerRfq,
      categoryBreakdown,
    ] = await Promise.all([
      prisma.rfq.count({
        where: { buyerId },
      }),
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
      prisma.quote.count({
        where: {
          rfq: { buyerId },
        },
      }),
      prisma.rfq.findMany({
        where: { buyerId },
        select: {
          _count: {
            select: { quotes: true },
          },
        },
      }),
      prisma.rfq.groupBy({
        by: ['categoryId'],
        where: { buyerId },
        _count: {
          id: true,
        },
        _avg: {
          budgetMax: true,
        },
      }),
    ]);

    const avgQuotes = avgQuotesPerRfq.length > 0 
      ? avgQuotesPerRfq.reduce((sum, rfq) => sum + rfq._count.quotes, 0) / avgQuotesPerRfq.length 
      : 0;

    return {
      totalRfqs,
      activeRfqs,
      expiredRfqs,
      totalQuotes,
      avgQuotesPerRfq: Math.round(avgQuotes * 100) / 100,
      categoryBreakdown,
      responseRate: totalRfqs > 0 ? Math.round((totalQuotes / totalRfqs) * 100) / 100 : 0,
    };
  }
}

export const enhancedRfqService = new EnhancedRfqService();