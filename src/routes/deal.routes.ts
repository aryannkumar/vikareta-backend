import { Router } from 'express';
import { DealController } from '../controllers/deal.controller';
import { authenticateToken } from '../middleware/auth-middleware';
import { validateRequest } from '../middleware/validation-middleware';
import { body, param, query } from 'express-validator';

const router = Router();
const dealController = new DealController();

// Validation schemas
const getDealsValidation = [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('status').optional().isIn(['active', 'completed', 'cancelled']).withMessage('Invalid status'),
    query('buyerId').optional().isUUID().withMessage('Buyer ID must be a valid UUID'),
    query('sellerId').optional().isUUID().withMessage('Seller ID must be a valid UUID'),
];

const createDealValidation = [
    body('title').notEmpty().isLength({ min: 5, max: 255 }).withMessage('Title must be between 5 and 255 characters'),
    body('description').optional().isLength({ max: 2000 }).withMessage('Description must be less than 2000 characters'),
    body('milestone').optional().isLength({ max: 1000 }).withMessage('Milestone must be less than 1000 characters'),
    body('discountType').notEmpty().isIn(['percentage', 'fixed']).withMessage('Discount type must be percentage or fixed'),
    body('discountValue').notEmpty().isNumeric().withMessage('Discount value must be a number'),
    body('dealValue').optional().isNumeric().withMessage('Deal value must be a number'),
    body('buyerId').optional().isUUID().withMessage('Buyer ID must be a valid UUID'),
    body('sellerId').optional().isUUID().withMessage('Seller ID must be a valid UUID'),
    body('rfqId').optional().isUUID().withMessage('RFQ ID must be a valid UUID'),
    body('quoteId').optional().isUUID().withMessage('Quote ID must be a valid UUID'),
    body('orderId').optional().isUUID().withMessage('Order ID must be a valid UUID'),
    body('startDate').notEmpty().isISO8601().withMessage('Start date must be a valid ISO 8601 date'),
    body('endDate').notEmpty().isISO8601().withMessage('End date must be a valid ISO 8601 date'),
    body('nextFollowUp').optional().isISO8601().withMessage('Next follow up must be a valid ISO 8601 date'),
];

const updateDealValidation = [
    param('id').isUUID().withMessage('Deal ID must be a valid UUID'),
    body('title').optional().isLength({ min: 5, max: 255 }).withMessage('Title must be between 5 and 255 characters'),
    body('description').optional().isLength({ max: 2000 }).withMessage('Description must be less than 2000 characters'),
    body('milestone').optional().isLength({ max: 1000 }).withMessage('Milestone must be less than 1000 characters'),
    body('discountType').optional().isIn(['percentage', 'fixed']).withMessage('Discount type must be percentage or fixed'),
    body('discountValue').optional().isNumeric().withMessage('Discount value must be a number'),
    body('dealValue').optional().isNumeric().withMessage('Deal value must be a number'),
    body('status').optional().isIn(['active', 'completed', 'cancelled']).withMessage('Invalid status'),
    body('startDate').optional().isISO8601().withMessage('Start date must be a valid ISO 8601 date'),
    body('endDate').optional().isISO8601().withMessage('End date must be a valid ISO 8601 date'),
    body('nextFollowUp').optional().isISO8601().withMessage('Next follow up must be a valid ISO 8601 date'),
];

const sendMessageValidation = [
    param('id').isUUID().withMessage('Deal ID must be a valid UUID'),
    body('message').notEmpty().isLength({ min: 1, max: 2000 }).withMessage('Message must be between 1 and 2000 characters'),
    body('messageType').optional().isIn(['text', 'file', 'image']).withMessage('Invalid message type'),
];

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
router.get('/', authenticateToken, validateRequest(getDealsValidation), dealController.getDeals.bind(dealController));
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
router.post('/', authenticateToken, validateRequest(createDealValidation), dealController.createDeal.bind(dealController));
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
router.get('/:id', authenticateToken, validateRequest([param('id').isUUID()]), dealController.getDealById.bind(dealController));
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
router.put('/:id', authenticateToken, validateRequest(updateDealValidation), dealController.updateDeal.bind(dealController));
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
router.post('/:id/messages', authenticateToken, validateRequest(sendMessageValidation), dealController.sendMessage.bind(dealController));

export default router;