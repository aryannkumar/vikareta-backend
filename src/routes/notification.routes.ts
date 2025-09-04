import { Router } from 'express';
import { NotificationController } from '@/controllers/notification.controller';
import { authMiddleware } from '@/middleware/auth-middleware';
import { validatePagination } from '@/middleware/validation-middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const notificationController = new NotificationController();

router.use(authMiddleware);

router.get('/', validatePagination, asyncHandler(notificationController.getNotifications.bind(notificationController)));
router.put('/:id/read', asyncHandler(notificationController.markAsRead.bind(notificationController)));
router.put('/mark-all-read', asyncHandler(notificationController.markAllAsRead.bind(notificationController)));
router.get('/stats', asyncHandler(notificationController.getStats.bind(notificationController)));

export { router as notificationRoutes };