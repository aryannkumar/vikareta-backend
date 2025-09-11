import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '@/config/database';
import { redisClient } from '@/config/redis';
import { config } from '@/config/environment';
import { securityConfig, SecurityAudit } from '@/config/security';
import { logger } from '@/utils/logger';
import { BaseService } from '@/services/base.service';

// Define User type locally to avoid import issues
interface User {
  id: string;
  email?: string | null;
  phone?: string | null;
  userType: string;
  isVerified: boolean;
  role?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  businessName?: string | null;
}

export interface SSOConfig {
  domains: string[];
  cookieDomain: string;
  sessionTimeout: number;
  maxConcurrentSessions: number;
}

export interface SSOToken {
  userId: string;
  sessionId: string;
  domains: string[];
  issuedAt: number;
  expiresAt: number;
}

export interface SSOUser {
  id: string;
  email?: string;
  userType: string;
  isVerified: boolean;
  permissions: string[];
}

export class SSOService extends BaseService {
  private ssoConfig: SSOConfig;

  constructor() {
    super();
    this.ssoConfig = {
      domains: [
        'vikareta.com',
        'dashboard.vikareta.com',
        'admin.vikareta.com',
      ],
      cookieDomain: '.vikareta.com',
      sessionTimeout: 7 * 24 * 60 * 60 * 1000, // 7 days
      maxConcurrentSessions: 5,
    };
  }

  /**
   * Create SSO session for user
   */
  async createSSOSession(user: User): Promise<{ sessionId: string; ssoToken: string }> {
    try {
      const sessionId = crypto.randomBytes(32).toString('hex');
      const now = Date.now();

      // Create SSO token payload
      const ssoPayload: SSOToken = {
        userId: user.id,
        sessionId,
        domains: this.ssoConfig.domains,
        issuedAt: now,
        expiresAt: now + this.ssoConfig.sessionTimeout,
      };

      // Sign SSO token
      const ssoToken = jwt.sign(ssoPayload, config.jwt.secret, {
        issuer: 'vikareta-sso',
        audience: this.ssoConfig.domains,
        expiresIn: this.ssoConfig.sessionTimeout / 1000,
      });

      // Store session in Redis with user data
      const sessionData = {
        userId: user.id,
        email: user.email,
        userType: user.userType,
        isVerified: user.isVerified,
        sessionId,
        createdAt: now,
        lastActivity: now,
        domains: this.ssoConfig.domains,
      };

      await redisClient.setex(
        `sso:session:${sessionId}`,
        Math.ceil(this.ssoConfig.sessionTimeout / 1000),
        JSON.stringify(sessionData)
      );

      // Store user session mapping
      await redisClient.setex(
        `sso:user:${user.id}:session`,
        Math.ceil(this.ssoConfig.sessionTimeout / 1000),
        sessionId
      );

      // Track active sessions for user
      const activeSessionsKey = `sso:user:${user.id}:sessions`;
      await redisClient.sadd(activeSessionsKey, sessionId);

      // Clean up old sessions if limit exceeded
      await this.cleanupOldSessions(user.id);

      SecurityAudit.logSSOEvent('SESSION_CREATED', user.id, this.ssoConfig.domains.join(','), {
        sessionId,
        domains: this.ssoConfig.domains,
      });

      return { sessionId, ssoToken };
    } catch (error) {
      logger.error('Failed to create SSO session:', error);
      throw new Error('Failed to create SSO session');
    }
  }

