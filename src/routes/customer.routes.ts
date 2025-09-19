import { Router } from 'express';
import { CustomerController } from '@/controllers/customer.controller';
import { authMiddleware, requireAdmin } from '@/middleware/authentication.middleware';
import { asyncHandler } from '@/middleware/error-handler';
import { validateQuery, validateParams, validateBody } from '@/middleware/zod-validate';
import { z } from 'zod';

const router = Router();
const customerController = new CustomerController();

// Validation schemas
const customerListQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
  verificationTier: z.string().optional(),
  userType: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.string().transform(val => parseInt(val)).optional(),
  limit: z.string().transform(val => parseInt(val)).optional(),
});

const customerIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const updateCustomerStatusSchema = z.object({
  isActive: z.boolean(),
});

const updateCustomerVerificationSchema = z.object({
  verificationTier: z.string(),
  isVerified: z.boolean(),
});

// All routes require authentication and admin access
router.use(authMiddleware);
router.use(requireAdmin);

/**
 * @openapi
 * /api/v1/customers:
 *   get:
 *     summary: Get customers list with filtering and pagination
 *     tags:
 *       - Customers
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, suspended]
 *       - in: query
 *         name: verificationTier
 *         schema:
 *           type: string
 *       - in: query
 *         name: userType
 *         schema:
 *           type: string
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Customers list
 */
router.get('/', validateQuery(customerListQuerySchema), asyncHandler(customerController.getCustomers.bind(customerController)));

/**
 * @openapi
 * /api/v1/customers/{id}:
 *   get:
 *     summary: Get customer by ID
 *     tags:
 *       - Customers
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Customer details
 */
router.get('/:id', validateParams(customerIdParamsSchema), asyncHandler(customerController.getCustomer.bind(customerController)));

/**
 * @openapi
 * /api/v1/customers/{id}/order-history:
 *   get:
 *     summary: Get customer order history
 *     tags:
 *       - Customers
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Customer order history
 */
router.get('/:id/order-history', validateParams(customerIdParamsSchema), asyncHandler(customerController.getCustomerOrderHistory.bind(customerController)));

/**
 * @openapi
 * /api/v1/customers/{id}/status:
 *   put:
 *     summary: Update customer status
 *     tags:
 *       - Customers
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Customer status updated
 */
router.put('/:id/status', validateParams(customerIdParamsSchema), validateBody(updateCustomerStatusSchema), asyncHandler(customerController.updateCustomerStatus.bind(customerController)));

/**
 * @openapi
 * /api/v1/customers/{id}/verification:
 *   put:
 *     summary: Update customer verification
 *     tags:
 *       - Customers
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               verificationTier:
 *                 type: string
 *               isVerified:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Customer verification updated
 */
router.put('/:id/verification', validateParams(customerIdParamsSchema), validateBody(updateCustomerVerificationSchema), asyncHandler(customerController.updateCustomerVerification.bind(customerController)));

/**
 * @openapi
 * /api/v1/customers/stats:
 *   get:
 *     summary: Get customer statistics
 *     tags:
 *       - Customers
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Customer statistics
 */
router.get('/stats', asyncHandler(customerController.getCustomerStats.bind(customerController)));

export { router as customerRoutes };