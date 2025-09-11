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

export default router;