  /**
   * Validate SSO token and get user data
   */
  async validateSSOToken(ssoToken: string, domain: string): Promise<SSOUser | null> {
    try {
      // Verify SSO token
      const decoded = jwt.verify(ssoToken, config.jwt.secret, {
        issuer: 'vikareta-sso',
        audience: domain,
      }) as SSOToken;

      // Check if session exists in Redis
      const sessionKey = `sso:session:${decoded.sessionId}`;
      const sessionData = await redisClient.get(sessionKey);

      if (!sessionData) {
        SecurityAudit.logSSOEvent('SESSION_EXPIRED', decoded.sessionId, domain, {
          sessionId: decoded.sessionId,
        });
        return null;
      }

      const session = JSON.parse(sessionData);

      // Update last activity
      session.lastActivity = Date.now();
      await redisClient.setex(
        sessionKey,
        Math.ceil((decoded.expiresAt - Date.now()) / 1000),
        JSON.stringify(session)
      );

      // Get user permissions based on user type and domain
      const permissions = this.getUserPermissions(session.userType, domain);

      return {
        id: session.userId,
        email: session.email,
        userType: session.userType,
        isVerified: session.isVerified,
        permissions,
      };
    } catch (error) {
      logger.error('SSO token validation failed:', error);
      SecurityAudit.logSecurityEvent('SSO_TOKEN_INVALID', {
        domain,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Get SSO redirect URL for cross-domain navigation
   */
  getSSORedirectUrl(targetDomain: string, ssoToken: string): string {
    const url = new URL(`https://${targetDomain}/auth/sso`);
    url.searchParams.set('token', ssoToken);
    return url.toString();
  }

  /**
   * Handle SSO login from another domain
   */
  async handleSSOLogin(ssoToken: string, targetDomain: string): Promise<{ user: SSOUser; redirectUrl: string } | null> {
    try {
      const user = await this.validateSSOToken(ssoToken, targetDomain);

      if (!user) {
        return null;
      }

      // Generate domain-specific access token
      const accessToken = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          userType: user.userType,
          aud: this.getAudienceFromDomain(targetDomain),
        },
        config.jwt.secret,
        {
          expiresIn: securityConfig.jwt.accessTokenExpiry,
          issuer: config.jwt.issuer,
        } as any
      );

      // Determine redirect URL based on user type and domain
      const redirectUrl = this.getPostLoginRedirectUrl(user, targetDomain);

      SecurityAudit.logSSOEvent('LOGIN_SUCCESS', user.id, targetDomain, {
        redirectUrl,
      });

      return { user, redirectUrl };
    } catch (error) {
      logger.error('SSO login failed:', error);
      return null;
    }
  }

  /**
   * Logout from all domains
   */
  async logoutAllDomains(userId: string): Promise<void> {
    try {
      // Get all active sessions for user
      const activeSessionsKey = `sso:user:${userId}:sessions`;
      const sessionIds = await redisClient.smembers(activeSessionsKey);

      // Delete all sessions
      const deletePromises = sessionIds.map(async (sessionId) => {
        await redisClient.del(`sso:session:${sessionId}`);
        await redisClient.del(`sso:user:${userId}:session`);
      });

      await Promise.all(deletePromises);

      // Clear session set
      await redisClient.del(activeSessionsKey);

      SecurityAudit.logSecurityEvent('SSO_LOGOUT_ALL', { userId });
    } catch (error) {
      logger.error('SSO logout failed:', error);
      throw new Error('Failed to logout from all domains');
    }
  }

  /**
   * Check if user has access to specific domain
   */
  hasDomainAccess(userType: string, domain: string): boolean {
    const domainAccess = {
      'vikareta.com': ['buyer', 'seller', 'both', 'business'], // Main site - all users
      'dashboard.vikareta.com': ['seller', 'both', 'business'], // Dashboard - business users only
      'admin.vikareta.com': ['admin'], // Admin - admin users only
    };

    const allowedTypes = domainAccess[domain as keyof typeof domainAccess];
    return allowedTypes ? allowedTypes.includes(userType) : false;
  }

  /**
   * Get user permissions based on user type and domain
   */
  private getUserPermissions(userType: string, domain: string): string[] {
    const permissions = {
      buyer: [
        'read:products',
        'write:cart',
        'read:orders',
        'read:profile',
        'write:profile',
        'read:support',
        'write:support',
      ],
      seller: [
        'read:products',
        'write:products',
        'read:orders',
        'write:orders',
        'read:analytics',
        'read:dashboard',
        'read:profile',
        'write:profile',
        'read:support',
        'write:support',
        'read:inventory',
        'write:inventory',
        'read:rfqs',
        'write:rfqs',
        'read:quotes',
        'write:quotes',
      ],
      business: [
        'read:products',
        'write:products',
        'read:orders',
        'write:orders',
        'read:analytics',
        'read:dashboard',
        'read:profile',
        'write:profile',
        'read:support',
        'write:support',
        'read:inventory',
        'write:inventory',
        'read:rfqs',
        'write:rfqs',
        'read:quotes',
        'write:quotes',
        'read:subscriptions',
        'write:subscriptions',
      ],
      both: [
        'read:products',
        'write:products',
        'write:cart',
        'read:orders',
        'write:orders',
        'read:analytics',
        'read:dashboard',
        'read:profile',
        'write:profile',
        'read:support',
        'write:support',
        'read:inventory',
        'write:inventory',
        'read:rfqs',
        'write:rfqs',
        'read:quotes',
        'write:quotes',
        'read:subscriptions',
        'write:subscriptions',
      ],
      admin: [
        'read:users',
        'write:users',
        'read:products',
        'write:products',
        'read:orders',
        'write:orders',
        'read:analytics',
        'read:dashboard',
        'read:profile',
        'write:profile',
        'read:support',
        'write:support',
        'read:inventory',
        'write:inventory',
        'read:rfqs',
        'write:rfqs',
        'read:quotes',
        'write:quotes',
        'read:subscriptions',
        'write:subscriptions',
        'admin:settings',
        'admin:reports',
        'admin:users',
        'admin:system',
        'admin:security',
        'admin:audit',
      ],
    };

    const basePermissions = permissions[userType as keyof typeof permissions] || [];

    // Add domain-specific permissions
    if (domain === 'dashboard.vikareta.com') {
      basePermissions.push('dashboard:access', 'dashboard:full');
    } else if (domain === 'admin.vikareta.com') {
      basePermissions.push('admin:access', 'admin:full');
    } else if (domain === 'vikareta.com') {
      basePermissions.push('web:access', 'web:full');
    }

    // Add role-based permissions
    this.addRoleBasedPermissions(basePermissions, userType, domain);

    return [...new Set(basePermissions)]; // Remove duplicates
  }

  /**
   * Add role-based permissions based on user type and domain
   */
  private addRoleBasedPermissions(permissions: string[], userType: string, domain: string): void {
    const rolePermissions = {
      buyer: {
        'vikareta.com': ['role:buyer', 'role:customer'],
        'dashboard.vikareta.com': [], // Buyers can't access dashboard
        'admin.vikareta.com': [], // Buyers can't access admin
      },
      seller: {
        'vikareta.com': ['role:seller', 'role:vendor'],
        'dashboard.vikareta.com': ['role:business', 'role:dashboard-user'],
        'admin.vikareta.com': [], // Sellers can't access admin
      },
      business: {
        'vikareta.com': ['role:business', 'role:seller', 'role:vendor'],
        'dashboard.vikareta.com': ['role:business', 'role:dashboard-user', 'role:dashboard-admin'],
        'admin.vikareta.com': [], // Business users can't access admin
      },
      both: {
        'vikareta.com': ['role:buyer', 'role:seller', 'role:vendor', 'role:business'],
        'dashboard.vikareta.com': ['role:business', 'role:dashboard-user', 'role:dashboard-admin'],
        'admin.vikareta.com': [], // Both users can't access admin
      },
      admin: {
        'vikareta.com': ['role:admin', 'role:superuser', 'role:system'],
        'dashboard.vikareta.com': ['role:admin', 'role:superuser', 'role:system'],
        'admin.vikareta.com': ['role:admin', 'role:superuser', 'role:system', 'role:admin-panel'],
      },
    };

    const userRolePermissions = rolePermissions[userType as keyof typeof rolePermissions];
    const domainPermissions = userRolePermissions ? userRolePermissions[domain as keyof typeof userRolePermissions] || [] : [];
    permissions.push(...domainPermissions);
  }

  /**
   * Get audience from domain (public method)
   */
  getAudienceFromDomain(domain: string): string {
    if (domain.includes('dashboard')) return 'dashboard';
    if (domain.includes('admin')) return 'admin';
    return 'web';
  }

  /**
   * Get post-login redirect URL
   */
  private getPostLoginRedirectUrl(user: SSOUser, domain: string): string {
    // Default redirects based on user type and domain
    if (domain === 'dashboard.vikareta.com') {
      return '/dashboard';
    } else if (domain === 'admin.vikareta.com') {
      return '/admin';
    } else {
      // Main site - redirect based on user type
      if (user.userType === 'seller' || user.userType === 'both' || user.userType === 'business') {
        return '/dashboard'; // Redirect to dashboard if they have business access
      }
      return '/'; // Regular users go to homepage
    }
  }

  /**
   * Clean up old sessions when limit exceeded
   */
  private async cleanupOldSessions(userId: string): Promise<void> {
    try {
      const activeSessionsKey = `sso:user:${userId}:sessions`;
      const sessionIds = await redisClient.smembers(activeSessionsKey);

      if (sessionIds.length > this.ssoConfig.maxConcurrentSessions) {
        // Sort by creation time and remove oldest
        const sessionsToRemove = sessionIds.slice(0, sessionIds.length - this.ssoConfig.maxConcurrentSessions);

        const deletePromises = sessionsToRemove.map(async (sessionId) => {
          await redisClient.del(`sso:session:${sessionId}`);
          await redisClient.srem(activeSessionsKey, sessionId);
        });

        await Promise.all(deletePromises);

        SecurityAudit.logSecurityEvent('SSO_SESSIONS_CLEANED', {
          userId,
          removedCount: sessionsToRemove.length,
        });
      }
    } catch (error) {
      logger.error('Failed to cleanup old sessions:', error);
    }
  }

  /**
   * Get active sessions for user
   */
  async getActiveSessions(userId: string): Promise<any[]> {
    try {
      const activeSessionsKey = `sso:user:${userId}:sessions`;
      const sessionIds = await redisClient.smembers(activeSessionsKey);

      const sessions = await Promise.all(
        sessionIds.map(async (sessionId) => {
          const sessionData = await redisClient.get(`sso:session:${sessionId}`);
          return sessionData ? JSON.parse(sessionData) : null;
        })
      );

      return sessions.filter(Boolean);
    } catch (error) {
      logger.error('Failed to get active sessions:', error);
      return [];
    }
  }

  // Legacy methods for backward compatibility
  private ttlSeconds = 120; // 2 minutes validity
  private prefix = 'sso';

  async createToken(userId: string, targetApp: string) {
    const token = crypto.randomBytes(32).toString('hex');
    const data = { userId, targetApp, createdAt: Date.now() };
    await redisClient.setex(`${this.prefix}:${token}`, this.ttlSeconds, JSON.stringify(data));
    this.logOperation('sso.createToken', { userId, targetApp });
    return token;
  }

  async exchange(token: string) {
    const key = `${this.prefix}:${token}`;
    const dataStr = await redisClient.get(key);
    if (!dataStr) {
      throw new Error('Invalid or expired SSO token');
    }
    const data = JSON.parse(dataStr);
    // one-time use
    await redisClient.del(key);
    this.logOperation('sso.exchange', { userId: data.userId, targetApp: data.targetApp });
    return data;
  }
}

// Export singleton instance
export const ssoService = new SSOService();
