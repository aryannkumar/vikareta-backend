import { Router } from 'express';
import { UserController } from '@/controllers/user.controller';
import { validateBody, validateParams, validateQuery } from '@/middleware/zod-validate';
import { userProfileUpdateSchema, businessProfileUpdateSchema, paginationQuerySchema, followUserParamsSchema, userSearchQuerySchema, userIdParamsSchema, userAdminListQuerySchema, userVerifyBodySchema, userDeactivateBodySchema } from '@/validation/schemas';
import { authMiddleware, requireAdmin } from '../middleware/authentication.middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const userController = new UserController();

// All routes require authentication
router.use(authMiddleware);

/**
 * @openapi
 * /api/v1/users/profile:
 *   get:
 *     summary: Get current user's profile
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 */
// User profile routes
router.get('/profile', asyncHandler(userController.getProfile.bind(userController)));

/**
 * @openapi
 * /api/v1/users/profile:
 *   put:
 *     summary: Update current user's profile
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Updated profile
 */
router.put('/profile', validateBody(userProfileUpdateSchema), asyncHandler(userController.updateProfile.bind(userController)));

// User avatar
router.post('/avatar', asyncHandler(userController.uploadAvatar.bind(userController)));
router.delete('/avatar', asyncHandler(userController.deleteAvatar.bind(userController)));

// User verification
router.post('/verify-documents', asyncHandler(userController.uploadVerificationDocuments.bind(userController)));
router.get('/verification-status', asyncHandler(userController.getVerificationStatus.bind(userController)));

// User preferences
router.get('/preferences', asyncHandler(userController.getPreferences.bind(userController)));
router.put('/preferences', asyncHandler(userController.updatePreferences.bind(userController)));

// User addresses
// Address endpoints removed; use /api/v1/shipping/addresses instead.

// User business profile
router.get('/business-profile', asyncHandler(userController.getBusinessProfile.bind(userController)));
// Business profile could have its own schema; placeholder: reuse userProfileUpdateSchema for now or extend later
router.put('/business-profile', validateBody(businessProfileUpdateSchema), asyncHandler(userController.updateBusinessProfile.bind(userController)));

// User statistics
router.get('/stats', asyncHandler(userController.getUserStats.bind(userController)));
router.get('/activity', validateQuery(paginationQuerySchema), asyncHandler(userController.getUserActivity.bind(userController)));

// User following/followers
router.get('/following', validateQuery(paginationQuerySchema), asyncHandler(userController.getFollowing.bind(userController)));
router.get('/followers', validateQuery(paginationQuerySchema), asyncHandler(userController.getFollowers.bind(userController)));
router.post('/follow/:userId', validateParams(followUserParamsSchema), asyncHandler(userController.followUser.bind(userController)));
router.delete('/follow/:userId', validateParams(followUserParamsSchema), asyncHandler(userController.unfollowUser.bind(userController)));

// User search and discovery
router.get('/search', validateQuery(userSearchQuerySchema), asyncHandler(userController.searchUsers.bind(userController)));

// Get user by ID (public profile)
router.get('/:id', validateParams(userIdParamsSchema), asyncHandler(userController.getUserById.bind(userController)));

// Admin routes
router.get('/', requireAdmin, validateQuery(userAdminListQuerySchema), asyncHandler(userController.getUsers.bind(userController)));

router.put('/:id/verify', requireAdmin, validateParams(userIdParamsSchema), validateBody(userVerifyBodySchema), asyncHandler(userController.verifyUser.bind(userController)));

router.put('/:id/deactivate', requireAdmin, validateParams(userIdParamsSchema), validateBody(userDeactivateBodySchema), asyncHandler(userController.deactivateUser.bind(userController)));

router.put('/:id/activate', requireAdmin, validateParams(userIdParamsSchema), asyncHandler(userController.activateUser.bind(userController)));

export { router as userRoutes };