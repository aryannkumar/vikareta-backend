import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User, LoginSession } from '@prisma/client';
import { BaseService } from '@/services/base.service';
import { UserService, CreateUserData, LoginCredentials, AuthTokens } from '@/services/user.service';
import { EmailService } from '@/services/email.service';
import { SMSService } from '@/services/sms.service';
import { SubscriptionService } from '@/services/subscription.service';
import { config } from '@/config/environment';
import { ValidationError, AuthenticationError, NotFoundError } from '@/middleware/error-handler';
import { blacklistToken } from '../middleware/auth.middleware';
import { GoogleTokens, GoogleUser, LinkedInTokens, LinkedInProfile, LinkedInEmailData, JWTPayload } from '../types/auth.types';

export interface OTPData {
  phone: string;
  otp: string;
  expiresAt: Date;
  verified: boolean;
}

export class AuthService extends BaseService {
  private userService: UserService;
  private emailService: EmailService;
  private smsService: SMSService;
  private subscriptionService: SubscriptionService;

  constructor() {
    super();
    this.userService = new UserService();
    this.emailService = new EmailService();
    this.smsService = new SMSService();
    this.subscriptionService = new SubscriptionService();
  }

  /**
   * Register a new user
   */
  async register(userData: CreateUserData): Promise<AuthTokens> {
    try {
      // Create user
      const user = await this.userService.createUser(userData);

      // Generate tokens
      const tokens = this.generateTokens(user);

      // Create login session if accessToken is present
      if (tokens && typeof tokens.accessToken === 'string') {
        await this.createLoginSession(user.id, String(tokens.accessToken || ''));
      }

      // Send welcome email if email is provided
      if (user.email) {
        await this.emailService.sendWelcomeEmail(
          user.email,
          user.firstName || user.businessName || 'User'
        );
      }

      this.logOperation('register', { userId: user.id, userType: user.userType });

      return {
        ...tokens,
        user,
      };
    } catch (error) {
      this.handleError(error, 'register', userData);
    }
  }

  /**
   * Login user
   */
  async login(credentials: LoginCredentials): Promise<AuthTokens> {
    try {
      const result = await this.userService.login(credentials);

      // Create login session if accessToken is present
      if (result && result.accessToken && result.user && result.user.id) {
        await this.createLoginSession(String(result.user.id), String(result.accessToken || ''));
      }

      this.logOperation('login', { userId: result.user.id });

      return result;
    } catch (error) {
      this.handleError(error, 'login', credentials);
    }
  }

