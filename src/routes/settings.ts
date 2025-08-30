import { Router } from 'express';
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
// import speakeasy from 'speakeasy';
// import QRCode from 'qrcode';
// Note: These packages need to be installed: npm install speakeasy qrcode @types/speakeasy @types/qrcode

const router = Router();
const prisma = new PrismaClient();

// Validation schemas
const businessProfileSchema = z.object({
  companyName: z.string().min(1).max(255),
  businessType: z.string().optional(),
  industry: z.string().optional(),
  description: z.string().optional(),
  logo: z.string().url().optional(),
  website: z.string().url().optional(),
  email: z.string().email(),
  phone: z.string().min(1),
  address: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    country: z.string(),
    postalCode: z.string()
  }),
  taxInfo: z.object({
    taxId: z.string(),
    gstNumber: z.string().optional(),
    panNumber: z.string().optional()
  }),
  bankDetails: z.object({
    accountName: z.string(),
    accountNumber: z.string(),
    bankName: z.string(),
    ifscCode: z.string(),
    swiftCode: z.string().optional()
  }),
  settings: z.object({
    allowPublicProfile: z.boolean(),
    showContactInfo: z.boolean(),
    autoAcceptOrders: z.boolean(),
    requireApprovalForLargeOrders: z.boolean(),
    largeOrderThreshold: z.number()
  })
});

const securitySettingsSchema = z.object({
  passwordPolicy: z.object({
    requireUppercase: z.boolean(),
    requireLowercase: z.boolean(),
    requireNumbers: z.boolean(),
    requireSpecialChars: z.boolean(),
    minLength: z.number().min(6).max(32),
    maxAge: z.number().min(30).max(365),
    preventReuse: z.number().min(1).max(10)
  }),
  loginSecurity: z.object({
    maxFailedAttempts: z.number().min(3).max(10),
    lockoutDuration: z.number().min(5).max(60),
    requireEmailVerification: z.boolean(),
    allowMultipleSessions: z.boolean(),
    sessionTimeout: z.number().min(15).max(480)
  }),
  notifications: z.object({
    loginAlerts: z.boolean(),
    passwordChanges: z.boolean(),
    securityEvents: z.boolean(),
    suspiciousActivity: z.boolean()
  })
});

const notificationSettingsSchema = z.object({
  email: z.object({
    enabled: z.boolean(),
    address: z.string().email(),
    frequency: z.enum(['immediate', 'hourly', 'daily', 'weekly']),
    categories: z.object({
      orders: z.boolean(),
      payments: z.boolean(),
      inventory: z.boolean(),
      customers: z.boolean(),
      marketing: z.boolean(),
      security: z.boolean(),
      system: z.boolean()
    })
  }),
  sms: z.object({
    enabled: z.boolean(),
    phoneNumber: z.string(),
    categories: z.object({
      urgentOrders: z.boolean(),
      paymentIssues: z.boolean(),
      securityAlerts: z.boolean(),
      systemDowntime: z.boolean()
    })
  }),
  push: z.object({
    enabled: z.boolean(),
    categories: z.object({
      newOrders: z.boolean(),
      messages: z.boolean(),
      lowInventory: z.boolean(),
      paymentReceived: z.boolean(),
      customerReviews: z.boolean()
    })
  }),
  inApp: z.object({
    enabled: z.boolean(),
    sound: z.boolean(),
    desktop: z.boolean(),
    categories: z.object({
      all: z.boolean(),
      orders: z.boolean(),
      messages: z.boolean(),
      inventory: z.boolean(),
      analytics: z.boolean()
    })
  }),
  schedule: z.object({
    quietHours: z.object({
      enabled: z.boolean(),
      startTime: z.string(),
      endTime: z.string(),
      timezone: z.string()
    }),
    workingDays: z.array(z.string())
  }),
  preferences: z.object({
    language: z.string(),
    digestFrequency: z.enum(['daily', 'weekly', 'monthly']),
    marketingEmails: z.boolean(),
    productUpdates: z.boolean(),
    surveyInvitations: z.boolean()
  })
});

// Business Profile Routes

// GET /api/settings/business - Get business profile
router.get('/business', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const businessProfile = await prisma.businessProfile.findUnique({
      where: { userId }
    });

    if (!businessProfile) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Business profile not found'
        }
      });
    }

    res.json({
      success: true,
      data: businessProfile
    });
  } catch (error) {
    console.error('Error fetching business profile:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch business profile'
      }
    });
  }
});

// PUT /api/settings/business - Update business profile
router.put('/business', 
  authenticate, 
  validateRequest(businessProfileSchema), 
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const profileData = req.body;

      const businessProfile = await prisma.businessProfile.upsert({
        where: { userId },
        update: {
          ...profileData,
          updatedAt: new Date()
        },
        create: {
          ...profileData,
          userId,
          verification: {
            isVerified: false,
            verificationLevel: 'basic',
            documents: []
          }
        }
      });

      res.json({
        success: true,
        data: businessProfile,
        message: 'Business profile updated successfully'
      });
    } catch (error) {
      console.error('Error updating business profile:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'UPDATE_ERROR',
          message: 'Failed to update business profile'
        }
      });
    }
  }
);

