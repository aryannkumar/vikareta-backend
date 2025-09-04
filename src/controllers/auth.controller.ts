import { Request, Response } from 'express';
import { AuthService } from '@/services/auth.service';
import { UserService } from '@/services/user.service';
import { logger } from '@/utils/logger';
import { ValidationError, AuthenticationError } from '@/middleware/error-handler';

export class AuthController {
  private authService: AuthService;
  private userService: UserService;

  constructor() {
    this.authService = new AuthService();
    this.userService = new UserService();
  }

  /**
   * Register a new user
   */
  async register(req: Request, res: Response): Promise<void> {
    try {
      const userData = req.body;

      // Validate that either email or phone is provided
      if (!userData.email && !userData.phone) {
        throw new ValidationError('Either email or phone is required');
      }

      const result = await this.authService.register(userData);

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: result,
      });
    } catch (error) {
      logger.error('Registration error:', error);
      throw error;
    }
  }

  /**
   * Login user
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, phone, password } = req.body;

      if (!email && !phone) {
        throw new ValidationError('Either email or phone is required');
      }

      const result = await this.authService.login({ email, phone, password });

      // Set refresh token as HTTP-only cookie
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          accessToken: result.accessToken,
          user: result.user,
        },
      });
    } catch (error) {
      logger.error('Login error:', error);
      throw error;
    }
  }

  /**
   * Logout user
   */
  async logout(req: Request, res: Response): Promise<void> {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (token) {
        await this.authService.logout(token);
      }

      // Clear refresh token cookie
      res.clearCookie('refreshToken');

      res.json({
        success: true,
        message: 'Logout successful',
      });
    } catch (error) {
      logger.error('Logout error:', error);
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

      if (!refreshToken) {
        throw new AuthenticationError('Refresh token is required');
      }

      const result = await this.authService.refreshToken(refreshToken);

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: result,
      });
    } catch (error) {
      logger.error('Refresh token error:', error);
      throw error;
    }
  }

  /**
   * Forgot password
   */
  async forgotPassword(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;

      await this.authService.forgotPassword(email);

      res.json({
        success: true,
        message: 'Password reset email sent successfully',
      });
    } catch (error) {
      logger.error('Forgot password error:', error);
      throw error;
    }
  }

  /**
   * Reset password
   */
  async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const { token, password } = req.body;

      await this.authService.resetPassword(token, password);

      res.json({
        success: true,
        message: 'Password reset successfully',
      });
    } catch (error) {
      logger.error('Reset password error:', error);
      throw error;
    }
  }

  /**
   * Change password
   */
  async changePassword(req: Request, res: Response): Promise<void> {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user!.id;

      await this.userService.changePassword(userId, currentPassword, newPassword);

      res.json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error) {
      logger.error('Change password error:', error);
      throw error;
    }
  }

  /**
   * Get user profile
   */
  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const user = await this.userService.getUserById(userId);

      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      logger.error('Get profile error:', error);
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const updateData = req.body;

      const user = await this.userService.updateUser(userId, updateData);

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: user,
      });
    } catch (error) {
      logger.error('Update profile error:', error);
      throw error;
    }
  }

  /**
   * Send OTP
   */
  async sendOTP(req: Request, res: Response): Promise<void> {
    try {
      const { phone } = req.body;

      await this.authService.sendOTP(phone);

      res.json({
        success: true,
        message: 'OTP sent successfully',
      });
    } catch (error) {
      logger.error('Send OTP error:', error);
      throw error;
    }
  }

  /**
   * Verify OTP
   */
  async verifyOTP(req: Request, res: Response): Promise<void> {
    try {
      const { phone, otp } = req.body;

      const result = await this.authService.verifyOTP(phone, otp);

      res.json({
        success: true,
        message: 'OTP verified successfully',
        data: result,
      });
    } catch (error) {
      logger.error('Verify OTP error:', error);
      throw error;
    }
  }

  /**
   * Google OAuth
   */
  async googleAuth(req: Request, res: Response): Promise<void> {
    try {
      const authUrl = await this.authService.getGoogleAuthUrl();
      res.redirect(authUrl);
    } catch (error) {
      logger.error('Google auth error:', error);
      throw error;
    }
  }

  /**
   * Google OAuth callback
   */
  async googleCallback(req: Request, res: Response): Promise<void> {
    try {
      const { code } = req.query;

      if (!code || typeof code !== 'string') {
        throw new ValidationError('Authorization code is required');
      }

      const result = await this.authService.handleGoogleCallback(code);

      // Set refresh token as HTTP-only cookie
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      // Redirect to frontend with access token
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/auth/callback?token=${result.accessToken}`);
    } catch (error) {
      logger.error('Google callback error:', error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/auth/error`);
    }
  }

  /**
   * LinkedIn OAuth
   */
  async linkedinAuth(req: Request, res: Response): Promise<void> {
    try {
      const authUrl = await this.authService.getLinkedInAuthUrl();
      res.redirect(authUrl);
    } catch (error) {
      logger.error('LinkedIn auth error:', error);
      throw error;
    }
  }

  /**
   * LinkedIn OAuth callback
   */
  async linkedinCallback(req: Request, res: Response): Promise<void> {
    try {
      const { code } = req.query;

      if (!code || typeof code !== 'string') {
        throw new ValidationError('Authorization code is required');
      }

      const result = await this.authService.handleLinkedInCallback(code);

      // Set refresh token as HTTP-only cookie
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      // Redirect to frontend with access token
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/auth/callback?token=${result.accessToken}`);
    } catch (error) {
      logger.error('LinkedIn callback error:', error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/auth/error`);
    }
  }

  /**
   * Send verification email
   */
  async sendVerificationEmail(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      await this.authService.sendVerificationEmail(userId);

      res.json({
        success: true,
        message: 'Verification email sent successfully',
      });
    } catch (error) {
      logger.error('Send verification email error:', error);
      throw error;
    }
  }

  /**
   * Verify email
   */
  async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.params;

      await this.authService.verifyEmail(token);

      res.json({
        success: true,
        message: 'Email verified successfully',
      });
    } catch (error) {
      logger.error('Verify email error:', error);
      throw error;
    }
  }

  /**
   * Enable two-factor authentication
   */
  async enableTwoFactor(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      const result = await this.authService.enableTwoFactor(userId);

      res.json({
        success: true,
        message: 'Two-factor authentication setup initiated',
        data: result,
      });
    } catch (error) {
      logger.error('Enable 2FA error:', error);
      throw error;
    }
  }

  /**
   * Disable two-factor authentication
   */
  async disableTwoFactor(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      await this.authService.disableTwoFactor(userId);

      res.json({
        success: true,
        message: 'Two-factor authentication disabled successfully',
      });
    } catch (error) {
      logger.error('Disable 2FA error:', error);
      throw error;
    }
  }

  /**
   * Verify two-factor authentication token
   */
  async verifyTwoFactor(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { token } = req.body;

      const result = await this.authService.verifyTwoFactor(userId, token);

      res.json({
        success: true,
        message: 'Two-factor authentication verified successfully',
        data: result,
      });
    } catch (error) {
      logger.error('Verify 2FA error:', error);
      throw error;
    }
  }

  /**
   * Get user sessions
   */
  async getSessions(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      const sessions = await this.authService.getUserSessions(userId);

      res.json({
        success: true,
        data: sessions,
      });
    } catch (error) {
      logger.error('Get sessions error:', error);
      throw error;
    }
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { sessionId } = req.params;

      await this.authService.revokeSession(userId, sessionId);

      res.json({
        success: true,
        message: 'Session revoked successfully',
      });
    } catch (error) {
      logger.error('Revoke session error:', error);
      throw error;
    }
  }

  /**
   * Revoke all sessions
   */
  async revokeAllSessions(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      await this.authService.revokeAllSessions(userId);

      res.json({
        success: true,
        message: 'All sessions revoked successfully',
      });
    } catch (error) {
      logger.error('Revoke all sessions error:', error);
      throw error;
    }
  }
}