import { Product, ProductVariant, ProductMedia } from '@prisma/client';
import { BaseService } from './base.service';
import { logger } from '../utils/logger';
// minioClient intentionally not used in this service yet
import { elasticsearchClient } from '@/config/elasticsearch';

export interface CreateProductData {
  title: string;
  description?: string;
  categoryId: string;
  subcategoryId?: string;
  price: number;
  currency?: string;
  stockQuantity?: number;
  minOrderQuantity?: number;
  sku?: string;
  weight?: number;
  isService?: boolean;
  images?: string[];
}

export interface UpdateProductData extends Partial<CreateProductData> {
  isActive?: boolean;
  status?: string;
}

export interface ProductFilters {
  categoryId?: string;
  subcategoryId?: string;
  sellerId?: string;
  priceMin?: number;
  priceMax?: number;
  isActive?: boolean;
  status?: string;
  search?: string;
}

export class ProductService extends BaseService {
  constructor() {
    super();
  }

  async createProduct(sellerId: string, data: CreateProductData): Promise<Product> {
    try {
      const product = await this.prisma.product.create({
        data: {
          ...data,
          sellerId,
          currency: data.currency || 'INR',
          stockQuantity: data.stockQuantity || 0,
          minOrderQuantity: data.minOrderQuantity || 1,
          isService: data.isService || false,
          status: 'active',
        },
        include: {
          seller: true,
          category: true,
          subcategory: true,
          media: true,
          variants: true,
        },
      });

      // Index in Elasticsearch
      await this.indexProductInElasticsearch(product);

      logger.info(`Product created: ${product.id} by seller: ${sellerId}`);
      return product;
    } catch (error) {
      logger.error('Error creating product:', error);
      throw error;
    }
  }

  async updateProduct(productId: string, sellerId: string, data: UpdateProductData): Promise<Product> {
    try {
      const product = await this.prisma.product.update({
        where: {
          id: productId,
          sellerId, // Ensure seller can only update their own products
        },
        data,
        include: {
          seller: true,
          category: true,
          subcategory: true,
          media: true,
          variants: true,
        },
      });

      // Update in Elasticsearch
      await this.indexProductInElasticsearch(product);

      logger.info(`Product updated: ${productId} by seller: ${sellerId}`);
      return product;
    } catch (error) {
      logger.error('Error updating product:', error);
      throw error;
    }
  }

