import { Router } from 'express';
import { AdminController } from '@/controllers/admin.controller';
import { authMiddleware, requireAdmin } from '@/middleware/auth-middleware';
import { validatePagination, validateSort } from '@/middleware/validation-middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const adminController = new AdminController();

router.use(authMiddleware);
router.use(requireAdmin);
/**
 * @openapi
 * /api/v1/admin/dashboard:
 *   get:
 *     summary: Get admin dashboard stats
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard stats
 */
router.get('/dashboard', asyncHandler(adminController.getDashboard.bind(adminController)));
/**
 * @openapi
 * /api/v1/admin/users:
 *   get:
 *     summary: List users (admin)
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Users list
 */
router.get('/users', validatePagination, validateSort(['createdAt', 'businessName']), asyncHandler(adminController.getUsers.bind(adminController)));
/**
 * @openapi
 * /api/v1/admin/orders:
 *   get:
 *     summary: List orders (admin)
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Orders list
 */
router.get('/orders', validatePagination, validateSort(['createdAt', 'totalAmount']), asyncHandler(adminController.getOrders.bind(adminController)));
/**
 * @openapi
 * /api/v1/admin/products:
 *   get:
 *     summary: List products (admin)
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Products list
 */
router.get('/products', validatePagination, validateSort(['createdAt', 'title']), asyncHandler(adminController.getProducts.bind(adminController)));
/**
 * @openapi
 * /api/v1/admin/rfqs:
 *   get:
 *     summary: List RFQs (admin)
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: RFQs list
 */
router.get('/rfqs', validatePagination, validateSort(['createdAt', 'title']), asyncHandler(adminController.getRfqs.bind(adminController)));

export { router as adminRoutes };