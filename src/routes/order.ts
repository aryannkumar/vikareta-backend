import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { orderService } from '../services/order.service';
import { logger } from '../utils/logger';
import { validateRequest } from '../utils/validation';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createOrderFromCartSchema = z.object({
  couponCode: z.string().optional(),
  shippingAddress: z.object({
    street: z.string().min(1, 'Street is required'),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(1, 'State is required'),
    postalCode: z.string().min(1, 'Postal code is required'),
    country: z.string().min(1, 'Country is required'),
  }),
  billingAddress: z.object({
    street: z.string().min(1, 'Street is required'),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(1, 'State is required'),
    postalCode: z.string().min(1, 'Postal code is required'),
    country: z.string().min(1, 'Country is required'),
  }).optional(),
  paymentMethod: z.enum(['cashfree', 'wallet']),
  returnUrl: z.string().url().optional(),
  customerNotes: z.string().optional(),
});

const createOrderFromQuoteSchema = z.object({
  quoteId: z.string().uuid('Invalid quote ID'),
  shippingAddress: z.object({
    street: z.string().min(1, 'Street is required'),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(1, 'State is required'),
    postalCode: z.string().min(1, 'Postal code is required'),
    country: z.string().min(1, 'Country is required'),
  }),
  billingAddress: z.object({
    street: z.string().min(1, 'Street is required'),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(1, 'State is required'),
    postalCode: z.string().min(1, 'Postal code is required'),
    country: z.string().min(1, 'Country is required'),
  }).optional(),
  paymentMethod: z.enum(['cashfree', 'wallet']),
  returnUrl: z.string().url().optional(),
  customerNotes: z.string().optional(),
});

const updateOrderStatusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned']),
  paymentStatus: z.enum(['pending', 'paid', 'failed', 'refunded']).optional(),
  trackingNumber: z.string().optional(),
  notes: z.string().optional(),
});

const getOrdersQuerySchema = z.object({
  role: z.enum(['buyer', 'seller']).optional(),
  status: z.string().optional(),
  limit: z.string().transform(val => parseInt(val) || 20).optional(),
  offset: z.string().transform(val => parseInt(val) || 0).optional(),
});

const serviceScheduleSchema = z.object({
  serviceType: z.enum(['on_site', 'remote', 'pickup_delivery', 'consultation']),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
  durationMinutes: z.number().min(15).max(480).optional(),
  location: z.string().optional(),
  serviceAddress: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    postalCode: z.string().min(1),
    country: z.string().min(1),
  }).optional(),
  contactPerson: z.string().optional(),
  contactPhone: z.string().optional(),
  specialInstructions: z.string().optional(),
});

const serviceProgressSchema = z.object({
  status: z.enum(['scheduled', 'in_progress', 'on_hold', 'completed', 'cancelled']),
  progressNotes: z.string().optional(),
  completionPercentage: z.number().min(0).max(100).optional(),
  nextSteps: z.string().optional(),
  estimatedCompletion: z.string().datetime().optional(),
});

const serviceCompletionSchema = z.object({
  completionNotes: z.string().optional(),
  completedAt: z.string().datetime().optional(),
});

const serviceReviewSchema = z.object({
  rating: z.number().min(1).max(5),
  review: z.string().optional(),
  serviceQuality: z.number().min(1).max(5),
  timeliness: z.number().min(1).max(5),
  professionalism: z.number().min(1).max(5),
});

const shippingDetailsSchema = z.object({
  shippingProvider: z.string().optional(),
  trackingNumber: z.string().min(1, 'Tracking number is required'),
  shippingNotes: z.string().optional(),
  estimatedDelivery: z.string().datetime().optional(),
});

const serviceReadySchema = z.object({
  serviceNotes: z.string().optional(),
});

const trackingUpdateSchema = z.object({
  trackingNumber: z.string().min(1),
  status: z.enum(['shipped', 'in_transit', 'out_for_delivery', 'delivered', 'returned', 'cancelled']),
  location: z.string().optional(),
  notes: z.string().optional(),
  estimatedDelivery: z.string().datetime().optional(),
});

const returnRequestSchema = z.object({
  reason: z.string().min(1),
  returnType: z.enum(['refund', 'exchange']),
  items: z.array(z.object({
    orderItemId: z.string().uuid(),
    quantity: z.number().min(1),
    reason: z.string().min(1),
  })).optional(),
  pickupAddress: z.object({
    name: z.string().min(1),
    phone: z.string().min(10),
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    postalCode: z.string().min(1),
    country: z.string().min(1),
  }).optional(),
});

