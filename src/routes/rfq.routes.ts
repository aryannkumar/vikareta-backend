import { Router } from 'express';
import { RfqController } from '@/controllers/rfq.controller';
import { authMiddleware } from '@/middleware/auth-middleware';
import { validatePagination, validateSort } from '@/middleware/validation-middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const rfqController = new RfqController();

// All routes require authentication
router.use(authMiddleware);

/**
 * @openapi
 * /api/v1/rfqs:
 *   get:
 *     summary: List RFQs
 *     tags:
 *       - RFQs
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: RFQs list
 */
router.get('/', validatePagination, validateSort(['createdAt', 'budgetMax', 'expiresAt']), asyncHandler(rfqController.getRfqs.bind(rfqController)));
/**
 * @openapi
 * /api/v1/rfqs:
 *   post:
 *     summary: Create an RFQ
 *     tags:
 *       - RFQs
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
 *         description: RFQ created
 */
router.post('/', asyncHandler(rfqController.createRfq.bind(rfqController)));
/**
 * @openapi
 * /api/v1/rfqs/{id}:
 *   get:
 *     summary: Get RFQ by id
 *     tags:
 *       - RFQs
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
 *         description: RFQ detail
 */
router.get('/:id', asyncHandler(rfqController.getRfqById.bind(rfqController)));
/**
 * @openapi
 * /api/v1/rfqs/{id}:
 *   put:
 *     summary: Update an RFQ
 *     tags:
 *       - RFQs
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
router.put('/:id', asyncHandler(rfqController.updateRfq.bind(rfqController)));
/**
 * @openapi
 * /api/v1/rfqs/{id}:
 *   delete:
 *     summary: Delete an RFQ
 *     tags:
 *       - RFQs
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
router.delete('/:id', asyncHandler(rfqController.deleteRfq.bind(rfqController)));

export { router as rfqRoutes };