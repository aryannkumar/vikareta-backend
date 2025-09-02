/**
 * Admin System Management Routes
 * System settings, analytics, and platform management
 */

import { Router } from 'express';
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateAdmin, requirePermission, requireSuperAdmin } from '../../middleware/admin-auth';

const router = Router();
const prisma = new PrismaClient();

// ================================
// SYSTEM ANALYTICS
// ================================

// GET /api/admin/system/analytics/overview - System overview analytics
router.get('/analytics/overview', authenticateAdmin, requirePermission('analytics.read'), async (req: Request, res: Response) => {
  try {
    const { period = '30d' } = req.query;
    
    let dateFilter = {};
    const now = new Date();
    
    switch (period) {
      case '7d':
        dateFilter = { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
        break;
      case '30d':
        dateFilter = { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
        break;
      case '90d':
        dateFilter = { gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) };
        break;
      case '1y':
        dateFilter = { gte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) };
        break;
    }
    
    const [
      // User metrics
      totalUsers,
      activeUsers,
      newUsers,
      usersByRole,
      
      // Business metrics
      totalOrders,
      totalRevenue,
      averageOrderValue,
      ordersByStatus,
      
      // Product/Service metrics
      totalProducts,
      totalServices,
      activeListings,
      
      // Platform metrics
      totalCategories,
      totalSubcategories,
      supportTickets,
      
      // Growth metrics
      dailySignups,
      dailyOrders,
      dailyRevenue
    ] = await Promise.all([
      // User metrics
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { createdAt: dateFilter } }),
      prisma.user.groupBy({
        by: ['role'],
        _count: { role: true }
      }),
      
      // Business metrics
      prisma.order.count({ where: { createdAt: dateFilter } }),
      prisma.order.aggregate({
        where: { 
          createdAt: dateFilter,
          status: { in: ['DELIVERED', 'DELIVERED'] }
        },
        _sum: { totalAmount: true }
      }),
      prisma.order.aggregate({
        where: { 
          createdAt: dateFilter,
          status: { in: ['DELIVERED', 'DELIVERED'] }
        },
        _avg: { totalAmount: true }
      }),
      prisma.order.groupBy({
        by: ['status'],
        where: { createdAt: dateFilter },
        _count: { status: true }
      }),
      
      // Product/Service metrics
      prisma.product.count(),
      prisma.service.count(),
      (await prisma.product.count({ where: { isActive: true } })) + 
      (await prisma.service.count({ where: { isActive: true } })),
      
      // Platform metrics
      prisma.productCategory.count(),
      prisma.productSubcategory.count(),
      prisma.supportMessage.count({ where: { createdAt: dateFilter } }),
      
      // Growth metrics - Daily signups
      prisma.$queryRaw`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM users 
        WHERE created_at >= ${new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)}
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
      `,
      
      // Growth metrics - Daily orders
      prisma.$queryRaw`
        SELECT DATE(created_at) as date, COUNT(*) as count, SUM(total_amount) as revenue
        FROM orders 
        WHERE created_at >= ${new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)}
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
      `,
      
      // Daily revenue
      prisma.$queryRaw`
        SELECT DATE(created_at) as date, SUM(total_amount) as revenue
        FROM orders 
        WHERE created_at >= ${new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)}
        AND status IN ('DELIVERED', 'DELIVERED')
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
      `
    ]);
    
    res.json({
      success: true,
      data: {
        period,
        overview: {
          users: {
            total: totalUsers,
            active: activeUsers,
            new: newUsers,
            byRole: usersByRole
          },
          business: {
            totalOrders,
            totalRevenue: Number(totalRevenue._sum.totalAmount || 0),
            averageOrderValue: Number(averageOrderValue._avg.totalAmount || 0),
            ordersByStatus
          },
          listings: {
            totalProducts,
            totalServices,
            activeListings
          },
          platform: {
            totalCategories,
            totalSubcategories,
            supportTickets
          }
        },
        growth: {
          dailySignups,
          dailyOrders,
          dailyRevenue
        }
      }
    });
  } catch (error) {
    console.error('System analytics error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ANALYTICS_ERROR',
        message: 'Failed to fetch system analytics'
      }
    });
  }
});

// ================================
// SYSTEM SETTINGS
// ================================

// GET /api/admin/system/settings - Get system settings
router.get('/settings', authenticateAdmin, requirePermission('settings.read'), async (req: Request, res: Response) => {
  try {
    // For now, return hardcoded settings. In production, these would be stored in database
    const settings = {
      platform: {
        name: 'Vikareta',
        version: '1.0.0',
        maintenance: false,
        registrationEnabled: true,
        emailVerificationRequired: true
      },
      business: {
        commissionRate: 5.0, // 5%
        minimumOrderAmount: 100,
        maxOrderAmount: 1000000,
        currency: 'INR',
        taxRate: 18.0 // 18% GST
      },
      features: {
        rfqEnabled: true,
        chatEnabled: true,
        reviewsEnabled: true,
        analyticsEnabled: true,
        notificationsEnabled: true
      },
      limits: {
        maxProductImages: 10,
        maxServiceImages: 5,
        maxFileSize: 10485760, // 10MB
        maxProductsPerSeller: 1000,
        maxServicesPerProvider: 500
      },
      notifications: {
        emailEnabled: true,
        smsEnabled: false,
        pushEnabled: true,
        adminNotifications: true
      }
    };
    
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('System settings fetch error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SETTINGS_ERROR',
        message: 'Failed to fetch system settings'
      }
    });
  }
});

