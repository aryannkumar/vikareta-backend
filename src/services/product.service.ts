import { PrismaClient } from '@prisma/client';
import type { Product, ProductVariant, ProductMedia, Category } from '@prisma/client';
import { logger } from '@/utils/logger';

const prisma = new PrismaClient();

export interface CreateProductData {
  title: string;
  description?: string;
  categoryId: string;
  subcategoryId?: string;
  price: number;
  currency?: string;
  stockQuantity?: number;
  minOrderQuantity?: number;
  isService?: boolean;
  variants?: CreateProductVariantData[];
  media?: CreateProductMediaData[];
}

export interface CreateProductVariantData {
  name: string;
  value: string;
  price?: number;
  priceAdjustment?: number;
  stockQuantity?: number;
}

export interface CreateProductMediaData {
  mediaType: 'image' | 'video' | 'document';
  url: string;
  altText?: string;
  sortOrder?: number;
}

export interface UpdateProductData {
  title?: string;
  description?: string;
  categoryId?: string;
  subcategoryId?: string;
  price?: number;
  currency?: string;
  stockQuantity?: number;
  minOrderQuantity?: number;
  isService?: boolean;
  status?: string;
}

export interface ProductFilters {
  categoryId?: string;
  subcategoryId?: string;
  sellerId?: string;
  isService?: boolean;
  status?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'price' | 'createdAt' | 'title' | 'stockQuantity';
  sortOrder?: 'asc' | 'desc';
}

export interface ProductWithDetails extends Product {
  seller: {
    id: string;
    businessName: string | null;
    firstName: string | null;
    lastName: string | null;
    verificationTier: string;
    isVerified: boolean;
  };
  category: Category;
  subcategory: Category | null;
  variants: ProductVariant[];
  media: ProductMedia[];
  _count: {
    orderItems: number;
    cartItems: number;
  };
}

export class ProductService {
  /**
   * Create a new product with variants and media
   */
  async createProduct(sellerId: string, data: CreateProductData): Promise<ProductWithDetails> {
    try {
      // Check for duplicate product title for the same seller
      const existingProduct = await prisma.product.findFirst({
        where: {
          sellerId,
          title: data.title,
          status: 'active'
        }
      });

      if (existingProduct) {
        throw new Error('Product with this title already exists for this seller');
      }

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

      // Create product with variants and media in a transaction
      const product = await prisma.$transaction(async (tx) => {
        // Create the main product
        const newProduct = await tx.product.create({
          data: {
            sellerId,
            title: data.title,
            description: data.description || null,
            categoryId: data.categoryId,
            subcategoryId: data.subcategoryId || null,
            price: data.price,
            currency: data.currency || 'INR',
            stockQuantity: data.stockQuantity || 0,
            minOrderQuantity: data.minOrderQuantity || 1,
            isService: data.isService || false,
          },
        });

        // Create variants if provided
        if (data.variants && data.variants.length > 0) {
          await tx.productVariant.createMany({
            data: data.variants.map(variant => ({
              productId: newProduct.id,
              name: variant.name,
              value: variant.value,
              price: variant.price || newProduct.price,
              priceAdjustment: variant.priceAdjustment || 0,
              stockQuantity: variant.stockQuantity || 0,
            })),
          });
        }

        // Create media if provided
        if (data.media && data.media.length > 0) {
          await tx.productMedia.createMany({
            data: data.media.map(media => ({
              productId: newProduct.id,
              mediaType: media.mediaType,
              url: media.url,
              altText: media.altText || null,
              sortOrder: media.sortOrder || 0,
            })),
          });
        }

        return newProduct;
      });

      // Return the complete product with relations
      return await this.getProductById(product.id);
    } catch (error) {
      logger.error('Error creating product:', error);
      throw error;
    }
  }

