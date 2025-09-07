import { BaseService } from '@/services/base.service';
import { logger } from '@/utils/logger';

export interface CreateProductVariantDto {
  productId: string;
  name: string;
  value?: string;
  sku?: string;
  price: number;
  priceAdjustment?: number;
  stockQuantity?: number;
  isActive?: boolean;
}

export interface UpdateProductVariantDto {
  name?: string;
  value?: string;
  sku?: string;
  price?: number;
  priceAdjustment?: number;
  stockQuantity?: number;
  isActive?: boolean;
}

export class ProductVariantService extends BaseService {

  async create(createProductVariantDto: CreateProductVariantDto) {
    logger.info(`Creating product variant for product ${createProductVariantDto.productId}`);

    const variant = await this.prisma.productVariant.create({
      data: createProductVariantDto,
      include: {
        product: {
          select: {
            id: true,
            title: true,
            sku: true,
          },
        },
      },
    });

    logger.info(`Product variant created with ID: ${variant.id}`);
    return variant;
  }

  async findById(id: string) {
    logger.info(`Finding product variant by ID: ${id}`);

    const variant = await this.prisma.productVariant.findUnique({
      where: { id },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            sku: true,
            category: { select: { id: true, name: true } },
          },
        },
        cartItems: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
          },
        },
        orderItems: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            totalPrice: true,
          },
        },
      },
    });

    if (!variant) {
      throw new Error(`Product variant with ID ${id} not found`);
    }

    return variant;
  }

  async findByProductId(productId: string, includeInactive: boolean = false) {
    logger.info(`Finding variants for product ${productId}`);

    const variants = await this.prisma.productVariant.findMany({
      where: {
        productId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: {
        cartItems: {
          select: {
            id: true,
            quantity: true,
          },
        },
        orderItems: {
          select: {
            id: true,
            quantity: true,
          },
        },
      },
      orderBy: {
        id: 'asc',
      },
    });

    return variants;
  }

  async findBySku(sku: string) {
    logger.info(`Finding product variant by SKU: ${sku}`);

    const variant = await this.prisma.productVariant.findFirst({
      where: { sku },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            sku: true,
          },
        },
      },
    });

    return variant;
  }

  async update(id: string, updateProductVariantDto: UpdateProductVariantDto) {
    logger.info(`Updating product variant ${id}`);

    const variant = await this.prisma.productVariant.update({
      where: { id },
      data: updateProductVariantDto,
      include: {
        product: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    logger.info(`Product variant updated: ${variant.id}`);
    return variant;
  }

  async delete(id: string) {
    logger.info(`Deleting product variant ${id}`);

    // Check if variant is used in any cart items or order items
    const cartItemCount = await this.prisma.cartItem.count({
      where: { variantId: id },
    });

    const orderItemCount = await this.prisma.orderItem.count({
      where: { variantId: id },
    });

    if (cartItemCount > 0 || orderItemCount > 0) {
      throw new Error(`Cannot delete variant ${id} as it is referenced in cart items or order items`);
    }

    const variant = await this.prisma.productVariant.delete({
      where: { id },
    });

    logger.info(`Product variant deleted: ${variant.id}`);
    return variant;
  }

  async updateStock(id: string, newStockQuantity: number) {
    logger.info(`Updating stock for variant ${id} to ${newStockQuantity}`);

    const variant = await this.prisma.productVariant.update({
      where: { id },
      data: { stockQuantity: newStockQuantity },
      include: {
        product: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    logger.info(`Stock updated for variant ${variant.id}`);
    return variant;
  }

  async getLowStockVariants(threshold: number = 10) {
    logger.info(`Finding variants with low stock (threshold: ${threshold})`);

    const variants = await this.prisma.productVariant.findMany({
      where: {
        stockQuantity: {
          lte: threshold,
        },
        isActive: true,
      },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            sku: true,
          },
        },
      },
      orderBy: {
        stockQuantity: 'asc',
      },
    });

    return variants;
  }

  async getVariantStats(productId?: string) {
    logger.info(`Getting variant statistics${productId ? ` for product ${productId}` : ''}`);

    const whereClause = productId ? { productId } : {};

    const stats = await this.prisma.productVariant.groupBy({
      by: ['productId'],
      where: {
        ...whereClause,
        isActive: true,
      },
      _count: {
        id: true,
      },
      _sum: {
        stockQuantity: true,
      },
      _avg: {
        price: true,
      },
    });

    return stats;
  }

  async bulkUpdateStock(updates: Array<{ id: string; stockQuantity: number }>) {
    logger.info(`Bulk updating stock for ${updates.length} variants`);

    const results = await Promise.all(
      updates.map(({ id, stockQuantity }) =>
        this.prisma.productVariant.update({
          where: { id },
          data: { stockQuantity },
          select: {
            id: true,
            stockQuantity: true,
            product: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        })
      )
    );

    logger.info(`Bulk stock update completed for ${results.length} variants`);
    return results;
  }

  async toggleActiveStatus(id: string) {
    logger.info(`Toggling active status for variant ${id}`);

    const currentVariant = await this.prisma.productVariant.findUnique({
      where: { id },
      select: { isActive: true },
    });

    if (!currentVariant) {
      throw new Error(`Product variant with ID ${id} not found`);
    }

    const variant = await this.prisma.productVariant.update({
      where: { id },
      data: { isActive: !currentVariant.isActive },
      include: {
        product: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    logger.info(`Variant ${variant.id} active status set to ${variant.isActive}`);
    return variant;
  }
}