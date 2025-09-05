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
/**
 * @openapi
 * /api/v1/wishlist:
 *   get:
 *     summary: Get current user's wishlist
 *     tags:
 *       - Wishlist
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wishlist
 */
router.get('/', authenticateToken, validateRequest(getWishlistValidation), wishlistController.getWishlist.bind(wishlistController));
/**
 * @openapi
 * /api/v1/wishlist:
 *   post:
 *     summary: Add an item to wishlist
 *     tags:
 *       - Wishlist
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
 *         description: Added
 */
router.post('/', authenticateToken, validateRequest(addToWishlistValidation), wishlistController.addToWishlist.bind(wishlistController));
/**
 * @openapi
 * /api/v1/wishlist/clear:
 *   delete:
 *     summary: Clear wishlist
 *     tags:
 *       - Wishlist
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cleared
 */
router.delete('/clear', authenticateToken, wishlistController.clearWishlist.bind(wishlistController));
/**
 * @openapi
 * /api/v1/wishlist/stats:
 *   get:
 *     summary: Get wishlist stats
 *     tags:
 *       - Wishlist
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Stats
 */
router.get('/stats', authenticateToken, wishlistController.getWishlistStats.bind(wishlistController));
/**
 * @openapi
 * /api/v1/wishlist/check:
 *   get:
 *     summary: Check if an item is in wishlist
 *     tags:
 *       - Wishlist
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Status
 */
router.get('/check', authenticateToken, validateRequest(checkWishlistStatusValidation), wishlistController.checkWishlistStatus.bind(wishlistController));
/**
 * @openapi
 * /api/v1/wishlist/{itemId}:
 *   delete:
 *     summary: Remove item from wishlist
 *     tags:
 *       - Wishlist
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Removed
 */
router.delete('/:itemId', authenticateToken, validateRequest([param('itemId').isUUID()]), wishlistController.removeFromWishlist.bind(wishlistController));

// Legacy routes for backward compatibility
router.post('/products/:productId', authenticateToken, validateRequest([param('productId').isUUID()]), wishlistController.addProduct.bind(wishlistController));
router.delete('/products/:productId', authenticateToken, validateRequest([param('productId').isUUID()]), wishlistController.removeProduct.bind(wishlistController));
router.post('/services/:serviceId', authenticateToken, validateRequest([param('serviceId').isUUID()]), wishlistController.addService.bind(wishlistController));
router.delete('/services/:serviceId', authenticateToken, validateRequest([param('serviceId').isUUID()]), wishlistController.removeService.bind(wishlistController));
router.post('/businesses/:businessId', authenticateToken, validateRequest([param('businessId').isUUID()]), wishlistController.addBusiness.bind(wishlistController));
router.delete('/businesses/:businessId', authenticateToken, validateRequest([param('businessId').isUUID()]), wishlistController.removeBusiness.bind(wishlistController));

export default router;