import { Router } from 'express';
import { InventoryController } from '../controllers/inventory.controller';
import { authenticateToken } from '../middleware/auth-middleware';
import { validateRequest } from '../middleware/validation-middleware';
import { body, param, query } from 'express-validator';

const router = Router();
const inventoryController = new InventoryController();

// Validation schemas
const getInventoryValidation = [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('warehouseId').optional().isUUID().withMessage('Warehouse ID must be a valid UUID'),
    query('lowStock').optional().isBoolean().withMessage('Low stock must be a boolean'),
];

const createWarehouseValidation = [
    body('name').notEmpty().isLength({ min: 2, max: 255 }).withMessage('Name must be between 2 and 255 characters'),
    body('description').optional().isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters'),
    body('location').optional().isLength({ max: 255 }).withMessage('Location must be less than 255 characters'),
    body('address').optional().isLength({ max: 500 }).withMessage('Address must be less than 500 characters'),
    body('city').optional().isLength({ max: 100 }).withMessage('City must be less than 100 characters'),
    body('state').optional().isLength({ max: 100 }).withMessage('State must be less than 100 characters'),
    body('country').optional().isLength({ max: 100 }).withMessage('Country must be less than 100 characters'),
    body('postalCode').optional().isLength({ max: 20 }).withMessage('Postal code must be less than 20 characters'),
    body('contactPerson').optional().isLength({ max: 255 }).withMessage('Contact person must be less than 255 characters'),
    body('contactPhone').optional().isLength({ max: 20 }).withMessage('Contact phone must be less than 20 characters'),
    body('contactEmail').optional().isEmail().withMessage('Contact email must be a valid email'),
];

const getMovementsValidation = [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('productId').optional().isUUID().withMessage('Product ID must be a valid UUID'),
    query('warehouseId').optional().isUUID().withMessage('Warehouse ID must be a valid UUID'),
    query('movementType').optional().isIn(['in', 'out', 'adjustment']).withMessage('Invalid movement type'),
];

const adjustInventoryValidation = [
    body('productId').notEmpty().isUUID().withMessage('Product ID must be a valid UUID'),
    body('warehouseId').notEmpty().isUUID().withMessage('Warehouse ID must be a valid UUID'),
    body('movementType').notEmpty().isIn(['in', 'out', 'adjustment']).withMessage('Movement type must be in, out, or adjustment'),
    body('quantity').notEmpty().isInt({ min: 1 }).withMessage('Quantity must be a positive integer'),
    body('reason').notEmpty().isLength({ min: 3, max: 255 }).withMessage('Reason must be between 3 and 255 characters'),
    body('notes').optional().isLength({ max: 1000 }).withMessage('Notes must be less than 1000 characters'),
];

// Routes
router.get('/', authenticateToken, validateRequest(getInventoryValidation), inventoryController.getInventory.bind(inventoryController));
router.get('/warehouses', authenticateToken, inventoryController.getWarehouses.bind(inventoryController));
router.post('/warehouses', authenticateToken, validateRequest(createWarehouseValidation), inventoryController.createWarehouse.bind(inventoryController));
router.get('/movements', authenticateToken, validateRequest(getMovementsValidation), inventoryController.getMovements.bind(inventoryController));
router.post('/adjust', authenticateToken, validateRequest(adjustInventoryValidation), inventoryController.adjustInventory.bind(inventoryController));
router.get('/analytics', authenticateToken, inventoryController.getInventoryAnalytics.bind(inventoryController));

export default router;