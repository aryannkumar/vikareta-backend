import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { cartService, CartSummary } from './cart.service';
import { paymentService, CreateOrderRequest, CashfreeOrderResponse } from './payment.service';

const prisma = new PrismaClient();

export interface CheckoutRequest {
  userId: string;
  couponCode?: string;
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  billingAddress?: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  paymentMethod: 'cashfree' | 'wallet';
  returnUrl?: string;
  customerNotes?: string;
}

export interface CheckoutResponse {
  success: boolean;
  orderId?: string;
  cashfreeOrder?: CashfreeOrderResponse;
  paymentRequired: boolean;
  totalAmount: number;
  message: string;
}

export interface OrderSummary {
  orderId: string;
  orderNumber: string;
  items: Array<{
    productId: string;
    productTitle: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    sellerId: string;
    sellerName: string;
  }>;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  shippingAmount: number;
  totalAmount: number;
  paymentStatus: string;
  orderStatus: string;
  shippingAddress: any;
  billingAddress?: any;
  createdAt: Date;
}

export class CheckoutService {
  /**
   * Initiate checkout process
   */
  async initiateCheckout(request: CheckoutRequest): Promise<CheckoutResponse> {
    try {
      // Validate cart
      const cartValidation = await cartService.validateCartForCheckout(request.userId);
      if (!cartValidation.valid) {
        return {
          success: false,
          paymentRequired: false,
          totalAmount: 0,
          message: `Cart validation failed: ${cartValidation.errors.join(', ')}`,
        };
      }

      // Get cart summary with coupon if provided
      const cartSummary = await cartService.getCartSummary(request.userId, request.couponCode);
      
      if (cartSummary.items.length === 0) {
        return {
          success: false,
          paymentRequired: false,
          totalAmount: 0,
          message: 'Cart is empty',
        };
      }

      // Calculate shipping
      const shippingAmount = await this.calculateShipping(cartSummary, request.shippingAddress);
      const finalAmount = cartSummary.totalAmount + shippingAmount;

      // Create order in database
      const order = await this.createOrder({
        userId: request.userId,
        cartSummary,
        shippingAmount,
        shippingAddress: request.shippingAddress,
        billingAddress: request.billingAddress || request.shippingAddress,
        couponCode: request.couponCode,
        customerNotes: request.customerNotes,
      });

      // Handle payment based on method
      if (request.paymentMethod === 'wallet') {
        // Process wallet payment
        const walletPayment = await this.processWalletPayment(request.userId, order.id, finalAmount);
        
        if (walletPayment.success) {
          // Clear cart after successful payment
          await cartService.clearCart(request.userId);
          
          return {
            success: true,
            orderId: order.id,
            paymentRequired: false,
            totalAmount: finalAmount,
            message: 'Order placed successfully using wallet',
          };
        } else {
          return {
            success: false,
            paymentRequired: true,
            totalAmount: finalAmount,
            message: walletPayment.message,
          };
        }
      } else {
        // Process Cashfree payment
        const cashfreeOrder = await this.createCashfreeOrder({
          userId: request.userId,
          orderId: order.id,
          amount: finalAmount,
          returnUrl: request.returnUrl,
        });

        return {
          success: true,
          orderId: order.id,
          cashfreeOrder,
          paymentRequired: true,
          totalAmount: finalAmount,
          message: 'Cashfree payment order created successfully',
        };
      }
    } catch (error) {
      logger.error('Error initiating checkout:', error);
      return {
        success: false,
        paymentRequired: false,
        totalAmount: 0,
        message: error instanceof Error ? error.message : 'Checkout failed',
      };
    }
  }

  /**
   * Complete checkout after payment verification
   */
  async completeCheckout(orderId: string, paymentVerification: any): Promise<CheckoutResponse> {
    try {
      // Verify payment status
      if (paymentVerification.paymentStatus !== 'SUCCESS') {
        await this.updateOrderStatus(orderId, 'payment_failed');
        return {
          success: false,
          paymentRequired: true,
          totalAmount: 0,
          message: 'Payment verification failed',
        };
      }

      // Update order status
      await this.updateOrderStatus(orderId, 'confirmed', {
        paymentStatus: 'paid',
        cashfreeOrderId: paymentVerification.cfOrderId,
        paymentDetails: JSON.stringify(paymentVerification),
      });

      // Process order fulfillment
      await this.processOrderFulfillment(orderId);

      // Get order details
      const order = await this.getOrderById(orderId);
      
      if (!order) {
        throw new Error('Order not found after completion');
      }

      // Clear user's cart
      await cartService.clearCart(order.buyerId);

      return {
        success: true,
        orderId,
        paymentRequired: false,
        totalAmount: Number(order.totalAmount),
        message: 'Order completed successfully',
      };
    } catch (error) {
      logger.error('Error completing checkout:', error);
      return {
        success: false,
        paymentRequired: false,
        totalAmount: 0,
        message: error instanceof Error ? error.message : 'Failed to complete checkout',
      };
    }
  }

