import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { UserController } from '@/controllers/user.controller';
import { validate, validatePagination, validateSort, validateUUID } from '../middleware/validation.middleware';
import { authMiddleware, requireAdmin, requireVerifiedUser } from '../middleware/auth-middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const userController = new UserController();

// All routes require authentication
router.use(authMiddleware);

// User profile routes
router.get('/profile', asyncHandler(userController.getProfile.bind(userController)));
router.put('/profile', 
  validate([
    body('firstName').optional().trim().isLength({ min: 2, max: 50 }),
    body('lastName').optional().trim().isLength({ min: 2, max: 50 }),
    body('businessName').optional().trim().isLength({ min: 2, max: 100 }),
    body('bio').optional().trim().isLength({ max: 500 }),
    body('website').optional().isURL(),
    body('location').optional().trim().isLength({ max: 255 }),
    body('city').optional().trim().isLength({ max: 100 }),
    body('state').optional().trim().isLength({ max: 100 }),
    body('country').optional().trim().isLength({ max: 100 }),
    body('postalCode').optional().trim().isLength({ max: 20 }),
    body('latitude').optional().isFloat({ min: -90, max: 90 }),
    body('longitude').optional().isFloat({ min: -180, max: 180 }),
  ]),
  asyncHandler(userController.updateProfile.bind(userController))
);

// User avatar
router.post('/avatar', asyncHandler(userController.uploadAvatar.bind(userController)));
router.delete('/avatar', asyncHandler(userController.deleteAvatar.bind(userController)));

// User verification
router.post('/verify-documents', asyncHandler(userController.uploadVerificationDocuments.bind(userController)));
router.get('/verification-status', asyncHandler(userController.getVerificationStatus.bind(userController)));

// User preferences
router.get('/preferences', asyncHandler(userController.getPreferences.bind(userController)));
router.put('/preferences', asyncHandler(userController.updatePreferences.bind(userController)));

// User addresses
router.get('/addresses', asyncHandler(userController.getAddresses.bind(userController)));
router.post('/addresses', 
  validate([
    body('name').trim().isLength({ min: 2, max: 100 }),
    body('phone').isMobilePhone('any'),
    body('addressLine1').trim().isLength({ min: 5, max: 255 }),
    body('addressLine2').optional().trim().isLength({ max: 255 }),
    body('city').trim().isLength({ min: 2, max: 100 }),
    body('state').trim().isLength({ min: 2, max: 100 }),
    body('postalCode').trim().isLength({ min: 5, max: 20 }),
    body('country').optional().trim().isLength({ max: 100 }),
    body('isDefault').optional().isBoolean(),
  ]),
  asyncHandler(userController.createAddress.bind(userController))
);
router.put('/addresses/:id', 
  validateUUID('id'),
  validate([
    body('name').optional().trim().isLength({ min: 2, max: 100 }),
    body('phone').optional().isMobilePhone('any'),
    body('addressLine1').optional().trim().isLength({ min: 5, max: 255 }),
    body('addressLine2').optional().trim().isLength({ max: 255 }),
    body('city').optional().trim().isLength({ min: 2, max: 100 }),
    body('state').optional().trim().isLength({ min: 2, max: 100 }),
    body('postalCode').optional().trim().isLength({ min: 5, max: 20 }),
    body('country').optional().trim().isLength({ max: 100 }),
    body('isDefault').optional().isBoolean(),
  ]),
  asyncHandler(userController.updateAddress.bind(userController))
);
router.delete('/addresses/:id', validateUUID('id'), asyncHandler(userController.deleteAddress.bind(userController)));

// User business profile
router.get('/business-profile', asyncHandler(userController.getBusinessProfile.bind(userController)));
router.put('/business-profile', 
  validate([
    body('companyName').trim().isLength({ min: 2, max: 255 }),
    body('businessType').optional().trim().isLength({ max: 100 }),
    body('industry').optional().trim().isLength({ max: 100 }),
    body('description').optional().trim().isLength({ max: 1000 }),
    body('website').optional().isURL(),
    body('email').isEmail().normalizeEmail(),
    body('phone').isMobilePhone('any'),
    body('address').isObject(),
    body('taxInfo').optional().isObject(),
    body('bankDetails').optional().isObject(),
  ]),
  asyncHandler(userController.updateBusinessProfile.bind(userController))
);

// User statistics
router.get('/stats', asyncHandler(userController.getUserStats.bind(userController)));
router.get('/activity', validatePagination, asyncHandler(userController.getUserActivity.bind(userController)));

// User following/followers
router.get('/following', validatePagination, asyncHandler(userController.getFollowing.bind(userController)));
router.get('/followers', validatePagination, asyncHandler(userController.getFollowers.bind(userController)));
router.post('/follow/:userId', validateUUID('userId'), asyncHandler(userController.followUser.bind(userController)));
router.delete('/follow/:userId', validateUUID('userId'), asyncHandler(userController.unfollowUser.bind(userController)));

// User search and discovery
router.get('/search', 
  validatePagination,
  validateSort(['businessName', 'location', 'verificationTier', 'createdAt']),
  validate([
    query('q').optional().trim().isLength({ min: 2, max: 100 }),
    query('userType').optional().isIn(['buyer', 'seller', 'both']),
    query('verificationTier').optional().isIn(['basic', 'verified', 'premium']),
    query('city').optional().trim(),
    query('state').optional().trim(),
    query('country').optional().trim(),
    query('isVerified').optional().isBoolean(),
  ]),
  asyncHandler(userController.searchUsers.bind(userController))
);

// Get user by ID (public profile)
router.get('/:id', validateUUID('id'), asyncHandler(userController.getUserById.bind(userController)));

// Admin routes
router.get('/', 
  requireAdmin,
  validatePagination,
  validateSort(['businessName', 'email', 'createdAt', 'verificationTier']),
  validate([
    query('userType').optional().isIn(['buyer', 'seller', 'both']),
    query('verificationTier').optional().isIn(['basic', 'verified', 'premium']),
    query('isVerified').optional().isBoolean(),
    query('isActive').optional().isBoolean(),
    query('search').optional().trim(),
  ]),
  asyncHandler(userController.getUsers.bind(userController))
);

router.put('/:id/verify', 
  requireAdmin,
  validateUUID('id'),
  validate([
    body('verificationTier').isIn(['basic', 'verified', 'premium']),
    body('notes').optional().trim(),
  ]),
  asyncHandler(userController.verifyUser.bind(userController))
);

router.put('/:id/deactivate', 
  requireAdmin,
  validateUUID('id'),
  validate([
    body('reason').trim().isLength({ min: 10, max: 500 }),
  ]),
  asyncHandler(userController.deactivateUser.bind(userController))
);

router.put('/:id/activate', 
  requireAdmin,
  validateUUID('id'),
  asyncHandler(userController.activateUser.bind(userController))
);

export { router as userRoutes };