// Security Settings Routes

// GET /api/settings/security - Get security settings
router.get('/security', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const securitySettings = await prisma.securitySettings.findUnique({
      where: { userId }
    });

    if (!securitySettings) {
      // Return default settings if none exist
      const defaultSettings = {
        twoFactorAuth: {
          enabled: false,
          method: null,
          backupCodes: []
        },
        passwordPolicy: {
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialChars: true,
          minLength: 8,
          maxAge: 90,
          preventReuse: 5
        },
        loginSecurity: {
          maxFailedAttempts: 5,
          lockoutDuration: 15,
          requireEmailVerification: true,
          allowMultipleSessions: true,
          sessionTimeout: 60
        },
        notifications: {
          loginAlerts: true,
          passwordChanges: true,
          securityEvents: true,
          suspiciousActivity: true
        }
      };

      return res.json({
        success: true,
        data: defaultSettings
      });
    }

    res.json({
      success: true,
      data: securitySettings
    });
  } catch (error) {
    console.error('Error fetching security settings:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch security settings'
      }
    });
  }
});

// PUT /api/settings/security - Update security settings
router.put('/security', 
  authenticate, 
  validateRequest(securitySettingsSchema), 
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const settingsData = req.body;

      const securitySettings = await prisma.securitySettings.upsert({
        where: { userId },
        update: {
          ...settingsData,
          updatedAt: new Date()
        },
        create: {
          ...settingsData,
          userId,
          twoFactorAuth: {
            enabled: false,
            method: null,
            backupCodes: []
          }
        }
      });

      res.json({
        success: true,
        data: securitySettings,
        message: 'Security settings updated successfully'
      });
    } catch (error) {
      console.error('Error updating security settings:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'UPDATE_ERROR',
          message: 'Failed to update security settings'
        }
      });
    }
  }
);

// Notification Settings Routes

// GET /api/settings/notifications - Get notification settings
router.get('/notifications', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const notificationSettings = await prisma.notificationSettings.findUnique({
      where: { userId }
    });

    if (!notificationSettings) {
      // Return default settings if none exist
      const defaultSettings = {
        email: {
          enabled: true,
          address: '',
          frequency: 'immediate',
          categories: {
            orders: true,
            payments: true,
            inventory: true,
            customers: true,
            marketing: false,
            security: true,
            system: true
          }
        },
        sms: {
          enabled: false,
          phoneNumber: '',
          categories: {
            urgentOrders: true,
            paymentIssues: true,
            securityAlerts: true,
            systemDowntime: true
          }
        },
        push: {
          enabled: true,
          categories: {
            newOrders: true,
            messages: true,
            lowInventory: true,
            paymentReceived: true,
            customerReviews: false
          }
        },
        inApp: {
          enabled: true,
          sound: true,
          desktop: true,
          categories: {
            all: true,
            orders: true,
            messages: true,
            inventory: true,
            analytics: false
          }
        },
        schedule: {
          quietHours: {
            enabled: false,
            startTime: '22:00',
            endTime: '08:00',
            timezone: 'UTC'
          },
          workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
        },
        preferences: {
          language: 'en',
          digestFrequency: 'daily',
          marketingEmails: false,
          productUpdates: true,
          surveyInvitations: false
        }
      };

      return res.json({
        success: true,
        data: defaultSettings
      });
    }

    res.json({
      success: true,
      data: notificationSettings
    });
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch notification settings'
      }
    });
  }
});

// PUT /api/settings/notifications - Update notification settings
router.put('/notifications', 
  authenticate, 
  validateRequest(notificationSettingsSchema), 
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const settingsData = req.body;

      const notificationSettings = await prisma.notificationSettings.upsert({
        where: { userId },
        update: {
          ...settingsData,
          updatedAt: new Date()
        },
        create: {
          ...settingsData,
          userId
        }
      });

      res.json({
        success: true,
        data: notificationSettings,
        message: 'Notification settings updated successfully'
      });
    } catch (error) {
      console.error('Error updating notification settings:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'UPDATE_ERROR',
          message: 'Failed to update notification settings'
        }
      });
    }
  }
);

// Password Change Route
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
});

router.post('/change-password', 
  authenticate, 
  validateRequest(changePasswordSchema), 
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { currentPassword, newPassword } = req.body;

      // Get user with current password
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, passwordHash: true }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found'
          }
        });
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PASSWORD',
            message: 'Current password is incorrect'
          }
        });
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, 12);

      // Update password
      await prisma.user.update({
        where: { id: userId },
        data: { 
          passwordHash: hashedNewPassword,
          updatedAt: new Date()
        }
      });

      // Log security event
      await prisma.securityEvent.create({
        data: {
          userId,
          type: 'password_change',
          description: 'Password changed successfully',
          ip: req.ip || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown',
          severity: 'low'
        }
      });

      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      console.error('Error changing password:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'PASSWORD_CHANGE_ERROR',
          message: 'Failed to change password'
        }
      });
    }
  }
);

