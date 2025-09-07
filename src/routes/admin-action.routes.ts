import { Router } from 'express';
import { adminActionController } from '@/controllers/admin-action.controller';
import { authMiddleware } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
router.use(authMiddleware);
router.get('/', asyncHandler(adminActionController.list.bind(adminActionController)));

export const adminActionRoutes = router;
export default router;
