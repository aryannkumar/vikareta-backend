import { Router } from 'express';
import { UserPreferenceController } from '@/controllers/user-preference.controller';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const userPreferenceController = new UserPreferenceController();

// User preference routes
router.get('/:userId/preferences', asyncHandler(userPreferenceController.getUserPreferences.bind(userPreferenceController)));
router.patch('/:userId/preferences', asyncHandler(userPreferenceController.updateUserPreferences.bind(userPreferenceController)));
router.get('/:userId/category-preferences', asyncHandler(userPreferenceController.getCategoryPreferences.bind(userPreferenceController)));
router.get('/:userId/interests', asyncHandler(userPreferenceController.getUserInterests.bind(userPreferenceController)));
router.post('/:userId/track/:categoryId', asyncHandler(userPreferenceController.trackCategoryView.bind(userPreferenceController)));

export { router as userPreferenceRoutes };