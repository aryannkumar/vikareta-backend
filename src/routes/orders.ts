/**
 * Order Routes
 * API endpoints for the comprehensive order management system
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { OrderService } from '../services/OrderService';
import { authenticate } from '../middleware/auth';
import {
  OrderCreateRequest,
  OrderFilters,
  OrderUpdateRequest,
  ServiceOrderUpdateRequest,
  ServiceBookingRequest,
  OrderError,
  ServiceBookingError,
  OrderStatus,
  OrderType
} from '../types/orders';

const router = Router();
const prisma = new PrismaClient();
const orderService = new OrderService(prisma);

/**
 * Create a new order
 * POST /api/orders
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const orderData: OrderCreateRequest = req.body;
    const order = await orderService.createOrder(userId, orderData);

    res.status(201).json({
      success: true,
      data: order,
      message: 'Order created successfully'
    });
  } catch (error) {
    console.error('Create order error:', error);

    if (error instanceof OrderError) {
      return res.status(error.statusCode).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create order'
      }
    });
  }
});

/**
 * Get order by ID
 * GET /api/orders/:id
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.authUser?.userId;

    const order = await orderService.getOrderById(id);

    // Check if user has access to this order
    if (order.buyerId !== userId && order.sellerId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCESS_DENIED',
          message: 'You do not have access to this order'
        }
      });
    }

    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('Get order error:', error);

    if (error instanceof OrderError) {
      return res.status(error.statusCode).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve order'
      }
    });
  }
});

/**
 * Get orders with filters and pagination
 * GET /api/orders
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.authUser?.userId;
    const {
      orderType,
      status,
      paymentStatus,
      role = 'buyer', // 'buyer' or 'seller'
      dateFrom,
      dateTo,
      minAmount,
      maxAmount,
      search,
      page = 1,
      limit = 20
    } = req.query;

    const filters: OrderFilters = {
      orderType: orderType as any,
      status: status as any,
      paymentStatus: paymentStatus as any,
      dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
      dateTo: dateTo ? new Date(dateTo as string) : undefined,
      minAmount: minAmount ? parseFloat(minAmount as string) : undefined,
      maxAmount: maxAmount ? parseFloat(maxAmount as string) : undefined,
      search: search as string,
    };

    // Set buyer or seller filter based on role
    if (role === 'buyer') {
      filters.buyerId = userId;
    } else if (role === 'seller') {
      filters.sellerId = userId;
    }

    const result = await orderService.getOrders(
      filters,
      parseInt(page as string),
      parseInt(limit as string)
    );

    // Ensure all numeric fields in orders are properly formatted
    const formattedOrders = result.orders.map(order => ({
      ...order,
      totalAmount: Number(order.totalAmount || 0),
      shippingAmount: Number(order.shippingAmount || 0),
      taxAmount: Number(order.taxAmount || 0),
      discountAmount: Number(order.discountAmount || 0),
      subtotal: Number(order.subtotal || 0),
      // Ensure any other numeric fields are properly formatted
      items: order.items?.map(item => ({
        ...item,
        unitPrice: Number(item.unitPrice || 0),
        quantity: Number(item.quantity || 0),
        totalPrice: Number(item.totalPrice || 0)
      })) || []
    }));

    res.json({
      success: true,
      data: formattedOrders,
      pagination: result.pagination,
      filters: result.filters
    });
  } catch (error) {
    console.error('Get orders error:', error);

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve orders'
      }
    });
  }
});

/**
 * Get completed orders
 * GET /api/orders/completed
 */
router.get('/completed', authenticate, async (req, res) => {
  try {
    const userId = req.authUser?.userId;
    const {
      role = 'buyer',
      page = 1,
      limit = 20
    } = req.query;

    const filters: OrderFilters = {
      status: OrderStatus.DELIVERED, // Use 'delivered' as the completed status for product orders
    };

    // Set buyer or seller filter based on role
    if (role === 'buyer') {
      filters.buyerId = userId;
    } else if (role === 'seller') {
      filters.sellerId = userId;
    }

    const result = await orderService.getOrders(
      filters,
      parseInt(page as string),
      parseInt(limit as string)
    );

    res.json({
      success: true,
      data: result.orders,
      pagination: result.pagination,
      message: 'Completed orders retrieved successfully'
    });
  } catch (error) {
    console.error('Get completed orders error:', error);

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve completed orders'
      }
    });
  }
});

/**
 * Update order
 * PUT /api/orders/:id
 */
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.authUser?.userId;
    const updateData: OrderUpdateRequest = req.body;

    // Get order to check permissions
    const existingOrder = await orderService.getOrderById(id);

    // Only seller can update order status
    if (existingOrder.sellerId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCESS_DENIED',
          message: 'Only the seller can update order status'
        }
      });
    }

    const order = await orderService.updateOrder(id, updateData, userId);

    res.json({
      success: true,
      data: order,
      message: 'Order updated successfully'
    });
  } catch (error) {
    console.error('Update order error:', error);

    if (error instanceof OrderError) {
      return res.status(error.statusCode).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update order'
      }
    });
  }
});

/**
 * Update service order
 * PUT /api/orders/service/:serviceOrderId
 */
router.put('/service/:serviceOrderId', authenticate, async (req, res) => {
  try {
    const { serviceOrderId } = req.params;
    const updateData: ServiceOrderUpdateRequest = req.body;

    await orderService.updateServiceOrder(serviceOrderId, updateData);

    res.json({
      success: true,
      message: 'Service order updated successfully'
    });
  } catch (error) {
    console.error('Update service order error:', error);

    if (error instanceof ServiceBookingError) {
      return res.status(error.statusCode).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update service order'
      }
    });
  }
});

