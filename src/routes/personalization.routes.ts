import { Router } from 'express';
import { PersonalizationController } from '../controllers/personalization.controller';
import { authMiddleware } from '../middleware/authentication.middleware';

const router = Router();
const personalizationController = new PersonalizationController();

// Public routes (no authentication required)
router.get('/trending-categories', personalizationController.getTrendingCategories.bind(personalizationController));
router.get('/categories', personalizationController.getPersonalizedCategories.bind(personalizationController));

// Protected routes (authentication required)
router.post('/category-interaction/:categoryId', authMiddleware, personalizationController.trackCategoryInteraction.bind(personalizationController));

// Guest personalization routes (require guest authentication)
router.get('/guest', authMiddleware, personalizationController.getGuestPersonalization.bind(personalizationController));
router.put('/guest/preferences', authMiddleware, personalizationController.updateGuestPreferences.bind(personalizationController));
router.post('/guest/recently-viewed', authMiddleware, personalizationController.addToRecentlyViewed.bind(personalizationController));
router.post('/guest/search-history', authMiddleware, personalizationController.addToSearchHistory.bind(personalizationController));
router.post('/guest/category-view', authMiddleware, personalizationController.updateCategoryView.bind(personalizationController));
router.post('/guest/cart', authMiddleware, personalizationController.addToCart.bind(personalizationController));
router.delete('/guest/cart', authMiddleware, personalizationController.removeFromCart.bind(personalizationController));
router.put('/guest/cart/quantity', authMiddleware, personalizationController.updateCartItemQuantity.bind(personalizationController));
router.post('/guest/wishlist/toggle', authMiddleware, personalizationController.toggleWishlist.bind(personalizationController));
router.post('/guest/session-activity', authMiddleware, personalizationController.updateSessionActivity.bind(personalizationController));
router.get('/guest/recommendations', authMiddleware, personalizationController.getPersonalizedRecommendations.bind(personalizationController));
router.delete('/guest', authMiddleware, personalizationController.clearGuestPersonalization.bind(personalizationController));

export default router;