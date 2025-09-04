import { Router } from 'express';
import { body } from 'express-validator';
import { AuthController } from '@/controllers/auth.controller';
import { validate } from '@/middleware/validation-middleware';
import { authMiddleware, optionalAuthMiddleware } from '@/middleware/auth-middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const authController = new AuthController();

// Registration validation
const registerValidation = [
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('phone')
    .optional()
    .isMobilePhone('any')
    .withMessage('Please provide a valid phone number'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('businessName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Business name must be between 2 and 100 characters'),
  body('userType')
    .isIn(['buyer', 'seller', 'both'])
    .withMessage('User type must be buyer, seller, or both'),
  body('gstin')
    .optional()
    .matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
    .withMessage('Please provide a valid GSTIN'),
];

// Login validation
const loginValidation = [
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('phone')
    .optional()
    .isMobilePhone('any')
    .withMessage('Please provide a valid phone number'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

// Password reset validation
const forgotPasswordValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
];

const resetPasswordValidation = [
  body('token')
    .notEmpty()
    .withMessage('Reset token is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
];

// Change password validation
const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one lowercase letter, one uppercase letter, and one number'),
];

// OTP validation
const verifyOTPValidation = [
  body('phone')
    .isMobilePhone('any')
    .withMessage('Please provide a valid phone number'),
  body('otp')
    .isLength({ min: 4, max: 6 })
    .isNumeric()
    .withMessage('Please provide a valid OTP'),
];

// Routes

// Public routes
router.post('/register', validate(registerValidation), asyncHandler(authController.register.bind(authController)));
router.post('/login', validate(loginValidation), asyncHandler(authController.login.bind(authController)));
router.post('/forgot-password', validate(forgotPasswordValidation), asyncHandler(authController.forgotPassword.bind(authController)));
router.post('/reset-password', validate(resetPasswordValidation), asyncHandler(authController.resetPassword.bind(authController)));
router.post('/refresh-token', asyncHandler(authController.refreshToken.bind(authController)));

// OTP routes
router.post('/send-otp', validate([body('phone').isMobilePhone('any')]), asyncHandler(authController.sendOTP.bind(authController)));
router.post('/verify-otp', validate(verifyOTPValidation), asyncHandler(authController.verifyOTP.bind(authController)));

// OAuth routes
router.get('/google', asyncHandler(authController.googleAuth.bind(authController)));
router.get('/google/callback', asyncHandler(authController.googleCallback.bind(authController)));
router.get('/linkedin', asyncHandler(authController.linkedinAuth.bind(authController)));
router.get('/linkedin/callback', asyncHandler(authController.linkedinCallback.bind(authController)));

// Protected routes
router.post('/logout', authMiddleware, asyncHandler(authController.logout.bind(authController)));
router.post('/change-password', authMiddleware, validate(changePasswordValidation), asyncHandler(authController.changePassword.bind(authController)));
router.get('/me', authMiddleware, asyncHandler(authController.getProfile.bind(authController)));
router.put('/profile', authMiddleware, asyncHandler(authController.updateProfile.bind(authController)));

// Email verification
router.post('/send-verification-email', authMiddleware, asyncHandler(authController.sendVerificationEmail.bind(authController)));
router.get('/verify-email/:token', asyncHandler(authController.verifyEmail.bind(authController)));

// Two-factor authentication
router.post('/2fa/enable', authMiddleware, asyncHandler(authController.enableTwoFactor.bind(authController)));
router.post('/2fa/disable', authMiddleware, asyncHandler(authController.disableTwoFactor.bind(authController)));
router.post('/2fa/verify', authMiddleware, validate([body('token').isLength({ min: 6, max: 6 })]), asyncHandler(authController.verifyTwoFactor.bind(authController)));

// Session management
router.get('/sessions', authMiddleware, asyncHandler(authController.getSessions.bind(authController)));
router.delete('/sessions/:sessionId', authMiddleware, asyncHandler(authController.revokeSession.bind(authController)));
router.delete('/sessions', authMiddleware, asyncHandler(authController.revokeAllSessions.bind(authController)));

export { router as authRoutes };