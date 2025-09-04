import { Router } from 'express';
import { AdvertisementController } from '@/controllers/advertisement.controller';
import { authMiddleware, requireVerifiedUser } from '@/middleware/auth-middleware';
import { validatePagination, validateSort } from '@/middleware/validation-middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const advertisementController = new AdvertisementController();

router.use(authMiddleware);

router.get('/campaigns', validatePagination, validateSort(['createdAt', 'budget']), asyncHandler(advertisementController.getCampaigns.bind(advertisementController)));
router.post('/campaigns', requireVerifiedUser, asyncHandler(advertisementController.createCampaign.bind(advertisementController)));
router.get('/campaigns/:id', asyncHandler(advertisementController.getCampaignById.bind(advertisementController)));
router.put('/campaigns/:id', asyncHandler(advertisementController.updateCampaign.bind(advertisementController)));
router.delete('/campaigns/:id', asyncHandler(advertisementController.deleteCampaign.bind(advertisementController)));

export { router as advertisementRoutes };