/**
 * Book a service
 * POST /api/orders/book-service
 */
router.post('/book-service', authenticate, async (req, res) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const bookingData: ServiceBookingRequest = req.body;
    const booking = await orderService.bookService(userId, bookingData);

    res.status(201).json({
      success: true,
      data: booking,
      message: 'Service booked successfully'
    });
  } catch (error) {
    console.error('Book service error:', error);

    if (error instanceof ServiceBookingError) {
      return res.status(error.statusCode).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to book service'
      }
    });
  }
});

/**
 * Get order statistics
 * GET /api/orders/stats
 */
router.get('/stats', authenticate, async (req, res) => {
  try {
    const userId = req.authUser?.userId;
    const { role = 'seller', dateFrom, dateTo } = req.query;

    const sellerId = role === 'seller' ? userId : undefined;
    const stats = await orderService.getOrderStats(
      sellerId,
      dateFrom ? new Date(dateFrom as string) : undefined,
      dateTo ? new Date(dateTo as string) : undefined
    );

    // Ensure all numeric values are properly formatted and not null/undefined
    const formattedStats = {
      totalRevenue: Number(stats.totalRevenue || 0),
      totalOrders: Number(stats.totalOrders || 0),
      averageOrderValue: Number(stats.averageOrderValue || 0),
      // Extract status counts from ordersByStatus using enum values
      pendingOrders: Number(stats.ordersByStatus?.[OrderStatus.PENDING] || 0),
      completedOrders: Number(stats.ordersByStatus?.[OrderStatus.DELIVERED] || 0),
      cancelledOrders: Number(stats.ordersByStatus?.[OrderStatus.CANCELLED] || 0),
      // Include order type counts using enum values
      productOrders: Number(stats.ordersByType?.[OrderType.PRODUCT] || 0),
      serviceOrders: Number(stats.ordersByType?.[OrderType.SERVICE] || 0),
      // Format top products and services with proper numeric values
      topProducts: (stats.topProducts || []).map(product => ({
        ...product,
        orderCount: Number(product.orderCount || 0),
        revenue: Number(product.revenue || 0)
      })),
      topServices: (stats.topServices || []).map(service => ({
        ...service,
        orderCount: Number(service.orderCount || 0),
        revenue: Number(service.revenue || 0)
      })),
      // Include the original ordersByStatus and ordersByType for completeness
      ordersByStatus: stats.ordersByStatus || {},
      ordersByType: stats.ordersByType || {}
    };

    res.json({
      success: true,
      data: formattedStats
    });
  } catch (error) {
    console.error('Get order stats error:', error);

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve order statistics'
      }
    });
  }
});

/**
 * Get order statistics overview (detailed)
 * GET /api/orders/stats/overview
 */
router.get('/stats/overview', authenticate, async (req, res) => {
  try {
    const userId = req.authUser?.userId;
    const { role = 'seller', dateFrom, dateTo } = req.query;

    const sellerId = role === 'seller' ? userId : undefined;
    const stats = await orderService.getOrderStats(
      sellerId,
      dateFrom ? new Date(dateFrom as string) : undefined,
      dateTo ? new Date(dateTo as string) : undefined
    );

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get order stats error:', error);

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve order statistics'
      }
    });
  }
});

/**
 * Cancel order
 * POST /api/orders/:id/cancel
 */
router.post('/:id/cancel', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.authUser?.userId;
    const { reason } = req.body;

    // Get order to check permissions
    const existingOrder = await orderService.getOrderById(id);

    // Only buyer can cancel order (within certain conditions)
    if (existingOrder.buyerId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCESS_DENIED',
          message: 'Only the buyer can cancel the order'
        }
      });
    }

    // Check if order can be cancelled
    if (!['pending', 'confirmed'].includes(existingOrder.status)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CANNOT_CANCEL',
          message: 'Order cannot be cancelled in current status'
        }
      });
    }

    const order = await orderService.updateOrder(id, {
      status: 'CANCELLED' as any,
      notes: reason
    }, userId);

    res.json({
      success: true,
      data: order,
      message: 'Order cancelled successfully'
    });
  } catch (error) {
    console.error('Cancel order error:', error);

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to cancel order'
      }
    });
  }
});

/**
 * Get order by order number
 * GET /api/orders/number/:orderNumber
 */
router.get('/number/:orderNumber', authenticate, async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const userId = req.authUser?.userId;

    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: {
        buyer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
            email: true,
            phone: true,
          },
        },
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
            email: true,
            phone: true,
          },
        },
        items: {
          include: {
            product: {
              include: { media: true },
            },
            variant: true,
          },
        },
        // serviceOrders: {
        //   include: {
        //     service: {
        //       include: {
        //         media: true,
        //         provider: {
        //           select: {
        //             id: true,
        //             firstName: true,
        //             lastName: true,
        //             businessName: true,
        //           },
        //         },
        //       },
        //     },
        //   },
        // },
        payments: true,
        statusHistory: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found'
        }
      });
    }

    // Check if user has access to this order
    if (order.buyerId !== userId && order.sellerId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCESS_DENIED',
          message: 'You do not have access to this order'
        }
      });
    }

    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('Get order by number error:', error);

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve order'
      }
    });
  }
});

export default router;