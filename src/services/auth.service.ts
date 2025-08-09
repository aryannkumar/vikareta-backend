import bcrypt from 'bcryptjs';
import jwt, { SignOptions, VerifyOptions } from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';

const prisma = new PrismaClient();

export interface RegisterData {
  email?: string | undefined;
  phone?: string | undefined;
  password: string;
  firstName?: string | undefined;
  lastName?: string | undefined;
  businessName?: string | undefined;
  gstin?: string | undefined;
}

export interface LoginData {
  email?: string | undefined;
  phone?: string | undefined;
  password: string;
}

export interface TokenPayload {
  userId: string;
  email?: string | undefined;
  phone?: string | undefined;
  verificationTier: string;
  userType: string;
  businessName?: string;
  role?: string;
  isAdmin?: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export class AuthService {
  /**
   * Hash password using bcrypt
   */
  static async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Verify password against hash
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT tokens
   */
  static generateTokens(payload: TokenPayload): AuthTokens {
    const accessToken = jwt.sign(
      payload as object,
      config.jwt.secret,
      {
        expiresIn: config.jwt.expiresIn,
        issuer: 'vikareta-api',
        audience: 'vikareta-client',
      } as SignOptions
    );

    const refreshToken = jwt.sign(
      { userId: payload.userId } as object,
      config.jwt.refreshSecret,
      {
        expiresIn: config.jwt.refreshExpiresIn,
        issuer: 'vikareta-api',
        audience: 'vikareta-client',
      } as SignOptions
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: config.jwt.expiresIn,
    };
  }

  /**
   * Verify JWT access token
   */
  static verifyAccessToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, config.jwt.secret, {
        issuer: 'vikareta-api',
        audience: 'vikareta-client',
      } as VerifyOptions) as TokenPayload;
    } catch (error) {
      logger.error('Access token verification failed:', error);
      throw new Error('Invalid or expired access token');
    }
  }

  /**
   * Verify JWT refresh token
   */
  static verifyRefreshToken(token: string): { userId: string } {
    try {
      return jwt.verify(token, config.jwt.refreshSecret, {
        issuer: 'vikareta-api',
        audience: 'vikareta-client',
      } as VerifyOptions) as { userId: string };
    } catch (error) {
      logger.error('Refresh token verification failed:', error);
      throw new Error('Invalid or expired refresh token');
    }
  }

  /**
   * Register new user
   */
  static async register(data: RegisterData) {
    try {
      // Validate that either email or phone is provided
      if (!data.email && !data.phone) {
        throw new Error('Either email or phone number is required');
      }

      // Check if user already exists
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            data.email ? { email: data.email } : {},
            data.phone ? { phone: data.phone } : {},
          ].filter(condition => Object.keys(condition).length > 0),
        },
      });

      if (existingUser) {
        throw new Error('User already exists with this email or phone number');
      }

      // Hash password
      const passwordHash = await this.hashPassword(data.password);

      // Create user
      const user = await prisma.user.create({
        data: {
          email: data.email || null,
          phone: data.phone || null,
          passwordHash,
          firstName: data.firstName || null,
          lastName: data.lastName || null,
          businessName: data.businessName || null,
          gstin: data.gstin || null,
          verificationTier: 'basic',
          isVerified: false,
        },
        select: {
          id: true,
          email: true,
          phone: true,
          firstName: true,
          lastName: true,
          businessName: true,
          gstin: true,
          userType: true,
          verificationTier: true,
          isVerified: true,
          createdAt: true,
        },
      });

      // Create wallet for the user
      await prisma.wallet.create({
        data: {
          userId: user.id,
          availableBalance: 0,
          lockedBalance: 0,
          negativeBalance: 0,
        },
      });

      // Create shopping cart for the user
      await prisma.shoppingCart.create({
        data: {
          userId: user.id,
        },
      });

      // Generate tokens
      const tokens = this.generateTokens({
        userId: user.id,
        email: user.email ?? undefined,
        phone: user.phone ?? undefined,
        verificationTier: user.verificationTier,
        userType: user.userType || 'user',
      });

      logger.info(`User registered successfully: ${user.id}`);

      return {
        user,
        tokens,
      };
    } catch (error) {
      logger.error('User registration failed:', error);
      throw error;
    }
  }

  /**
   * Login user
   */
  static async login(data: LoginData) {
    try {
      // Validate that either email or phone is provided
      if (!data.email && !data.phone) {
        throw new Error('Either email or phone number is required');
      }

      // Find user
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            data.email ? { email: data.email } : {},
            data.phone ? { phone: data.phone } : {},
          ].filter(condition => Object.keys(condition).length > 0),
        },
        select: {
          id: true,
          email: true,
          phone: true,
          passwordHash: true,
          firstName: true,
          lastName: true,
          businessName: true,
          gstin: true,
          userType: true,
          verificationTier: true,
          isVerified: true,
          createdAt: true,
        },
      });

      if (!user || !user.passwordHash) {
        throw new Error('Invalid credentials');
      }

      // Verify password
      const isPasswordValid = await this.verifyPassword(data.password, user.passwordHash);
      if (!isPasswordValid) {
        throw new Error('Invalid credentials');
      }

      // Generate tokens
      const tokens = this.generateTokens({
        userId: user.id,
        email: user.email ?? undefined,
        phone: user.phone ?? undefined,
        verificationTier: user.verificationTier,
        userType: user.userType || 'user',
      });

      // Remove password hash from response
      const { passwordHash, ...userWithoutPassword } = user;

      logger.info(`User logged in successfully: ${user.id}`);

      return {
        user: userWithoutPassword,
        tokens,
      };
    } catch (error) {
      logger.error('User login failed:', error);
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  static async refreshToken(refreshToken: string) {
    try {
      // Verify refresh token
      const { userId } = this.verifyRefreshToken(refreshToken);

      // Get user details
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          phone: true,
          userType: true,
          verificationTier: true,
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Generate new tokens
      const tokens = this.generateTokens({
        userId: user.id,
        email: user.email ?? undefined,
        phone: user.phone ?? undefined,
        verificationTier: user.verificationTier,
        userType: user.userType || 'user',
      });

      logger.info(`Token refreshed successfully: ${user.id}`);

      return tokens;
    } catch (error) {
      logger.error('Token refresh failed:', error);
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  static async getUserById(userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          phone: true,
          firstName: true,
          lastName: true,
          businessName: true,
          gstin: true,
          verificationTier: true,
          isVerified: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      return user;
    } catch (error) {
      logger.error('Get user by ID failed:', error);
      throw error;
    }
  }

  /**
   * Reset user password
   */
  static async resetPassword(identifier: string, type: 'email' | 'phone', newPassword: string) {
    try {
      // Find user by email or phone
      const user = await prisma.user.findFirst({
        where: type === 'email' ? { email: identifier } : { phone: identifier },
        select: {
          id: true,
          email: true,
          phone: true,
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Hash new password
      const passwordHash = await this.hashPassword(newPassword);

      // Update user password
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });

      logger.info(`Password reset successfully for user: ${user.id}`);

      return user;
    } catch (error) {
      logger.error('Password reset failed:', error);
      throw error;
    }
  }

  /**
   * Change user password
   */
  static async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    try {
      // Get user with current password hash
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, passwordHash: true },
      });

      if (!user) {
        throw new Error('User not found');
      }

      if (!user.passwordHash) {
        throw new Error('User has no password set');
      }

      // Verify current password
      const isCurrentPasswordValid = await this.verifyPassword(currentPassword, user.passwordHash);
      if (!isCurrentPasswordValid) {
        throw new Error('Invalid current password');
      }

      // Hash new password
      const newPasswordHash = await this.hashPassword(newPassword);

      // Update password
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
      });

      logger.info(`Password changed successfully for user: ${userId}`);
    } catch (error) {
      logger.error('Change password failed:', error);
      throw error;
    }
  }
}
export const authService = new AuthService();