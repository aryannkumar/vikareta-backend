import { Router } from 'express';
import { authMiddleware } from '@/middleware/authentication.middleware';
import { asyncHandler } from '@/middleware/error-handler';
import { validateBody, validateParams } from '@/middleware/zod-validate';
import { notificationPreferenceCreateSchema, notificationPreferenceUpdateSchema, notificationPreferenceIdParamsSchema } from '@/validation/schemas';
import { notificationPreferenceController } from '@/controllers/notification-preference.controller';

const router = Router();
router.use(authMiddleware);
router.get('/', asyncHandler(notificationPreferenceController.list.bind(notificationPreferenceController)));
router.post('/', validateBody(notificationPreferenceCreateSchema), asyncHandler(notificationPreferenceController.create.bind(notificationPreferenceController)));
router.put('/:id', validateParams(notificationPreferenceIdParamsSchema), validateBody(notificationPreferenceUpdateSchema), asyncHandler(notificationPreferenceController.update.bind(notificationPreferenceController)));
router.delete('/:id', validateParams(notificationPreferenceIdParamsSchema), asyncHandler(notificationPreferenceController.remove.bind(notificationPreferenceController)));
export { router as notificationPreferenceRoutes };
