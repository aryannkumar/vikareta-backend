import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { logisticsService } from '../services/logistics.service';
import { orderService } from '../services/order.service';
import { logger } from '../utils/logger';
import { validateRequest } from '../utils/validation';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createShipmentSchema = z.object({
  providerId: z.string().uuid('Invalid provider ID'),
  pickupAddress: z.object({
    name: z.string().min(1, 'Name is required'),
    phone: z.string().min(10, 'Valid phone number is required'),
    street: z.string().min(1, 'Street is required'),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(1, 'State is required'),
    postalCode: z.string().min(1, 'Postal code is required'),
    country: z.string().min(1, 'Country is required'),
    landmark: z.string().optional(),
  }),
  deliveryAddress: z.object({
    name: z.string().min(1, 'Name is required'),
    phone: z.string().min(10, 'Valid phone number is required'),
    street: z.string().min(1, 'Street is required'),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(1, 'State is required'),
    postalCode: z.string().min(1, 'Postal code is required'),
    country: z.string().min(1, 'Country is required'),
    landmark: z.string().optional(),
  }),
  packageDetails: z.object({
    weight: z.number().min(0.1, 'Weight must be at least 0.1 kg'),
    length: z.number().min(1, 'Length must be at least 1 cm'),
    width: z.number().min(1, 'Width must be at least 1 cm'),
    height: z.number().min(1, 'Height must be at least 1 cm'),
    contents: z.string().min(1, 'Contents description is required'),
    value: z.number().min(1, 'Package value is required'),
    fragile: z.boolean().optional(),
    hazardous: z.boolean().optional(),
  }),
  serviceType: z.enum(['standard', 'express', 'overnight']).optional(),
  insuranceRequired: z.boolean().optional(),
  codAmount: z.number().min(0).optional(),
  specialInstructions: z.string().optional(),
});

const rateCalculationSchema = z.object({
  fromPincode: z.string().min(6, 'Valid from pincode is required'),
  toPincode: z.string().min(6, 'Valid to pincode is required'),
  weight: z.number().min(0.1, 'Weight must be at least 0.1 kg'),
  dimensions: z.object({
    length: z.number().min(1),
    width: z.number().min(1),
    height: z.number().min(1),
  }),
  serviceType: z.string().optional(),
  codAmount: z.number().min(0).optional(),
});

const updateShipmentStatusSchema = z.object({
  status: z.string().min(1, 'Status is required'),
  location: z.string().optional(),
  description: z.string().optional(),
  deliveryProof: z.object({
    type: z.enum(['signature', 'photo', 'otp', 'biometric']),
    data: z.string().min(1, 'Proof data is required'),
    recipientName: z.string().optional(),
    recipientPhone: z.string().optional(),
    location: z.object({
      latitude: z.number(),
      longitude: z.number(),
    }).optional(),
  }).optional(),
});

const confirmDeliverySchema = z.object({
  type: z.enum(['signature', 'photo', 'otp', 'biometric']),
  data: z.string().min(1, 'Proof data is required'),
  recipientName: z.string().optional(),
  recipientPhone: z.string().optional(),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }).optional(),
});

/**
 * Get all active logistics providers
 * GET /api/logistics/providers
 */
router.get('/providers', authenticate, async (req: Request, res: Response) => {
  try {
    const providers = await logisticsService.getActiveProviders();

    return res.json({
      success: true,
      data: providers,
    });
  } catch (error) {
    logger.error('Error getting logistics providers:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get logistics providers',
    });
  }
});

/**
 * Calculate shipping rates
 * POST /api/logistics/rates
 */
router.post('/rates', authenticate, async (req: Request, res: Response) => {
  try {
    const validatedData = validateRequest(rateCalculationSchema, req.body);
    const rates = await logisticsService.calculateShippingRates(validatedData);

    return res.json({
      success: true,
      data: rates,
    });
  } catch (error) {
    logger.error('Error calculating shipping rates:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to calculate shipping rates',
    });
  }
});

