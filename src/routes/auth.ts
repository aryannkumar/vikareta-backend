import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '@/middleware/auth';
import { logger } from '@/utils/logger';

const router = Router();
const prisma = new PrismaClient();

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

// Generate JWT tokens
const generateTokens = (userId: string, email: string, userType: string) => {
  const jwtSecret = process.env.JWT_SECRET!;
  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET!;

  const accessToken = jwt.sign(
    { userId, email, userType },
    jwtSecret,
    { expiresIn: '1h' }
  );

  const refreshToken = jwt.sign(
    { userId, email, userType },
    jwtRefreshSecret,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

// POST /api/auth/register
router.post('/register', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('firstName').trim().isLength({ min: 1 }).withMessage('First name is required'),
  body('lastName').trim().isLength({ min: 1 }).withMessage('Last name is required'),
  body('userType').isIn(['buyer', 'seller', 'both']).withMessage('Invalid user type'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, userType, businessName, phone } = req.body;

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
      return res.status(400).json({
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
        userType,
        verificationTier: 'basic',
        isVerified: false,
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

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id, user.email!, user.userType!);

    logger.info('User registered successfully:', { userId: user.id, email: user.email });

    return res.status(201).json({
      success: true,
      data: {
        user,
        token: accessToken,
        refreshToken,
      },
      message: 'User registered successfully',
    });
  } catch (error) {
    logger.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'REGISTRATION_FAILED',
        message: 'Failed to register user',
      },
    });
  }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidationErrors,
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

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id, user.email!, user.userType!);

    // Remove password hash from response
    const { passwordHash, ...userResponse } = user;

    logger.info('User logged in successfully:', { userId: user.id, email: user.email });

    return res.json({
      success: true,
      data: {
        user: userResponse,
        token: accessToken,
        refreshToken,
      },
      message: 'Login successful',
    });
  } catch (error) {
    logger.error('Login error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'LOGIN_FAILED',
        message: 'Failed to login',
      },
    });
  }
});

// POST /api/auth/refresh
router.post('/refresh', [
  body('refreshToken').notEmpty().withMessage('Refresh token is required'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET!;

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, jwtRefreshSecret) as any;

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        userType: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    // Generate new tokens
    const tokens = generateTokens(user.id, user.email!, user.userType!);

    return res.json({
      success: true,
      data: tokens,
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid refresh token',
      },
    });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.authUser!.userId },
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

    return res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    logger.error('Get user error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'GET_USER_FAILED',
        message: 'Failed to get user information',
      },
    });
  }
});

// PUT /api/auth/profile
router.put('/profile', authenticate, [
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
      where: { id: req.authUser!.userId },
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

    logger.info('Profile updated successfully:', { userId: user.id });

    return res.json({
      success: true,
      data: { user },
      message: 'Profile updated successfully',
    });
  } catch (error) {
    logger.error('Profile update error:', error);
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