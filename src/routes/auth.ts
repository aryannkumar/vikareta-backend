/**
 * SSO Authentication Routes
 * Secure Cross-Subdomain Single Sign-On with JWT + Refresh Tokens in HttpOnly Cookies
 */

import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

import { logger } from '@/utils/logger';

const router = Router();
const prisma = new PrismaClient();

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

// Cookie Configuration
const COOKIE_CONFIG = {
  domain: process.env.NODE_ENV === 'production' ? '.vikareta.com' : undefined,
  path: '/',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' as const : 'lax' as const
};



// In-memory refresh token storage (replace with Redis in production)
const refreshTokens = new Map<string, {
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}>();

// Validation middleware
const handleValidationErrors = (req: Request, res: Response, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        details: errors.array(),
      },
    });
  }
  return next();
};

/**
 * Generate JWT Access Token
 */
function generateAccessToken(user: any) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.userType,
      userType: user.userType
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

/**
 * Generate Refresh Token
 */
function generateRefreshToken(user: any) {
  const refreshToken = jwt.sign(
    { id: user.id, email: user.email },
    REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );

  // Store refresh token
  refreshTokens.set(refreshToken, {
    userId: user.id,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  });

  return refreshToken;
}

/**
 * Generate CSRF Token
 */
function generateCSRFToken() {
  return jwt.sign(
    { type: 'csrf', timestamp: Date.now() },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

/**
 * Set Authentication Cookies
 */
function setAuthCookies(res: Response, user: any) {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  const csrfToken = generateCSRFToken();

  // Set HttpOnly cookies for tokens
  res.cookie('access_token', accessToken, {
    ...COOKIE_CONFIG,
    maxAge: 15 * 60 * 1000 // 15 minutes
  });

  res.cookie('refresh_token', refreshToken, {
    ...COOKIE_CONFIG,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  // Set CSRF token (non-HttpOnly for JavaScript access)
  res.cookie('XSRF-TOKEN', csrfToken, {
    ...COOKIE_CONFIG,
    httpOnly: false,
    maxAge: 60 * 60 * 1000 // 1 hour
  });
}

/**
 * Clear Authentication Cookies
 */
function clearAuthCookies(res: Response) {
  const expiredConfig = {
    ...COOKIE_CONFIG,
    expires: new Date(0)
  };

  res.cookie('access_token', '', expiredConfig);
  res.cookie('refresh_token', '', expiredConfig);
  res.cookie('XSRF-TOKEN', '', { ...expiredConfig, httpOnly: false });
}

/**
 * Middleware: Verify Access Token from Cookie
 */
function verifyAccessToken(req: Request, res: Response, next: any) {
  const accessToken = req.cookies.access_token;

  if (!accessToken) {
    return res.status(401).json({
      success: false,
      error: { code: 'NO_TOKEN', message: 'Access token required' }
    });
  }

  try {
    const decoded = jwt.verify(accessToken, JWT_SECRET) as any;
    req.authUser = decoded;
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: { code: 'TOKEN_EXPIRED', message: 'Access token expired' }
      });
    }

    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid access token' }
    });
  }
}

/**
 * Middleware: Verify CSRF Token
 */