/**
 * Create shipment for order
 * POST /api/logistics/orders/:orderId/shipment
 */
router.post('/orders/:orderId/shipment', authenticate, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const validatedData = validateRequest(createShipmentSchema, req.body);
    
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const result = await orderService.createShipment(orderId, validatedData, userId);

    if (result.success) {
      return res.status(201).json({
        success: true,
        data: {
          shipmentId: result.shipmentId,
          trackingNumber: result.trackingNumber,
          labelUrl: result.labelUrl,
          estimatedDelivery: result.estimatedDelivery,
          shippingCost: result.shippingCost,
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
    logger.error('Error creating shipment:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create shipment',
    });
  }
});

/**
 * Track shipment
 * GET /api/logistics/track/:trackingNumber
 */
router.get('/track/:trackingNumber', authenticate, async (req: Request, res: Response) => {
  try {
    const { trackingNumber } = req.params;

    const result = await logisticsService.trackShipment(trackingNumber);

    if (result.success) {
      return res.json({
        success: true,
        data: {
          trackingInfo: result.trackingInfo,
          currentStatus: result.currentStatus,
          estimatedDelivery: result.estimatedDelivery,
        },
        message: result.message,
      });
    } else {
      return res.status(404).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('Error tracking shipment:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to track shipment',
    });
  }
});

/**
 * Update shipment status
 * PUT /api/logistics/track/:trackingNumber/status
 */
router.put('/track/:trackingNumber/status', authenticate, async (req: Request, res: Response) => {
  try {
    const { trackingNumber } = req.params;
    const validatedData = validateRequest(updateShipmentStatusSchema, req.body);

    const result = await logisticsService.updateShipmentStatus(
      trackingNumber,
      validatedData.status,
      validatedData.location,
      validatedData.description,
      validatedData.deliveryProof ? {
        ...validatedData.deliveryProof,
        timestamp: new Date()
      } : undefined
    );

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
    logger.error('Error updating shipment status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update shipment status',
    });
  }
});

/**
 * Request return pickup
 * POST /api/logistics/orders/:orderId/return
 */
router.post('/orders/:orderId/return', authenticate, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { returnReason, pickupAddress } = req.body;
    const userId = req.authUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    if (!returnReason) {
      return res.status(400).json({
        success: false,
        error: 'Return reason is required',
      });
    }

    const result = await logisticsService.requestReturnPickup(orderId, returnReason, pickupAddress);

    if (result.success) {
      return res.status(201).json({
        success: true,
        data: {
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
    logger.error('Error requesting return pickup:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to request return pickup',
    });
  }
});

/**
 * Cancel shipment
 * POST /api/logistics/track/:trackingNumber/cancel
 */
router.post('/track/:trackingNumber/cancel', authenticate, async (req: Request, res: Response) => {
  try {
    const { trackingNumber } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Cancellation reason is required',
      });
    }

    const result = await logisticsService.cancelShipment(trackingNumber, reason);

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
 * Get delivery proof
 * GET /api/logistics/track/:trackingNumber/proof
 */
router.get('/track/:trackingNumber/proof', authenticate, async (req: Request, res: Response) => {
  try {
    const { trackingNumber } = req.params;

    const result = await logisticsService.getDeliveryProof(trackingNumber);

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
 * Confirm delivery with proof
 * POST /api/logistics/orders/:orderId/confirm-delivery
 */
router.post('/orders/:orderId/confirm-delivery', authenticate, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const validatedData = validateRequest(confirmDeliverySchema, req.body);
    
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const result = await orderService.confirmDelivery(orderId, validatedData, userId);

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
 * Get delivery proof for order
 * GET /api/logistics/orders/:orderId/delivery-proof
 */
router.get('/orders/:orderId/delivery-proof', authenticate, async (req: Request, res: Response) => {
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
 * GET /api/logistics/orders/:orderId/rates
 */
router.get('/orders/:orderId/rates', authenticate, async (req: Request, res: Response) => {
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

export default router;