  /**
   * Get checkout status
   */
  async getCheckoutStatus(orderId: string): Promise<{
    status: string;
    paymentStatus: string;
    orderDetails: OrderSummary | null;
  }> {
    try {
      const order = await this.getOrderById(orderId);
      
      if (!order) {
        return {
          status: 'not_found',
          paymentStatus: 'unknown',
          orderDetails: null,
        };
      }

      const orderSummary = await this.getOrderSummary(orderId);

      return {
        status: order.status,
        paymentStatus: order.paymentStatus,
        orderDetails: orderSummary,
      };
    } catch (error) {
      logger.error('Error getting checkout status:', error);
      return {
        status: 'error',
        paymentStatus: 'unknown',
        orderDetails: null,
      };
    }
  }

  /**
   * Calculate shipping cost
   */
  private async calculateShipping(cartSummary: CartSummary, _shippingAddress: any): Promise<number> {
    try {
      // Simple shipping calculation - can be enhanced with real shipping APIs
      const baseShipping = 50; // Base shipping cost
      const weightBasedShipping = cartSummary.itemCount * 10; // Per item shipping
      
      // Free shipping for orders above ₹500
      if (cartSummary.subtotal >= 500) {
        return 0;
      }

      return Math.min(baseShipping + weightBasedShipping, 200); // Max ₹200 shipping
    } catch (error) {
      logger.error('Error calculating shipping:', error);
      return 50; // Default shipping cost
    }
  }

  /**
   * Create order in database
   */
  private async createOrder(orderData: {
    userId: string;
    cartSummary: CartSummary;
    shippingAmount: number;
    shippingAddress: any;
    billingAddress: any;
    couponCode?: string | undefined;
    customerNotes?: string | undefined;
  }): Promise<any> {
    try {
      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      
      // Group items by seller to create separate orders
      const itemsBySeller = orderData.cartSummary.items.reduce((acc, item) => {
        const sellerId = item.product.seller.id;
        if (!acc[sellerId]) {
          acc[sellerId] = [];
        }
        acc[sellerId].push(item);
        return acc;
      }, {} as Record<string, any[]>);

      // For now, create a single order (can be enhanced to support multi-seller orders)
      const firstSellerId = Object.keys(itemsBySeller)[0];
      if (!firstSellerId) {
        throw new Error('No seller found for cart items');
      }
      const orderItems = itemsBySeller[firstSellerId];

      const order = await prisma.order.create({
        data: {
          buyerId: orderData.userId,
          sellerId: firstSellerId,
          orderNumber,
          orderType: 'product',
          subtotal: orderData.cartSummary.subtotal,
          taxAmount: orderData.cartSummary.taxAmount,
          shippingAmount: orderData.shippingAmount,
          discountAmount: orderData.cartSummary.discountAmount,
          totalAmount: orderData.cartSummary.totalAmount + orderData.shippingAmount,
          status: 'pending',
          paymentStatus: 'pending',
          items: {
            create: orderItems?.map((item: any) => ({
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.unitPrice * item.quantity,
            })) || [],
          },
        },
        include: {
          items: true,
        },
      });

      // Store shipping and billing addresses (would need separate address table in production)
      logger.info('Order created:', { orderId: order.id, orderNumber });

      return order;
    } catch (error) {
      logger.error('Error creating order:', error);
      throw new Error('Failed to create order');
    }
  }

