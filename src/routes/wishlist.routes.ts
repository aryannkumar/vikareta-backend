import { Router } from 'express';
import { WishlistController } from '../controllers/wishlist.controller';
import { authenticateToken } from '../middleware/auth-middleware';
import { validateRequest } from '../middleware/validation-middleware';
import { body, param, query } from 'express-validator';

const router = Router();
const wishlistController = new WishlistController();

// Validation schemas
const addToWishlistValidation = [
    body('productId').optional().isUUID().withMessage('Product ID must be a valid UUID'),
    body('serviceId').optional().isUUID().withMessage('Service ID must be a valid UUID'),
    body('businessId').optional().isUUID().withMessage('Business ID must be a valid UUID'),
];

const getWishlistValidation = [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('type').optional().isIn(['products', 'services', 'businesses']).withMessage('Type must be products, services, or businesses'),
];

const checkWishlistStatusValidation = [
    query('productId').optional().isUUID().withMessage('Product ID must be a valid UUID'),
    query('serviceId').optional().isUUID().withMessage('Service ID must be a valid UUID'),
    query('businessId').optional().isUUID().withMessage('Business ID must be a valid UUID'),
];

// Routes
router.get('/', authenticateToken, validateRequest(getWishlistValidation), wishlistController.getWishlist.bind(wishlistController));
router.post('/', authenticateToken, validateRequest(addToWishlistValidation), wishlistController.addToWishlist.bind(wishlistController));
router.delete('/clear', authenticateToken, wishlistController.clearWishlist.bind(wishlistController));
router.get('/stats', authenticateToken, wishlistController.getWishlistStats.bind(wishlistController));
router.get('/check', authenticateToken, validateRequest(checkWishlistStatusValidation), wishlistController.checkWishlistStatus.bind(wishlistController));
router.delete('/:itemId', authenticateToken, validateRequest([param('itemId').isUUID()]), wishlistController.removeFromWishlist.bind(wishlistController));

// Legacy routes for backward compatibility
router.post('/products/:productId', authenticateToken, validateRequest([param('productId').isUUID()]), wishlistController.addProduct.bind(wishlistController));
router.delete('/products/:productId', authenticateToken, validateRequest([param('productId').isUUID()]), wishlistController.removeProduct.bind(wishlistController));
router.post('/services/:serviceId', authenticateToken, validateRequest([param('serviceId').isUUID()]), wishlistController.addService.bind(wishlistController));
router.delete('/services/:serviceId', authenticateToken, validateRequest([param('serviceId').isUUID()]), wishlistController.removeService.bind(wishlistController));
router.post('/businesses/:businessId', authenticateToken, validateRequest([param('businessId').isUUID()]), wishlistController.addBusiness.bind(wishlistController));
router.delete('/businesses/:businessId', authenticateToken, validateRequest([param('businessId').isUUID()]), wishlistController.removeBusiness.bind(wishlistController));

export default router;