const cancellationSchema = z.object({
  reason: z.string().min(1),
  cancellationType: z.enum(['full', 'partial']),
  items: z.array(z.object({
    orderItemId: z.string().uuid(),
    quantity: z.number().min(1),
  })).optional(),
});

/**
 * Create order from shopping cart
 * POST /api/orders/from-cart
 */
router.post('/from-cart', authenticate, async (req: Request, res: Response) => {
  try {
    const validatedData = validateRequest(createOrderFromCartSchema, req.body);
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const request = {
      userId,
      ...validatedData,
    };

    const result = await orderService.createOrderFromCart(request);

    if (result.success) {
      return res.status(201).json({
        success: true,
        data: {
          orderId: result.orderId,
          orderNumber: result.orderNumber,
          cashfreeOrder: (result as any).cashfreeOrder,
          paymentRequired: result.paymentRequired,
          totalAmount: (result as any).totalAmount,
        },
        message: result.message,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('Error creating order from cart:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create order',
    });
  }
});

/**
 * Create order from accepted quote
 * POST /api/orders/from-quote
 */
router.post('/from-quote', authenticate, async (req: Request, res: Response) => {
  try {
    const validatedData = validateRequest(createOrderFromQuoteSchema, req.body);

    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const request = {
      userId,
      ...validatedData,
    };

    const result = await orderService.createOrderFromQuote(request);

    if (result.success) {
      return res.status(201).json({
        success: true,
        data: {
          orderId: result.orderId,
          orderNumber: result.orderNumber,
          cashfreeOrder: (result as any).cashfreeOrder,
          paymentRequired: result.paymentRequired,
          totalAmount: (result as any).totalAmount,
        },
        message: result.message,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('Error creating order from quote:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create order',
    });
  }
});

/**
 * Get order by ID
 * GET /api/orders/:orderId
 */
router.get('/:orderId', authenticate, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const userId = req.authUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const order = await orderService.getOrderById(orderId, userId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    return res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    logger.error('Error getting order:', error);
    
    if (error instanceof Error && error.message === 'Unauthorized to view this order') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to view this order',
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to get order',
    });
  }
});

/**
 * Get user orders (as buyer or seller)
 * GET /api/orders
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const queryValidation = validateRequest(getOrdersQuerySchema, req.query);
    if (!true) {
      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        details: [],
      });
    }

    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const orders = await orderService.getUserOrders(userId, queryValidation);

    return res.json({
      success: true,
      data: orders,
      pagination: {
        limit: queryValidation.limit || 20,
        offset: queryValidation.offset || 0,
        total: orders.length,
      },
    });
  } catch (error) {
    logger.error('Error getting user orders:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get orders',
    });
  }
});

/**
 * Get my orders (user's orders as buyer)
 * GET /api/orders/my
 */
router.get('/my', authenticate, async (req: Request, res: Response) => {
  try {
  const queryValidation = validateRequest(getOrdersQuerySchema, req.query);
    
  const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

  // Log the incoming query for diagnostics
  logger.info('Get my orders request', { userId, query: queryValidation, route: '/api/orders/my' });

    // Force role to buyer for /my endpoint
    const queryWithBuyerRole = { ...queryValidation, role: 'buyer' as const };

    try {
      const orders = await orderService.getUserOrders(userId, queryWithBuyerRole);

      return res.json({
        success: true,
        data: {
          orders: orders,
          total: orders.length,
          page: Math.floor((queryValidation.offset || 0) / (queryValidation.limit || 20)) + 1,
          totalPages: Math.ceil(orders.length / (queryValidation.limit || 20)),
        },
      });
    } catch (err: any) {
      // Log detailed error and return an empty-but-successful response to avoid breaking frontend
      logger.error('Failed to fetch user orders (fallback):', { userId, query: queryValidation, message: err?.message, stack: err?.stack });

      return res.json({
        success: true,
        data: {
          orders: [],
          total: 0,
          page: Math.floor((queryValidation.offset || 0) / (queryValidation.limit || 20)) + 1,
          totalPages: 0,
        },
        message: 'Could not fetch orders at this time',
      });
    }
  } catch (error) {
    logger.error('Error getting my orders:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get orders',
    });
  }
});