  /**
   * Get product by ID with all relations
   */
  async getProductById(productId: string): Promise<ProductWithDetails> {
    try {
      const product = await prisma.product.findUnique({
        where: { id: productId },
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
          category: true,
          subcategory: true,
          variants: {
            orderBy: { name: 'asc' },
          },
          media: {
            orderBy: { sortOrder: 'asc' },
          },
          _count: {
            select: {
              orderItems: true,
              cartItems: true,
            },
          },
        },
      });

      if (!product) {
        throw new Error('Product not found');
      }

      return product as ProductWithDetails;
    } catch (error) {
      logger.error('Error fetching product:', error);
      throw error;
    }
  }

  /**
   * Get products with filtering, pagination, and sorting
   */
  async getProducts(filters: ProductFilters = {}): Promise<{
    products: ProductWithDetails[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const {
        categoryId,
        subcategoryId,
        sellerId,
        isService,
        status = 'active',
        minPrice,
        maxPrice,
        inStock,
        search,
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = filters;

      // Build where clause
      const where: any = {
        status,
      };

      if (categoryId) where.categoryId = categoryId;
      if (subcategoryId) where.subcategoryId = subcategoryId;
      if (sellerId) where.sellerId = sellerId;
      if (typeof isService === 'boolean') where.isService = isService;
      if (inStock) where.stockQuantity = { gt: 0 };

      if (minPrice !== undefined || maxPrice !== undefined) {
        where.price = {};
        if (minPrice !== undefined) where.price.gte = minPrice;
        if (maxPrice !== undefined) where.price.lte = maxPrice;
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
      const total = await prisma.product.count({ where });

      // Get products with pagination
      const products = await prisma.product.findMany({
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
          category: true,
          subcategory: true,
          variants: {
            orderBy: { name: 'asc' },
          },
          media: {
            orderBy: { sortOrder: 'asc' },
          },
          _count: {
            select: {
              orderItems: true,
              cartItems: true,
            },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      });

      const totalPages = Math.ceil(total / limit);

      return {
        products: products as ProductWithDetails[],
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      logger.error('Error fetching products:', error);
      throw error;
    }
  }

  /**
   * Update product
   */
  async updateProduct(productId: string, sellerId: string, data: UpdateProductData): Promise<ProductWithDetails> {
    try {
      // Verify product belongs to seller
      const existingProduct = await prisma.product.findFirst({
        where: { id: productId, sellerId },
      });

      if (!existingProduct) {
        throw new Error('Product not found or access denied');
      }

      // Check for duplicate product title if title is being updated
      if (data.title && data.title !== existingProduct.title) {
        const duplicateProduct = await prisma.product.findFirst({
          where: {
            sellerId,
            title: data.title,
            status: 'active',
            id: { not: productId } // Exclude current product
          }
        });

        if (duplicateProduct) {
          throw new Error('Product with this title already exists for this seller');
        }
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

      // Update product
      await prisma.product.update({
        where: { id: productId },
        data,
      });

      return await this.getProductById(productId);
    } catch (error) {
      logger.error('Error updating product:', error);
      throw error;
    }
  }

  /**
   * Delete product (soft delete by setting status to inactive)
   */
  async deleteProduct(productId: string, sellerId: string): Promise<void> {
    try {
      // Verify product belongs to seller
      const existingProduct = await prisma.product.findFirst({
        where: { id: productId, sellerId },
      });

      if (!existingProduct) {
        throw new Error('Product not found or access denied');
      }

      // Soft delete by setting status to inactive
      await prisma.product.update({
        where: { id: productId },
        data: { status: 'inactive' },
      });

      logger.info(`Product ${productId} deleted by seller ${sellerId}`);
    } catch (error) {
      logger.error('Error deleting product:', error);
      throw error;
    }
  }

  /**
   * Add product variant
   */
  async addProductVariant(productId: string, sellerId: string, variantData: CreateProductVariantData): Promise<ProductVariant> {
    try {
      // Verify product belongs to seller
      const product = await prisma.product.findFirst({
        where: { id: productId, sellerId },
      });

      if (!product) {
        throw new Error('Product not found or access denied');
      }

      const variant = await prisma.productVariant.create({
        data: {
          productId,
          name: variantData.name,
          value: variantData.value,
          price: variantData.price || 0,
          priceAdjustment: variantData.priceAdjustment || 0,
          stockQuantity: variantData.stockQuantity || 0,
        },
      });

      logger.info(`Variant added to product ${productId}`);
      return variant;
    } catch (error) {
      logger.error('Error adding product variant:', error);
      throw error;
    }
  }

  /**
   * Update product variant
   */
  async updateProductVariant(variantId: string, sellerId: string, variantData: Partial<CreateProductVariantData>): Promise<ProductVariant> {
    try {
      // Verify variant belongs to seller's product
      const variant = await prisma.productVariant.findFirst({
        where: {
          id: variantId,
          product: { sellerId },
        },
      });

      if (!variant) {
        throw new Error('Variant not found or access denied');
      }

      const updatedVariant = await prisma.productVariant.update({
        where: { id: variantId },
        data: variantData,
      });

      return updatedVariant;
    } catch (error) {
      logger.error('Error updating product variant:', error);
      throw error;
    }
  }

  /**
   * Delete product variant
   */
  async deleteProductVariant(variantId: string, sellerId: string): Promise<void> {
    try {
      // Verify variant belongs to seller's product
      const variant = await prisma.productVariant.findFirst({
        where: {
          id: variantId,
          product: { sellerId },
        },
      });

      if (!variant) {
        throw new Error('Variant not found or access denied');
      }

      await prisma.productVariant.delete({
        where: { id: variantId },
      });

      logger.info(`Variant ${variantId} deleted`);
    } catch (error) {
      logger.error('Error deleting product variant:', error);
      throw error;
    }
  }

  /**
   * Add product media
   */
  async addProductMedia(productId: string, sellerId: string, mediaData: CreateProductMediaData): Promise<ProductMedia> {
    try {
      // Verify product belongs to seller
      const product = await prisma.product.findFirst({
        where: { id: productId, sellerId },
      });

      if (!product) {
        throw new Error('Product not found or access denied');
      }

      const media = await prisma.productMedia.create({
        data: {
          productId,
          mediaType: mediaData.mediaType,
          url: mediaData.url,
          altText: mediaData.altText || null,
          sortOrder: mediaData.sortOrder || 0,
        },
      });

      logger.info(`Media added to product ${productId}`);
      return media;
    } catch (error) {
      logger.error('Error adding product media:', error);
      throw error;
    }
  }

  /**
   * Update product media
   */
  async updateProductMedia(mediaId: string, sellerId: string, mediaData: Partial<CreateProductMediaData>): Promise<ProductMedia> {
    try {
      // Verify media belongs to seller's product
      const media = await prisma.productMedia.findFirst({
        where: {
          id: mediaId,
          product: { sellerId },
        },
      });

      if (!media) {
        throw new Error('Media not found or access denied');
      }

      const updatedMedia = await prisma.productMedia.update({
        where: { id: mediaId },
        data: mediaData,
      });

      return updatedMedia;
    } catch (error) {
      logger.error('Error updating product media:', error);
      throw error;
    }
  }

  /**
   * Delete product media
   */
  async deleteProductMedia(mediaId: string, sellerId: string): Promise<void> {
    try {
      // Verify media belongs to seller's product
      const media = await prisma.productMedia.findFirst({
        where: {
          id: mediaId,
          product: { sellerId },
        },
      });

      if (!media) {
        throw new Error('Media not found or access denied');
      }

      await prisma.productMedia.delete({
        where: { id: mediaId },
      });

      logger.info(`Media ${mediaId} deleted`);
    } catch (error) {
      logger.error('Error deleting product media:', error);
      throw error;
    }
  }

  /**
   * Update stock quantity and check for low stock alerts
   */
  async updateStock(productId: string, sellerId: string, quantity: number, operation: 'add' | 'subtract' = 'add'): Promise<{ product: ProductWithDetails; lowStockAlert?: boolean }> {
    try {
      const product = await prisma.product.findFirst({
        where: { id: productId, sellerId },
      });

      if (!product) {
        throw new Error('Product not found or access denied');
      }

      const newQuantity = operation === 'add' 
        ? product.stockQuantity + quantity 
        : Math.max(0, product.stockQuantity - quantity);

      await prisma.product.update({
        where: { id: productId },
        data: { stockQuantity: newQuantity },
      });

      const updatedProduct = await this.getProductById(productId);
      
      // Check for low stock alert (less than 10 units)
      const lowStockAlert = newQuantity < 10 && newQuantity > 0;

      if (lowStockAlert) {
        logger.warn(`Low stock alert for product ${productId}: ${newQuantity} units remaining`);
      }

      return { product: updatedProduct, lowStockAlert };
    } catch (error) {
      logger.error('Error updating stock:', error);
      throw error;
    }
  }

  /**
   * Get products with low stock for a seller
   */
  async getLowStockProducts(sellerId: string, threshold: number = 10): Promise<ProductWithDetails[]> {
    try {
      const products = await prisma.product.findMany({
        where: {
          sellerId,
          stockQuantity: {
            lte: threshold,
            gt: 0,
          },
          status: 'active',
        },
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
          category: true,
          subcategory: true,
          variants: {
            orderBy: { name: 'asc' },
          },
          media: {
            orderBy: { sortOrder: 'asc' },
          },
          _count: {
            select: {
              orderItems: true,
              cartItems: true,
            },
          },
        },
        orderBy: { stockQuantity: 'asc' },
      });

      return products as ProductWithDetails[];
    } catch (error) {
      logger.error('Error fetching low stock products:', error);
      throw error;
    }
  }
}

export const productService = new ProductService();