  async getProductById(productId: string): Promise<Product | null> {
    try {
      return await this.prisma.product.findUnique({
        where: { id: productId },
        include: {
          seller: {
            select: {
              id: true,
              businessName: true,
              firstName: true,
              lastName: true,
              avatar: true,
              verificationTier: true,
              isVerified: true,
            },
          },
          category: true,
          subcategory: true,
          media: {
            orderBy: { sortOrder: 'asc' },
          },
          variants: {
            where: { isActive: true },
            orderBy: { name: 'asc' },
          },
          reviews: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      });
    } catch (error) {
      logger.error('Error fetching product:', error);
      throw error;
    }
  }

  async getProducts(filters: ProductFilters = {}, page = 1, limit = 20): Promise<{
    products: Product[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const where: any = {
        isActive: filters.isActive !== undefined ? filters.isActive : true,
      };

      if (filters.categoryId) where.categoryId = filters.categoryId;
      if (filters.subcategoryId) where.subcategoryId = filters.subcategoryId;
      if (filters.sellerId) where.sellerId = filters.sellerId;
      if (filters.status) where.status = filters.status;
      
      if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
        where.price = {};
        if (filters.priceMin !== undefined) where.price.gte = filters.priceMin;
        if (filters.priceMax !== undefined) where.price.lte = filters.priceMax;
      }

      if (filters.search) {
        where.OR = [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
          { sku: { contains: filters.search, mode: 'insensitive' } },
        ];
      }

      const [products, total] = await Promise.all([
        this.prisma.product.findMany({
          where,
          include: {
            seller: {
              select: {
                id: true,
                businessName: true,
                firstName: true,
                lastName: true,
                avatar: true,
                verificationTier: true,
                isVerified: true,
              },
            },
            category: true,
            subcategory: true,
            media: {
              orderBy: { sortOrder: 'asc' },
              take: 1,
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.product.count({ where }),
      ]);

      return {
        products,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error('Error fetching products:', error);
      throw error;
    }
  }

  async getFeaturedProducts(limit = 10) {
    try {
      const featuredProducts = await this.prisma.featuredProduct.findMany({
        where: { isActive: true },
        include: {
          product: {
            include: {
              seller: {
                select: {
                  id: true,
                  businessName: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  verificationTier: true,
                  isVerified: true,
                },
              },
              category: true,
              media: {
                orderBy: { sortOrder: 'asc' },
                take: 1,
              },
            },
          },
        },
        orderBy: { position: 'asc' },
        take: limit,
      });

      return featuredProducts.map(fp => fp.product);
    } catch (error) {
      logger.error('Error fetching featured products:', error);
      return [];
    }
  }

  async deleteProduct(productId: string, sellerId: string): Promise<void> {
    try {
      await this.prisma.product.delete({
        where: {
          id: productId,
          sellerId, // Ensure seller can only delete their own products
        },
      });

      // Remove from Elasticsearch
      await this.removeProductFromElasticsearch(productId);

      logger.info(`Product deleted: ${productId} by seller: ${sellerId}`);
    } catch (error) {
      logger.error('Error deleting product:', error);
      throw error;
    }
  }

  async addProductMedia(productId: string, mediaData: {
    mediaType: string;
    url: string;
    altText?: string;
    sortOrder?: number;
  }): Promise<ProductMedia> {
    try {
      return await this.prisma.productMedia.create({
        data: {
          ...mediaData,
          productId,
          sortOrder: mediaData.sortOrder || 0,
        },
      });
    } catch (error) {
      logger.error('Error adding product media:', error);
      throw error;
    }
  }

  async createProductVariant(productId: string, variantData: {
    name: string;
    value?: string;
    sku?: string;
    price: number;
    priceAdjustment?: number;
    stock?: number;
    stockQuantity?: number;
  }): Promise<ProductVariant> {
    try {
      return await this.prisma.productVariant.create({
        data: {
          ...variantData,
          productId,
          priceAdjustment: variantData.priceAdjustment || 0,
          stock: variantData.stock || 0,
          stockQuantity: variantData.stockQuantity || 0,
        },
      });
    } catch (error) {
      logger.error('Error creating product variant:', error);
      throw error;
    }
  }

  async searchProducts(query: string, filters: ProductFilters = {}, page = 1, limit = 20): Promise<{
    products: Product[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      // Use Elasticsearch for advanced search
      const searchBody: any = {
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query,
                  fields: ['title^2', 'description', 'sku'],
                  type: 'best_fields',
                  fuzziness: 'AUTO',
                },
              },
            ],
            filter: [],
          },
        },
        from: (page - 1) * limit,
        size: limit,
        sort: [{ _score: { order: 'desc' } }, { createdAt: { order: 'desc' } }],
      };

      // Add filters
      if (filters.categoryId) {
        searchBody.query.bool.filter.push({ term: { categoryId: filters.categoryId } });
      }
      if (filters.sellerId) {
        searchBody.query.bool.filter.push({ term: { sellerId: filters.sellerId } });
      }
      if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
        const priceRange: any = {};
        if (filters.priceMin !== undefined) priceRange.gte = filters.priceMin;
        if (filters.priceMax !== undefined) priceRange.lte = filters.priceMax;
        searchBody.query.bool.filter.push({ range: { price: priceRange } });
      }

      const esResponse: any = await elasticsearchClient.search({
        index: 'products',
        body: searchBody,
      });

      const hits = esResponse.hits?.hits || [];
      const productIds = hits.map((h: any) => h._source?.id || h._id).filter(Boolean);
      const total = typeof esResponse.hits?.total === 'object' ? esResponse.hits.total.value : esResponse.hits?.total || 0;

      if (productIds.length === 0) {
        return { products: [], total: 0, page, totalPages: 0 };
      }

      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds } },
        include: {
          seller: {
            select: {
              id: true,
              businessName: true,
              firstName: true,
              lastName: true,
              avatar: true,
              verificationTier: true,
              isVerified: true,
            },
          },
          category: true,
          subcategory: true,
          media: {
            orderBy: { sortOrder: 'asc' },
            take: 1,
          },
        },
      });

      // Maintain Elasticsearch order
      const orderedProducts = productIds.map((id: string) => 
        products.find(p => p.id === id)
      ).filter(Boolean);

      return {
        products: orderedProducts,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error('Error searching products:', error);
      // Fallback to database search
      return this.getProducts({ ...filters, search: query }, page, limit);
    }
  }

  private async indexProductInElasticsearch(product: any): Promise<void> {
    try {
      await elasticsearchClient.index({
        index: 'products',
        id: product.id,
        document: {
          id: product.id,
          title: product.title,
          description: product.description,
          categoryId: product.categoryId,
          subcategoryId: product.subcategoryId,
          sellerId: product.sellerId,
          price: product.price,
          currency: product.currency,
          stockQuantity: product.stockQuantity,
          sku: product.sku,
          isActive: product.isActive,
          status: product.status,
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
        },
      });
    } catch (error) {
      logger.error('Error indexing product in Elasticsearch:', error);
    }
  }

  private async removeProductFromElasticsearch(productId: string): Promise<void> {
    try {
      await elasticsearchClient.delete({
        index: 'products',
        id: productId,
      });
    } catch (error) {
      logger.error('Error removing product from Elasticsearch:', error);
    }
  }
}