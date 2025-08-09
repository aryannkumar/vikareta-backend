import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export interface CouponDetails {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minOrderAmount?: number | null;
  maxDiscount?: number | null;
  usageLimit?: number | null;
  usedCount: number;
  expiresAt?: Date | null;
  isActive: boolean;
}

export interface ApplyCouponRequest {
  code: string;
  orderAmount: number;
}

export interface CouponDiscount {
  couponId: string;
  code: string;
  discountAmount: number;
  discountType: 'percentage' | 'fixed';
  originalValue: number;
}

export interface CreateCouponRequest {
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minOrderAmount?: number | null;
  maxDiscount?: number | null;
  usageLimit?: number | null;
  expiresAt?: Date | null;
  isActive?: boolean;
}

export class CouponService {
  /**
   * Create a new coupon
   */
  async createCoupon(request: CreateCouponRequest): Promise<CouponDetails> {
    try {
      // Validate discount value
      if (request.discountType === 'percentage' && request.discountValue > 100) {
        throw new Error('Percentage discount cannot exceed 100%');
      }

      if (request.discountValue <= 0) {
        throw new Error('Discount value must be greater than 0');
      }

      // Check if coupon code already exists
      const existingCoupon = await prisma.coupon.findUnique({
        where: { code: request.code.toUpperCase() },
      });

      if (existingCoupon) {
        throw new Error('Coupon code already exists');
      }

      const coupon = await prisma.coupon.create({
        data: {
          code: request.code.toUpperCase(),
          discountType: request.discountType,
          discountValue: new Prisma.Decimal(request.discountValue),
          minOrderAmount: request.minOrderAmount ? new Prisma.Decimal(request.minOrderAmount) : null,
          maxDiscount: request.maxDiscount ? new Prisma.Decimal(request.maxDiscount) : null,
          usageLimit: request.usageLimit ?? null,
          expiresAt: request.expiresAt ?? null,
          isActive: request.isActive ?? true,
        },
      });

      return this.transformCoupon(coupon);
    } catch (error) {
      logger.error('Error creating coupon:', error);
      throw error;
    }
  }

  /**
   * Get coupon by code
   */
  async getCouponByCode(code: string): Promise<CouponDetails | null> {
    try {
      const coupon = await prisma.coupon.findUnique({
        where: { code: code.toUpperCase() },
      });

      return coupon ? this.transformCoupon(coupon) : null;
    } catch (error) {
      logger.error('Error getting coupon by code:', error);
      throw new Error('Failed to get coupon');
    }
  }

