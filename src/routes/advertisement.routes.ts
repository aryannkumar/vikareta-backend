import { Router } from 'express';
import { AdvertisementController } from '@/controllers/advertisement.controller';
import { authMiddleware, requireVerifiedUser } from '@/middleware/auth-middleware';
import { validatePagination, validateSort } from '@/middleware/validation-middleware';
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
router.get('/campaigns', validatePagination, validateSort(['createdAt', 'budget']), asyncHandler(advertisementController.getCampaigns.bind(advertisementController)));
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

export { router as advertisementRoutes };