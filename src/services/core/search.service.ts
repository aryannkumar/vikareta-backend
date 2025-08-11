import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';

export interface SearchFilters {
  categoryId?: string;
  subcategoryId?: string;
  priceMin?: number;
  priceMax?: number;
  location?: string;
  sellerId?: string;
  inStock?: boolean;
  rating?: number;
  sortBy?: 'relevance' | 'price' | 'rating' | 'date';
  sortOrder?: 'asc' | 'desc';
}

export interface SearchResult {
  products: any[];
  services: any[];
  users: any[];
  total: number;
  page: number;
  totalPages: number;
}

export class SearchService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Global search across products, services, and users
   */
  async globalSearch(
    query: string,
    filters: SearchFilters = {},
    page = 1,
    limit = 20
  ): Promise<SearchResult> {
    try {
      const skip = (page - 1) * limit;
      const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 2);

      const [products, services, users] = await Promise.all([
        this.searchProducts(query, filters, 0, Math.ceil(limit / 3)),
        this.searchServices(query, filters, 0, Math.ceil(limit / 3)),
        this.searchUsers(query, {}, 0, Math.ceil(limit / 3)),
      ]);

      const allResults = [
        ...products.map(p => ({ ...p, type: 'product' })),
        ...services.map(s => ({ ...s, type: 'service' })),
        ...users.map(u => ({ ...u, type: 'user' })),
      ];

      // Sort by relevance (simplified scoring)
      const scoredResults = allResults.map(result => ({
        ...result,
        relevanceScore: this.calculateRelevanceScore(result, searchTerms),
      }));

      scoredResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

      const paginatedResults = scoredResults.slice(skip, skip + limit);
      const productResults = paginatedResults.filter(r => r.type === 'product');
      const serviceResults = paginatedResults.filter(r => r.type === 'service');
      const userResults = paginatedResults.filter(r => r.type === 'user');

      return {
        products: productResults,
        services: serviceResults,
        users: userResults,
        total: allResults.length,
        page,
        totalPages: Math.ceil(allResults.length / limit),
      };
    } catch (error) {
      logger.error('Error in global search:', error);
      throw error;
    }
  }

  /**
   * Search products
   */
  async searchProducts(
    query: string,
    filters: SearchFilters = {},
    page = 1,
    limit = 20
  ): Promise<any[]> {
    try {
      const where: any = {
        status: 'active',
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      };

      if (filters.categoryId) where.categoryId = filters.categoryId;
      if (filters.subcategoryId) where.subcategoryId = filters.subcategoryId;
      if (filters.sellerId) where.sellerId = filters.sellerId;
      if (filters.inStock) where.stockQuantity = { gt: 0 };

      if (filters.priceMin || filters.priceMax) {
        where.price = {};
        if (filters.priceMin) where.price.gte = filters.priceMin;
        if (filters.priceMax) where.price.lte = filters.priceMax;
      }

      const orderBy: any = {};
      switch (filters.sortBy) {
        case 'price':
          orderBy.price = filters.sortOrder || 'asc';
          break;
        case 'date':
          orderBy.createdAt = filters.sortOrder || 'desc';
          break;
        default:
          orderBy.createdAt = 'desc';
      }

      const skip = (page - 1) * limit;

      const products = await this.prisma.product.findMany({
        where,
        include: {
          seller: {
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
            },
          },
          subcategory: {
            select: {
              id: true,
              name: true,
            },
          },
          media: {
            take: 1,
            orderBy: { sortOrder: 'asc' },
          },
          reviews: {
            select: { rating: true },
          },
        },
        orderBy,
        skip,
        take: limit,
      });

      // Add calculated fields
      return products.map(product => ({
        ...product,
        averageRating: product.reviews.length > 0
          ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / product.reviews.length
          : 0,
        reviewCount: product.reviews.length,
      }));
    } catch (error) {
      logger.error('Error searching products:', error);
      throw error;
    }
  }

  /**
   * Search services
   */
  async searchServices(
    query: string,
    filters: SearchFilters = {},
    page = 1,
    limit = 20
  ): Promise<any[]> {
    try {
      const where: any = {
        status: 'active',
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      };

      if (filters.categoryId) where.categoryId = filters.categoryId;
      if (filters.subcategoryId) where.subcategoryId = filters.subcategoryId;
      if (filters.sellerId) where.providerId = filters.sellerId;

      if (filters.priceMin || filters.priceMax) {
        where.price = {};
        if (filters.priceMin) where.price.gte = filters.priceMin;
        if (filters.priceMax) where.price.lte = filters.priceMax;
      }

      const orderBy: any = {};
      switch (filters.sortBy) {
        case 'price':
          orderBy.price = filters.sortOrder || 'asc';
          break;
        case 'date':
          orderBy.createdAt = filters.sortOrder || 'desc';
          break;
        default:
          orderBy.createdAt = 'desc';
      }

      const skip = (page - 1) * limit;

      const services = await this.prisma.service.findMany({
        where,
        include: {
          provider: {
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
            },
          },
          subcategory: {
            select: {
              id: true,
              name: true,
            },
          },
          media: {
            take: 1,
            orderBy: { sortOrder: 'asc' },
          },
          reviews: {
            select: { rating: true },
          },
        },
        orderBy,
        skip,
        take: limit,
      });

      // Add calculated fields
      return services.map(service => ({
        ...service,
        averageRating: service.reviews.length > 0
          ? service.reviews.reduce((sum, review) => sum + review.rating, 0) / service.reviews.length
          : 0,
        reviewCount: service.reviews.length,
      }));
    } catch (error) {
      logger.error('Error searching services:', error);
      throw error;
    }
  }

  /**
   * Search users/businesses
   */
  async searchUsers(
    query: string,
    filters: any = {},
    page = 1,
    limit = 20
  ): Promise<any[]> {
    try {
      const where: any = {
        OR: [
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
          { businessName: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      };

      const skip = (page - 1) * limit;

      const users = await this.prisma.user.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          businessName: true,
          userType: true,
          isVerified: true,
          createdAt: true,
          _count: {
            select: {
              products: true,
              services: true,
              sellerOrders: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      });

      return users;
    } catch (error) {
      logger.error('Error searching users:', error);
      throw error;
    }
  }

  /**
   * Get search suggestions
   */
  async getSearchSuggestions(query: string, limit = 10): Promise<{
    products: string[];
    services: string[];
    categories: string[];
  }> {
    try {
      const [products, services, categories] = await Promise.all([
        this.prisma.product.findMany({
          where: {
            title: { contains: query, mode: 'insensitive' },
            status: 'active',
          },
          select: { title: true },
          take: limit,
        }),
        this.prisma.service.findMany({
          where: {
            title: { contains: query, mode: 'insensitive' },
            status: 'active',
          },
          select: { title: true },
          take: limit,
        }),
        this.prisma.category.findMany({
          where: {
            name: { contains: query, mode: 'insensitive' },
            isActive: true,
          },
          select: { name: true },
          take: limit,
        }),
      ]);

      return {
        products: products.map(p => p.title),
        services: services.map(s => s.title),
        categories: categories.map(c => c.name),
      };
    } catch (error) {
      logger.error('Error getting search suggestions:', error);
      throw error;
    }
  }

  /**
   * Get popular searches
   */
  async getPopularSearches(limit = 10): Promise<string[]> {
    try {
      // This would typically come from search analytics
      // For now, return some common search terms
      const popularTerms = [
        'electronics',
        'clothing',
        'home decor',
        'books',
        'sports',
        'beauty',
        'automotive',
        'health',
        'food',
        'toys',
      ];

      return popularTerms.slice(0, limit);
    } catch (error) {
      logger.error('Error getting popular searches:', error);
      throw error;
    }
  }

  /**
   * Advanced product search with filters
   */
  async advancedProductSearch(
    query: string,
    filters: SearchFilters & {
      brands?: string[];
      features?: string[];
      availability?: 'in_stock' | 'out_of_stock' | 'all';
    } = {},
    page = 1,
    limit = 20
  ): Promise<{
    products: any[];
    total: number;
    page: number;
    totalPages: number;
    facets: {
      categories: Array<{ id: string; name: string; count: number }>;
      priceRanges: Array<{ range: string; count: number }>;
      brands: Array<{ name: string; count: number }>;
    };
  }> {
    try {
      const where: any = {
        status: 'active',
      };

      if (query) {
        where.OR = [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ];
      }

      // Apply filters
      if (filters.categoryId) where.categoryId = filters.categoryId;
      if (filters.subcategoryId) where.subcategoryId = filters.subcategoryId;
      if (filters.sellerId) where.sellerId = filters.sellerId;

      if (filters.priceMin || filters.priceMax) {
        where.price = {};
        if (filters.priceMin) where.price.gte = filters.priceMin;
        if (filters.priceMax) where.price.lte = filters.priceMax;
      }

      if (filters.availability === 'in_stock') {
        where.stockQuantity = { gt: 0 };
      } else if (filters.availability === 'out_of_stock') {
        where.stockQuantity = { lte: 0 };
      }

      const skip = (page - 1) * limit;

      const [products, total, categories] = await Promise.all([
        this.prisma.product.findMany({
          where,
          include: {
            seller: {
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
              },
            },
            media: {
              take: 1,
              orderBy: { sortOrder: 'asc' },
            },
            reviews: {
              select: { rating: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.product.count({ where }),
        this.prisma.product.groupBy({
          by: ['categoryId'],
          where,
          _count: { id: true },
        }),
      ]);

      // Get category names for facets
      const categoryIds = categories.map(c => c.categoryId);
      const categoryDetails = await this.prisma.category.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true },
      });

      const categoryFacets = categories.map(cat => {
        const category = categoryDetails.find(c => c.id === cat.categoryId);
        return {
          id: cat.categoryId,
          name: category?.name || 'Unknown',
          count: cat._count.id,
        };
      });

      // Calculate price range facets (simplified)
      const priceRanges = [
        { range: '0-100', count: 0 },
        { range: '100-500', count: 0 },
        { range: '500-1000', count: 0 },
        { range: '1000+', count: 0 },
      ];

      return {
        products: products.map(product => ({
          ...product,
          averageRating: product.reviews.length > 0
            ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / product.reviews.length
            : 0,
          reviewCount: product.reviews.length,
        })),
        total,
        page,
        totalPages: Math.ceil(total / limit),
        facets: {
          categories: categoryFacets,
          priceRanges,
          brands: [], // Would be populated from product data
        },
      };
    } catch (error) {
      logger.error('Error in advanced product search:', error);
      throw error;
    }
  }

  /**
   * Calculate relevance score for search results
   */
  private calculateRelevanceScore(result: any, searchTerms: string[]): number {
    let score = 0;
    const title = (result.title || '').toLowerCase();
    const description = (result.description || '').toLowerCase();

    searchTerms.forEach(term => {
      // Title matches get higher score
      if (title.includes(term)) {
        score += title.startsWith(term) ? 10 : 5;
      }
      // Description matches get lower score
      if (description.includes(term)) {
        score += 2;
      }
    });

    // Boost score for verified users/businesses
    if (result.isVerified) {
      score += 3;
    }

    // Boost score for products with good ratings
    if (result.averageRating && result.averageRating > 4) {
      score += 2;
    }

    return score;
  }

  /**
   * Log search query for analytics
   */
  async logSearchQuery(query: string, userId?: string, results = 0): Promise<void> {
    try {
      // In a real implementation, you would store search queries for analytics
      logger.info('Search query logged', {
        query,
        userId,
        results,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Error logging search query:', error);
      // Don't throw error as this is not critical
    }
  }
}

export default SearchService;