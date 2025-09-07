import { BaseService } from './base.service';
import { prisma } from '@/config/database';
import { ValidationError, NotFoundError } from '@/middleware/error-handler';
import { redisClient } from '@/config/redis';

interface ListParams { page?: number; limit?: number; type?: string; }

export class WishlistService extends BaseService {
  async getWishlist(userId: string, params: ListParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (params.type === 'products') where.productId = { not: null };
    else if (params.type === 'services') where.serviceId = { not: null };
    else if (params.type === 'businesses') where.businessId = { not: null };

    const [items, total] = await Promise.all([
      prisma.wishlist.findMany({
        where,
        include: {
          product: { include: { seller: { select: { id: true, businessName: true, firstName: true, lastName: true, avatar: true, verificationTier: true, isVerified: true } }, media: { take: 1, orderBy: { sortOrder: 'asc' } }, category: { select: { id: true, name: true, slug: true } }, subcategory: { select: { id: true, name: true, slug: true } } } },
          service: { include: { provider: { select: { id: true, businessName: true, firstName: true, lastName: true, avatar: true, verificationTier: true, isVerified: true } }, media: { take: 1, orderBy: { sortOrder: 'asc' } }, category: { select: { id: true, name: true, slug: true } }, subcategory: { select: { id: true, name: true, slug: true } } } },
          business: { select: { id: true, businessName: true, firstName: true, lastName: true, avatar: true, verificationTier: true, isVerified: true, location: true, city: true, state: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.wishlist.count({ where }),
    ]);

    if (params.type) {
      return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    const grouped = {
      products: items.filter(i => i.product).map(i => ({ id: i.id, type: 'product', addedAt: i.createdAt, item: i.product })),
      services: items.filter(i => i.service).map(i => ({ id: i.id, type: 'service', addedAt: i.createdAt, item: i.service })),
      businesses: items.filter(i => i.business).map(i => ({ id: i.id, type: 'business', addedAt: i.createdAt, item: i.business })),
    };

    return { items: grouped, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async add(userId: string, { productId, serviceId, businessId }: { productId?: string; serviceId?: string; businessId?: string; }) {
    if (!productId && !serviceId && !businessId) throw new ValidationError('Product ID, Service ID, or Business ID is required');

    if (productId) {
      const product = await prisma.product.findFirst({ where: { id: productId, isActive: true } });
      if (!product) throw new NotFoundError('Product not found');
    }
    if (serviceId) {
      const service = await prisma.service.findFirst({ where: { id: serviceId, isActive: true } });
      if (!service) throw new NotFoundError('Service not found');
    }
    if (businessId) {
      const business = await prisma.user.findFirst({ where: { id: businessId, isActive: true, role: { in: ['SELLER', 'SERVICE_PROVIDER'] } } });
      if (!business) throw new NotFoundError('Business not found');
    }

    const existing = await prisma.wishlist.findFirst({ where: { userId, ...(productId && { productId }), ...(serviceId && { serviceId }), ...(businessId && { businessId }) } });
    if (existing) throw new ValidationError('Item already in wishlist');

    const wishlistItem = await prisma.wishlist.create({
      data: { userId, ...(productId && { productId }), ...(serviceId && { serviceId }), ...(businessId && { businessId }) },
      include: { product: true, service: true, business: true },
    });

    await this.clearCache(userId);
    return wishlistItem;
  }

  async remove(userId: string, itemId: string) {
    const deleted = await prisma.wishlist.deleteMany({ where: { id: itemId, userId } });
    if (deleted.count === 0) throw new NotFoundError('Item not found in wishlist');
    await this.clearCache(userId);
    return true;
  }

  async removeByReference(userId: string, ref: { productId?: string; serviceId?: string; businessId?: string }) {
    const deleted = await prisma.wishlist.deleteMany({ where: { userId, ...(ref.productId && { productId: ref.productId }), ...(ref.serviceId && { serviceId: ref.serviceId }), ...(ref.businessId && { businessId: ref.businessId }) } });
    if (deleted.count === 0) throw new NotFoundError('Item not found in wishlist');
    await this.clearCache(userId);
    return true;
  }

  async clear(userId: string) {
    const deleted = await prisma.wishlist.deleteMany({ where: { userId } });
    await this.clearCache(userId);
    return deleted.count;
  }

  async stats(userId: string) {
    const [productCount, serviceCount, businessCount] = await Promise.all([
      prisma.wishlist.count({ where: { userId, productId: { not: null } } }),
      prisma.wishlist.count({ where: { userId, serviceId: { not: null } } }),
      prisma.wishlist.count({ where: { userId, businessId: { not: null } } }),
    ]);
    return { total: productCount + serviceCount + businessCount, products: productCount, services: serviceCount, businesses: businessCount };
  }

  async status(userId: string, query: { productId?: string; serviceId?: string; businessId?: string }) {
    const item = await prisma.wishlist.findFirst({ where: { userId, ...(query.productId && { productId: query.productId }), ...(query.serviceId && { serviceId: query.serviceId }), ...(query.businessId && { businessId: query.businessId }) } });
    return { inWishlist: !!item, wishlistItemId: item?.id || null, addedAt: item?.createdAt || null };
  }

  private async clearCache(userId: string) {
    try {
      await redisClient.del(`wishlist:${userId}`);
    } catch (err) {
      // Swallow cache errors silently but keep minimal trace for dev
      this.logger.debug('Wishlist cache clear failed', { userId, error: (err as any)?.message });
    }
  }
}

export const wishlistService = new WishlistService();
