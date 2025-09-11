import { Router } from 'express';
import { ReviewController } from '@/controllers/review.controller';
import { authMiddleware, optionalAuthMiddleware } from '@/middleware/authentication.middleware';
import { validateQuery } from '@/middleware/zod-validate';
import { paginationQuerySchema } from '@/validation/schemas';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const reviewController = new ReviewController();

// Public routes
/**
 * @openapi
 * /api/v1/reviews:
 *   get:
 *     summary: List reviews
 *     tags:
 *       - Reviews
 *     responses:
 *       200:
 *         description: Reviews list
 */
router.get('/', optionalAuthMiddleware, validateQuery(paginationQuerySchema), asyncHandler(reviewController.getReviews.bind(reviewController)));
/**
 * @openapi
 * /api/v1/reviews/{id}:
 *   get:
 *     summary: Get review by id
 *     tags:
 *       - Reviews
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Review detail
 */
router.get('/:id', asyncHandler(reviewController.getReviewById.bind(reviewController)));

// Protected routes
router.use(authMiddleware);
/**
 * @openapi
 * /api/v1/reviews:
 *   post:
 *     summary: Create a review
 *     tags:
 *       - Reviews
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
 *         description: Review created
 */
router.post('/', asyncHandler(reviewController.createReview.bind(reviewController)));
/**
 * @openapi
 * /api/v1/reviews/{id}:
 *   put:
 *     summary: Update a review
 *     tags:
 *       - Reviews
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
router.put('/:id', asyncHandler(reviewController.updateReview.bind(reviewController)));
/**
 * @openapi
 * /api/v1/reviews/{id}:
 *   delete:
 *     summary: Delete a review
 *     tags:
 *       - Reviews
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
router.delete('/:id', asyncHandler(reviewController.deleteReview.bind(reviewController)));

export { router as reviewRoutes };