function verifyCSRF(req: Request, res: Response, next: any) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  const csrfToken = req.headers['x-xsrf-token'] as string;
  const csrfCookie = req.cookies['XSRF-TOKEN'];

  // Debug logging
  logger.info('CSRF Validation Debug:', {
    hasHeader: !!csrfToken,
    hasCookie: !!csrfCookie,
    headerToken: csrfToken ? csrfToken.substring(0, 20) + '...' : 'none',
    cookieToken: csrfCookie ? csrfCookie.substring(0, 20) + '...' : 'none',
    tokensMatch: csrfToken === csrfCookie,
    allCookies: Object.keys(req.cookies),
    allHeaders: Object.keys(req.headers).filter(h => h.toLowerCase().includes('xsrf') || h.toLowerCase().includes('csrf'))
  });

  if (!csrfToken || !csrfCookie || csrfToken !== csrfCookie) {
    logger.warn('CSRF Token Validation Failed:', {
      reason: !csrfToken ? 'No header token' : !csrfCookie ? 'No cookie token' : 'Tokens do not match',
      headerPresent: !!csrfToken,
      cookiePresent: !!csrfCookie,
      headerTokenPreview: csrfToken ? csrfToken.substring(0, 20) + '...' : 'none',
      cookieTokenPreview: csrfCookie ? csrfCookie.substring(0, 20) + '...' : 'none',
      tokensEqual: csrfToken === csrfCookie
    });

    return res.status(403).json({
      success: false,
      error: { 
        code: 'CSRF_TOKEN_INVALID', 
        message: 'CSRF token validation failed',
        timestamp: new Date().toISOString()
      }
    });
  }

  try {
    jwt.verify(csrfToken, JWT_SECRET);
    logger.info('CSRF Token validated successfully');
    next();
  } catch (error) {
    logger.error('CSRF Token JWT verification failed:', error);
    return res.status(403).json({
      success: false,
      error: { code: 'CSRF_TOKEN_INVALID', message: 'Invalid CSRF token' }
    });
  }
}

/**
 * POST /auth/register
 * Register new user with SSO cookies
 */
router.post('/register', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('firstName').trim().isLength({ min: 1 }).withMessage('First name is required'),
  body('lastName').trim().isLength({ min: 1 }).withMessage('Last name is required'),
  body('userType').isIn(['buyer', 'seller', 'both']).withMessage('Invalid user type'),
  handleValidationErrors,
  verifyCSRF,
], async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, userType, businessName, phone, location } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { phone: phone || undefined },
        ],
      },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'USER_EXISTS',
          message: 'User with this email or phone already exists',
        },
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        businessName,
        phone,
        location,
        userType,
        verificationTier: 'basic',
        isVerified: false,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        businessName: true,
        userType: true,
        verificationTier: true,
        isVerified: true,
        createdAt: true,
      },
    });

    // Set authentication cookies
    setAuthCookies(res, user);

    // Create user response with name field
    const userResponse = {
      ...user,
      name: `${user.firstName} ${user.lastName}`,
      role: user.userType,
      verified: user.isVerified
    };

    logger.info('SSO: User registered successfully:', { userId: user.id, email: user.email });

    return res.status(201).json({
      success: true,
      user: userResponse,
      message: 'User registered successfully',
    });
  } catch (error) {
    logger.error('SSO: Registration error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'REGISTRATION_FAILED',
        message: 'Failed to register user',
      },
    });
  }
});

/**
 * POST /auth/login
 * Login with username/password and set SSO cookies
 */
router.post('/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidationErrors,
  verifyCSRF,
], async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        firstName: true,
        lastName: true,
        businessName: true,
        userType: true,
        verificationTier: true,
        isVerified: true,
        createdAt: true,
      },
    });

    if (!user || !user.passwordHash) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
    }

    // Set authentication cookies
    setAuthCookies(res, user);

    // Create user response with name field
    const userResponse = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      name: `${user.firstName} ${user.lastName}`,
      businessName: user.businessName,
      role: user.userType,
      userType: user.userType,
      verificationTier: user.verificationTier,
      verified: user.isVerified,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
    };

    logger.info('SSO: User logged in successfully:', { userId: user.id, email: user.email });

    // For admin users, also return tokens in response body for frontend localStorage
    if (user.userType === 'admin') {
      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);
      
      return res.json({
        success: true,
        data: {
          user: userResponse,
          token: accessToken,
          refreshToken: refreshToken,
        },
        message: 'Login successful',
      });
    }

    return res.json({
      success: true,
      user: userResponse,
      message: 'Login successful',
    });
  } catch (error) {
    logger.error('SSO: Login error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'LOGIN_FAILED',
        message: 'Failed to login',
      },
    });
  }
});

/**
 * POST /auth/refresh
 * Refresh access token using refresh token from cookie
 */
