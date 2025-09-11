import { Router } from 'express';
import { AuthController } from '@/controllers/auth.controller';
import { validateBody } from '@/middleware/zod-validate';
import { authRegisterSchema, authLoginSchema, authForgotPasswordSchema, authResetPasswordSchema, authChangePasswordSchema, authSendOTPSchema, authVerifyOTPSchema, authVerify2FASchema } from '@/validation/schemas';
import { authenticateToken, csrfProtection, generateCSRFToken, rateLimit, securityHeaders, requireRole, requireUserType } from '@/middleware/authentication.middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const authController = new AuthController();

// Apply security headers to all routes
router.use(securityHeaders);

// Apply rate limiting to auth endpoints
router.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window
  keyGenerator: (req) => `${req.ip}:auth`,
}));

// CSRF token endpoint
router.get('/csrf-token', generateCSRFToken, (req, res) => {
  res.json({ success: true, message: 'CSRF token set' });
});

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

// OTP routes with enhanced rate limiting
router.use('/send-otp', rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // 3 OTP requests per 5 minutes
  keyGenerator: (req) => `${req.ip}:otp`,
}));
router.post('/send-otp', validateBody(authSendOTPSchema), asyncHandler(authController.sendOTP.bind(authController)));
router.post('/verify-otp', validateBody(authVerifyOTPSchema), asyncHandler(authController.verifyOTP.bind(authController)));

// OAuth routes
router.get('/google', asyncHandler(authController.googleAuth.bind(authController)));
router.get('/google/callback', asyncHandler(authController.googleCallback.bind(authController)));
router.get('/linkedin', asyncHandler(authController.linkedinAuth.bind(authController)));
router.get('/linkedin/callback', asyncHandler(authController.linkedinCallback.bind(authController)));
router.post('/oauth/token', asyncHandler(authController.oauthTokenExchange.bind(authController)));

// Protected routes with enhanced authentication
router.post('/logout', authenticateToken, asyncHandler(authController.logout.bind(authController)));
router.post('/change-password', authenticateToken, validateBody(authChangePasswordSchema), asyncHandler(authController.changePassword.bind(authController)));
router.get('/me', authenticateToken, asyncHandler(authController.getProfile.bind(authController)));
router.put('/profile', authenticateToken, asyncHandler(authController.updateProfile.bind(authController)));

// Email verification
router.post('/send-verification-email', authenticateToken, asyncHandler(authController.sendVerificationEmail.bind(authController)));
router.get('/verify-email/:token', asyncHandler(authController.verifyEmail.bind(authController)));

// Two-factor authentication (admin and business users only)
router.post('/2fa/enable', authenticateToken, requireUserType('admin', 'business'), asyncHandler(authController.enableTwoFactor.bind(authController)));
router.post('/2fa/disable', authenticateToken, requireUserType('admin', 'business'), asyncHandler(authController.disableTwoFactor.bind(authController)));
router.post('/2fa/verify', authenticateToken, validateBody(authVerify2FASchema), asyncHandler(authController.verifyTwoFactor.bind(authController)));

// Session management (admin only)
router.get('/sessions', authenticateToken, requireRole('admin'), asyncHandler(authController.getSessions.bind(authController)));
router.delete('/sessions/:sessionId', authenticateToken, requireRole('admin'), asyncHandler(authController.revokeSession.bind(authController)));
router.delete('/sessions', authenticateToken, requireRole('admin'), asyncHandler(authController.revokeAllSessions.bind(authController)));

export { router as authRoutes };