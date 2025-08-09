import { PrismaClient } from '@prisma/client';
import { AuthService } from './auth.service';
import { logger } from '@/utils/logger';

const prisma = new PrismaClient();

export interface GoogleProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
}

export interface LinkedInProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
  headline?: string;
  industry?: string;
  location?: string;
}

export interface SocialLoginResult {
  user: any;
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
  };
  isNewUser: boolean;
}

export class SocialAuthService {
  /**
   * Handle Google OAuth login/registration
   */
  static async handleGoogleAuth(
    profile: GoogleProfile,
    accessToken: string,
    refreshToken?: string
  ): Promise<SocialLoginResult> {
    try {
      // Validate email is provided
      if (!profile.email || profile.email.trim() === '') {
        throw new Error('Email not provided by Google');
      }
      // Check if user exists with this Google ID
      let socialLogin = await prisma.socialLogin.findFirst({
        where: {
          provider: 'google',
          providerId: profile.id,
        },
        include: {
          user: {
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
              updatedAt: true,
            },
          },
        },
      });

      let user;
      let isNewUser = false;

      if (socialLogin) {
        // Update tokens
        await prisma.socialLogin.update({
          where: { id: socialLogin.id },
          data: {
            accessToken,
            refreshToken: refreshToken || null,
          },
        });
        user = socialLogin.user;
      } else {
        // Check if user exists with this email
        const existingUser = await prisma.user.findUnique({
          where: { email: profile.email },
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
            updatedAt: true,
          },
        });

        if (existingUser) {
          // Link Google account to existing user
          await prisma.socialLogin.create({
            data: {
              userId: existingUser.id,
              provider: 'google',
              providerId: profile.id,
              accessToken,
              refreshToken: refreshToken || null,
            },
          });
          user = existingUser;
        } else {
          // Create new user
          const newUser = await prisma.user.create({
            data: {
              email: profile.email,
              firstName: profile.firstName || null,
              lastName: profile.lastName || null,
              verificationTier: 'basic',
              isVerified: true, // Google accounts are considered verified
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
              updatedAt: true,
            },
          });

          // Create social login record
          await prisma.socialLogin.create({
            data: {
              userId: newUser.id,
              provider: 'google',
              providerId: profile.id,
              accessToken,
              refreshToken: refreshToken || null,
            },
          });

          // Create wallet for the user
          await prisma.wallet.create({
            data: {
              userId: newUser.id,
              availableBalance: 0,
              lockedBalance: 0,
              negativeBalance: 0,
            },
          });

          // Create shopping cart for the user
          await prisma.shoppingCart.create({
            data: {
              userId: newUser.id,
            },
          });

          user = newUser;
          isNewUser = true;
        }
      }

      // Generate JWT tokens
      const tokens = AuthService.generateTokens({
        userId: user.id,
        email: user.email ?? undefined,
        phone: user.phone ?? undefined,
        userType: user.userType || 'user',
        verificationTier: user.verificationTier,
      });

      logger.info(`Google auth successful for user: ${user.id}, isNewUser: ${isNewUser}`);

