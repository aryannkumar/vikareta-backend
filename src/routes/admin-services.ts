/**
 * Admin Service Management Routes
 * Comprehensive service management for administrators
 */

import { Router } from 'express';
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateAdmin, requirePermission } from '../middleware/admin-auth';

const router = Router();
const prisma = new PrismaClient();

// GET /api/admin/services - Get all services with filtering
router.get('/', authenticateAdmin, requirePermission('services.read'), async (req: Request, res: Response) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search, 
      category, 
      status,
      minPrice,
      maxPrice,
      provider,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 100);
    const skip = (pageNum - 1) * limitNum;
    
    const where: any = {};
    
    // Search filter
    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
        { provider: {
          OR: [
            { firstName: { contains: search as string, mode: 'insensitive' } },
            { lastName: { contains: search as string, mode: 'insensitive' } },
            { businessName: { contains: search as string, mode: 'insensitive' } }
          ]
        }}
      ];
    }
    
    // Category filter
    if (category && category !== 'all') {
      where.categoryId = category;
    }
    
    // Status filter
    if (status && status !== 'all') {
      where.isActive = status === 'active';
    }
    
    // Price range filter
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) {
        where.price.gte = parseFloat(minPrice as string);
      }
      if (maxPrice) {
        where.price.lte = parseFloat(maxPrice as string);
      }
    }
    
    // Provider filter
    if (provider && provider !== 'all') {
      where.providerId = provider;
    }
    
    const orderBy: any = {};
    orderBy[sortBy as string] = sortOrder;
    
    const [services, total] = await Promise.all([
      prisma.service.findMany({
        where,
        include: {
          provider: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              email: true
            }
          },
          category: {
            select: {
              id: true,
              name: true
            }
          },
          subcategory: {
            select: {
              id: true,
              name: true
            }
          },
          _count: {
            select: {
              orderItems: true,
              reviews: true
            }
          }
        },
        skip,
        take: limitNum,
        orderBy
      }),
      prisma.service.count({ where })
    ]);
    
    res.json({
      success: true,
      data: {
        services: services.map(service => ({
          id: service.id,
          title: service.title,
          description: service.description,
          price: Number(service.price),
          duration: service.duration,
          isActive: service.isActive,
          images: service.images,
          provider: {
            id: service.provider.id,
            name: service.provider.businessName || `${service.provider.firstName} ${service.provider.lastName}`,
            email: service.provider.email
          },
          category: service.category,
          subcategory: service.subcategory,
          stats: {
            orders: service._count.orderItems,
            reviews: service._count.reviews
          },
          createdAt: service.createdAt,
          updatedAt: service.updatedAt
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Admin services fetch error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch services'
      }
    });
  }
});

// GET /api/admin/services/:id - Get service details
router.get('/:id', authenticateAdmin, requirePermission('services.read'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const service = await prisma.service.findUnique({
      where: { id },
      include: {
        provider: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
            email: true,
            phone: true,
            address: true
          }
        },
        category: true,
        subcategory: true,
        orderItems: {
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                status: true,
                createdAt: true,
                buyer: {
                  select: {
                    firstName: true,
                    lastName: true,
                    businessName: true
                  }
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        reviews: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                businessName: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });
    
    if (!service) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SERVICE_NOT_FOUND',
          message: 'Service not found'
        }
      });
    }
    
    res.json({
      success: true,
      data: service
    });
  } catch (error) {
    console.error('Admin service details error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch service details'
      }
    });
  }
});

// PUT /api/admin/services/:id/status - Update service status
router.put('/:id/status', authenticateAdmin, requirePermission('services.write'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isActive, reason } = req.body;
    
    const updatedService = await prisma.service.update({
      where: { id },
      data: {
        isActive,
        updatedAt: new Date()
      },
      include: {
        provider: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });
    
    // Log admin action
    await prisma.adminAction.create({
      data: {
        adminId: (req as any).adminUser.id,
        action: 'SERVICE_STATUS_UPDATE',
        targetType: 'SERVICE',
        targetId: id,
        details: {
          isActive,
          reason: reason || 'No reason provided'
        }
      }
    });
    
    res.json({
      success: true,
      data: updatedService,
      message: `Service ${isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('Admin service status update error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to update service status'
      }
    });
  }
});

// DELETE /api/admin/services/:id - Delete service
router.delete('/:id', authenticateAdmin, requirePermission('services.delete'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    // Check if service has orders
    const orderCount = await prisma.orderItem.count({
      where: { serviceId: id }
    });
    
    if (orderCount > 0) {
      // Soft delete - deactivate instead of hard delete
      await prisma.service.update({
        where: { id },
        data: {
          isActive: false,
          deletedAt: new Date()
        }
      });
    } else {
      // Hard delete if no orders
      await prisma.service.delete({
        where: { id }
      });
    }
    
    // Log admin action
    await prisma.adminAction.create({
      data: {
        adminId: (req as any).adminUser.id,
        action: 'SERVICE_DELETE',
        targetType: 'SERVICE',
        targetId: id,
        details: {
          reason: reason || 'No reason provided',
          hasOrders: orderCount > 0,
          deleteType: orderCount > 0 ? 'soft' : 'hard'
        }
      }
    });
    
    res.json({
      success: true,
      message: 'Service deleted successfully'
    });
  } catch (error) {
    console.error('Admin service delete error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_ERROR',
        message: 'Failed to delete service'
      }
    });
  }
});

// GET /api/admin/services/analytics/summary - Service analytics
router.get('/analytics/summary', authenticateAdmin, requirePermission('analytics.read'), async (req: Request, res: Response) => {
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
    }
    
    const [
      totalServices,
      activeServices,
      servicesByCategory,
      topServices,
      recentServices,
      averagePrice
    ] = await Promise.all([
      // Total services
      prisma.service.count(),
      
      // Active services
      prisma.service.count({
        where: { isActive: true }
      }),
      
      // Services by category
      prisma.service.groupBy({
        by: ['categoryId'],
        _count: { categoryId: true },
        where: { isActive: true }
      }),
      
      // Top services by orders
      prisma.orderItem.groupBy({
        by: ['serviceId'],
        _sum: { quantity: true },
        _count: { serviceId: true },
        where: {
          service: { isActive: true },
          order: { createdAt: dateFilter }
        },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 10
      }),
      
      // Recent services
      prisma.service.findMany({
        where: { createdAt: dateFilter },
        select: {
          id: true,
          title: true,
          price: true,
          createdAt: true,
          provider: {
            select: {
              firstName: true,
              lastName: true,
              businessName: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      }),
      
      // Average service price
      prisma.service.aggregate({
        where: { isActive: true },
        _avg: { price: true }
      })
    ]);
    
    res.json({
      success: true,
      data: {
        summary: {
          totalServices,
          activeServices,
          inactiveServices: totalServices - activeServices,
          averagePrice: Number(averagePrice._avg.price || 0),
          period
        },
        servicesByCategory,
        topServices,
        recentServices
      }
    });
  } catch (error) {
    console.error('Admin service analytics error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ANALYTICS_ERROR',
        message: 'Failed to fetch service analytics'
      }
    });
  }
});

export default router;