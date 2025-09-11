import { Router } from 'express';
import { AdminController } from '@/controllers/admin.controller';
import { authenticateToken, securityHeaders, rateLimit, requireRole, requireUserType } from '@/middleware/authentication.middleware';
import { validateQuery } from '@/middleware/zod-validate';
import { paginationQuerySchema } from '@/validation/schemas';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const adminController = new AdminController();

// Apply security headers to all admin routes
router.use(securityHeaders);

// Apply rate limiting to admin endpoints
router.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window for admin operations
  keyGenerator: (req) => `${req.user?.id || req.ip}:admin`,
}));

// Enhanced authentication and authorization for admin routes
router.use(authenticateToken);
router.use(requireUserType('admin'));
router.use(requireRole('admin'));

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
router.get('/users', validateQuery(paginationQuerySchema), asyncHandler(adminController.getUsers.bind(adminController)));
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
router.get('/orders', validateQuery(paginationQuerySchema), asyncHandler(adminController.getOrders.bind(adminController)));
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
router.get('/products', validateQuery(paginationQuerySchema), asyncHandler(adminController.getProducts.bind(adminController)));
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
router.get('/rfqs', validateQuery(paginationQuerySchema), asyncHandler(adminController.getRfqs.bind(adminController)));

export { router as adminRoutes };