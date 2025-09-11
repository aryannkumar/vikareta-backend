import { Router } from 'express';
import { securitySettingsController } from '@/controllers/security-settings.controller';
import { validateBody } from '@/middleware/zod-validate';
import { securitySettingsSchema } from '@/validation/schemas';
import { authMiddleware } from '@/middleware/authentication.middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
router.use(authMiddleware);
router.get('/', asyncHandler(securitySettingsController.get.bind(securitySettingsController)));
router.put('/', validateBody(securitySettingsSchema), asyncHandler(securitySettingsController.upsert.bind(securitySettingsController)));
export { router as securitySettingsRoutes };
