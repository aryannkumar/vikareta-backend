import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { logger } from '@/utils/logger';

// Enhanced password validation schema
export const strongPasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters long')
  .max(128, 'Password must be less than 128 characters')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character')
  .refine(
    (password) => !/(.)\1{2,}/.test(password),
    'Password must not contain repeated characters'
  )
  .refine(
    (password) => !/(012|123|234|345|456|567|678|789|890)/.test(password),
    'Password must not contain sequential numbers'
  )
  .refine(
    (password) => !/(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i.test(password),
    'Password must not contain sequential letters'
  );

// Security configuration
export const securityConfig = {
  // Password hashing
  bcryptRounds: 12,

  // JWT configuration
  jwt: {
    algorithm: 'HS256',
    issuer: 'vikareta-backend',
    audience: ['web', 'dashboard', 'admin'],
    accessTokenExpiry: '15m', // Short-lived access tokens
    refreshTokenExpiry: '7d',
    maxTokensPerUser: 5,
  },

  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: {
      auth: 5, // Authentication attempts
      api: 1000, // General API calls
      passwordReset: 3, // Password reset requests
      otp: 5, // OTP requests
    },
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  },

  // Session management
  session: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    secure: true,
    sameSite: 'strict' as const,
    domain: '.vikareta.com', // Allow subdomains
  },

  // CSRF protection
  csrf: {
    secretLength: 32,
    cookieName: 'XSRF-TOKEN',
    headerName: 'X-XSRF-TOKEN',
    maxAge: 60 * 60 * 1000, // 1 hour
  },

  // Security headers
  headers: {
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    csp: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'https:'],
      connectSrc: ["'self'", 'https:', 'wss:'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: {
      geolocation: [],
      microphone: [],
      camera: [],
      payment: ['self'],
    },
  },

  // CORS configuration for multi-domain SSO
  cors: {
    allowedOrigins: [
      'http://localhost:3000', // Development
      'https://vikareta.com',
      'https://www.vikareta.com',
      'https://dashboard.vikareta.com',
      'https://admin.vikareta.com',
      'https://api.vikareta.com',
    ],
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-XSRF-TOKEN',
      'Accept',
      'Origin',
    ],
    credentials: true,
    maxAge: 86400, // 24 hours
  },

  // Input validation
  inputValidation: {
    maxStringLength: 10000,
    maxArrayLength: 1000,
    maxObjectDepth: 10,
    allowedFileTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    maxFileSize: 10 * 1024 * 1024, // 10MB
  },

  // Audit logging
  audit: {
    enabled: true,
    sensitiveFields: ['password', 'token', 'secret', 'key'],
    logFailedAttempts: true,
    logSuccessfulAuth: true,
  },
};

// Password utilities
export class PasswordUtils {
  static async hash(password: string): Promise<string> {
    return bcrypt.hash(password, securityConfig.bcryptRounds);
  }

  static async verify(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  static validate(password: string): boolean {
    try {
      strongPasswordSchema.parse(password);
      return true;
    } catch {
      return false;
    }
  }

  static generateSecurePassword(length: number = 16): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';

    // Ensure at least one character from each required category
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]; // Uppercase
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]; // Lowercase
    password += '0123456789'[Math.floor(Math.random() * 10)]; // Number
    password += '!@#$%^&*'[Math.floor(Math.random() * 8)]; // Special

    // Fill remaining length
    for (let i = password.length; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }

    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }
}

// CSRF token utilities
export class CSRFUtils {
  static generateToken(): string {
    return crypto.randomBytes(securityConfig.csrf.secretLength).toString('hex');
  }

  static validateToken(sessionToken: string, requestToken: string): boolean {
    if (!sessionToken || !requestToken) return false;

    // Use constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(sessionToken, 'hex'),
      Buffer.from(requestToken, 'hex')
    );
  }
}

// Security audit utilities
export class SecurityAudit {
  private static auditLogger = logger.child({ component: 'security-audit' });

