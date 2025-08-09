import express from 'express';
import { logger } from '../utils/logger';
import { FeaturedServiceService } from '../services/featuredServiceService';

const router = express.Router();

// Promotion pricing configuration
const PROMOTION_PRICING = {
  standard: { price: 1499, duration: 7 },
  premium: { price: 3999, duration: 30 },
  creative: { price: 2499, duration: 14 }
};

// GET /api/featured-services/services - Get all featured services
router.get('/services', async (req, res) => {
  try {
    const { limit, category, minPrice, maxPrice, serviceType } = req.query;
    
    const filters = {
      limit: limit ? parseInt(limit as string) : undefined,
      category: category as string,
      minPrice: minPrice ? parseInt(minPrice as string) : undefined,
      maxPrice: maxPrice ? parseInt(maxPrice as string) : undefined,
      serviceType: serviceType as string,
    };

    const result = await FeaturedServiceService.getFeaturedServices(filters);

    logger.info(`Fetched ${result.services.length} featured services`);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error fetching featured services:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch featured services'
      }
    });
  }
});

// GET /api/featured-services/services/:id - Get specific featured service
router.get('/services/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const service = await FeaturedServiceService.getFeaturedService(id);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SERVICE_NOT_FOUND',
          message: 'Featured service not found or expired'
        }
      });
    }

    // Track view
    const ipAddress = req.ip || req.connection.remoteAddress;
    await FeaturedServiceService.trackEvent(id, 'view', undefined, ipAddress);

    logger.info(`Fetched featured service: ${id}`);

    res.json({
      success: true,
      data: service
    });
  } catch (error) {
    logger.error('Error fetching featured service:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch featured service'
      }
    });
  }
});

// POST /api/featured-services/services - Create/promote a service as featured (for dashboard)
router.post('/services', async (req, res) => {
  try {
    const {
      serviceId,
      promotionType = 'standard',
      duration,
      providerId
    } = req.body;

    if (!serviceId || !providerId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'Service ID and Provider ID are required'
        }
      });
    }

    // Get pricing and duration from configuration
    const config = PROMOTION_PRICING[promotionType as keyof typeof PROMOTION_PRICING];
    if (!config) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PROMOTION_TYPE',
          message: 'Invalid promotion type'
        }
      });
    }

    const finalDuration = duration || config.duration;
    const paymentAmount = config.price;

    // TODO: In production, verify:
    // 1. Provider owns the service
    // 2. Service exists and is active
    // 3. Payment processing
    // 4. No existing active promotion for this service

    const featuredId = await FeaturedServiceService.promoteService({
      serviceId,
      providerId,
      promotionType,
      duration: finalDuration,
      paymentAmount
    });

    res.status(201).json({
      success: true,
      data: {
        id: featuredId,
        serviceId,
        promotionType,
        duration: finalDuration,
        paymentAmount
      },
      message: `Service successfully promoted as ${promotionType} featured for ${finalDuration} days`
    });
  } catch (error) {
    logger.error('Error promoting service:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PROMOTION_ERROR',
        message: 'Failed to promote service'
      }
    });
  }
});

// DELETE /api/featured-services/services/:id - Remove featured status
router.delete('/services/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { providerId } = req.body;

    if (!providerId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PROVIDER_ID',
          message: 'Provider ID is required'
        }
      });
    }

    await FeaturedServiceService.removeFeaturedStatus(id, providerId);

    res.json({
      success: true,
      message: 'Featured status removed successfully'
    });
  } catch (error) {
    logger.error('Error removing featured status:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'REMOVAL_ERROR',
        message: 'Failed to remove featured status'
      }
    });
  }
});

// GET /api/featured-services/stats - Get featured services statistics (for dashboard)
router.get('/stats', async (req, res) => {
  try {
    const { providerId } = req.query;
    const stats = await FeaturedServiceService.getStats(providerId as string);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error fetching featured services stats:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'STATS_ERROR',
        message: 'Failed to fetch statistics'
      }
    });
  }
});

// POST /api/featured-services/services/:id/track - Track events (inquiry, booking)
router.post('/services/:id/track', async (req, res) => {
  try {
    const { id } = req.params;
    const { eventType, userId } = req.body;

    if (!['inquiry', 'booking'].includes(eventType)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_EVENT_TYPE',
          message: 'Event type must be inquiry or booking'
        }
      });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    await FeaturedServiceService.trackEvent(id, eventType, userId, ipAddress);

    res.json({
      success: true,
      message: `${eventType} event tracked successfully`
    });
  } catch (error) {
    logger.error('Error tracking event:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'TRACKING_ERROR',
        message: 'Failed to track event'
      }
    });
  }
});

export default router;