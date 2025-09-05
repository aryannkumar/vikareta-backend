import { Router } from 'express';
import { ShippingController } from '@/controllers/shipping.controller';
import { authMiddleware } from '@/middleware/auth-middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const shippingController = new ShippingController();

router.use(authMiddleware);

/**
 * @openapi
 * /api/v1/shipping/providers:
 *   get:
 *     summary: List shipping providers
 *     tags:
 *       - Shipping
 *     responses:
 *       200:
 *         description: Providers list
 */
router.get('/providers', asyncHandler(shippingController.getProviders.bind(shippingController)));
/**
 * @openapi
 * /api/v1/shipping/calculate:
 *   post:
 *     summary: Calculate shipping cost
 *     tags:
 *       - Shipping
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Shipping estimate
 */
router.post('/calculate', asyncHandler(shippingController.calculateShipping.bind(shippingController)));
/**
 * @openapi
 * /api/v1/shipping/create-shipment:
 *   post:
 *     summary: Create a shipment with provider
 *     tags:
 *       - Shipping
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Shipment created
 */
router.post('/create-shipment', asyncHandler(shippingController.createShipment.bind(shippingController)));
/**
 * @openapi
 * /api/v1/shipping/track/{trackingNumber}:
 *   get:
 *     summary: Track a shipment
 *     tags:
 *       - Shipping
 *     parameters:
 *       - in: path
 *         name: trackingNumber
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tracking info
 */
router.get('/track/:trackingNumber', asyncHandler(shippingController.trackShipment.bind(shippingController)));

export { router as shippingRoutes };