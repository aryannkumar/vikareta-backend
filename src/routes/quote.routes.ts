import { Router } from 'express';
import { QuoteController } from '../controllers/quote.controller';
import { authMiddleware } from '../middleware/auth-middleware';
import { validatePagination, validateSort } from '../middleware/validation-middleware';
import { asyncHandler } from '../middleware/error-handler';

const router = Router();
const quoteController = new QuoteController();

// All routes require authentication
router.use(authMiddleware);

/**
 * @openapi
 * /api/v1/quotes:
 *   get:
 *     summary: List quotes
 *     tags:
 *       - Quotes
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Quotes list
 */
router.get('/', validatePagination, validateSort(['createdAt', 'totalPrice']), asyncHandler(quoteController.getQuotes.bind(quoteController)));
/**
 * @openapi
 * /api/v1/quotes:
 *   post:
 *     summary: Create a quote
 *     tags:
 *       - Quotes
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
 *         description: Quote created
 */
router.post('/', asyncHandler(quoteController.createQuote.bind(quoteController)));
/**
 * @openapi
 * /api/v1/quotes/{id}:
 *   get:
 *     summary: Get quote by id
 *     tags:
 *       - Quotes
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
 *         description: Quote detail
 */
router.get('/:id', asyncHandler(quoteController.getQuoteById.bind(quoteController)));
/**
 * @openapi
 * /api/v1/quotes/{id}:
 *   put:
 *     summary: Update a quote
 *     tags:
 *       - Quotes
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
router.put('/:id', asyncHandler(quoteController.updateQuote.bind(quoteController)));
/**
 * @openapi
 * /api/v1/quotes/{id}:
 *   delete:
 *     summary: Delete a quote
 *     tags:
 *       - Quotes
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
router.delete('/:id', asyncHandler(quoteController.deleteQuote.bind(quoteController)));

export { router as quoteRoutes };