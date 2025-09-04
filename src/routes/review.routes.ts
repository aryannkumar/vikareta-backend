import { Router } from 'express';
import { ReviewController } from '@/controllers/review.controller';
import { authMiddleware, optionalAuthMiddleware } from '@/middleware/auth-middleware';
import { validatePagination, validateSort } from '@/middleware/validation-middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const reviewController = new ReviewController();

// Public routes
router.get('/', optionalAuthMiddleware, validatePagination, validateSort(['createdAt', 'rating']), asyncHandler(reviewController.getReviews.bind(reviewController)));
router.get('/:id', asyncHandler(reviewController.getReviewById.bind(reviewController)));

// Protected routes
router.use(authMiddleware);
router.post('/', asyncHandler(reviewController.createReview.bind(reviewController)));
router.put('/:id', asyncHandler(reviewController.updateReview.bind(reviewController)));
router.delete('/:id', asyncHandler(reviewController.deleteReview.bind(reviewController)));

export { router as reviewRoutes };