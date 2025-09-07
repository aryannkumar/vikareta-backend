import { Router } from 'express';
import { notificationSettingsController } from '@/controllers/notification-settings.controller';
import { validateBody } from '@/middleware/zod-validate';
import { notificationSettingsSchema } from '@/validation/schemas';
import { authMiddleware } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
router.use(authMiddleware);
router.get('/', asyncHandler(notificationSettingsController.get.bind(notificationSettingsController)));
router.put('/', validateBody(notificationSettingsSchema), asyncHandler(notificationSettingsController.upsert.bind(notificationSettingsController)));
export { router as notificationSettingsRoutes };
