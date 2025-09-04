import { Router } from 'express';
import { ShippingController } from '@/controllers/shipping.controller';
import { authMiddleware } from '@/middleware/auth-middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const shippingController = new ShippingController();

router.use(authMiddleware);

router.get('/providers', asyncHandler(shippingController.getProviders.bind(shippingController)));
router.post('/calculate', asyncHandler(shippingController.calculateShipping.bind(shippingController)));
router.post('/create-shipment', asyncHandler(shippingController.createShipment.bind(shippingController)));
router.get('/track/:trackingNumber', asyncHandler(shippingController.trackShipment.bind(shippingController)));

export { router as shippingRoutes };