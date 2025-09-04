import { Router } from 'express';
import { AdminController } from '@/controllers/admin.controller';
import { authMiddleware, requireAdmin } from '@/middleware/auth-middleware';
import { validatePagination, validateSort } from '@/middleware/validation-middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const adminController = new AdminController();

router.use(authMiddleware);
router.use(requireAdmin);

router.get('/dashboard', asyncHandler(adminController.getDashboard.bind(adminController)));
router.get('/users', validatePagination, validateSort(['createdAt', 'businessName']), asyncHandler(adminController.getUsers.bind(adminController)));
router.get('/orders', validatePagination, validateSort(['createdAt', 'totalAmount']), asyncHandler(adminController.getOrders.bind(adminController)));
router.get('/products', validatePagination, validateSort(['createdAt', 'title']), asyncHandler(adminController.getProducts.bind(adminController)));
router.get('/rfqs', validatePagination, validateSort(['createdAt', 'title']), asyncHandler(adminController.getRfqs.bind(adminController)));

export { router as adminRoutes };