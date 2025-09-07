import { Router } from 'express';
import { DealController } from '../controllers/deal.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { validateBody, validateParams, validateQuery } from '@/middleware/zod-validate';
import { dealCreateSchema, dealUpdateSchema, dealIdParamsSchema, dealListQuerySchema, dealMessageSchema } from '@/validation/schemas';

const router = Router();
const dealController = new DealController();

// Validation now handled by Zod schemas

// Routes
/**
 * @openapi
 * /api/v1/deals:
 *   get:
 *     summary: List deals
 *     tags:
 *       - Deals
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Deals list
 */
router.get('/', authenticateToken, validateQuery(dealListQuerySchema), dealController.getDeals.bind(dealController));
/**
 * @openapi
 * /api/v1/deals:
 *   post:
 *     summary: Create a deal
 *     tags:
 *       - Deals
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
 *         description: Deal created
 */
router.post('/', authenticateToken, validateBody(dealCreateSchema), dealController.createDeal.bind(dealController));
/**
 * @openapi
 * /api/v1/deals/{id}:
 *   get:
 *     summary: Get deal by id
 *     tags:
 *       - Deals
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
 *         description: Deal detail
 */
router.get('/:id', authenticateToken, validateParams(dealIdParamsSchema), dealController.getDealById.bind(dealController));
/**
 * @openapi
 * /api/v1/deals/{id}:
 *   put:
 *     summary: Update a deal
 *     tags:
 *       - Deals
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
router.put('/:id', authenticateToken, validateParams(dealIdParamsSchema), validateBody(dealUpdateSchema), dealController.updateDeal.bind(dealController));
/**
 * @openapi
 * /api/v1/deals/{id}/messages:
 *   post:
 *     summary: Send a message on a deal
 *     tags:
 *       - Deals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Message sent
 */
router.post('/:id/messages', authenticateToken, validateParams(dealIdParamsSchema), validateBody(dealMessageSchema), dealController.sendMessage.bind(dealController));

export default router;