/**
 * Update order status
 * PUT /api/orders/:orderId/status
 */
router.put('/:orderId/status', authenticate, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const validatedData = validateRequest(updateOrderStatusSchema, req.body);

    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const update = validatedData;
    const updatedOrder = await orderService.updateOrderStatus(orderId, update, userId);

    return res.json({
      success: true,
      data: updatedOrder,
      message: 'Order status updated successfully',
    });
  } catch (error) {
    logger.error('Error updating order status:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Order not found') {
        return res.status(404).json({
          success: false,
          error: 'Order not found',
        });
      }
      
      if (error.message === 'Unauthorized to update this order') {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized to update this order',
        });
      }
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to update order status',
    });
  }
});

/**
 * Cancel order
 * POST /api/orders/:orderId/cancel
 */
router.post('/:orderId/cancel', authenticate, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const userId = req.authUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const update = {
      status: 'cancelled',
      notes: reason || 'Order cancelled by user',
    };

    const updatedOrder = await orderService.updateOrderStatus(orderId, update, userId);

    return res.json({
      success: true,
      data: updatedOrder,
      message: 'Order cancelled successfully',
    });
  } catch (error) {
    logger.error('Error cancelling order:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Order not found') {
        return res.status(404).json({
          success: false,
          error: 'Order not found',
        });
      }
      
      if (error.message === 'Unauthorized to update this order') {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized to cancel this order',
        });
      }
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to cancel order',
    });
  }
});

/**
 * Get order statistics for user
 * GET /api/orders/stats
 */
router.get('/stats', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    // Get orders as buyer and seller
    const [buyerOrders, sellerOrders] = await Promise.all([
      orderService.getUserOrders(userId, { role: 'buyer' }),
      orderService.getUserOrders(userId, { role: 'seller' }),
    ]);

    // Calculate statistics
    const buyerStats = {
      total: buyerOrders.length,
      pending: buyerOrders.filter(o => o.status === 'pending').length,
      confirmed: buyerOrders.filter(o => o.status === 'confirmed').length,
      processing: buyerOrders.filter(o => o.status === 'processing').length,
      shipped: buyerOrders.filter(o => o.status === 'shipped').length,
      delivered: buyerOrders.filter(o => o.status === 'delivered').length,
      cancelled: buyerOrders.filter(o => o.status === 'cancelled').length,
      totalAmount: buyerOrders.reduce((sum, o) => sum + o.totalAmount, 0),
    };

    const sellerStats = {
      total: sellerOrders.length,
      pending: sellerOrders.filter(o => o.status === 'pending').length,
      confirmed: sellerOrders.filter(o => o.status === 'confirmed').length,
      processing: sellerOrders.filter(o => o.status === 'processing').length,
      shipped: sellerOrders.filter(o => o.status === 'shipped').length,
      delivered: sellerOrders.filter(o => o.status === 'delivered').length,
      cancelled: sellerOrders.filter(o => o.status === 'cancelled').length,
      totalAmount: sellerOrders.reduce((sum, o) => sum + o.totalAmount, 0),
    };

    return res.json({
      success: true,
      data: {
        buyer: buyerStats,
        seller: sellerStats,
      },
    });
  } catch (error) {
    logger.error('Error getting order statistics:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get order statistics',
    });
  }
});

/**
 * Schedule service for service orders
 * POST /api/orders/:orderId/service/schedule
 */
router.post('/:orderId/service/schedule', authenticate, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const validatedData = validateRequest(serviceScheduleSchema, req.body);

    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const request = {
      orderId,
      ...validatedData,
    };

    const result = await orderService.scheduleService(request, userId);

    if (result.success) {
      return res.status(201).json({
        success: true,
        data: {
          scheduleId: result.scheduleId,
        },
        message: result.message,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('Error scheduling service:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to schedule service',
    });
  }
});

/**
 * Update service progress
 * PUT /api/orders/:orderId/service/progress
 */
router.put('/:orderId/service/progress', authenticate, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const validatedData = validateRequest(serviceProgressSchema, req.body);

    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const request = {
      orderId,
      ...validatedData,
      estimatedCompletion: validatedData.estimatedCompletion ? new Date(validatedData.estimatedCompletion) : undefined,
    };

    const result = await orderService.updateServiceProgress(request, userId);

    if (result.success) {
      return res.json({
        success: true,
        message: result.message,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('Error updating service progress:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update service progress',
    });
  }
});

