import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import { couponService, CouponDiscount } from './coupon.service';

const prisma = new PrismaClient();

export interface CartItem {
  id: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
  unitPrice: number;
  product: {
    id: string;
    title: string;
    price: number;
    stockQuantity: number;
    isService: boolean;
    seller: {
      id: string;
      businessName: string;
    };
    media: Array<{
      url: string;
      mediaType: string;
      altText?: string | null;
    }>;
  };
  variant?: {
    id: string;
    name: string;
    value: string;
    priceAdjustment: number;
    stockQuantity: number;
  } | null;
}

export interface CartSummary {
  items: CartItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  itemCount: number;
  appliedCoupon?: CouponDiscount | undefined;
}

export interface AddToCartRequest {
  productId: string;
  variantId?: string;
  quantity: number;
}

export interface UpdateCartItemRequest {
  quantity: number;
}

export class CartService {
  /**
   * Get or create shopping cart for user
   */
  async getOrCreateCart(userId: string) {
    try {
      let cart = await prisma.shoppingCart.findUnique({
        where: { userId },
        include: {
          items: {
            include: {
              product: {
                include: {
                  seller: {
                    select: {
                      id: true,
                      businessName: true,
                    },
                  },
                  media: {
                    select: {
                      url: true,
                      mediaType: true,
                      altText: true,
                    },
                    orderBy: {
                      sortOrder: 'asc',
                    },
                    take: 1,
                  },
                },
              },
              variant: true,
            },
          },
        },
      });

      if (!cart) {
        cart = await prisma.shoppingCart.create({
          data: {
            userId,
          },
          include: {
            items: {
              include: {
                product: {
                  include: {
                    seller: {
                      select: {
                        id: true,
                        businessName: true,
                      },
                    },
                    media: {
                      select: {
                        url: true,
                        mediaType: true,
                        altText: true,
                      },
                      orderBy: {
                        sortOrder: 'asc',
                      },
                      take: 1,
                    },
                  },
                },
                variant: true,
              },
            },
          },
        });
      }

      return cart;
    } catch (error) {
      logger.error('Error getting or creating cart:', error);
      throw new Error('Failed to get cart');
    }
  }

  /**
   * Add item to cart with quantity management
   */
  async addToCart(userId: string, request: AddToCartRequest): Promise<CartSummary> {
    try {
      // Get or create cart
      const cart = await this.getOrCreateCart(userId);

      // Validate product exists and get details
      const product = await prisma.product.findUnique({
        where: { id: request.productId },
        include: {
          variants: true,
          seller: {
            select: {
              id: true,
              businessName: true,
            },
          },
          media: {
            select: {
              url: true,
              mediaType: true,
              altText: true,
            },
            orderBy: {
              sortOrder: 'asc',
            },
            take: 1,
          },
        },
      });

      if (!product) {
        throw new Error('Product not found');
      }

      if (product.status !== 'active') {
        throw new Error('Product is not available');
      }

      // Validate variant if provided
      let variant = null;
      if (request.variantId) {
        variant = product.variants.find(v => v.id === request.variantId);
        if (!variant) {
          throw new Error('Product variant not found');
        }
      }

      // Check stock availability
      const availableStock = variant ? variant.stockQuantity : product.stockQuantity;
      if (!product.isService && availableStock < request.quantity) {
        throw new Error('Insufficient stock available');
      }

      // Calculate unit price (base price + variant adjustment)
      const basePrice = product.price;
      const variantAdjustment = variant ? variant.priceAdjustment : new Prisma.Decimal(0);
      const unitPrice = basePrice.add(variantAdjustment);

      // Check if item already exists in cart
      const existingItem = await prisma.cartItem.findFirst({
        where: {
          cartId: cart.id,
          productId: request.productId,
          variantId: request.variantId || null,
        },
      });

      if (existingItem) {
        // Update existing item quantity
        const newQuantity = existingItem.quantity + request.quantity;
        
        // Check stock for new total quantity
        if (!product.isService && availableStock < newQuantity) {
          throw new Error('Insufficient stock for requested quantity');
        }

        await prisma.cartItem.update({
          where: { id: existingItem.id },
          data: {
            quantity: newQuantity,
            unitPrice,
          },
        });
      } else {
        // Create new cart item
        await prisma.cartItem.create({
          data: {
            cartId: cart.id,
            productId: request.productId,
            variantId: request.variantId || null,
            quantity: request.quantity,
            unitPrice,
          },
        });
      }

      // Return updated cart summary
      return await this.getCartSummary(userId);
    } catch (error) {
      logger.error('Error adding to cart:', error);
      throw error;
    }
  }

