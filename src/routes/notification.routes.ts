import { Router } from 'express';
import { NotificationController } from '@/controllers/notification.controller';
import { authMiddleware } from '@/middleware/auth.middleware';
import { validateQuery } from '@/middleware/zod-validate';
import { paginationQuerySchema } from '@/validation/schemas';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const notificationController = new NotificationController();

router.use(authMiddleware);

/**
 * @openapi
 * /api/v1/notifications:
 *   get:
 *     summary: Get notifications for current user
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notifications list
 */
router.get('/', validateQuery(paginationQuerySchema), asyncHandler(notificationController.getNotifications.bind(notificationController)));
/**
 * @openapi
 * /api/v1/notifications/{id}/read:
 *   put:
 *     summary: Mark a notification as read
 *     tags:
 *       - Notifications
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
 *         description: Marked as read
 */
router.put('/:id/read', asyncHandler(notificationController.markAsRead.bind(notificationController)));
/**
 * @openapi
 * /api/v1/notifications/mark-all-read:
 *   put:
 *     summary: Mark all notifications as read
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Marked all as read
 */
router.put('/mark-all-read', asyncHandler(notificationController.markAllAsRead.bind(notificationController)));
/**
 * @openapi
 * /api/v1/notifications/stats:
 *   get:
 *     summary: Get notification stats
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Stats
 */
router.get('/stats', asyncHandler(notificationController.getStats.bind(notificationController)));

export { router as notificationRoutes };