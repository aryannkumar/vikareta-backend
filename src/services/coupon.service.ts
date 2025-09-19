import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';

export interface CouponCreateInput {
  userId: string;
  code: string;
  discountType: string; // percentage | flat | bogo etc.
  discountValue: number;
  minOrderAmount?: number;
  maxDiscount?: number;
  usageLimit?: number;
  expiresAt?: Date | string | null;
  isActive?: boolean;
}

export interface CouponFilters {
  activeOnly?: boolean;
  search?: string;
  expired?: boolean; // include expired only when true
}

export class CouponService {
  async create(data: CouponCreateInput) {
    try {
      const existing = await prisma.coupon.findUnique({ where: { code: data.code } });
      if (existing) throw new Error('Coupon code already exists');

      const coupon = await prisma.coupon.create({
        data: {
          userId: data.userId,
          code: data.code.trim().toUpperCase(),
          discountType: data.discountType,
          discountValue: data.discountValue,
          minOrderAmount: data.minOrderAmount ?? null,
            maxDiscount: data.maxDiscount ?? null,
          usageLimit: data.usageLimit ?? null,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
          isActive: data.isActive ?? true,
        },
      });
      return coupon;
    } catch (error) {
      logger.error('CouponService.create error:', error);
      throw error;
    }
  }

  async list(filters: CouponFilters, page = 1, limit = 20) {
    const where: any = {};
    if (filters.activeOnly) where.isActive = true;
    if (filters.search) where.code = { contains: filters.search, mode: 'insensitive' };
    if (filters.expired === true) {
      where.expiresAt = { lt: new Date() };
    } else if (filters.expired === false) {
      where.OR = [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.coupon.count({ where }),
    ]);

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getById(id: string) {
    return prisma.coupon.findUnique({ where: { id } });
  }

  async getByCode(code: string) {
    return prisma.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  }

  async update(id: string, data: Partial<CouponCreateInput>) {
    try {
      const coupon = await prisma.coupon.update({
        where: { id },
        data: {
          ...(data.code ? { code: data.code.trim().toUpperCase() } : {}),
          ...(data.discountType ? { discountType: data.discountType } : {}),
          ...(data.discountValue != null ? { discountValue: data.discountValue } : {}),
          ...(data.minOrderAmount != null ? { minOrderAmount: data.minOrderAmount } : {}),
          ...(data.maxDiscount != null ? { maxDiscount: data.maxDiscount } : {}),
          ...(data.usageLimit != null ? { usageLimit: data.usageLimit } : {}),
          ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt ? new Date(data.expiresAt) : null } : {}),
          ...(data.isActive != null ? { isActive: data.isActive } : {}),
        },
      });
      return coupon;
    } catch (error) {
      logger.error('CouponService.update error:', error);
      throw error;
    }
  }

  async softDelete(id: string) {
    return prisma.coupon.update({ where: { id }, data: { isActive: false } });
  }

  async incrementUsage(id: string) {
    return prisma.coupon.update({
      where: { id },
      data: { usedCount: { increment: 1 } },
    });
  }

  async validateForOrder(code: string, orderSubtotal: number) {
    const coupon = await this.getByCode(code);
    if (!coupon) throw new Error('Invalid coupon code');
    if (!coupon.isActive) throw new Error('Coupon inactive');
    if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new Error('Coupon expired');
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw new Error('Coupon usage limit reached');
    if (coupon.minOrderAmount && orderSubtotal < Number(coupon.minOrderAmount)) throw new Error('Order amount below minimum for coupon');

    // Calculate discount
    let discount = 0;
    if (coupon.discountType === 'percentage') {
      discount = (orderSubtotal * Number(coupon.discountValue)) / 100;
    } else if (coupon.discountType === 'flat') {
      discount = Number(coupon.discountValue);
    }
    if (coupon.maxDiscount && discount > Number(coupon.maxDiscount)) {
      discount = Number(coupon.maxDiscount);
    }
    return { coupon, discount: Number(discount.toFixed(2)) };
  }
}

export const couponService = new CouponService();