/**
 * Get service details
 * GET /api/orders/:orderId/service/details
 */
router.get('/:orderId/service/details', authenticate, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const userId = req.authUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const result = await orderService.getServiceDetails(orderId, userId);

    if (result.success) {
      return res.json({
        success: true,
        data: result.serviceDetails,
        message: result.message,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('Error getting service details:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get service details',
    });
  }
});

/**
 * Get service appointments for order
 * GET /api/orders/:orderId/service/appointments
 */
router.get('/:orderId/service/appointments', authenticate, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const userId = req.authUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const appointments = await orderService.getServiceAppointments(orderId, userId);

    return res.json({
      success: true,
      data: appointments,
    });
  } catch (error) {
    logger.error('Error getting service appointments:', error);
    
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to view appointments for this order',
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to get service appointments',
    });
  }
});

/**
 * Update service appointment status
 * PUT /api/orders/service/appointments/:appointmentId/status
 */
router.put('/service/appointments/:appointmentId/status', authenticate, async (req: Request, res: Response) => {
  try {
    const { appointmentId } = req.params;
    const { status } = req.body;
    const userId = req.authUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required',
      });
    }

    const result = await orderService.updateServiceAppointmentStatus(appointmentId, status, userId);

    if (result.success) {
      return res.json({
        success: true,
        message: result.message,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('Error updating service appointment status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update appointment status',
    });
  }
});

/**
 * Complete service delivery
 * POST /api/orders/service/appointments/:appointmentId/complete
 */
router.post('/service/appointments/:appointmentId/complete', authenticate, async (req: Request, res: Response) => {
  try {
    const { appointmentId } = req.params;
    const validatedData = validateRequest(serviceCompletionSchema, req.body);

    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const request = {
      appointmentId,
      completionNotes: validatedData.completionNotes,
      completedAt: validatedData.completedAt ? new Date(validatedData.completedAt) : undefined,
    };

    const result = await orderService.completeServiceDelivery(request, userId);

    if (result.success) {
      return res.json({
        success: true,
        message: result.message,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('Error completing service delivery:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to complete service delivery',
    });
  }
});

/**
 * Verify service completion (buyer confirmation)
 * POST /api/orders/:orderId/service/verify
 */
router.post('/:orderId/service/verify', authenticate, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { verified } = req.body;
    const userId = req.authUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    if (typeof verified !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'Verified field must be a boolean',
      });
    }

    const result = await orderService.verifyServiceCompletion(orderId, verified, userId);

    if (result.success) {
      return res.json({
        success: true,
        message: result.message,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('Error verifying service completion:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to verify service completion',
    });
  }
});

/**
 * Submit service review and rating
 * POST /api/orders/:orderId/service/review
 */
router.post('/:orderId/service/review', authenticate, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const validatedData = validateRequest(serviceReviewSchema, req.body);

    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const request = {
      orderId,
      ...validatedData,
    };

    const result = await orderService.submitServiceReview(request, userId);

    if (result.success) {
      return res.status(201).json({
        success: true,
        data: {
          reviewId: result.reviewId,
        },
        message: result.message,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('Error submitting service review:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to submit service review',
    });
  }
});

/**
 * Add shipping details for product orders
 * POST /api/orders/:orderId/shipping/details
 */
router.post('/:orderId/shipping/details', authenticate, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const validatedData = validateRequest(shippingDetailsSchema, req.body);

    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const request = {
      orderId,
      ...validatedData,
      estimatedDelivery: validatedData.estimatedDelivery ? new Date(validatedData.estimatedDelivery) : undefined,
    };

    const result = await orderService.addShippingDetails(request, userId);

    if (result.success) {
      return res.status(201).json({
        success: true,
        message: result.message,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('Error adding shipping details:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to add shipping details',
    });
  }
});

/**
 * Update tracking status
 * PUT /api/orders/:orderId/tracking
 */
router.put('/:orderId/tracking', authenticate, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const validatedData = validateRequest(trackingUpdateSchema, req.body);

    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const request = {
      orderId,
      ...validatedData,
      estimatedDelivery: validatedData.estimatedDelivery ? new Date(validatedData.estimatedDelivery) : undefined,
    };

    const result = await orderService.updateTrackingStatus(request, userId);

    if (result.success) {
      return res.json({
        success: true,
        message: result.message,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('Error updating tracking status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update tracking status',
    });
  }
});

