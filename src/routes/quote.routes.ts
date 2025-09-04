import { Router } from 'express';
import { QuoteController } from '../controllers/quote.controller';
import { authMiddleware } from '../middleware/auth-middleware';
import { validatePagination, validateSort } from '../middleware/validation-middleware';
import { asyncHandler } from '../middleware/error-handler';

const router = Router();
const quoteController = new QuoteController();

// All routes require authentication
router.use(authMiddleware);

router.get('/', validatePagination, validateSort(['createdAt', 'totalPrice']), asyncHandler(quoteController.getQuotes.bind(quoteController)));
router.post('/', asyncHandler(quoteController.createQuote.bind(quoteController)));
router.get('/:id', asyncHandler(quoteController.getQuoteById.bind(quoteController)));
router.put('/:id', asyncHandler(quoteController.updateQuote.bind(quoteController)));
router.delete('/:id', asyncHandler(quoteController.deleteQuote.bind(quoteController)));

export { router as quoteRoutes };