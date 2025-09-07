import { BaseService } from './base.service';

export interface CreateFeaturedProductDto {
  productId: string;
  position?: number;
  isActive?: boolean;
}

export interface UpdateFeaturedProductDto {
  position?: number;
  isActive?: boolean;
}

export class FeaturedProductService extends BaseService {

  async create(createFeaturedProductDto: CreateFeaturedProductDto) {
    this.logger.info(`Creating featured product for product ${createFeaturedProductDto.productId}`);

    // Check if product is already featured
    const existing = await this.prisma.featuredProduct.findUnique({
      where: { productId: createFeaturedProductDto.productId },
    });

    if (existing) {
      throw new Error(`Product ${createFeaturedProductDto.productId} is already featured`);
    }

    const featuredProduct = await this.prisma.featuredProduct.create({
      data: createFeaturedProductDto,
      include: {
        product: {
          select: {
            id: true,
            title: true,
            sku: true,
            images: true,
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    this.logger.info(`Featured product created with ID: ${featuredProduct.id}`);
    return featuredProduct;
  }

  async findById(id: string) {
    this.logger.info(`Finding featured product by ID: ${id}`);

    const featuredProduct = await this.prisma.featuredProduct.findUnique({
      where: { id },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            sku: true,
            description: true,
            images: true,
            price: true,
            category: {
              select: {
                id: true,
                name: true,
              },
            },
            seller: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                businessName: true,
              },
            },
          },
        },
      },
    });

    if (!featuredProduct) {
      throw new Error(`Featured product with ID ${id} not found`);
    }

    return featuredProduct;
  }

  async findByProductId(productId: string) {
    this.logger.info(`Finding featured product for product ${productId}`);

    const featuredProduct = await this.prisma.featuredProduct.findUnique({
      where: { productId },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            sku: true,
            images: true,
          },
        },
      },
    });

    return featuredProduct;
  }

  async findAllActive(limit: number = 20, offset: number = 0) {
    this.logger.info(`Finding active featured products (limit: ${limit}, offset: ${offset})`);

    const featuredProducts = await this.prisma.featuredProduct.findMany({
      where: {
        isActive: true,
        product: {
          isActive: true,
        },
      },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            sku: true,
            description: true,
            images: true,
            price: true,
            category: {
              select: {
                id: true,
                name: true,
              },
            },
            seller: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                businessName: true,
              },
            },
          },
        },
      },
      orderBy: [
        { position: 'asc' },
        { createdAt: 'desc' },
      ],
      take: limit,
      skip: offset,
    });

    return featuredProducts;
  }

  async findAll(limit: number = 50, offset: number = 0, includeInactive: boolean = false) {
    this.logger.info(`Finding all featured products (limit: ${limit}, offset: ${offset})`);

    const featuredProducts = await this.prisma.featuredProduct.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            sku: true,
            images: true,
            isActive: true,
          },
        },
      },
      orderBy: [
        { position: 'asc' },
        { createdAt: 'desc' },
      ],
      take: limit,
      skip: offset,
    });

    return featuredProducts;
  }

  async update(id: string, updateFeaturedProductDto: UpdateFeaturedProductDto) {
    this.logger.info(`Updating featured product ${id}`);

    const featuredProduct = await this.prisma.featuredProduct.update({
      where: { id },
      data: updateFeaturedProductDto,
      include: {
        product: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    this.logger.info(`Featured product updated: ${featuredProduct.id}`);
    return featuredProduct;
  }

  async updatePosition(id: string, position: number) {
    this.logger.info(`Updating position of featured product ${id} to ${position}`);

    const featuredProduct = await this.prisma.featuredProduct.update({
      where: { id },
      data: { position },
      include: {
        product: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    this.logger.info(`Featured product position updated: ${featuredProduct.id}`);
    return featuredProduct;
  }

  async toggleActiveStatus(id: string) {
    this.logger.info(`Toggling active status for featured product ${id}`);

    const current = await this.prisma.featuredProduct.findUnique({
      where: { id },
      select: { isActive: true },
    });

    if (!current) {
      throw new Error(`Featured product with ID ${id} not found`);
    }

    const featuredProduct = await this.prisma.featuredProduct.update({
      where: { id },
      data: { isActive: !current.isActive },
      include: {
        product: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    this.logger.info(`Featured product ${featuredProduct.id} active status set to ${featuredProduct.isActive}`);
    return featuredProduct;
  }

  async delete(id: string) {
    this.logger.info(`Deleting featured product ${id}`);

    const featuredProduct = await this.prisma.featuredProduct.delete({
      where: { id },
    });

    this.logger.info(`Featured product deleted: ${featuredProduct.id}`);
    return featuredProduct;
  }

  async removeByProductId(productId: string) {
    this.logger.info(`Removing featured product for product ${productId}`);

    const featuredProduct = await this.prisma.featuredProduct.findUnique({
      where: { productId },
    });

    if (!featuredProduct) {
      throw new Error(`Product ${productId} is not featured`);
    }

    const deleted = await this.prisma.featuredProduct.delete({
      where: { productId },
    });

    this.logger.info(`Featured product removed for product: ${productId}`);
    return deleted;
  }

  async reorderFeaturedProducts(newOrder: Array<{ id: string; position: number }>) {
    this.logger.info(`Reordering ${newOrder.length} featured products`);

    const results = await Promise.all(
      newOrder.map(({ id, position }) =>
        this.prisma.featuredProduct.update({
          where: { id },
          data: { position },
          select: {
            id: true,
            position: true,
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

    this.logger.info(`Featured products reordered successfully`);
    return results;
  }

  async getFeaturedProductsCount() {
    this.logger.info(`Getting count of active featured products`);

    const count = await this.prisma.featuredProduct.count({
      where: {
        isActive: true,
        product: {
          isActive: true,
        },
      },
    });

    return count;
  }

  async getFeaturedProductsByCategory(categoryId: string, limit: number = 10) {
    this.logger.info(`Getting featured products for category ${categoryId}`);

    const featuredProducts = await this.prisma.featuredProduct.findMany({
      where: {
        isActive: true,
        product: {
          isActive: true,
          categoryId,
        },
      },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            sku: true,
            description: true,
            images: true,
            price: true,
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [
        { position: 'asc' },
        { createdAt: 'desc' },
      ],
      take: limit,
    });

    return featuredProducts;
  }

  async bulkUpdateStatus(featuredProductIds: string[], isActive: boolean) {
    this.logger.info(`Bulk updating ${featuredProductIds.length} featured products to active: ${isActive}`);

    const result = await this.prisma.featuredProduct.updateMany({
      where: {
        id: {
          in: featuredProductIds,
        },
      },
      data: { isActive },
    });

    this.logger.info(`Bulk status update completed: ${result.count} records updated`);
    return result;
  }

  async getExpiredFeaturedProducts() {
    this.logger.info(`Finding expired featured products`);

    // Note: FeaturedProduct doesn't have expiry dates, but we can check for inactive products
    const expiredProducts = await this.prisma.featuredProduct.findMany({
      where: {
        isActive: false,
      },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            isActive: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return expiredProducts;
  }
}