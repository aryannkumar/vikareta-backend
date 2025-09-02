/**
 * Admin Product Management Routes
 * Comprehensive product management for administrators
 */

import { Router } from 'express';
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateAdmin, requirePermission } from '../../middleware/admin-auth';

const router = Router();
const prisma = new PrismaClient();

// GET /api/admin/products - Get all products with filtering
router.get('/', authenticateAdmin, requirePermission('products.read'), async (req: Request, res: Response) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search, 
      category, 
      status,
      minPrice,
      maxPrice,
      seller,
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
        { stockKeepingUnit: { contains: search as string, mode: 'insensitive' } },
        { seller: {
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
    
    // Seller filter
    if (seller && seller !== 'all') {
      where.sellerId = seller;
    }
    
    const orderBy: any = {};
    orderBy[sortBy as string] = sortOrder;
    
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              email: true
            }
          },
          productCategory: {
            select: {
              id: true,
              name: true
            }
          },
          productSubcategory: {
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
      prisma.product.count({ where })
    ]);
    
    res.json({
      success: true,
      data: {
        products: products.map(product => ({
          id: product.id,
          title: product.title,
          description: product.description,
          price: Number(product.price),
          stockKeepingUnit: product.stockKeepingUnit,
          stock: product.stock,
          isActive: product.isActive,
          images: product.imageUrls,
          seller: {
            id: product.seller.id,
            name: product.seller.businessName || `${product.seller.firstName} ${product.seller.lastName}`,
            email: product.seller.email
          },
          productCategory: product.category,
          productSubcategory: product.subcategory,
          stats: {
            orders: product._count.orderItems,
            reviews: product_count.reviews
          },
          createdAt: product.createdAt,
          updatedAt: product.updatedAt
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
    console.error('Admin products fetch error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch products'
      }
    });
  }
});

// GET /api/admin/products/:id - Get product details
router.get('/:id', authenticateAdmin, requirePermission('products.read'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        seller: {
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
        productCategory: true,
        productSubcategory: true,
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
          orderBy: { id: 'desc' },
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
          orderBy: { id: 'desc' },
          take: 10
        }
      }
    });
    
    if (!product) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: 'Product not found'
        }
      });
    }
    
    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Admin product details error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch product details'
      }
    });
  }
});

// PUT /api/admin/products/:id/status - Update product status
router.put('/:id/status', authenticateAdmin, requirePermission('products.write'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isActive, reason } = req.body;
    
    const updatedProduct = await prisma.product.update({
      where: { id },
      data: {
        isActive,
        updatedAt: new Date()
      },
      include: {
        seller: {
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
        action: 'PRODUCT_STATUS_UPDATE',
        targetType: 'PRODUCT',
        targetId: id,
        details: {
          isActive,
          reason: reason || 'No reason provided'
        }
      }
    });
    
    res.json({
      success: true,
      data: updatedProduct,
      message: `Product ${isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('Admin product status update error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to update product status'
      }
    });
  }
});

// DELETE /api/admin/products/:id - Delete product
router.delete('/:id', authenticateAdmin, requirePermission('products.delete'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    // Check if product has orders
    const orderCount = await prisma.orderItem.count({
      where: { productId: id }
    });
    
    if (orderCount > 0) {
      // Soft delete - deactivate instead of hard delete
      await prisma.product.update({
        where: { id },
        data: {
          isActive: false
        }
      });
    } else {
      // Hard delete if no orders
      await prisma.product.delete({
        where: { id }
      });
    }
    
    // Log admin action
    await prisma.adminAction.create({
      data: {
        adminId: (req as any).adminUser.id,
        action: 'PRODUCT_DELETE',
        targetType: 'PRODUCT',
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
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Admin product delete error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_ERROR',
        message: 'Failed to delete product'
      }
    });
  }
});

// GET /api/admin/products/analytics/summary - Product analytics
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
      totalProducts,
      activeProducts,
      productsByCategory,
      topProducts,
      lowStockProducts,
      recentProducts
    ] = await Promise.all([
      // Total products
      prisma.product.count(),
      
      // Active products
      prisma.product.count({
        where: { isActive: true }
      }),
      
      // Products by category
      prisma.product.groupBy({
        by: ['categoryId'],
        _count: { categoryId: true },
        where: { isActive: true }
      }),
      
      // Top selling products
      prisma.orderItem.groupBy({
        by: ['productId'],
        _sum: { quantity: true },
        _count: { productId: true },
        where: {
          product: { isActive: true },
          order: { createdAt: dateFilter }
        },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 10
      }),
      
      // Low stock products
      prisma.product.findMany({
        where: {
          isActive: true,
          stock: { lte: 10 }
        },
        select: {
          id: true,
          title: true,
          stock: true,
          seller: {
            select: {
              firstName: true,
              lastName: true,
              businessName: true
            }
          }
        },
        orderBy: { stock: 'asc' },
        take: 20
      }),
      
      // Recent products
      prisma.product.findMany({
        where: { createdAt: dateFilter },
        select: {
          id: true,
          title: true,
          price: true,
          createdAt: true,
          seller: {
            select: {
              firstName: true,
              lastName: true,
              businessName: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      })
    ]);
    
    res.json({
      success: true,
      data: {
        summary: {
          totalProducts,
          activeProducts,
          inactiveProducts: totalProducts - activeProducts,
          period
        },
        productsByCategory,
        topProducts,
        lowStockProducts,
        recentProducts
      }
    });
  } catch (error) {
    console.error('Admin product analytics error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ANALYTICS_ERROR',
        message: 'Failed to fetch product analytics'
      }
    });
  }
});

export default router;