  /**
   * Update cart item quantity
   */
  async updateCartItem(userId: string, itemId: string, request: UpdateCartItemRequest): Promise<CartSummary> {
    try {
      // Verify cart item belongs to user
      const cartItem = await prisma.cartItem.findFirst({
        where: {
          id: itemId,
          cart: {
            userId,
          },
        },
        include: {
          product: {
            include: {
              variants: true,
            },
          },
          variant: true,
        },
      });

      if (!cartItem) {
        throw new Error('Cart item not found');
      }

      if (request.quantity <= 0) {
        throw new Error('Quantity must be greater than 0');
      }

      // Check stock availability
      const variant = cartItem.variant;
      const product = cartItem.product;
      const availableStock = variant ? variant.stockQuantity : product.stockQuantity;
      
      if (!product.isService && availableStock < request.quantity) {
        throw new Error('Insufficient stock available');
      }

      // Update cart item
      await prisma.cartItem.update({
        where: { id: itemId },
        data: {
          quantity: request.quantity,
        },
      });

      return await this.getCartSummary(userId);
    } catch (error) {
      logger.error('Error updating cart item:', error);
      throw error;
    }
  }

  /**
   * Remove item from cart
   */
  async removeCartItem(userId: string, itemId: string): Promise<CartSummary> {
    try {
      // Verify cart item belongs to user
      const cartItem = await prisma.cartItem.findFirst({
        where: {
          id: itemId,
          cart: {
            userId,
          },
        },
      });

      if (!cartItem) {
        throw new Error('Cart item not found');
      }

      // Remove cart item
      await prisma.cartItem.delete({
        where: { id: itemId },
      });

      return await this.getCartSummary(userId);
    } catch (error) {
      logger.error('Error removing cart item:', error);
      throw error;
    }
  }

  /**
   * Get cart summary with real-time price calculations
   */
  async getCartSummary(userId: string, couponCode?: string): Promise<CartSummary> {
    try {
      const cart = await this.getOrCreateCart(userId);

      // Transform cart items
      const items: CartItem[] = cart.items.map(item => ({
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        product: {
          id: item.product.id,
          title: item.product.title,
          price: Number(item.product.price),
          stockQuantity: item.product.stockQuantity,
          isService: item.product.isService,
          seller: {
            id: item.product.seller.id,
            businessName: item.product.seller.businessName || 'Unknown Seller',
          },
          media: item.product.media.map(m => ({
            url: m.url,
            mediaType: m.mediaType,
            altText: m.altText,
          })),
        },
        variant: item.variant ? {
          id: item.variant.id,
          name: item.variant.name,
          value: item.variant.value || '',
          priceAdjustment: Number(item.variant.priceAdjustment),
          stockQuantity: item.variant.stockQuantity,
        } : null,
      }));

      // Calculate subtotal
      const subtotal = items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
      
      // Apply coupon discount if provided
      let discountAmount = 0;
      let appliedCoupon: CouponDiscount | undefined;
      
      if (couponCode) {
        try {
          appliedCoupon = await couponService.applyCoupon({
            code: couponCode,
            orderAmount: subtotal,
          });
          discountAmount = appliedCoupon.discountAmount;
        } catch (error) {
          // Coupon validation failed, continue without discount
          logger.warn('Coupon validation failed:', error);
        }
      }

      // Calculate tax on discounted amount (18% GST for now - can be made configurable)
      const taxableAmount = subtotal - discountAmount;
      const taxRate = 0.18;
      const taxAmount = taxableAmount * taxRate;
      
      const totalAmount = subtotal - discountAmount + taxAmount;
      const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

      return {
        items,
        subtotal: Math.round(subtotal * 100) / 100,
        discountAmount: Math.round(discountAmount * 100) / 100,
        taxAmount: Math.round(taxAmount * 100) / 100,
        totalAmount: Math.round(totalAmount * 100) / 100,
        itemCount,
        appliedCoupon,
      };
    } catch (error) {
      logger.error('Error getting cart summary:', error);
      throw new Error('Failed to get cart summary');
    }
  }