  /**
   * Create Cashfree payment order
   */
  private async createCashfreeOrder(orderData: {
    userId: string;
    orderId: string;
    amount: number;
    returnUrl?: string | undefined;
  }): Promise<CashfreeOrderResponse> {
    try {
      // Get user details
      const user = await prisma.user.findUnique({
        where: { id: orderData.userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const createOrderRequest: CreateOrderRequest = {
        userId: orderData.userId,
        amount: orderData.amount,
        currency: 'INR',
        customerDetails: {
          customerId: user.id,
          customerName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.businessName || 'Customer',
          customerEmail: user.email || undefined,
          customerPhone: user.phone || undefined,
        },
        orderMeta: {
          returnUrl: orderData.returnUrl || `${process.env['FRONTEND_URL'] || 'http://localhost:3000'}/checkout/success`,
          notifyUrl: `${process.env['BACKEND_URL'] || 'http://localhost:3001'}/api/payments/webhook`,
        },
      };

      const cashfreeOrder = await paymentService.createOrder(createOrderRequest);

      // Update order with Cashfree order ID
      await prisma.order.update({
        where: { id: orderData.orderId },
        data: {
          cashfreeOrderId: cashfreeOrder.cfOrderId,
        },
      });

      return cashfreeOrder;
    } catch (error) {
      logger.error('Error creating Cashfree order:', error);
      throw new Error('Failed to create payment order');
    }
  }

  /**
   * Process wallet payment
   */
  private async processWalletPayment(userId: string, orderId: string, amount: number): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      // Get user wallet
      const wallet = await prisma.wallet.findUnique({
        where: { userId },
      });

      if (!wallet) {
        return {
          success: false,
          message: 'Wallet not found',
        };
      }

      if (Number(wallet.availableBalance) < amount) {
        return {
          success: false,
          message: 'Insufficient wallet balance',
        };
      }

      // Process wallet payment in transaction
      await prisma.$transaction(async (tx) => {
        // Deduct from wallet
        await tx.wallet.update({
          where: { userId },
          data: {
            availableBalance: {
              decrement: amount,
            },
          },
        });

        // Create wallet transaction
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            transactionType: 'debit',
            amount: amount,
            balanceAfter: Number(wallet.availableBalance) - amount,
            referenceType: 'order',
            referenceId: orderId,
            description: `Payment for order ${orderId}`,
          },
        });

        // Update order payment status
        await tx.order.update({
          where: { id: orderId },
          data: {
            paymentStatus: 'paid',
            status: 'confirmed',
          },
        });
      });

      return {
        success: true,
        message: 'Wallet payment processed successfully',
      };
    } catch (error) {
      logger.error('Error processing wallet payment:', error);
      return {
        success: false,
        message: 'Failed to process wallet payment',
      };
    }
  }

  /**
   * Update order status
   */
  private async updateOrderStatus(orderId: string, status: string, additionalData?: any): Promise<void> {
    try {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status,
          ...additionalData,
        },
      });
    } catch (error) {
      logger.error('Error updating order status:', error);
      throw error;
    }
  }

  /**
   * Process order fulfillment
   */
  private async processOrderFulfillment(orderId: string): Promise<void> {
    try {
      // Get order with items
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            include: {
              product: true,
              variant: true,
            },
          },
        },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      // Update inventory for each item
      for (const item of order.items) {
        if (!item.product.isService) {
          if (item.variantId && item.variant) {
            // Update variant stock
            await prisma.productVariant.update({
              where: { id: item.variantId },
              data: {
                stockQuantity: {
                  decrement: item.quantity,
                },
              },
            });
          } else {
            // Update product stock
            await prisma.product.update({
              where: { id: item.productId },
              data: {
                stockQuantity: {
                  decrement: item.quantity,
                },
              },
            });
          }
        }
      }

      logger.info('Order fulfillment processed:', orderId);
    } catch (error) {
      logger.error('Error processing order fulfillment:', error);
      throw error;
    }
  }

  /**
   * Get order by ID
   */
  private async getOrderById(orderId: string): Promise<any> {
    try {
      return await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            include: {
              product: true,
              variant: true,
            },
          },
          buyer: true,
          seller: true,
        },
      });
    } catch (error) {
      logger.error('Error getting order by ID:', error);
      throw error;
    }
  }

  /**
   * Get order summary
   */
  private async getOrderSummary(orderId: string): Promise<OrderSummary | null> {
    try {
      const order = await this.getOrderById(orderId);
      
      if (!order) {
        return null;
      }

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        items: order.items.map((item: any) => ({
          productId: item.productId,
          productTitle: item.product.title,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.totalPrice),
          sellerId: order.sellerId,
          sellerName: order.seller.businessName || `${order.seller.firstName} ${order.seller.lastName}`,
        })),
        subtotal: Number(order.subtotal),
        discountAmount: Number(order.discountAmount),
        taxAmount: Number(order.taxAmount),
        shippingAmount: Number(order.shippingAmount),
        totalAmount: Number(order.totalAmount),
        paymentStatus: order.paymentStatus,
        orderStatus: order.status,
        shippingAddress: {}, // Would come from address table
        billingAddress: {}, // Would come from address table
        createdAt: order.createdAt,
      };
    } catch (error) {
      logger.error('Error getting order summary:', error);
      return null;
    }
  }
}

export const checkoutService = new CheckoutService();