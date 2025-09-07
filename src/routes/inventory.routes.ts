import { Router } from 'express';
import { InventoryController } from '../controllers/inventory.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { validateBody, validateQuery } from '@/middleware/zod-validate';
import { inventoryAdjustSchema, inventoryListQuerySchema, inventoryWarehouseCreateSchema, inventoryMovementsQuerySchema } from '@/validation/schemas';

const router = Router();
const inventoryController = new InventoryController();

// Legacy express-validator validations removed; using Zod schemas

// Routes
/**
 * @openapi
 * /api/v1/inventory:
 *   get:
 *     summary: Get inventory list
 *     tags:
 *       - Inventory
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Inventory list
 */
router.get('/', authenticateToken, validateQuery(inventoryListQuerySchema), inventoryController.getInventory.bind(inventoryController));
/**
 * @openapi
 * /api/v1/inventory/warehouses:
 *   get:
 *     summary: List warehouses
 *     tags:
 *       - Inventory
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Warehouses
 */
router.get('/warehouses', authenticateToken, inventoryController.getWarehouses.bind(inventoryController));
/**
 * @openapi
 * /api/v1/inventory/warehouses:
 *   post:
 *     summary: Create a warehouse
 *     tags:
 *       - Inventory
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Warehouse created
 */
router.post('/warehouses', authenticateToken, validateBody(inventoryWarehouseCreateSchema), inventoryController.createWarehouse.bind(inventoryController));
/**
 * @openapi
 * /api/v1/inventory/movements:
 *   get:
 *     summary: Get inventory movements
 *     tags:
 *       - Inventory
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Movements list
 */
router.get('/movements', authenticateToken, validateQuery(inventoryMovementsQuerySchema), inventoryController.getMovements.bind(inventoryController));
/**
 * @openapi
 * /api/v1/inventory/adjust:
 *   post:
 *     summary: Adjust inventory
 *     tags:
 *       - Inventory
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Adjusted
 */
router.post('/adjust', authenticateToken, validateBody(inventoryAdjustSchema), inventoryController.adjustInventory.bind(inventoryController));
/**
 * @openapi
 * /api/v1/inventory/analytics:
 *   get:
 *     summary: Get inventory analytics
 *     tags:
 *       - Inventory
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Analytics
 */
router.get('/analytics', authenticateToken, inventoryController.getInventoryAnalytics.bind(inventoryController));

export const inventoryRoutes = router;
export default router;