  /**
   * Clear entire cart
   */
  async clearCart(userId: string): Promise<void> {
    try {
      const cart = await prisma.shoppingCart.findUnique({
        where: { userId },
      });

      if (cart) {
        await prisma.cartItem.deleteMany({
          where: { cartId: cart.id },
        });
      }
    } catch (error) {
      logger.error('Error clearing cart:', error);
      throw new Error('Failed to clear cart');
    }
  }

  /**
   * Validate cart items before checkout
   */
  async validateCartForCheckout(userId: string): Promise<{ valid: boolean; errors: string[] }> {
    try {
      const cartSummary = await this.getCartSummary(userId);
      const errors: string[] = [];

      if (cartSummary.items.length === 0) {
        errors.push('Cart is empty');
        return { valid: false, errors };
      }

      // Check each item for availability and stock
      for (const item of cartSummary.items) {
        // Check if product is still active
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
          include: {
            variants: item.variantId ? {
              where: { id: item.variantId },
            } : false,
          },
        });

        if (!product || product.status !== 'active') {
          errors.push(`Product "${item.product.title}" is no longer available`);
          continue;
        }

        // Check stock availability
        if (!product.isService) {
          const variant = item.variantId && product.variants ? product.variants[0] : null;
          const availableStock = variant ? variant.stockQuantity : product.stockQuantity;
          
          if (availableStock < item.quantity) {
            errors.push(`Insufficient stock for "${item.product.title}". Available: ${availableStock}, Requested: ${item.quantity}`);
          }
        }

        // Check minimum order quantity
        if (item.quantity < product.minOrderQuantity) {
          errors.push(`Minimum order quantity for "${item.product.title}" is ${product.minOrderQuantity}`);
        }
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      logger.error('Error validating cart:', error);
      return {
        valid: false,
        errors: ['Failed to validate cart'],
      };
    }
  }

  /**
   * Apply coupon to cart
   */
  async applyCouponToCart(userId: string, couponCode: string): Promise<CartSummary> {
    try {
      const cartSummary = await this.getCartSummary(userId);
      
      if (cartSummary.items.length === 0) {
        throw new Error('Cannot apply coupon to empty cart');
      }

      // Validate and apply coupon
      await couponService.applyCoupon({
        code: couponCode,
        orderAmount: cartSummary.subtotal,
      });

      // Return cart summary with applied coupon
      return await this.getCartSummary(userId, couponCode);
    } catch (error) {
      logger.error('Error applying coupon to cart:', error);
      throw error;
    }
  }

  /**
   * Remove coupon from cart
   */
  async removeCouponFromCart(userId: string): Promise<CartSummary> {
    try {
      // Return cart summary without coupon
      return await this.getCartSummary(userId);
    } catch (error) {
      logger.error('Error removing coupon from cart:', error);
      throw new Error('Failed to remove coupon from cart');
    }
  }

  /**
   * Validate coupon for cart
   */
  async validateCouponForCart(userId: string, couponCode: string): Promise<{
    valid: boolean;
    discount?: CouponDiscount;
    error?: string;
  }> {
    try {
      const cartSummary = await this.getCartSummary(userId);
      
      if (cartSummary.items.length === 0) {
        return {
          valid: false,
          error: 'Cannot apply coupon to empty cart',
        };
      }

      const couponDiscount = await couponService.applyCoupon({
        code: couponCode,
        orderAmount: cartSummary.subtotal,
      });

      return {
        valid: true,
        discount: couponDiscount,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Invalid coupon',
      };
    }
  }
}

export const cartService = new CartService();