router.post('/refresh', verifyCSRF, async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies.refresh_token;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'NO_REFRESH_TOKEN',
          message: 'Refresh token required',
        },
      });
    }

    // Check if refresh token exists and is valid
    const tokenData = refreshTokens.get(refreshToken);
    if (!tokenData || tokenData.expiresAt < new Date()) {
      refreshTokens.delete(refreshToken);
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Invalid or expired refresh token',
        },
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, REFRESH_SECRET) as any;

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        businessName: true,
        userType: true,
        verificationTier: true,
        isVerified: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    // Generate new access token
    const newAccessToken = generateAccessToken(user);

    // Set new access token cookie
    res.cookie('access_token', newAccessToken, {
      ...COOKIE_CONFIG,
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    // Create user response
    const userResponse = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      name: `${user.firstName} ${user.lastName}`,
      businessName: user.businessName,
      role: user.userType,
      userType: user.userType,
      verificationTier: user.verificationTier,
      verified: user.isVerified,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
    };

    logger.info('SSO: Token refreshed successfully:', { userId: user.id });

    return res.json({
      success: true,
      user: userResponse,
    });
  } catch (error) {
    logger.error('SSO: Token refresh error:', error);
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid refresh token',
      },
    });
  }
});

/**
 * GET /auth/me
 * Get current user profile using access token from cookie
 */
router.get('/me', verifyAccessToken, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.authUser!.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        businessName: true,
        userType: true,
        verificationTier: true,
        isVerified: true,
        phone: true,
        gstin: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    // Create user response with name field
    const userResponse = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      name: `${user.firstName} ${user.lastName}`,
      businessName: user.businessName,
      role: user.userType,
      userType: user.userType,
      verificationTier: user.verificationTier,
      verified: user.isVerified,
      isVerified: user.isVerified,
      phone: user.phone,
      gstin: user.gstin,
      createdAt: user.createdAt,
    };

    return res.json({
      success: true,
      user: userResponse,
    });
  } catch (error) {
    logger.error('SSO: Get user error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'GET_USER_FAILED',
        message: 'Failed to get user information',
      },
    });
  }
});

/**
 * POST /auth/logout
 * Logout and clear all cookies across subdomains
 */
router.post('/logout', verifyCSRF, async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies.refresh_token;

    // Remove refresh token from storage
    if (refreshToken) {
      refreshTokens.delete(refreshToken);
    }

    // Clear all authentication cookies
    clearAuthCookies(res);

    logger.info('SSO: User logged out successfully');

    return res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    logger.error('SSO: Logout error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'LOGOUT_ERROR',
        message: 'Logout failed',
      },
    });
  }
});

/**
 * PUT /auth/profile
 * Update user profile
 */
router.put('/profile', verifyAccessToken, verifyCSRF, [
  body('firstName').optional().trim().isLength({ min: 1 }).withMessage('First name cannot be empty'),
  body('lastName').optional().trim().isLength({ min: 1 }).withMessage('Last name cannot be empty'),
  body('businessName').optional().trim(),
  body('phone').optional().isMobilePhone('any').withMessage('Invalid phone number'),
  body('gstin').optional().isLength({ min: 15, max: 15 }).withMessage('GSTIN must be 15 characters'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, businessName, phone, gstin } = req.body;

    const user = await prisma.user.update({
      where: { id: req.authUser!.id },
      data: {
        firstName,
        lastName,
        businessName,
        phone,
        gstin,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        businessName: true,
        userType: true,
        verificationTier: true,
        isVerified: true,
        phone: true,
        gstin: true,
        createdAt: true,
      },
    });

    // Create user response with name field
    const userResponse = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      name: `${user.firstName} ${user.lastName}`,
      businessName: user.businessName,
      role: user.userType,
      userType: user.userType,
      verificationTier: user.verificationTier,
      verified: user.isVerified,
      isVerified: user.isVerified,
      phone: user.phone,
      gstin: user.gstin,
      createdAt: user.createdAt,
    };

    logger.info('SSO: Profile updated successfully:', { userId: user.id });

    return res.json({
      success: true,
      user: userResponse,
      message: 'Profile updated successfully',
    });
  } catch (error) {
    logger.error('SSO: Profile update error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'PROFILE_UPDATE_FAILED',
        message: 'Failed to update profile',
      },
    });
  }
});

export default router;