/**
 * Get order tracking information
 * GET /api/orders/:orderId/tracking
 */
router.get('/:orderId/tracking', authenticate, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const userId = req.authUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const result = await orderService.getOrderTracking(orderId, userId);

    if (result.success) {
      return res.json({
        success: true,
        data: result.tracking,
        message: result.message,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('Error getting order tracking:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get tracking information',
    });
  }
});

/**
 * Request order return
 * POST /api/orders/:orderId/return
 */
router.post('/:orderId/return', authenticate, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const validatedData = validateRequest(returnRequestSchema, req.body);

    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const request = {
      orderId,
      ...validatedData,
    };

    const result = await orderService.processReturnRequest(request, userId);

    if (result.success) {
      return res.status(201).json({
        success: true,
        data: {
          returnId: result.returnId,
          returnTrackingNumber: result.returnTrackingNumber,
          pickupDate: result.pickupDate,
        },
        message: result.message,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('Error processing return request:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process return request',
    });
  }
});

/**
 * Cancel order with enhanced cancellation workflow
 * POST /api/orders/:orderId/cancel-enhanced
 */
router.post('/:orderId/cancel-enhanced', authenticate, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const validatedData = validateRequest(cancellationSchema, req.body);

    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const request = {
      orderId,
      ...validatedData,
    };

    const result = await orderService.cancelOrder(request, userId);

    if (result.success) {
      return res.json({
        success: true,
        data: {
          refundAmount: result.refundAmount,
        },
        message: result.message,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('Error cancelling order:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to cancel order',
    });
  }
});

/**
 * Cancel shipment for order
 * POST /api/orders/:orderId/cancel-shipment
 */
router.post('/:orderId/cancel-shipment', authenticate, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const userId = req.authUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Cancellation reason is required',
      });
    }

    const result = await orderService.cancelShipment(orderId, reason, userId);

    if (result.success) {
      return res.json({
        success: true,
        data: {
          refundAmount: result.refundAmount,
        },
        message: result.message,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('Error cancelling shipment:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to cancel shipment',
    });
  }
});

/**
 * Confirm delivery with proof
 * POST /api/orders/:orderId/confirm-delivery
 */
router.post('/:orderId/confirm-delivery', authenticate, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { type, data, recipientName, recipientPhone, location } = req.body;
    const userId = req.authUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    if (!type || !data) {
      return res.status(400).json({
        success: false,
        error: 'Delivery proof type and data are required',
      });
    }

    const deliveryProof = {
      type,
      data,
      recipientName,
      recipientPhone,
      location,
    };

    const result = await orderService.confirmDelivery(orderId, deliveryProof, userId);

    if (result.success) {
      return res.json({
        success: true,
        message: result.message,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('Error confirming delivery:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to confirm delivery',
    });
  }
});

/**
 * Get delivery proof
 * GET /api/orders/:orderId/delivery-proof
 */
router.get('/:orderId/delivery-proof', authenticate, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const userId = req.authUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const result = await orderService.getDeliveryProof(orderId, userId);

    if (result.success) {
      return res.json({
        success: true,
        data: result.deliveryProof,
        message: result.message,
      });
    } else {
      return res.status(404).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('Error getting delivery proof:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get delivery proof',
    });
  }
});

/**
 * Get shipping rates for order
 * GET /api/orders/:orderId/shipping-rates
 */
router.get('/:orderId/shipping-rates', authenticate, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const userId = req.authUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const result = await orderService.getShippingRates(orderId, userId);

    if (result.success) {
      return res.json({
        success: true,
        data: result.rates,
        message: result.message,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('Error getting shipping rates:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get shipping rates',
    });
  }
});

/**
 * Cancel order
 * POST /api/orders/:orderId/cancel
 */
router.post('/:orderId/cancel', authenticate, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const validatedData = validateRequest(cancellationSchema, req.body);

    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const request = {
      orderId,
      ...validatedData,
    };

    const result = await orderService.cancelOrder(request, userId);

    if (result.success) {
      return res.json({
        success: true,
        data: {
          refundAmount: result.refundAmount,
        },
        message: result.message,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('Error cancelling order:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to cancel order',
    });
  }
});

export default router;