  static sanitizeLogData(data: any): any {
    if (typeof data !== 'object' || data === null) return data;

    const sanitized = { ...data };

    for (const field of securityConfig.audit.sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  static logSecurityEvent(event: string, data: any, level: 'info' | 'warn' | 'error' = 'info'): void {
    const sanitizedData = this.sanitizeLogData(data);

    // Log to both security audit logger and main logger
    this.auditLogger[level](`[SECURITY] ${event}`, sanitizedData);

    // Also log to main logger for broader visibility
    logger[level](`[SECURITY] ${event}:`, sanitizedData);

    // For critical security events, also log to error level
    if (['AUTH_FAILURE', 'CSRF_INVALID_TOKEN', 'RATE_LIMIT_EXCEEDED', 'BLACKLISTED_TOKEN'].includes(event)) {
      logger.error(`[CRITICAL SECURITY] ${event}:`, sanitizedData);
    }
  }

  // Specific audit event methods for better type safety and consistency
  static logAuthSuccess(userId: string, userType: string, domain: string, ip: string, userAgent?: string): void {
    this.logSecurityEvent('AUTH_SUCCESS', {
      userId,
      userType,
      domain,
      ip,
      userAgent,
      timestamp: new Date().toISOString(),
    });
  }

  static logAuthFailure(reason: string, ip: string, userAgent?: string, attemptedUser?: string): void {
    this.logSecurityEvent('AUTH_FAILURE', {
      reason,
      ip,
      userAgent,
      attemptedUser,
      timestamp: new Date().toISOString(),
    }, 'error');
  }

  static logTokenBlacklisted(userId: string, tokenSnippet: string, reason: string = 'logout'): void {
    this.logSecurityEvent('TOKEN_BLACKLISTED', {
      userId,
      tokenSnippet,
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  static logSSOEvent(event: string, userId: string, domain: string, details?: any): void {
    this.logSecurityEvent(`SSO_${event.toUpperCase()}`, {
      userId,
      domain,
      ...details,
      timestamp: new Date().toISOString(),
    });
  }

  static logPermissionDenied(userId: string, resource: string, action: string, requiredPermissions: string[]): void {
    this.logSecurityEvent('PERMISSION_DENIED', {
      userId,
      resource,
      action,
      requiredPermissions,
      timestamp: new Date().toISOString(),
    }, 'warn');
  }

  static logRateLimitExceeded(identifier: string, limit: number, windowMs: number, ip: string): void {
    this.logSecurityEvent('RATE_LIMIT_EXCEEDED', {
      identifier,
      limit,
      windowMs,
      ip,
      timestamp: new Date().toISOString(),
    }, 'warn');
  }

  static logCSRFViolation(ip: string, userAgent?: string, endpoint?: string): void {
    this.logSecurityEvent('CSRF_VIOLATION', {
      ip,
      userAgent,
      endpoint,
      timestamp: new Date().toISOString(),
    }, 'error');
  }

  static logSuspiciousActivity(activity: string, ip: string, userAgent?: string, details?: any): void {
    this.logSecurityEvent('SUSPICIOUS_ACTIVITY', {
      activity,
      ip,
      userAgent,
      ...details,
      timestamp: new Date().toISOString(),
    }, 'warn');
  }

  static logAdminAction(adminId: string, action: string, targetUser?: string, details?: any): void {
    this.logSecurityEvent('ADMIN_ACTION', {
      adminId,
      action,
      targetUser,
      ...details,
      timestamp: new Date().toISOString(),
    });
  }

  static logPasswordChange(userId: string, method: 'reset' | 'change', ip: string): void {
    this.logSecurityEvent('PASSWORD_CHANGE', {
      userId,
      method,
      ip,
      timestamp: new Date().toISOString(),
    });
  }

  static logTwoFactorEvent(userId: string, event: 'enabled' | 'disabled' | 'verified' | 'failed', ip: string): void {
    this.logSecurityEvent('TWO_FACTOR_EVENT', {
      userId,
      event,
      ip,
      timestamp: new Date().toISOString(),
    });
  }

  static logSessionEvent(userId: string, event: 'created' | 'destroyed' | 'expired', sessionId: string, ip: string): void {
    this.logSecurityEvent('SESSION_EVENT', {
      userId,
      event,
      sessionId,
      ip,
      timestamp: new Date().toISOString(),
    });
  }

  // Audit trail methods
  static createAuditTrail(userId: string, action: string, resource: string, oldValue?: any, newValue?: any): void {
    this.logSecurityEvent('AUDIT_TRAIL', {
      userId,
      action,
      resource,
      oldValue: this.sanitizeLogData(oldValue),
      newValue: this.sanitizeLogData(newValue),
      timestamp: new Date().toISOString(),
    });
  }

  // Compliance logging for GDPR, SOX, etc.
  static logComplianceEvent(event: string, userId: string, dataController: string, details?: any): void {
    this.logSecurityEvent(`COMPLIANCE_${event.toUpperCase()}`, {
      userId,
      dataController,
      ...details,
      timestamp: new Date().toISOString(),
    });
  }

  // Security monitoring alerts
  static logSecurityAlert(alertType: string, severity: 'low' | 'medium' | 'high' | 'critical', details: any): void {
    const level = severity === 'critical' ? 'error' : severity === 'high' ? 'error' : 'warn';
    this.logSecurityEvent('SECURITY_ALERT', {
      alertType,
      severity,
      ...details,
      timestamp: new Date().toISOString(),
    }, level);
  }
}

// Rate limiting utilities
export class RateLimitUtils {
  static getKey(identifier: string, action: string): string {
    return `ratelimit:${action}:${identifier}`;
  }

  static getTTL(windowMs: number): number {
    return Math.ceil(windowMs / 1000);
  }
}

// Input sanitization utilities
export class InputSanitizer {
  static sanitizeString(input: string): string {
    if (typeof input !== 'string') return '';

    // Remove null bytes and control characters
    return input
      .replace(/\0/g, '')
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
      .trim()
      .substring(0, securityConfig.inputValidation.maxStringLength);
  }

  static sanitizeEmail(email: string): string {
    const sanitized = this.sanitizeString(email).toLowerCase();

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(sanitized)) {
      throw new Error('Invalid email format');
    }

    return sanitized;
  }

  static sanitizePhone(phone: string): string {
    const sanitized = this.sanitizeString(phone).replace(/\D/g, '');

    // Basic phone validation (Indian numbers)
    if (sanitized.length < 10 || sanitized.length > 15) {
      throw new Error('Invalid phone number length');
    }

    return sanitized;
  }
}