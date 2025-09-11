import { Router } from 'express';
import { negotiationController } from '../controllers/negotiation.controller';
import { authMiddleware } from '../middleware/authentication.middleware';
import { asyncHandler } from '../middleware/error-handler';

const router = Router();
router.use(authMiddleware);

// List negotiations for a quote
router.get('/quotes/:quoteId', asyncHandler(negotiationController.list.bind(negotiationController)));
// Create initial negotiation
router.post('/', asyncHandler(negotiationController.create.bind(negotiationController)));
// Counter offer
router.post('/:id/counter', asyncHandler(negotiationController.counter.bind(negotiationController)));
// Accept
router.post('/:id/accept', asyncHandler(negotiationController.accept.bind(negotiationController)));
// Reject
router.post('/:id/reject', asyncHandler(negotiationController.reject.bind(negotiationController)));
// Mark final
router.post('/:id/final', asyncHandler(negotiationController.markFinal.bind(negotiationController)));

export { router as negotiationRoutes };
