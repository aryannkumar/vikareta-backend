import { Router } from 'express';
import { AdvertisementController } from '@/controllers/advertisement.controller';
import { authMiddleware, requireVerifiedUser } from '@/middleware/auth.middleware';
import { rateLimit } from 'express-rate-limit';
import { validateQuery } from '@/middleware/zod-validate';
import { paginationQuerySchema } from '@/validation/schemas';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const advertisementController = new AdvertisementController();

router.use(authMiddleware);

/**
 * @openapi
 * /api/v1/advertisements/campaigns:
 *   get:
 *     summary: List advertisement campaigns
 *     tags:
 *       - Advertisements
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Campaign list
 */
router.get('/campaigns', validateQuery(paginationQuerySchema), asyncHandler(advertisementController.getCampaigns.bind(advertisementController)));
/**
 * @openapi
 * /api/v1/advertisements/campaigns:
 *   post:
 *     summary: Create an advertisement campaign
 *     tags:
 *       - Advertisements
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Campaign created
 */
router.post('/campaigns', requireVerifiedUser, asyncHandler(advertisementController.createCampaign.bind(advertisementController)));
/**
 * @openapi
 * /api/v1/advertisements/campaigns/{id}:
 *   get:
 *     summary: Get campaign by id
 *     tags:
 *       - Advertisements
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Campaign detail
 */
router.get('/campaigns/:id', asyncHandler(advertisementController.getCampaignById.bind(advertisementController)));
/**
 * @openapi
 * /api/v1/advertisements/campaigns/{id}:
 *   put:
 *     summary: Update a campaign
 *     tags:
 *       - Advertisements
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Updated
 */
router.put('/campaigns/:id', asyncHandler(advertisementController.updateCampaign.bind(advertisementController)));
/**
 * @openapi
 * /api/v1/advertisements/campaigns/{id}:
 *   delete:
 *     summary: Delete a campaign
 *     tags:
 *       - Advertisements
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted
 */
router.delete('/campaigns/:id', asyncHandler(advertisementController.deleteCampaign.bind(advertisementController)));

// Ads under campaign
router.get('/campaigns/:campaignId/ads', asyncHandler(advertisementController.listAds.bind(advertisementController)));
router.post('/campaigns/:campaignId/ads', asyncHandler(advertisementController.createAd.bind(advertisementController)));

// Placements
router.get('/placements', asyncHandler(advertisementController.listPlacements.bind(advertisementController)));
router.post('/placements', asyncHandler(advertisementController.createPlacement.bind(advertisementController)));
router.get('/placements/:placementId/assignments', asyncHandler(advertisementController.listAssignments.bind(advertisementController)));
router.post('/placements/:placementId/assignments', asyncHandler(advertisementController.assignAd.bind(advertisementController)));

// Approvals
router.post('/approvals', asyncHandler(advertisementController.createApproval.bind(advertisementController)));
router.patch('/approvals/:id', asyncHandler(advertisementController.updateApproval.bind(advertisementController)));

// Metrics record endpoints (internal / tracking)
// Lightweight abuse protection (per IP burst limiting)
const trackLimiter = rateLimit({ windowMs: 60 * 1000, max: 120 });
router.post('/ads/:adId/impression', trackLimiter, asyncHandler(advertisementController.recordImpression.bind(advertisementController)));
router.post('/ads/:adId/click', trackLimiter, asyncHandler(advertisementController.recordClick.bind(advertisementController)));

// Analytics / reporting
router.get('/campaigns/:campaignId/analytics/daily', asyncHandler(advertisementController.getCampaignDailyAnalytics.bind(advertisementController)));
router.get('/ads/top', asyncHandler(advertisementController.getTopAds.bind(advertisementController)));

export { router as advertisementRoutes };