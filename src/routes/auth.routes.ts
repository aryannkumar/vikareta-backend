import { Router } from 'express';
import { AuthController } from '@/controllers/auth.controller';
import { validateBody } from '@/middleware/zod-validate';
import { authRegisterSchema, authLoginSchema, authForgotPasswordSchema, authResetPasswordSchema, authChangePasswordSchema, authSendOTPSchema, authVerifyOTPSchema, authVerify2FASchema } from '@/validation/schemas';
import { authMiddleware } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const authController = new AuthController();


// Routes

/**
 * @openapi
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created
 */
router.post('/register', validateBody(authRegisterSchema), asyncHandler(authController.register.bind(authController)));

/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     summary: Login with email/phone and password
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Authenticated
 */
router.post('/login', validateBody(authLoginSchema), asyncHandler(authController.login.bind(authController)));
router.post('/forgot-password', validateBody(authForgotPasswordSchema), asyncHandler(authController.forgotPassword.bind(authController)));
router.post('/reset-password', validateBody(authResetPasswordSchema), asyncHandler(authController.resetPassword.bind(authController)));
router.post('/refresh-token', asyncHandler(authController.refreshToken.bind(authController)));

// OTP routes
router.post('/send-otp', validateBody(authSendOTPSchema), asyncHandler(authController.sendOTP.bind(authController)));
router.post('/verify-otp', validateBody(authVerifyOTPSchema), asyncHandler(authController.verifyOTP.bind(authController)));

// OAuth routes
router.get('/google', asyncHandler(authController.googleAuth.bind(authController)));
router.get('/google/callback', asyncHandler(authController.googleCallback.bind(authController)));
router.get('/linkedin', asyncHandler(authController.linkedinAuth.bind(authController)));
router.get('/linkedin/callback', asyncHandler(authController.linkedinCallback.bind(authController)));
router.post('/oauth/token', asyncHandler(authController.oauthTokenExchange.bind(authController)));

// Protected routes
router.post('/logout', authMiddleware, asyncHandler(authController.logout.bind(authController)));
router.post('/change-password', authMiddleware, validateBody(authChangePasswordSchema), asyncHandler(authController.changePassword.bind(authController)));
router.get('/me', authMiddleware, asyncHandler(authController.getProfile.bind(authController)));
router.put('/profile', authMiddleware, asyncHandler(authController.updateProfile.bind(authController)));

// Email verification
router.post('/send-verification-email', authMiddleware, asyncHandler(authController.sendVerificationEmail.bind(authController)));
router.get('/verify-email/:token', asyncHandler(authController.verifyEmail.bind(authController)));

// Two-factor authentication
router.post('/2fa/enable', authMiddleware, asyncHandler(authController.enableTwoFactor.bind(authController)));
router.post('/2fa/disable', authMiddleware, asyncHandler(authController.disableTwoFactor.bind(authController)));
router.post('/2fa/verify', authMiddleware, validateBody(authVerify2FASchema), asyncHandler(authController.verifyTwoFactor.bind(authController)));

// Session management
router.get('/sessions', authMiddleware, asyncHandler(authController.getSessions.bind(authController)));
router.delete('/sessions/:sessionId', authMiddleware, asyncHandler(authController.revokeSession.bind(authController)));
router.delete('/sessions', authMiddleware, asyncHandler(authController.revokeAllSessions.bind(authController)));

export { router as authRoutes };