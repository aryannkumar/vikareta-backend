/**
 * Admin Authentication Middleware
 * Handles admin role verification and permissions
 */

import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

export interface AdminUser {
  id: string;
  email: string;
  role: string;
  permissions: string[];
  firstName?: string;
  lastName?: string;
}

// Admin roles and their permissions
export const ADMIN_ROLES = {
  SUPER_ADMIN: {
    name: 'Super Admin',
    permissions: [
      'users.read', 'users.write', 'users.delete',
      'orders.read', 'orders.write', 'orders.delete',
      'products.read', 'products.write', 'products.delete',
      'services.read', 'services.write', 'services.delete',
      'categories.read', 'categories.write', 'categories.delete',
      'analytics.read', 'analytics.write',
      'system.read', 'system.write', 'system.delete',
      'admin.read', 'admin.write', 'admin.delete',
      'reports.read', 'reports.write',
      'settings.read', 'settings.write'
    ]
  },
  ADMIN: {
    name: 'Admin',
    permissions: [
      'users.read', 'users.write',
      'orders.read', 'orders.write',
      'products.read', 'products.write',
      'services.read', 'services.write',
      'categories.read', 'categories.write',
      'analytics.read',
      'reports.read'
    ]
  },
  MODERATOR: {
    name: 'Moderator',
    permissions: [
      'users.read',
      'orders.read', 'orders.write',
      'products.read', 'products.write',
      'services.read', 'services.write',
      'reports.read'
    ]
  },
  SUPPORT: {
    name: 'Support',
    permissions: [
      'users.read',
      'orders.read',
      'products.read',
      'services.read',
      'reports.read'
    ]
  }
};

/**
 * Middleware to authenticate admin users
 */
export const authenticateAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '') || req.cookies?.adminToken;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'NO_TOKEN',
          message: 'Admin access token required'
        }
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as any;
    
    // Get admin user from database
    const adminUser = await prisma.user.findFirst({
      where: {
        id: decoded.userId,
        role: { in: ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'SUPPORT'] }
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true
      }
    });

    if (!adminUser || !adminUser.isActive) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_ADMIN',
          message: 'Invalid admin credentials or account disabled'
        }
      });
    }

    // Get role permissions
    const rolePermissions = ADMIN_ROLES[adminUser.role as keyof typeof ADMIN_ROLES]?.permissions || [];

    // Attach admin user to request
    (req as any).adminUser = {
      id: adminUser.id,
      email: adminUser.email,
      firstName: adminUser.firstName,
      lastName: adminUser.lastName,
      role: adminUser.role,
      permissions: rolePermissions
    };

    next();
  } catch (error) {
    console.error('Admin authentication error:', error);
    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: 'Invalid admin authentication'
      }
    });
  }
};

/**
 * Middleware to check specific admin permissions
 */
export const requirePermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const adminUser = (req as any).adminUser as AdminUser;
    
    if (!adminUser) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'NO_ADMIN_USER',
          message: 'Admin authentication required'
        }
      });
    }

    if (!adminUser.permissions.includes(permission)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `Permission '${permission}' required`
        }
      });
    }

    next();
  };
};

/**
 * Middleware to require super admin role
 */
export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
  const adminUser = (req as any).adminUser as AdminUser;
  
  if (!adminUser || adminUser.role !== 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'SUPER_ADMIN_REQUIRED',
        message: 'Super admin access required'
      }
    });
  }

  next();
};

/**
 * Check if user has specific permission
 */
export const hasPermission = (adminUser: AdminUser, permission: string): boolean => {
  return adminUser.permissions.includes(permission);
};

/**
 * Get all permissions for a role
 */
export const getRolePermissions = (role: string): string[] => {
  return ADMIN_ROLES[role as keyof typeof ADMIN_ROLES]?.permissions || [];
};