// PUT /api/admin/system/settings - Update system settings
router.put('/settings', authenticateAdmin, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { settings } = req.body;
    
    // In production, save settings to database
    // For now, just log the update
    console.log('System settings updated by admin:', (req as any).adminUser.email, settings);
    
    // Log admin action
    await prisma.adminAction.create({
      data: {
        adminId: (req as any).adminUser.id,
        action: 'SYSTEM_SETTINGS_UPDATE',
        targetType: 'SYSTEM',
        targetId: 'settings',
        details: {
          updatedSettings: settings
        }
      }
    });
    
    res.json({
      success: true,
      message: 'System settings updated successfully'
    });
  } catch (error) {
    console.error('System settings update error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SETTINGS_UPDATE_ERROR',
        message: 'Failed to update system settings'
      }
    });
  }
});

// ================================
// SYSTEM HEALTH & MONITORING
// ================================

// GET /api/admin/system/health - System health check
router.get('/health', authenticateAdmin, requirePermission('system.read'), async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    
    // Database health check
    const dbHealth = await prisma.$queryRaw`SELECT 1 as status`;
    const dbResponseTime = Date.now() - startTime;
    
    // Check various system components
    const [
      userCount,
      orderCount,
      productCount,
      serviceCount,
      recentErrors
    ] = await Promise.all([
      prisma.user.count(),
      prisma.order.count(),
      prisma.product.count(),
      prisma.service.count(),
      // In production, you'd have an error logging table
      Promise.resolve([])
    ]);
    
    const systemHealth = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        status: dbHealth ? 'connected' : 'disconnected',
        responseTime: dbResponseTime
      },
      statistics: {
        users: userCount,
        orders: orderCount,
        products: productCount,
        services: serviceCount
      },
      memory: {
        used: process.memoryUsage().heapUsed,
        total: process.memoryUsage().heapTotal,
        external: process.memoryUsage().external
      },
      errors: recentErrors
    };
    
    res.json({
      success: true,
      data: systemHealth
    });
  } catch (error) {
    console.error('System health check error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'HEALTH_CHECK_ERROR',
        message: 'System health check failed'
      }
    });
  }
});

// ================================
// ADMIN ACTIVITY LOGS
// ================================

// GET /api/admin/system/activity-logs - Get admin activity logs
router.get('/activity-logs', authenticateAdmin, requirePermission('system.read'), async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 50, adminId, action, targetType } = req.query;
    
    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 100);
    const skip = (pageNum - 1) * limitNum;
    
    const where: any = {};
    
    if (adminId && adminId !== 'all') {
      where.adminId = adminId;
    }
    
    if (action && action !== 'all') {
      where.action = action;
    }
    
    if (targetType && targetType !== 'all') {
      where.targetType = targetType;
    }
    
    const [logs, total] = await Promise.all([
      prisma.adminAction.findMany({
        where,
        include: {
          admin: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              role: true
            }
          }
        },
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.adminAction.count({ where })
    ]);
    
    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Activity logs fetch error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'LOGS_ERROR',
        message: 'Failed to fetch activity logs'
      }
    });
  }
});

// ================================
// SYSTEM MAINTENANCE
// ================================

// POST /api/admin/system/maintenance - Toggle maintenance mode
router.post('/maintenance', authenticateAdmin, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { enabled, message } = req.body;
    
    // In production, this would update a system setting
    console.log(`Maintenance mode ${enabled ? 'enabled' : 'disabled'} by admin:`, (req as any).adminUser.email);
    
    // Log admin action
    await prisma.adminAction.create({
      data: {
        adminId: (req as any).adminUser.id,
        action: 'MAINTENANCE_MODE_TOGGLE',
        targetType: 'SYSTEM',
        targetId: 'maintenance',
        details: {
          enabled,
          message: message || 'No message provided'
        }
      }
    });
    
    res.json({
      success: true,
      message: `Maintenance mode ${enabled ? 'enabled' : 'disabled'} successfully`
    });
  } catch (error) {
    console.error('Maintenance mode toggle error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'MAINTENANCE_ERROR',
        message: 'Failed to toggle maintenance mode'
      }
    });
  }
});

// POST /api/admin/system/cache/clear - Clear system cache
router.post('/cache/clear', authenticateAdmin, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    // In production, this would clear Redis cache, CDN cache, etc.
    console.log('System cache cleared by admin:', (req as any).adminUser.email);
    
    // Log admin action
    await prisma.adminAction.create({
      data: {
        adminId: (req as any).adminUser.id,
        action: 'CACHE_CLEAR',
        targetType: 'SYSTEM',
        targetId: 'cache',
        details: {
          timestamp: new Date().toISOString()
        }
      }
    });
    
    res.json({
      success: true,
      message: 'System cache cleared successfully'
    });
  } catch (error) {
    console.error('Cache clear error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CACHE_ERROR',
        message: 'Failed to clear system cache'
      }
    });
  }
});

export default router;