      return {
        user,
        tokens,
        isNewUser,
      };
    } catch (error) {
      logger.error('Google auth failed:', error);
      throw error;
    }
  }

  /**
   * Handle LinkedIn OAuth login/registration
   */
  static async handleLinkedInAuth(
    profile: LinkedInProfile,
    accessToken: string,
    refreshToken?: string
  ): Promise<SocialLoginResult> {
    try {
      // Validate email is provided
      if (!profile.email || profile.email.trim() === '') {
        throw new Error('Email not provided by LinkedIn');
      }
      // Check if user exists with this LinkedIn ID
      let socialLogin = await prisma.socialLogin.findFirst({
        where: {
          provider: 'linkedin',
          providerId: profile.id,
        },
        include: {
          user: {
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
              updatedAt: true,
            },
          },
        },
      });

      let user;
      let isNewUser = false;

      if (socialLogin) {
        // Update tokens
        await prisma.socialLogin.update({
          where: { id: socialLogin.id },
          data: {
            accessToken,
            refreshToken: refreshToken || null,
          },
        });
        user = socialLogin.user;
      } else {
        // Check if user exists with this email
        const existingUser = await prisma.user.findUnique({
          where: { email: profile.email },
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
            updatedAt: true,
          },
        });

        if (existingUser) {
          // Link LinkedIn account to existing user
          await prisma.socialLogin.create({
            data: {
              userId: existingUser.id,
              provider: 'linkedin',
              providerId: profile.id,
              accessToken,
              refreshToken: refreshToken || null,
            },
          });
          user = existingUser;
        } else {
          // Create new user with LinkedIn professional data
          const newUser = await prisma.user.create({
            data: {
              email: profile.email,
              firstName: profile.firstName || null,
              lastName: profile.lastName || null,
              // Use LinkedIn headline as business name if available
              businessName: profile.headline || null,
              verificationTier: 'standard', // LinkedIn users get standard tier
              isVerified: true, // LinkedIn accounts are considered verified
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
              updatedAt: true,
            },
          });

          // Create social login record
          await prisma.socialLogin.create({
            data: {
              userId: newUser.id,
              provider: 'linkedin',
              providerId: profile.id,
              accessToken,
              refreshToken: refreshToken || null,
            },
          });

          // Create wallet for the user
          await prisma.wallet.create({
            data: {
              userId: newUser.id,
              availableBalance: 0,
              lockedBalance: 0,
              negativeBalance: 0,
            },
          });

          // Create shopping cart for the user
          await prisma.shoppingCart.create({
            data: {
              userId: newUser.id,
            },
          });

          user = newUser;
          isNewUser = true;
        }
      }

      // Generate JWT tokens
      const tokens = AuthService.generateTokens({
        userId: user.id,
        email: user.email ?? undefined,
        phone: user.phone ?? undefined,
        userType: user.userType || 'user',
        verificationTier: user.verificationTier,
      });

      logger.info(`LinkedIn auth successful for user: ${user.id}, isNewUser: ${isNewUser}`);

      return {
        user,
        tokens,
        isNewUser,
      };
    } catch (error) {
      logger.error('LinkedIn auth failed:', error);
      throw error;
    }
  }

  /**
   * Link social account to existing user
   */
  static async linkSocialAccount(
    userId: string,
    provider: 'google' | 'linkedin',
    providerId: string,
    accessToken: string,
    refreshToken?: string
  ): Promise<void> {
    try {
      // Check if this social account is already linked to another user
      const existingSocialLogin = await prisma.socialLogin.findFirst({
        where: {
          provider,
          providerId,
        },
      });

      if (existingSocialLogin && existingSocialLogin.userId !== userId) {
        throw new Error(`This ${provider} account is already linked to another user`);
      }

      if (existingSocialLogin && existingSocialLogin.userId === userId) {
        // Update tokens
        await prisma.socialLogin.update({
          where: { id: existingSocialLogin.id },
          data: {
            accessToken,
            refreshToken: refreshToken || null,
          },
        });
      } else {
        // Create new social login record
        await prisma.socialLogin.create({
          data: {
            userId,
            provider,
            providerId,
            accessToken,
            refreshToken: refreshToken || null,
          },
        });
      }

      logger.info(`${provider} account linked to user: ${userId}`);
    } catch (error) {
      logger.error(`Failed to link ${provider} account:`, error);
      throw error;
    }
  }

  /**
   * Unlink social account from user
   */
  static async unlinkSocialAccount(
    userId: string,
    provider: 'google' | 'linkedin'
  ): Promise<void> {
    try {
      const socialLogin = await prisma.socialLogin.findFirst({
        where: {
          userId,
          provider,
        },
      });

      if (!socialLogin) {
        throw new Error(`${provider} account is not linked to this user`);
      }

      await prisma.socialLogin.delete({
        where: { id: socialLogin.id },
      });

      logger.info(`${provider} account unlinked from user: ${userId}`);
    } catch (error) {
      logger.error(`Failed to unlink ${provider} account:`, error);
      throw error;
    }
  }

  /**
   * Get user's linked social accounts
   */
  static async getUserSocialAccounts(userId: string) {
    try {
      const socialLogins = await prisma.socialLogin.findMany({
        where: { userId },
        select: {
          id: true,
          provider: true,
          providerId: true,
          createdAt: true,
        },
      });

      return socialLogins;
    } catch (error) {
      logger.error('Failed to get user social accounts:', error);
      throw error;
    }
  }

  /**
   * Handle account merging when user logs in with different social providers
   */
  static async handleAccountMerging(
    primaryUserId: string,
    secondaryUserId: string
  ): Promise<void> {
    try {
      // This is a complex operation that should be done in a transaction
      await prisma.$transaction(async (tx) => {
        // Move social logins from secondary to primary account
        await tx.socialLogin.updateMany({
          where: { userId: secondaryUserId },
          data: { userId: primaryUserId },
        });

        // Move other related data (orders, quotes, etc.) if needed
        // This would depend on business requirements

        // Delete secondary user account
        await tx.user.delete({
          where: { id: secondaryUserId },
        });
      });

      logger.info(`Account merged: ${secondaryUserId} -> ${primaryUserId}`);
    } catch (error) {
      logger.error('Account merging failed:', error);
      throw error;
    }
  }
}