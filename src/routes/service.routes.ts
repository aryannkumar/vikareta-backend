import { Router } from 'express';
import { ServiceController } from '@/controllers/service.controller';
import { authMiddleware, optionalAuthMiddleware } from '@/middleware/auth-middleware';
import { validatePagination, validateSort } from '@/middleware/validation-middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const serviceController = new ServiceController();

// Public routes
router.get('/', optionalAuthMiddleware, validatePagination, validateSort(['price', 'createdAt', 'title']), asyncHandler(serviceController.getServices.bind(serviceController)));
router.get('/featured', asyncHandler(serviceController.getFeaturedServices.bind(serviceController)));
router.get('/:id', optionalAuthMiddleware, asyncHandler(serviceController.getServiceById.bind(serviceController)));

// Protected routes
router.use(authMiddleware);
router.post('/', asyncHandler(serviceController.createService.bind(serviceController)));
router.put('/:id', asyncHandler(serviceController.updateService.bind(serviceController)));
router.delete('/:id', asyncHandler(serviceController.deleteService.bind(serviceController)));

export { router as serviceRoutes };