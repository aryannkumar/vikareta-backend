import { BaseService } from './base.service';
import { logger } from '@/utils/logger';

export class CartItemService extends BaseService {
  async addToCart(data: {
    cartId: string;
    productId: string;
    variantId?: string;
    quantity: number;
    unitPrice: number;
  }) {
    // Check if item already exists in cart
    const existingItem = await this.prisma.cartItem.findFirst({
      where: {
        cartId: data.cartId,
        productId: data.productId,
        variantId: data.variantId || null,
      },
    });

    if (existingItem) {
      // Update quantity if item exists
      const updatedItem = await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: existingItem.quantity + data.quantity,
        },
        include: {
          product: true,
          variant: true,
        },
      });

      logger.info(`Cart item updated: ${updatedItem.id} quantity: ${updatedItem.quantity}`);
      return updatedItem;
    } else {
      // Create new cart item
      const newItem = await this.prisma.cartItem.create({
        data: {
          cartId: data.cartId,
          productId: data.productId,
          variantId: data.variantId,
          quantity: data.quantity,
          unitPrice: data.unitPrice,
        },
        include: {
          product: true,
          variant: true,
        },
      });

      logger.info(`Cart item added: ${newItem.id} for product: ${data.productId}`);
      return newItem;
    }
  }

  async updateQuantity(id: string, quantity: number) {
    if (quantity <= 0) {
      return this.removeFromCart(id);
    }

    const updatedItem = await this.prisma.cartItem.update({
      where: { id },
      data: { quantity },
      include: {
        product: true,
        variant: true,
      },
    });

    logger.info(`Cart item quantity updated: ${id} to ${quantity}`);
    return updatedItem;
  }

  async removeFromCart(id: string) {
    const deletedItem = await this.prisma.cartItem.delete({
      where: { id },
    });

    logger.info(`Cart item removed: ${id}`);
    return deletedItem;
  }

  async getCartItems(cartId: string) {
    return this.prisma.cartItem.findMany({
      where: { cartId },
      include: {
        product: {
          include: {
            category: true,
            subcategory: true,
            media: true,
          },
        },
        variant: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getCartItemById(id: string) {
    return this.prisma.cartItem.findUnique({
      where: { id },
      include: {
        product: {
          include: {
            category: true,
            subcategory: true,
            media: true,
          },
        },
        variant: true,
      },
    });
  }

  async clearCart(cartId: string) {
    const result = await this.prisma.cartItem.deleteMany({
      where: { cartId },
    });

    logger.info(`Cart cleared: ${cartId}, removed ${result.count} items`);
    return result;
  }

  async getCartTotal(cartId: string) {
    const items = await this.prisma.cartItem.findMany({
      where: { cartId },
      include: {
        product: true,
        variant: true,
      },
    });

    let total = 0;
    let itemCount = 0;

    for (const item of items) {
      const price = item.variant?.price || item.product.price;
      total += Number(price) * item.quantity;
      itemCount += item.quantity;
    }

    return {
      total: total,
      itemCount,
      items,
    };
  }

  async moveItemsToOrder(cartId: string, orderId: string) {
    const cartItems = await this.getCartItems(cartId);

    const orderItems = [];

    for (const cartItem of cartItems) {
      const orderItem = await this.prisma.orderItem.create({
        data: {
          orderId,
          productId: cartItem.productId,
          variantId: cartItem.variantId,
          quantity: cartItem.quantity,
          unitPrice: cartItem.unitPrice,
          totalPrice: Number(cartItem.unitPrice) * cartItem.quantity,
        },
      });
      orderItems.push(orderItem);
    }

    // Clear the cart after moving items to order
    await this.clearCart(cartId);

    logger.info(`Moved ${cartItems.length} items from cart ${cartId} to order ${orderId}`);
    return orderItems;
  }

  async validateCartItems(cartId: string) {
    const items = await this.getCartItems(cartId);
    const validationResults = [];

    for (const item of items) {
      const product = item.product;
      const variant = item.variant;

      // Check if product is active
      if (!product.isActive) {
        validationResults.push({
          itemId: item.id,
          productId: product.id,
          issue: 'Product is not active',
          severity: 'error',
        });
        continue;
      }

      // Check stock availability
      const availableStock = variant ? variant.stockQuantity : product.stockQuantity;
      if (item.quantity > availableStock) {
        validationResults.push({
          itemId: item.id,
          productId: product.id,
          issue: `Insufficient stock. Requested: ${item.quantity}, Available: ${availableStock}`,
          severity: 'error',
        });
        continue;
      }

      // Check minimum order quantity
      if (item.quantity < product.minOrderQuantity) {
        validationResults.push({
          itemId: item.id,
          productId: product.id,
          issue: `Minimum order quantity is ${product.minOrderQuantity}`,
          severity: 'warning',
        });
      }

      validationResults.push({
        itemId: item.id,
        productId: product.id,
        issue: null,
        severity: 'valid',
      });
    }

    return validationResults;
  }
}

export const cartItemService = new CartItemService();