import express from 'express';
import { logger } from '../utils/logger';
import { FeaturedProductService } from '../services/featuredProductService';

const router = express.Router();

// Promotion pricing configuration
const PROMOTION_PRICING = {
  standard: { price: 999, duration: 7 },
  premium: { price: 2499, duration: 30 },
  organic: { price: 1499, duration: 14 }
};

// GET /api/featured/products - Get all featured products
router.get('/products', async (req, res) => {
  try {
    const { limit, category, minPrice, maxPrice } = req.query;
    
    const filters = {
      limit: limit ? parseInt(limit as string) : undefined,
      category: category as string,
      minPrice: minPrice ? parseInt(minPrice as string) : undefined,
      maxPrice: maxPrice ? parseInt(maxPrice as string) : undefined,
    };

    const result = await FeaturedProductService.getFeaturedProducts(filters);

    logger.info(`Fetched ${result.products.length} featured products`);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error fetching featured products:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch featured products'
      }
    });
  }
});

// GET /api/featured/products/:id - Get specific featured product
router.get('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const product = await FeaturedProductService.getFeaturedProduct(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: 'Featured product not found or expired'
        }
      });
    }

    // Track view
    const ipAddress = req.ip || req.connection.remoteAddress;
    await FeaturedProductService.trackEvent(id, 'view', undefined, ipAddress);

    logger.info(`Fetched featured product: ${id}`);

    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    logger.error('Error fetching featured product:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch featured product'
      }
    });
  }
});

// POST /api/featured/products - Create/promote a product as featured (for dashboard)
router.post('/products', async (req, res) => {
  try {
    const {
      productId,
      promotionType = 'standard',
      duration,
      supplierId
    } = req.body;

    if (!productId || !supplierId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'Product ID and Supplier ID are required'
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
    // 1. Supplier owns the product
    // 2. Product exists and is active
    // 3. Payment processing
    // 4. No existing active promotion for this product

    const featuredId = await FeaturedProductService.promoteProduct({
      productId,
      supplierId,
      promotionType,
      duration: finalDuration,
      paymentAmount
    });

    res.status(201).json({
      success: true,
      data: {
        id: featuredId,
        productId,
        promotionType,
        duration: finalDuration,
        paymentAmount
      },
      message: `Product successfully promoted as ${promotionType} featured for ${finalDuration} days`
    });
  } catch (error) {
    logger.error('Error promoting product:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PROMOTION_ERROR',
        message: 'Failed to promote product'
      }
    });
  }
});

// DELETE /api/featured/products/:id - Remove featured status
router.delete('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { supplierId } = req.body;

    if (!supplierId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_SUPPLIER_ID',
          message: 'Supplier ID is required'
        }
      });
    }

    await FeaturedProductService.removeFeaturedStatus(id, supplierId);

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

// GET /api/featured/stats - Get featured products statistics (for dashboard)
router.get('/stats', async (req, res) => {
  try {
    const { supplierId } = req.query;
    const stats = await FeaturedProductService.getStats(supplierId as string);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error fetching featured stats:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'STATS_ERROR',
        message: 'Failed to fetch statistics'
      }
    });
  }
});

// POST /api/featured/products/:id/track - Track events (click, order)
router.post('/products/:id/track', async (req, res) => {
  try {
    const { id } = req.params;
    const { eventType, userId } = req.body;

    if (!['click', 'order'].includes(eventType)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_EVENT_TYPE',
          message: 'Event type must be click or order'
        }
      });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    await FeaturedProductService.trackEvent(id, eventType, userId, ipAddress);

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