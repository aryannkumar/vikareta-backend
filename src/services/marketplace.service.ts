import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface DiscoverFilters {
  latitude?: number;
  longitude?: number;
  radius: number;
  type: 'all' | 'businesses' | 'products' | 'services';
  categoryId?: string;
  limit: number;
}

interface FeaturedFilters {
  type: 'all' | 'businesses' | 'products' | 'services';
  categoryId?: string;
  limit: number;
}

interface PopularFilters {
  type: 'all' | 'businesses' | 'products' | 'services';
  categoryId?: string;
  timeframe: 'day' | 'week' | 'month' | 'all';
  limit: number;
}

interface BusinessFilters {
  latitude?: number;
  longitude?: number;
  radius: number;
  categoryId?: string;
  verificationTier?: string;
  isVerified?: boolean;
  search?: string;
  page: number;
  limit: number;
}

interface CategoryFilters {
  type: 'all' | 'products' | 'services';
  parentId?: string;
}

interface SearchFilters {
  query: string;
  type: 'all' | 'businesses' | 'products' | 'services';
  categoryId?: string;
  latitude?: number;
  longitude?: number;
  radius: number;
  page: number;
  limit: number;
}

class MarketplaceService {
  async discoverNearby(filters: DiscoverFilters) {
    const { type, categoryId, limit } = filters;

    const result: any = {
      businesses: [],
      products: [],
      services: [],
    };

    // Get businesses
    if (type === 'all' || type === 'businesses') {
      const businessWhere: any = {
        userType: 'seller',
        isVerified: true,
      };

      const businesses = await prisma.user.findMany({
        where: businessWhere,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          businessName: true,
          verificationTier: true,
          isVerified: true,
          createdAt: true,
          products: {
            where: {
              status: 'active',
              ...(categoryId && { categoryId }),
            },
            select: {
              id: true,
              title: true,
              price: true,
              isService: true,
            },
            take: 3,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: type === 'businesses' ? limit : Math.ceil(limit / 3),
      });

      result.businesses = businesses.map((business: any) => ({
        ...business,
        type: 'business',
        productCount: business.products.filter((p: any) => !p.isService).length,
        serviceCount: business.products.filter((p: any) => p.isService).length,
        rating: 4.5, // Placeholder
        distance: Math.random() * filters.radius, // Placeholder
      }));
    }

    // Get products
    if (type === 'all' || type === 'products') {
      const productWhere: any = {
        isService: false,
        status: 'active',
        stockQuantity: { gt: 0 },
        ...(categoryId && { categoryId }),
      };

      const products = await prisma.product.findMany({
        where: productWhere,
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
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          media: {
            orderBy: { sortOrder: 'asc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: type === 'products' ? limit : Math.ceil(limit / 3),
      });

      result.products = products.map(product => ({
        ...product,
        type: 'product',
        seller: product.seller,
        rating: 4.2, // Placeholder
        distance: Math.random() * filters.radius, // Placeholder
      }));
    }

    // Get services
    if (type === 'all' || type === 'services') {
      const serviceWhere: any = {
        isService: true,
        status: 'active',
        ...(categoryId && { categoryId }),
      };

      const services = await prisma.product.findMany({
        where: serviceWhere,
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
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          media: {
            orderBy: { sortOrder: 'asc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: type === 'services' ? limit : Math.ceil(limit / 3),
      });

      result.services = services.map(service => ({
        ...service,
        type: 'service',
        provider: service.seller,
        rating: 4.6, // Placeholder
        distance: Math.random() * filters.radius, // Placeholder
      }));
    }

    return result;
  }

  async getFeatured(filters: FeaturedFilters) {
    const { type, categoryId, limit } = filters;

    const result: any = {
      businesses: [],
      products: [],
      services: [],
    };

    // Featured businesses (verified premium sellers)
    if (type === 'all' || type === 'businesses') {
      const businesses = await prisma.user.findMany({
        where: {
          userType: 'seller',
          verificationTier: 'premium',
          isVerified: true,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          businessName: true,
          verificationTier: true,
          isVerified: true,
          createdAt: true,
          products: {
            where: {
              status: 'active',
              ...(categoryId && { categoryId }),
            },
            select: {
              id: true,
              title: true,
              price: true,
              isService: true,
            },
            take: 3,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: type === 'businesses' ? limit : Math.ceil(limit / 3),
      });

      result.businesses = businesses.map((business: any) => ({
        ...business,
        type: 'business',
        featured: true,
        productCount: business.products.filter((p: any) => !p.isService).length,
        serviceCount: business.products.filter((p: any) => p.isService).length,
        rating: 4.7,
      }));
    }

    // Featured products (high-priced or recently added)
    if (type === 'all' || type === 'products') {
      const products = await prisma.product.findMany({
        where: {
          isService: false,
          status: 'active',
          stockQuantity: { gt: 0 },
          ...(categoryId && { categoryId }),
        },
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
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          media: {
            orderBy: { sortOrder: 'asc' },
            take: 1,
          },
        },
        orderBy: [
          { price: 'desc' },
          { createdAt: 'desc' },
        ],
        take: type === 'products' ? limit : Math.ceil(limit / 3),
      });

      result.products = products.map(product => ({
        ...product,
        type: 'product',
        featured: true,
        seller: product.seller,
        rating: 4.4,
      }));
    }

    // Featured services (premium providers)
    if (type === 'all' || type === 'services') {
      const services = await prisma.product.findMany({
        where: {
          isService: true,
          status: 'active',
          ...(categoryId && { categoryId }),
          seller: {
            verificationTier: 'premium',
            isVerified: true,
          },
        },
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
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          media: {
            orderBy: { sortOrder: 'asc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: type === 'services' ? limit : Math.ceil(limit / 3),
      });

      result.services = services.map(service => ({
        ...service,
        type: 'service',
        featured: true,
        provider: service.seller,
        rating: 4.8,
      }));
    }

    return result;
  }

  async getPopular(filters: PopularFilters) {
    const { type, categoryId, timeframe, limit } = filters;

    // Calculate date range based on timeframe
    const now = new Date();
    let dateFilter: Date | undefined;

    switch (timeframe) {
      case 'day':
        dateFilter = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        dateFilter = undefined;
    }

    const result: any = {
      businesses: [],
      products: [],
      services: [],
    };

    // Popular businesses (based on order count)
    if (type === 'all' || type === 'businesses') {
      const businesses = await prisma.user.findMany({
        where: {
          userType: 'seller',
          isVerified: true,
          sellerOrders: {
            some: {
              ...(dateFilter && { createdAt: { gte: dateFilter } }),
              status: 'delivered',
            },
          },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          businessName: true,
          verificationTier: true,
          isVerified: true,
          _count: {
            select: {
              sellerOrders: {
                where: {
                  ...(dateFilter && { createdAt: { gte: dateFilter } }),
                  status: 'delivered',
                },
              },
            },
          },
          products: {
            where: {
              status: 'active',
              ...(categoryId && { categoryId }),
            },
            select: {
              id: true,
              title: true,
              price: true,
              isService: true,
            },
            take: 3,
          },
        },
        orderBy: {
          sellerOrders: {
            _count: 'desc',
          },
        },
        take: type === 'businesses' ? limit : Math.ceil(limit / 3),
      });

      result.businesses = businesses.map((business: any) => ({
        ...business,
        type: 'business',
        popular: true,
        orderCount: business._count.sellerOrders,
        productCount: business.products.filter((p: any) => !p.isService).length,
        serviceCount: business.products.filter((p: any) => p.isService).length,
        rating: 4.5,
      }));
    }

    // Popular products (based on order items)
    if (type === 'all' || type === 'products') {
      const products = await prisma.product.findMany({
        where: {
          isService: false,
          status: 'active',
          stockQuantity: { gt: 0 },
          ...(categoryId && { categoryId }),
          orderItems: {
            some: {
              order: {
                ...(dateFilter && { createdAt: { gte: dateFilter } }),
                status: 'delivered',
              },
            },
          },
        },
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
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          media: {
            orderBy: { sortOrder: 'asc' },
            take: 1,
          },
          _count: {
            select: {
              orderItems: {
                where: {
                  order: {
                    ...(dateFilter && { createdAt: { gte: dateFilter } }),
                    status: 'delivered',
                  },
                },
              },
            },
          },
        },
        orderBy: {
          orderItems: {
            _count: 'desc',
          },
        },
        take: type === 'products' ? limit : Math.ceil(limit / 3),
      });

      result.products = products.map(product => ({
        ...product,
        type: 'product',
        popular: true,
        orderCount: product._count.orderItems,
        seller: product.seller,
        rating: 4.3,
      }));
    }

    // Popular services (based on service appointments)
    if (type === 'all' || type === 'services') {
      const services = await prisma.product.findMany({
        where: {
          isService: true,
          status: 'active',
          ...(categoryId && { categoryId }),
          orderItems: {
            some: {
              order: {
                ...(dateFilter && { createdAt: { gte: dateFilter } }),
                orderType: 'service',
                status: 'delivered',
              },
            },
          },
        },
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
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          media: {
            orderBy: { sortOrder: 'asc' },
            take: 1,
          },
          _count: {
            select: {
              orderItems: {
                where: {
                  order: {
                    ...(dateFilter && { createdAt: { gte: dateFilter } }),
                    orderType: 'service',
                    status: 'delivered',
                  },
                },
              },
            },
          },
        },
        orderBy: {
          orderItems: {
            _count: 'desc',
          },
        },
        take: type === 'services' ? limit : Math.ceil(limit / 3),
      });

      result.services = services.map(service => ({
        ...service,
        type: 'service',
        popular: true,
        bookingCount: service._count.orderItems,
        provider: service.seller,
        rating: 4.7,
      }));
    }

    return result;
  }

  async getBusinesses(filters: BusinessFilters) {
    const {
      categoryId,
      verificationTier,
      isVerified,
      search,
      page,
      limit,
    } = filters;

    const skip = (page - 1) * limit;

    const where: any = {
      userType: 'seller',
    };

    if (verificationTier) where.verificationTier = verificationTier;
    if (isVerified !== undefined) where.isVerified = isVerified;

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { businessName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (categoryId) {
      where.products = {
        some: {
          categoryId,
          status: 'active',
        },
      };
    }

    const [businesses, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          businessName: true,
          verificationTier: true,
          isVerified: true,
          createdAt: true,
          products: {
            where: {
              status: 'active',
              ...(categoryId && { categoryId }),
            },
            select: {
              id: true,
              title: true,
              price: true,
              isService: true,
              category: {
                select: {
                  name: true,
                },
              },
            },
            take: 5,
          },
          _count: {
            select: {
              products: {
                where: {
                  status: 'active',
                  isService: false,
                },
              },
              sellerOrders: {
                where: {
                  status: 'delivered',
                },
              },
            },
          },
        },
        orderBy: [
          { verificationTier: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    const transformedBusinesses = businesses.map((business: any) => ({
      ...business,
      type: 'business',
      productCount: business.products.filter((p: any) => !p.isService).length,
      serviceCount: business.products.filter((p: any) => p.isService).length,
      totalProducts: business._count.products,
      completedOrders: business._count.sellerOrders,
      rating: 4.4, // Placeholder
      distance: Math.random() * filters.radius, // Placeholder
    }));

    return {
      businesses: transformedBusinesses,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getCategories(filters: CategoryFilters) {
    const { type, parentId } = filters;

    const where: any = {
      isActive: true,
    };

    if (parentId) {
      where.parentId = parentId;
    } else {
      where.parentId = null; // Root categories only
    }

    const categories = await prisma.category.findMany({
      where,
      include: {
        children: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: {
            products: {
              where: {
                status: 'active',
                ...(type === 'products' && { isService: false }),
                ...(type === 'services' && { isService: true }),
              },
            },
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    return categories.map((category: any) => ({
      ...category,
      productCount: category._count.products,
      hasSubcategories: category.children.length > 0,
    }));
  }

  async search(filters: SearchFilters) {
    const {
      query,
      type,
      categoryId,
      page,
      limit,
    } = filters;

    const skip = (page - 1) * limit;

    const result: any = {
      businesses: [],
      products: [],
      services: [],
      total: 0,
    };

    // Search businesses
    if (type === 'all' || type === 'businesses') {
      const businessWhere: any = {
        userType: 'seller',
        isVerified: true,
        OR: [
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
          { businessName: { contains: query, mode: 'insensitive' } },
        ],
      };

      const businesses = await prisma.user.findMany({
        where: businessWhere,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          businessName: true,
          verificationTier: true,
          isVerified: true,
          products: {
            where: {
              status: 'active',
              ...(categoryId && { categoryId }),
            },
            select: {
              id: true,
              title: true,
              price: true,
              isService: true,
            },
            take: 3,
          },
        },
        skip: type === 'businesses' ? skip : 0,
        take: type === 'businesses' ? limit : Math.ceil(limit / 3),
      });

      result.businesses = businesses.map((business: any) => ({
        ...business,
        type: 'business',
        productCount: business.products.filter((p: any) => !p.isService).length,
        serviceCount: business.products.filter((p: any) => p.isService).length,
        rating: 4.5,
      }));
    }

    // Search products
    if (type === 'all' || type === 'products') {
      const productWhere: any = {
        isService: false,
        status: 'active',
        stockQuantity: { gt: 0 },
        ...(categoryId && { categoryId }),
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      };

      const products = await prisma.product.findMany({
        where: productWhere,
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
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          media: {
            orderBy: { sortOrder: 'asc' },
            take: 1,
          },
        },
        skip: type === 'products' ? skip : 0,
        take: type === 'products' ? limit : Math.ceil(limit / 3),
      });

      result.products = products.map(product => ({
        ...product,
        type: 'product',
        seller: product.seller,
        rating: 4.2,
      }));
    }

    // Search services
    if (type === 'all' || type === 'services') {
      const serviceWhere: any = {
        isService: true,
        status: 'active',
        ...(categoryId && { categoryId }),
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      };

      const services = await prisma.product.findMany({
        where: serviceWhere,
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
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          media: {
            orderBy: { sortOrder: 'asc' },
            take: 1,
          },
        },
        skip: type === 'services' ? skip : 0,
        take: type === 'services' ? limit : Math.ceil(limit / 3),
      });

      result.services = services.map(service => ({
        ...service,
        type: 'service',
        provider: service.seller,
        rating: 4.6,
      }));
    }

    result.total = result.businesses.length + result.products.length + result.services.length;

    return {
      ...result,
      pagination: {
        page,
        limit,
        total: result.total,
        pages: Math.ceil(result.total / limit),
      },
    };
  }

  async getMarketplaceStats() {
    const [
      totalBusinesses,
      totalProducts,
      totalServices,
      totalOrders,
      totalCategories,
      recentOrders,
    ] = await Promise.all([
      prisma.user.count({
        where: {
          userType: 'seller',
          isVerified: true,
        },
      }),
      prisma.product.count({
        where: {
          isService: false,
          status: 'active',
        },
      }),
      prisma.product.count({
        where: {
          isService: true,
          status: 'active',
        },
      }),
      prisma.order.count({
        where: {
          status: 'delivered',
        },
      }),
      prisma.category.count({
        where: {
          isActive: true,
        },
      }),
      prisma.order.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      }),
    ]);

    return {
      totalBusinesses,
      totalProducts,
      totalServices,
      totalOrders,
      totalCategories,
      recentOrders,
      totalListings: totalProducts + totalServices,
    };
  }
}

export const marketplaceService = new MarketplaceService();