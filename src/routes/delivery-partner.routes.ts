import { Router } from 'express';
import { deliveryPartnerController } from '@/controllers/delivery-partner.controller';
import { authMiddleware, requireAdmin } from '@/middleware/authentication.middleware';
import { deliveryPartnerCreateSchema, deliveryPartnerUpdateSchema, toggleDeliveryPartnerParamsSchema, toggleDeliveryPartnerBodySchema, deliveryPartnerPreferenceParamsSchema } from '@/validation/schemas';
import { validateParams, validateBody } from '../middleware/zod-validate';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
router.use(authMiddleware);

router.get('/', asyncHandler(deliveryPartnerController.listPartners.bind(deliveryPartnerController)));
router.post('/', requireAdmin, validateBody(deliveryPartnerCreateSchema), asyncHandler(deliveryPartnerController.createPartner.bind(deliveryPartnerController)));
router.put('/:id', requireAdmin, validateParams(toggleDeliveryPartnerParamsSchema), validateBody(deliveryPartnerUpdateSchema), asyncHandler(deliveryPartnerController.updatePartner.bind(deliveryPartnerController)));
router.patch('/:id/toggle', requireAdmin, validateParams(toggleDeliveryPartnerParamsSchema), validateBody(toggleDeliveryPartnerBodySchema), asyncHandler(deliveryPartnerController.togglePartner.bind(deliveryPartnerController)));

router.get('/preferences/mine', asyncHandler(deliveryPartnerController.listPreferences.bind(deliveryPartnerController)));
router.put('/preferences/:partnerId', validateParams(deliveryPartnerPreferenceParamsSchema), asyncHandler(deliveryPartnerController.upsertPreference.bind(deliveryPartnerController)));
router.delete('/preferences/:partnerId', validateParams(deliveryPartnerPreferenceParamsSchema), asyncHandler(deliveryPartnerController.removePreference.bind(deliveryPartnerController)));

export { router as deliveryPartnerRoutes };
