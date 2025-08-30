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

export default router;// 
GET /api/orders/pending/stats - Get pending order statistics
router.get('/pending/stats', authenticate, async (req, res) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const [
      totalPending,
      urgentOrders,
      todayOrders,
      totalValue
    ] = await Promise.all([
      prisma.order.count({
        where: {
          sellerId: userId,
          status: 'pending'
        }
      }),
      prisma.order.count({
        where: {
          sellerId: userId,
          status: 'pending',
          // Assuming urgent orders are those older than 24 hours
          createdAt: {
            lte: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        }
      }),
      prisma.order.count({
        where: {
          sellerId: userId,
          status: 'pending',
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0))
          }
        }
      }),
      prisma.order.aggregate({
        where: {
          sellerId: userId,
          status: 'pending'
        },
        _sum: { totalAmount: true }
      })
    ]);

    const stats = {
      totalPending,
      urgentOrders,
      todayOrders,
      totalValue: Number(totalValue._sum.totalAmount || 0),
      averageOrderValue: totalPending > 0 ? Number(totalValue._sum.totalAmount || 0) / totalPending : 0
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get pending order stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pending order statistics'
    });
  }
});

// GET /api/orders/completed/stats - Get completed order statistics
router.get('/completed/stats', authenticate, async (req, res) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const [
      totalCompleted,
      thisMonthCompleted,
      totalRevenue,
      averageRating
    ] = await Promise.all([
      prisma.order.count({
        where: {
          sellerId: userId,
          status: { in: ['delivered', 'completed'] }
        }
      }),
      prisma.order.count({
        where: {
          sellerId: userId,
          status: { in: ['delivered', 'completed'] },
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          }
        }
      }),
      prisma.order.aggregate({
        where: {
          sellerId: userId,
          status: { in: ['delivered', 'completed'] }
        },
        _sum: { totalAmount: true }
      }),
      // Simplified rating calculation
      Promise.resolve(4.5)
    ]);

    const stats = {
      totalCompleted,
      thisMonthCompleted,
      totalRevenue: Number(totalRevenue._sum.totalAmount || 0),
      averageRating,
      averageOrderValue: totalCompleted > 0 ? Number(totalRevenue._sum.totalAmount || 0) / totalCompleted : 0
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get completed order stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch completed order statistics'
    });
  }
});

// GET /api/orders/ready-to-ship - Get orders ready for shipment
router.get('/ready-to-ship', authenticate, async (req, res) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const readyOrders = await prisma.order.findMany({
      where: {
        sellerId: userId,
        status: 'confirmed',
        // Orders that don't have shipments yet
        shipments: {
          none: {}
        }
      },
      include: {
        buyer: {
          select: {
            firstName: true,
            lastName: true,
            businessName: true,
            email: true
          }
        },
        items: {
          include: {
            product: {
              select: {
                title: true,
                media: {
                  take: 1,
                  select: { url: true }
                }
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'asc' },
      take: 50
    });

    const transformedOrders = readyOrders.map(order => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customer: {
        name: `${order.buyer.firstName || ''} ${order.buyer.lastName || ''}`.trim() || 
               order.buyer.businessName || 'Unknown',
        email: order.buyer.email
      },
      totalAmount: Number(order.totalAmount),
      itemCount: order.items.length,
      createdAt: order.createdAt,
      deliveryAddress: order.deliveryAddress,
      items: order.items.map(item => ({
        productName: item.product.title,
        quantity: item.quantity,
        image: item.product.media[0]?.url
      }))
    }));

    res.json({
      success: true,
      data: transformedOrders
    });
  } catch (error) {
    console.error('Get ready-to-ship orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch ready-to-ship orders'
    });
  }
});

export default router;/
/ Enhanced order processing with automated shipment creation
import { OrderFulfillmentService } from '../services/order-fulfillment.service';

const fulfillmentService = new OrderFulfillmentService(prisma);

/**
 * Process order and create shipment
 * POST /api/orders/:id/process
 */
router.post('/:id/process', authenticate, async (req, res) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const { id } = req.params;
    
    // Process order and create shipment
    const result = await fulfillmentService.processOrder(id, userId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PROCESSING_FAILED',
          message: result.error || 'Failed to process order'
        }
      });
    }

    res.json({
      success: true,
      data: result.shipment,
      message: 'Order processed and shipment created successfully'
    });
  } catch (error) {
    console.error('Process order error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to process order'
      }
    });
  }
});

/**
 * Update order status with automated workflows
 * PUT /api/orders/:id/status
 */
router.put('/:id/status', authenticate, async (req, res) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const { id } = req.params;
    const { status, notes } = req.body;

    // Verify order belongs to user (seller)
    const order = await prisma.order.findFirst({
      where: {
        id,
        sellerId: userId
      }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found or access denied'
        }
      });
    }

    // Update order status
    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        status,
        updatedAt: new Date()
      }
    });

    // Create status history
    await prisma.orderStatusHistory.create({
      data: {
        orderId: id,
        status,
        notes: notes || `Status updated to ${status}`,
        updatedBy: userId
      }
    });

    // Auto-process order if status is 'confirmed'
    if (status === 'confirmed') {
      // Trigger automated shipment creation in background
      fulfillmentService.processOrder(id, userId).then(result => {
        if (result.success) {
          console.log(`Automated shipment created for order ${id}`);
        } else {
          console.error(`Failed to create automated shipment for order ${id}:`, result.error);
        }
      }).catch(error => {
        console.error(`Error in automated shipment creation for order ${id}:`, error);
      });
    }

    res.json({
      success: true,
      data: updatedOrder,
      message: 'Order status updated successfully'
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update order status'
      }
    });
  }
});

/**
 * Bulk process multiple orders
 * POST /api/orders/bulk-process
 */
router.post('/bulk-process', authenticate, async (req, res) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const { orderIds } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Order IDs array is required'
        }
      });
    }

    const results = [];
    
    for (const orderId of orderIds) {
      try {
        const result = await fulfillmentService.processOrder(orderId, userId);
        results.push({
          orderId,
          success: result.success,
          shipment: result.shipment,
          error: result.error
        });
      } catch (error) {
        results.push({
          orderId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    res.json({
      success: true,
      data: {
        results,
        summary: {
          total: results.length,
          successful: successCount,
          failed: failureCount
        }
      },
      message: `Processed ${successCount} orders successfully, ${failureCount} failed`
    });
  } catch (error) {
    console.error('Bulk process orders error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to bulk process orders'
      }
    });
  }
});