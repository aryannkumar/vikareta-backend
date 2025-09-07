import { Router } from 'express';
import { integrationController } from '@/controllers/integration.controller';
import { authMiddleware } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
router.use(authMiddleware);
router.get('/', asyncHandler(integrationController.list.bind(integrationController)));
router.post('/', asyncHandler(integrationController.connect.bind(integrationController)));
router.patch('/:provider', asyncHandler(integrationController.update.bind(integrationController)));
router.post('/:provider/disconnect', asyncHandler(integrationController.disconnect.bind(integrationController)));

export const integrationRoutes = router;
export default router;