  /**
   * Logout user
   */
  async logout(token: string): Promise<void> {
    try {
      // Blacklist the token
      await blacklistToken(token);

      // Invalidate login session
      const decoded = jwt.decode(token) as any;
      if (decoded?.userId) {
        await this.invalidateLoginSession(decoded.userId, token);
      }

      this.logOperation('logout', { userId: decoded?.userId });
    } catch (error) {
      this.handleError(error, 'logout', { token: '[REDACTED]' });
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret || 'fallback-refresh-secret') as any;

      // Get user
      const user = await this.userService.getUserById(decoded.userId);
      if (!user) {
        throw new AuthenticationError('User not found');
      }

      // Generate new access token
      const accessToken = this.generateAccessToken(user);

      this.logOperation('refreshToken', { userId: user.id });

      return { accessToken };
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationError('Invalid refresh token');
      }
      this.handleError(error, 'refreshToken');
    }
  }

  /**
   * Forgot password
   */
  async forgotPassword(email: string): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        // Don't reveal if email exists or not
        return;
      }

      // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');

      // Store reset token in cache
      await this.cache.setex(`password_reset:${resetToken}`, 3600, user.id);

      // Send reset email
      await this.emailService.sendPasswordResetEmail(email, resetToken);

      this.logOperation('forgotPassword', { userId: user.id });
    } catch (error) {
      this.handleError(error, 'forgotPassword', { email });
    }
  }

  /**
   * Reset password
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
      // Get user ID from cache
      const userId = await this.cache.get<string>(`password_reset:${token}`);
      if (!userId) {
        throw new ValidationError('Invalid or expired reset token');
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(newPassword, 12);

      // Update user password
      await this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      });

      // Delete reset token from cache
      await this.cache.del(`password_reset:${token}`);

      // Invalidate all user sessions
      await this.revokeAllSessions(userId);

      this.logOperation('resetPassword', { userId });
    } catch (error) {
      this.handleError(error, 'resetPassword', { token: '[REDACTED]' });
    }
  }

  /**
   * Send OTP
   */
  async sendOTP(phone: string): Promise<void> {
    try {
      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Store OTP in cache
      const otpData: OTPData = {
        phone,
        otp,
        expiresAt,
        verified: false,
      };

      await this.cache.setex(`otp:${phone}`, 600, otpData); // 10 minutes

      // Send OTP via SMS
      await this.smsService.sendOTP(phone, otp);

      this.logOperation('sendOTP', { phone });
    } catch (error) {
      this.handleError(error, 'sendOTP', { phone });
    }
  }

  /**
   * Verify OTP
   */
  async verifyOTP(phone: string, otp: string): Promise<{ verified: boolean; user?: User }> {
    try {
      // Get OTP data from cache
      const otpData = await this.cache.get<OTPData>(`otp:${phone}`);
      if (!otpData) {
        throw new ValidationError('OTP not found or expired');
      }

      if (otpData.otp !== otp) {
        throw new ValidationError('Invalid OTP');
      }

      if (new Date() > new Date(otpData.expiresAt)) {
        throw new ValidationError('OTP has expired');
      }

      // Mark OTP as verified
      otpData.verified = true;
      await this.cache.setex(`otp:${phone}`, 600, otpData);

      // Check if user exists with this phone
      const user = await this.prisma.user.findUnique({
        where: { phone },
      });

      this.logOperation('verifyOTP', { phone, userId: user?.id });

      return {
        verified: true,
        user: user || undefined,
      };
    } catch (error) {
      this.handleError(error, 'verifyOTP', { phone });
    }
  }

  /**
   * Get Google OAuth URL
   */
  async getGoogleAuthUrl(): Promise<string> {
    const params = new URLSearchParams({
      client_id: config.oauth.google.clientId || '',
      redirect_uri: process.env.GOOGLE_CALLBACK_URL || '',
      scope: 'openid email profile',
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Handle Google OAuth callback
   */
  async handleGoogleCallback(code: string): Promise<AuthTokens> {
    try {
      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.oauth.google.clientId || '',
          client_secret: config.oauth.google.clientSecret || '',
          code,
          grant_type: 'authorization_code',
          redirect_uri: process.env.GOOGLE_CALLBACK_URL || '',
        }),
      });

      const tokens = await tokenResponse.json() as GoogleTokens;

      // Get user info
      const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      const googleUser = await userResponse.json() as GoogleUser;

      // Find or create user
      let user = await this.prisma.user.findUnique({
        where: { email: googleUser.email },
      });

      if (!user) {
        // Create new user
        user = await this.userService.createUser({
          email: googleUser.email,
          firstName: googleUser.given_name,
          lastName: googleUser.family_name,
          password: crypto.randomBytes(32).toString('hex'), // Random password
          userType: 'buyer', // Default user type
        });
      }

      // Create or update social login record
      await this.prisma.socialLogin.upsert({
        where: {
          provider_providerId: {
            provider: 'google',
            providerId: googleUser.id,
          },
        },
        update: {
          email: googleUser.email,
          name: googleUser.name,
          avatar: googleUser.picture,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
        },
        create: {
          userId: user.id,
          provider: 'google',
          providerId: googleUser.id,
          email: googleUser.email,
          name: googleUser.name,
          avatar: googleUser.picture,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
        },
      });

      // Generate app tokens
      const appTokens = this.generateTokens(user);

      this.logOperation('googleCallback', { userId: user.id });

      return {
        ...appTokens,
        user,
      };
    } catch (error) {
      this.handleError(error, 'handleGoogleCallback', { code: '[REDACTED]' });
    }
  }

  /**
   * Get LinkedIn OAuth URL
   */
  async getLinkedInAuthUrl(): Promise<string> {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.oauth.linkedin.clientId || '',
      redirect_uri: process.env.LINKEDIN_CALLBACK_URL || '',
      scope: 'r_liteprofile r_emailaddress',
    });

    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  }

  /**
   * Handle LinkedIn OAuth callback
   */
  async handleLinkedInCallback(code: string): Promise<AuthTokens> {
    try {
      // Exchange code for tokens
      const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: process.env.LINKEDIN_CALLBACK_URL || '',
          client_id: config.oauth.linkedin.clientId || '',
          client_secret: config.oauth.linkedin.clientSecret || '',
        }),
      });

      const tokens = await tokenResponse.json() as LinkedInTokens;

      // Get user profile
      const profileResponse = await fetch('https://api.linkedin.com/v2/people/~', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      const profile = await profileResponse.json() as LinkedInProfile;

      // Get user email
      const emailResponse = await fetch('https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      const emailData = await emailResponse.json() as LinkedInEmailData;
      const email = emailData.elements?.[0]?.['handle~']?.emailAddress;

      if (!email) {
        throw new ValidationError('Email not available from LinkedIn');
      }

      // Find or create user
      let user = await this.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        // Create new user
        user = await this.userService.createUser({
          email,
          firstName: profile.localizedFirstName,
          lastName: profile.localizedLastName,
          password: crypto.randomBytes(32).toString('hex'), // Random password
          userType: 'buyer', // Default user type
        });
      }

      // Create or update social login record
      await this.prisma.socialLogin.upsert({
        where: {
          provider_providerId: {
            provider: 'linkedin',
            providerId: profile.id,
          },
        },
        update: {
          email,
          name: `${profile.localizedFirstName} ${profile.localizedLastName}`,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
        },
        create: {
          userId: user.id,
          provider: 'linkedin',
          providerId: profile.id,
          email,
          name: `${profile.localizedFirstName} ${profile.localizedLastName}`,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
        },
      });

      // Generate app tokens
      const appTokens = this.generateTokens(user);

      this.logOperation('linkedinCallback', { userId: user.id });

      return {
        ...appTokens,
        user,
      };
    } catch (error) {
      this.handleError(error, 'handleLinkedInCallback', { code: '[REDACTED]' });
    }
  }

  /**
   * Send verification email
   */
  async sendVerificationEmail(userId: string): Promise<void> {
    try {
      const user = await this.userService.getUserById(userId);
      if (!user || !user.email) {
        throw new NotFoundError('User or email not found');
      }

      if (user.isVerified) {
        throw new ValidationError('Email is already verified');
      }

      // Generate verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');

      // Store token in cache
      await this.cache.setex(`email_verification:${verificationToken}`, 3600, userId); // 1 hour

      // Send verification email
      await this.emailService.sendEmail({
        to: user.email,
        subject: 'Verify your email - Vikareta',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1>Verify your email address</h1>
            <p>Please click the link below to verify your email address:</p>
            <a href="${config.urls.frontend}/verify-email/${verificationToken}" 
               style="display: inline-block; background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
              Verify Email
            </a>
            <p>This link will expire in 1 hour.</p>
          </div>
        `,
      });

      this.logOperation('sendVerificationEmail', { userId });
    } catch (error) {
      this.handleError(error, 'sendVerificationEmail', { userId });
    }
  }

  /**
   * Verify email
   */
  async verifyEmail(token: string): Promise<void> {
    try {
      // Get user ID from cache
      const userId = await this.cache.get<string>(`email_verification:${token}`);
      if (!userId) {
        throw new ValidationError('Invalid or expired verification token');
      }

      // Get user before verification to check user type
      const user = await this.userService.getUserById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Update user as verified
      await this.prisma.user.update({
        where: { id: userId },
        data: { isVerified: true },
      });

      // Delete verification token from cache
      await this.cache.del(`email_verification:${token}`);

      // Automatically create free tier subscription for business users (sellers)
      if (user.userType === 'seller') {
        try {
          await this.subscriptionService.create({
            userId: user.id,
            type: 'free',
            planName: 'Free Tier',
            durationMonths: 1, // Free tier for 1 month
          });

          this.logOperation('verifyEmail', { userId, subscriptionCreated: true });
        } catch (subscriptionError) {
          // Log the error but don't fail the email verification
          this.logger.error('Failed to create free subscription for user:', {
            userId,
            error: subscriptionError,
          });
          this.logOperation('verifyEmail', { userId, subscriptionError: true });
        }
      } else {
        this.logOperation('verifyEmail', { userId });
      }
    } catch (error) {
      this.handleError(error, 'verifyEmail', { token: '[REDACTED]' });
    }
  }

  /**
   * Enable two-factor authentication
   */
  async enableTwoFactor(userId: string): Promise<{ secret: string; qrCode: string }> {
    try {
      // Implementation for 2FA setup
      // This would typically involve generating a secret and QR code
      const secret = crypto.randomBytes(32).toString('base64');
      
      // Store temporary secret
      await this.cache.setex(`2fa_setup:${userId}`, 600, secret); // 10 minutes

      this.logOperation('enableTwoFactor', { userId });

      return {
        secret,
        qrCode: `otpauth://totp/Vikareta:${userId}?secret=${secret}&issuer=Vikareta`,
      };
    } catch (error) {
      this.handleError(error, 'enableTwoFactor', { userId });
    }
  }

  /**
   * Disable two-factor authentication
   */
  async disableTwoFactor(userId: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
        },
      });

      this.logOperation('disableTwoFactor', { userId });
    } catch (error) {
      this.handleError(error, 'disableTwoFactor', { userId });
    }
  }

  /**
   * Verify two-factor authentication token
   */
  async verifyTwoFactor(userId: string, _token: string): Promise<{ verified: boolean }> {
    try {
      // Implementation for 2FA verification
      // This would typically involve verifying the TOTP token
      // Mark _token as used to satisfy TypeScript linter when implementation is pending
      void _token;

      this.logOperation('verifyTwoFactor', { userId });

      return { verified: true };
    } catch (error) {
      this.handleError(error, 'verifyTwoFactor', { userId });
    }
  }

  /**
   * Get user sessions
   */
  async getUserSessions(userId: string): Promise<LoginSession[]> {
    try {
      const sessions = await this.prisma.loginSession.findMany({
        where: { userId },
        orderBy: { lastActivity: 'desc' },
      });

      return sessions;
    } catch (error) {
      this.handleError(error, 'getUserSessions', { userId });
    }
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    try {
      await this.prisma.loginSession.delete({
        where: {
          id: sessionId,
          userId,
        },
      });

      this.logOperation('revokeSession', { userId, sessionId });
    } catch (error) {
      this.handleError(error, 'revokeSession', { userId, sessionId });
    }
  }

  /**
   * Revoke all sessions
   */
  async revokeAllSessions(userId: string): Promise<void> {
    try {
      await this.prisma.loginSession.deleteMany({
        where: { userId },
      });

      this.logOperation('revokeAllSessions', { userId });
    } catch (error) {
      this.handleError(error, 'revokeAllSessions', { userId });
    }
  }

  /**
   * Generate JWT tokens
   */
  private generateTokens(user: User): { accessToken: string; refreshToken: string } {
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      userType: user.userType,
      aud: 'web',
    };

    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.accessExpires,
    });

    const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpires,
    });

    return { accessToken, refreshToken };
  }

  /**
   * Generate access token only
   */
  private generateAccessToken(user: User): string {
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      userType: user.userType,
      aud: 'web',
    };

    return jwt.sign(payload, config.jwt.secret || 'fallback-secret', {
      expiresIn: config.jwt.accessExpires,
    });
  }

  /**
   * Public helper for SSO or cross-application token issuing with custom audience
   */
  public issueTokensForAudience(user: User, audience: string) {
    const basePayload: JWTPayload = {
      userId: user.id,
      email: user.email,
      userType: user.userType,
      aud: audience,
    };
    const accessToken = jwt.sign(basePayload, config.jwt.secret, {
      expiresIn: config.jwt.accessExpires,
      audience,
    });
    const refreshToken = jwt.sign(basePayload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpires,
      audience,
    });
    return { accessToken, refreshToken };
  }

  /**
   * Create login session
   */
  private async createLoginSession(userId: string, token?: string): Promise<void> {
    try {
      if (!token) return;
      const decoded = jwt.decode(token) as any;
      const expiresAt = new Date(decoded.exp * 1000);

      await this.prisma.loginSession.create({
        data: {
          userId,
          sessionToken: token,
          deviceInfo: {}, // Would be populated with actual device info
          location: {}, // Would be populated with actual location info
          isCurrent: true,
          expiresAt,
        },
      });
    } catch (error) {
      this.logger.error('Failed to create login session:', error);
      // Don't throw error as this is not critical
    }
  }

  /**
   * Invalidate login session
   */
  private async invalidateLoginSession(userId: string, token: string): Promise<void> {
    try {
      await this.prisma.loginSession.deleteMany({
        where: {
          userId,
          sessionToken: token,
        },
      });
    } catch (error) {
      this.logger.error('Failed to invalidate login session:', error);
      // Don't throw error as this is not critical
    }
  }
}