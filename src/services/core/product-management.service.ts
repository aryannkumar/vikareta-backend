import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';

export interface CreateProductData {
  sellerId: string;
  title: string;
  description?: string;
  categoryId: string;
  subcategoryId?: string;
  price: number;
  stockQuantity: number;
  minOrderQuantity?: number;
  media?: Array<{
    url: string;
    mediaType: string;
    altText?: string;
  }>;
  variants?: Array<{
    name: string;
    value: string;
    priceAdjustment: number;
    stockQuantity: number;
  }>;
}

export interface ProductFilters {
  categoryId?: string;
  subcategoryId?: string;
  sellerId?: string;
  priceMin?: number;
  priceMax?: number;
  inStock?: boolean;
  search?: string;
}

export class ProductManagementService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Create a new product
   */
  async createProduct(productData: CreateProductData): Promise<string> {
    try {
      // Create product
      const product = await this.prisma.product.create({
        data: {
          sellerId: productData.sellerId,
          title: productData.title,
          description: productData.description,
          categoryId: productData.categoryId,
          subcategoryId: productData.subcategoryId,
          price: productData.price,
          stockQuantity: productData.stockQuantity,
          minOrderQuantity: productData.minOrderQuantity || 1,
          status: 'active',
        },
      });

      // Create media if provided
      if (productData.media && productData.media.length > 0) {
        for (let i = 0; i < productData.media.length; i++) {
          const media = productData.media[i];
          await this.prisma.productMedia.create({
            data: {
              productId: product.id,
              mediaType: media.mediaType,
              url: media.url,
              altText: media.altText,
              sortOrder: i,
            },
          });
        }
      }

      // Create variants if provided
      if (productData.variants && productData.variants.length > 0) {
        for (const variant of productData.variants) {
          await this.prisma.productVariant.create({
            data: {
              productId: product.id,
              name: variant.name,
              value: variant.value,
              price: productData.price + variant.priceAdjustment,
              priceAdjustment: variant.priceAdjustment,
              stockQuantity: variant.stockQuantity,
              isActive: true,
            },
          });
        }
      }

      logger.info('Product created successfully', { productId: product.id });
      return product.id;
    } catch (error) {
      logger.error('Error creating product:', error);
      throw error;
    }
  }

  /**
   * Update product
   */
  async updateProduct(productId: string, updateData: Partial<CreateProductData>): Promise<void> {
    try {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        throw new Error('Product not found');
      }

      // Update product
      await this.prisma.product.update({
        where: { id: productId },
        data: {
          title: updateData.title,
          description: updateData.description,
          categoryId: updateData.categoryId,
          subcategoryId: updateData.subcategoryId,
          price: updateData.price,
          stockQuantity: updateData.stockQuantity,
          minOrderQuantity: updateData.minOrderQuantity,
        },
      });

      // Update media if provided
      if (updateData.media) {
        // Delete existing media
        await this.prisma.productMedia.deleteMany({
          where: { productId },
        });

        // Create new media
        for (let i = 0; i < updateData.media.length; i++) {
          const media = updateData.media[i];
          await this.prisma.productMedia.create({
            data: {
              productId,
              mediaType: media.mediaType,
              url: media.url,
              altText: media.altText,
              sortOrder: i,
            },
          });
        }
      }

      logger.info('Product updated successfully', { productId });
    } catch (error) {
      logger.error('Error updating product:', error);
      throw error;
    }
  }

  /**
   * Get product details
   */
  async getProductDetails(productId: string): Promise<any> {
    try {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        include: {
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              email: true,
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
          media: {
            orderBy: { sortOrder: 'asc' },
          },
          variants: {
            where: { isActive: true },
          },
          reviews: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });

      if (!product) {
        throw new Error('Product not found');
      }

      // Calculate average rating
      const avgRating = product.reviews.length > 0
        ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / product.reviews.length
        : 0;

      return {
        ...product,
        averageRating: avgRating,
        reviewCount: product.reviews.length,
      };
    } catch (error) {
      logger.error('Error getting product details:', error);
      throw error;
    }
  }

  /**
   * Search and filter products
   */
  async searchProducts(
    filters: ProductFilters,
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc'
  ): Promise<{
    products: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const where: any = {
        status: 'active',
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

      if (filters.search) {
        where.OR = [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ];
      }

      const skip = (page - 1) * limit;

      const [products, total] = await Promise.all([
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
          orderBy: { [sortBy]: sortOrder },
          skip,
          take: limit,
        }),
        this.prisma.product.count({ where }),
      ]);

      // Calculate average ratings
      const productsWithRatings = products.map(product => ({
        ...product,
        averageRating: product.reviews.length > 0
          ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / product.reviews.length
          : 0,
        reviewCount: product.reviews.length,
      }));

      return {
        products: productsWithRatings,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error('Error searching products:', error);
      throw error;
    }
  }

  /**
   * Update product stock
   */
  async updateStock(productId: string, quantity: number, operation: 'increment' | 'decrement' | 'set'): Promise<void> {
    try {
      const updateData: any = {};

      switch (operation) {
        case 'increment':
          updateData.stockQuantity = { increment: quantity };
          break;
        case 'decrement':
          updateData.stockQuantity = { decrement: quantity };
          break;
        case 'set':
          updateData.stockQuantity = quantity;
          break;
      }

      await this.prisma.product.update({
        where: { id: productId },
        data: updateData,
      });

      logger.info('Product stock updated', { productId, quantity, operation });
    } catch (error) {
      logger.error('Error updating product stock:', error);
      throw error;
    }
  }

  /**
   * Get low stock products
   */
  async getLowStockProducts(sellerId?: string, threshold = 10): Promise<any[]> {
    try {
      const where: any = {
        stockQuantity: { lte: threshold },
        status: 'active',
      };

      if (sellerId) where.sellerId = sellerId;

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
            select: { name: true },
          },
          media: {
            take: 1,
            select: { url: true },
          },
        },
        orderBy: { stockQuantity: 'asc' },
      });

      return products;
    } catch (error) {
      logger.error('Error getting low stock products:', error);
      throw error;
    }
  }

  /**
   * Get product analytics
   */
  async getProductAnalytics(sellerId?: string, dateRange?: { from: Date; to: Date }): Promise<{
    totalProducts: number;
    activeProducts: number;
    lowStockProducts: number;
    totalViews: number;
    topProducts: any[];
  }> {
    try {
      const where: any = {};
      if (sellerId) where.sellerId = sellerId;

      const [
        totalProducts,
        activeProducts,
        lowStockProducts,
      ] = await Promise.all([
        this.prisma.product.count({ where }),
        this.prisma.product.count({ where: { ...where, status: 'active' } }),
        this.prisma.product.count({ where: { ...where, stockQuantity: { lte: 10 } } }),
      ]);

      // Get top products by order count
      const topProducts = await this.prisma.product.findMany({
        where,
        include: {
          orderItems: {
            select: { quantity: true },
          },
          media: {
            take: 1,
            select: { url: true },
          },
        },
        take: 10,
      });

      const topProductsWithStats = topProducts
        .map(product => ({
          ...product,
          totalOrdered: product.orderItems.reduce((sum, item) => sum + item.quantity, 0),
        }))
        .sort((a, b) => b.totalOrdered - a.totalOrdered);

      return {
        totalProducts,
        activeProducts,
        lowStockProducts,
        totalViews: 0, // TODO: Implement view tracking
        topProducts: topProductsWithStats,
      };
    } catch (error) {
      logger.error('Error getting product analytics:', error);
      throw error;
    }
  }

  /**
   * Delete product
   */
  async deleteProduct(productId: string): Promise<void> {
    try {
      // Check if product has any orders
      const orderCount = await this.prisma.orderItem.count({
        where: { productId },
      });

      if (orderCount > 0) {
        // Soft delete - just mark as inactive
        await this.prisma.product.update({
          where: { id: productId },
          data: { status: 'inactive' },
        });
      } else {
        // Hard delete if no orders
        await this.prisma.product.delete({
          where: { id: productId },
        });
      }

      logger.info('Product deleted successfully', { productId });
    } catch (error) {
      logger.error('Error deleting product:', error);
      throw error;
    }
  }
}

export default ProductManagementService;