  /**
   * Validate and apply coupon to order
   */
  async applyCoupon(request: ApplyCouponRequest): Promise<CouponDiscount> {
    try {
      const coupon = await prisma.coupon.findUnique({
        where: { code: request.code.toUpperCase() },
      });

      if (!coupon) {
        throw new Error('Invalid coupon code');
      }

      // Check if coupon is active
      if (!coupon.isActive) {
        throw new Error('Coupon is not active');
      }

      // Check if coupon has expired
      if (coupon.expiresAt && coupon.expiresAt < new Date()) {
        throw new Error('Coupon has expired');
      }

      // Check usage limit
      if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
        throw new Error('Coupon usage limit exceeded');
      }

      // Check minimum order amount
      if (coupon.minOrderAmount && request.orderAmount < Number(coupon.minOrderAmount)) {
        throw new Error(`Minimum order amount of ₹${coupon.minOrderAmount} required`);
      }

      // Calculate discount amount
      let discountAmount = 0;
      const discountValue = Number(coupon.discountValue);

      if (coupon.discountType === 'percentage') {
        discountAmount = (request.orderAmount * discountValue) / 100;
        
        // Apply maximum discount limit if set
        if (coupon.maxDiscount && discountAmount > Number(coupon.maxDiscount)) {
          discountAmount = Number(coupon.maxDiscount);
        }
      } else {
        // Fixed discount
        discountAmount = Math.min(discountValue, request.orderAmount);
      }

      // Round to 2 decimal places
      discountAmount = Math.round(discountAmount * 100) / 100;

      return {
        couponId: coupon.id,
        code: coupon.code,
        discountAmount,
        discountType: coupon.discountType as 'percentage' | 'fixed',
        originalValue: discountValue,
      };
    } catch (error) {
      logger.error('Error applying coupon:', error);
      throw error;
    }
  }

  /**
   * Mark coupon as used (increment usage count)
   */
  async markCouponAsUsed(couponId: string): Promise<void> {
    try {
      await prisma.coupon.update({
        where: { id: couponId },
        data: {
          usedCount: {
            increment: 1,
          },
        },
      });
    } catch (error) {
      logger.error('Error marking coupon as used:', error);
      throw new Error('Failed to update coupon usage');
    }
  }

  /**
   * Get all active coupons
   */
  async getActiveCoupons(): Promise<CouponDetails[]> {
    try {
      const coupons = await prisma.coupon.findMany({
        where: {
          isActive: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return coupons.map(coupon => this.transformCoupon(coupon));
    } catch (error) {
      logger.error('Error getting active coupons:', error);
      throw new Error('Failed to get active coupons');
    }
  }

  /**
   * Update coupon
   */
  async updateCoupon(couponId: string, updates: Partial<CreateCouponRequest>): Promise<CouponDetails> {
    try {
      // Validate discount value if provided
      if (updates.discountValue !== undefined) {
        if (updates.discountType === 'percentage' && updates.discountValue > 100) {
          throw new Error('Percentage discount cannot exceed 100%');
        }
        if (updates.discountValue <= 0) {
          throw new Error('Discount value must be greater than 0');
        }
      }

      const updateData: any = {};
      
      if (updates.discountType) updateData.discountType = updates.discountType;
      if (updates.discountValue !== undefined) updateData.discountValue = new Prisma.Decimal(updates.discountValue);
      if (updates.minOrderAmount !== undefined) updateData.minOrderAmount = updates.minOrderAmount ? new Prisma.Decimal(updates.minOrderAmount) : null;
      if (updates.maxDiscount !== undefined) updateData.maxDiscount = updates.maxDiscount ? new Prisma.Decimal(updates.maxDiscount) : null;
      if (updates.usageLimit !== undefined) updateData.usageLimit = updates.usageLimit;
      if (updates.expiresAt !== undefined) updateData.expiresAt = updates.expiresAt;
      if (updates.isActive !== undefined) updateData.isActive = updates.isActive;

      const coupon = await prisma.coupon.update({
        where: { id: couponId },
        data: updateData,
      });

      return this.transformCoupon(coupon);
    } catch (error) {
      logger.error('Error updating coupon:', error);
      throw error;
    }
  }

  /**
   * Delete coupon (soft delete by marking as inactive)
   */
  async deleteCoupon(couponId: string): Promise<void> {
    try {
      await prisma.coupon.update({
        where: { id: couponId },
        data: { isActive: false },
      });
    } catch (error) {
      logger.error('Error deleting coupon:', error);
      throw new Error('Failed to delete coupon');
    }
  }

  /**
   * Get coupon usage statistics
   */
  async getCouponStats(couponId: string): Promise<{
    totalUsage: number;
    remainingUsage: number | null;
    isExpired: boolean;
    isActive: boolean;
  }> {
    try {
      const coupon = await prisma.coupon.findUnique({
        where: { id: couponId },
      });

      if (!coupon) {
        throw new Error('Coupon not found');
      }

      const remainingUsage = coupon.usageLimit ? coupon.usageLimit - coupon.usedCount : null;
      const isExpired = coupon.expiresAt ? coupon.expiresAt < new Date() : false;

      return {
        totalUsage: coupon.usedCount,
        remainingUsage,
        isExpired,
        isActive: coupon.isActive,
      };
    } catch (error) {
      logger.error('Error getting coupon stats:', error);
      throw error;
    }
  }

  /**
   * Check if multiple coupons can be applied (for future enhancement)
   */
  async validateMultipleCoupons(codes: string[], orderAmount: number): Promise<CouponDiscount[]> {
    try {
      const discounts: CouponDiscount[] = [];
      let remainingAmount = orderAmount;

      for (const code of codes) {
        try {
          const discount = await this.applyCoupon({
            code,
            orderAmount: remainingAmount,
          });
          
          discounts.push(discount);
          remainingAmount -= discount.discountAmount;
          
          if (remainingAmount <= 0) break;
        } catch (error) {
          // Skip invalid coupons but continue with others
          logger.warn(`Skipping invalid coupon ${code}:`, error);
        }
      }

      return discounts;
    } catch (error) {
      logger.error('Error validating multiple coupons:', error);
      throw new Error('Failed to validate coupons');
    }
  }

  /**
   * Transform database coupon to service interface
   */
  private transformCoupon(coupon: any): CouponDetails {
    return {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType as 'percentage' | 'fixed',
      discountValue: Number(coupon.discountValue),
      minOrderAmount: coupon.minOrderAmount ? Number(coupon.minOrderAmount) : null,
      maxDiscount: coupon.maxDiscount ? Number(coupon.maxDiscount) : null,
      usageLimit: coupon.usageLimit,
      usedCount: coupon.usedCount,
      expiresAt: coupon.expiresAt,
      isActive: coupon.isActive,
    };
  }
}

export const couponService = new CouponService();