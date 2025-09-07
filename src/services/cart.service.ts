import { BaseService } from './base.service';
import { logger } from '@/utils/logger';

export class CartService extends BaseService {
  constructor() { super(); }

  private async getOrCreateCart(userId: string) {
    let cart = await this.prisma.shoppingCart.findUnique({ where: { userId } });
    if (!cart) {
      cart = await this.prisma.shoppingCart.create({ data: { userId } });
    }
    return cart;
  }

  async getCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    const items = await this.prisma.cartItem.findMany({
      where: { cartId: cart.id },
      include: {
        product: { select: { id: true, title: true, price: true, images: true } },
        variant: { select: { id: true, name: true, value: true, price: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const totals = items.reduce((acc, it) => {
      const line = Number(it.unitPrice) * it.quantity;
      acc.subtotal += line;
      return acc;
    }, { subtotal: 0 });
    return { id: cart.id, items, subtotal: totals.subtotal };
  }

  async addItem(userId: string, data: { productId: string; variantId?: string; quantity: number }) {
    return await this.prisma.$transaction(async (tx) => {
      const cart = await this.getOrCreateCart(userId);
      // Resolve product / variant pricing
      const product = await tx.product.findUnique({ where: { id: data.productId } });
      if (!product) throw new Error('Product not found');
      if (product.isService) throw new Error('Use service booking flow for services');
      if (!product.isActive) throw new Error('Product inactive');

      let unitPrice = Number(product.price);
      if (data.variantId) {
        const variant = await tx.productVariant.findUnique({ where: { id: data.variantId } });
        if (!variant || variant.productId !== product.id) throw new Error('Variant not found');
        if (!variant.isActive) throw new Error('Variant inactive');
        unitPrice = Number(variant.price);
      }

      // Existing item merge
      const existing = await tx.cartItem.findFirst({
        where: { cartId: cart.id, productId: data.productId, variantId: data.variantId || null },
      });
      let item;
      if (existing) {
        item = await tx.cartItem.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + data.quantity, unitPrice },
        });
      } else {
        item = await tx.cartItem.create({
          data: {
            cartId: cart.id,
            productId: data.productId,
            variantId: data.variantId,
            quantity: data.quantity,
            unitPrice,
          },
        });
      }
      logger.info(`Cart add item user=${userId} product=${data.productId}`);
      return item;
    });
  }

  async updateItem(userId: string, itemId: string, data: { quantity?: number }) {
    return await this.prisma.$transaction(async (tx) => {
      const cart = await this.getOrCreateCart(userId);
      const item = await tx.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
      if (!item) throw new Error('Cart item not found');
      if (data.quantity !== undefined) {
        if (data.quantity <= 0) {
          await tx.cartItem.delete({ where: { id: item.id } });
          return null;
        }
      }
      const updated = await tx.cartItem.update({
        where: { id: item.id },
        data: { quantity: data.quantity ?? item.quantity },
      });
      return updated;
    });
  }

  async removeItem(userId: string, itemId: string) {
    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
  }

  async clearCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  }
}

export const cartService = new CartService();