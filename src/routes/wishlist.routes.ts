import { Router } from 'express';
import { WishlistController } from '../controllers/wishlist.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { validateBody, validateQuery, validateParams } from '@/middleware/zod-validate';
import { wishlistAddSchema, wishlistQuerySchema, wishlistCheckQuerySchema, wishlistItemIdParamsSchema, wishlistLegacyProductParams, wishlistLegacyServiceParams, wishlistLegacyBusinessParams } from '@/validation/schemas';

const router = Router();
const wishlistController = new WishlistController();

// Validation via Zod schemas

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
router.get('/', authenticateToken, validateQuery(wishlistQuerySchema), wishlistController.getWishlist.bind(wishlistController));
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
router.post('/', authenticateToken, validateBody(wishlistAddSchema), wishlistController.addToWishlist.bind(wishlistController));
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
router.get('/check', authenticateToken, validateQuery(wishlistCheckQuerySchema), wishlistController.checkWishlistStatus.bind(wishlistController));
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
router.delete('/:itemId', authenticateToken, validateParams(wishlistItemIdParamsSchema), wishlistController.removeFromWishlist.bind(wishlistController));

// Legacy routes for backward compatibility
router.post('/products/:productId', authenticateToken, validateParams(wishlistLegacyProductParams), wishlistController.addProduct.bind(wishlistController));
router.delete('/products/:productId', authenticateToken, validateParams(wishlistLegacyProductParams), wishlistController.removeProduct.bind(wishlistController));
router.post('/services/:serviceId', authenticateToken, validateParams(wishlistLegacyServiceParams), wishlistController.addService.bind(wishlistController));
router.delete('/services/:serviceId', authenticateToken, validateParams(wishlistLegacyServiceParams), wishlistController.removeService.bind(wishlistController));
router.post('/businesses/:businessId', authenticateToken, validateParams(wishlistLegacyBusinessParams), wishlistController.addBusiness.bind(wishlistController));
router.delete('/businesses/:businessId', authenticateToken, validateParams(wishlistLegacyBusinessParams), wishlistController.removeBusiness.bind(wishlistController));

export default router;