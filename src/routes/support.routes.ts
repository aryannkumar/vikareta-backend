import { Router } from 'express';
import { SupportController } from '../controllers/support.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { validateQuery, validateBody, validateParams } from '@/middleware/zod-validate';
import { supportTicketCreateSchema, supportTicketUpdateSchema, supportTicketMessageSchema, supportTicketCloseSchema, supportTicketIdParamsSchema, supportTicketListQuerySchema } from '@/validation/schemas';

const router = Router();
const supportController = new SupportController();

// Validation now handled via Zod schemas

// Routes
/**
 * @openapi
 * /api/v1/support:
 *   get:
 *     summary: List support tickets for user
 *     tags:
 *       - Support
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tickets list
 */
router.get('/', authenticateToken, validateQuery(supportTicketListQuerySchema), supportController.getTickets.bind(supportController));
/**
 * @openapi
 * /api/v1/support:
 *   post:
 *     summary: Create a support ticket
 *     tags:
 *       - Support
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
 *         description: Ticket created
 */
router.post('/', authenticateToken, validateBody(supportTicketCreateSchema), supportController.createTicket.bind(supportController));
/**
 * @openapi
 * /api/v1/support/stats:
 *   get:
 *     summary: Get support ticket stats
 *     tags:
 *       - Support
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Stats
 */
router.get('/stats', authenticateToken, supportController.getTicketStats.bind(supportController));
/**
 * @openapi
 * /api/v1/support/{id}:
 *   get:
 *     summary: Get ticket by id
 *     tags:
 *       - Support
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
 *         description: Ticket detail
 */
router.get('/:id', authenticateToken, validateParams(supportTicketIdParamsSchema), supportController.getTicketById.bind(supportController));
/**
 * @openapi
 * /api/v1/support/{id}:
 *   put:
 *     summary: Update a support ticket
 *     tags:
 *       - Support
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
router.put('/:id', authenticateToken, validateParams(supportTicketIdParamsSchema), validateBody(supportTicketUpdateSchema), supportController.updateTicket.bind(supportController));
/**
 * @openapi
 * /api/v1/support/{id}/messages:
 *   post:
 *     summary: Add a message to a ticket
 *     tags:
 *       - Support
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
 *         description: Message added
 */
router.post('/:id/messages', authenticateToken, validateParams(supportTicketIdParamsSchema), validateBody(supportTicketMessageSchema), supportController.addMessage.bind(supportController));
/**
 * @openapi
 * /api/v1/support/{id}/close:
 *   post:
 *     summary: Close a support ticket
 *     tags:
 *       - Support
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Closed
 */
router.post('/:id/close', authenticateToken, validateParams(supportTicketIdParamsSchema), validateBody(supportTicketCloseSchema), supportController.closeTicket.bind(supportController));

export default router;