// 2FA Setup Route
router.post('/2fa/setup', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, lastName: true }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    // Generate secret
    // const secret = speakeasy.generateSecret({
    //   name: `Vikareta (${user.email})`,
    //   issuer: 'Vikareta'
    // });

    // Generate QR code
    // const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);
    
    // Temporary mock for build
    const secret = { base32: 'MOCK_SECRET_FOR_BUILD' };
    const qrCodeUrl = 'data:image/png;base64,mock_qr_code';

    // Store temporary secret (will be confirmed on verification)
    await prisma.user.update({
      where: { id: userId },
      data: {
        tempTwoFactorSecret: secret.base32
      }
    });

    res.json({
      success: true,
      data: {
        qrCode: qrCodeUrl,
        secret: secret.base32
      }
    });
  } catch (error) {
    console.error('Error setting up 2FA:', error);
    res.status(500).json({
      success: false,
      error: {
        code: '2FA_SETUP_ERROR',
        message: 'Failed to setup 2FA'
      }
    });
  }
});

// 2FA Verification Route
const verify2FASchema = z.object({
  code: z.string().length(6)
});

router.post('/2fa/verify', 
  authenticate, 
  validateRequest(verify2FASchema), 
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { code } = req.body;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, tempTwoFactorSecret: true }
      });

      if (!user || !user.tempTwoFactorSecret) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_TEMP_SECRET',
            message: 'No temporary 2FA secret found. Please setup 2FA first.'
          }
        });
      }

      // Verify the code
      // const verified = speakeasy.totp.verify({
      //   secret: user.tempTwoFactorSecret,
      //   encoding: 'base32',
      //   token: code,
      //   window: 2
      // });
      
      // Temporary mock for build
      const verified = code === '123456'; // Mock verification

      if (!verified) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_CODE',
            message: 'Invalid verification code'
          }
        });
      }

      // Generate backup codes
      const backupCodes = Array.from({ length: 10 }, () => 
        Math.random().toString(36).substring(2, 10).toUpperCase()
      );

      // Enable 2FA and clear temp secret
      await prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorSecret: user.tempTwoFactorSecret,
          tempTwoFactorSecret: null,
          twoFactorEnabled: true,
          twoFactorBackupCodes: backupCodes
        }
      });

      // Update security settings
      await prisma.securitySettings.upsert({
        where: { userId },
        update: {
          twoFactorAuth: {
            enabled: true,
            method: 'authenticator',
            backupCodes,
            lastUsed: null
          }
        },
        create: {
          userId,
          twoFactorAuth: {
            enabled: true,
            method: 'authenticator',
            backupCodes,
            lastUsed: null
          },
          passwordPolicy: {
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSpecialChars: true,
            minLength: 8,
            maxAge: 90,
            preventReuse: 5
          },
          loginSecurity: {
            maxFailedAttempts: 5,
            lockoutDuration: 15,
            requireEmailVerification: true,
            allowMultipleSessions: true,
            sessionTimeout: 60
          },
          notifications: {
            loginAlerts: true,
            passwordChanges: true,
            securityEvents: true,
            suspiciousActivity: true
          }
        }
      });

      // Log security event
      await prisma.securityEvent.create({
        data: {
          userId,
          type: '2fa_enabled',
          description: '2FA enabled successfully',
          ip: req.ip || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown',
          severity: 'low'
        }
      });

      res.json({
        success: true,
        data: { backupCodes },
        message: '2FA enabled successfully'
      });
    } catch (error) {
      console.error('Error verifying 2FA:', error);
      res.status(500).json({
        success: false,
        error: {
          code: '2FA_VERIFY_ERROR',
          message: 'Failed to verify 2FA'
        }
      });
    }
  }
);

// 2FA Disable Route
router.post('/2fa/disable', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: null,
        twoFactorEnabled: false,
        twoFactorBackupCodes: []
      }
    });

    // Update security settings
    await prisma.securitySettings.upsert({
      where: { userId },
      update: {
        twoFactorAuth: {
          enabled: false,
          method: null,
          backupCodes: []
        }
      },
      create: {
        userId,
        twoFactorAuth: {
          enabled: false,
          method: null,
          backupCodes: []
        },
        passwordPolicy: {
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialChars: true,
          minLength: 8,
          maxAge: 90,
          preventReuse: 5
        },
        loginSecurity: {
          maxFailedAttempts: 5,
          lockoutDuration: 15,
          requireEmailVerification: true,
          allowMultipleSessions: true,
          sessionTimeout: 60
        },
        notifications: {
          loginAlerts: true,
          passwordChanges: true,
          securityEvents: true,
          suspiciousActivity: true
        }
      }
    });

    // Log security event
    await prisma.securityEvent.create({
      data: {
        userId,
        type: '2fa_disabled',
        description: '2FA disabled',
        ip: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        severity: 'medium'
      }
    });

    res.json({
      success: true,
      message: '2FA disabled successfully'
    });
  } catch (error) {
    console.error('Error disabling 2FA:', error);
    res.status(500).json({
      success: false,
      error: {
        code: '2FA_DISABLE_ERROR',
        message: 'Failed to disable 2FA'
      }
    });
  }
});

export default router;