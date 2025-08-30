/**
 * Admin Order Management Routes
 * Comprehensive order management for administrators
 */

import { Router } from 'express';
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateAdmin, requirePermission } from '../middleware/admin-auth';

const router = Router();
const prisma = new PrismaClient();

// GET /api/admin/orders - Get all orders with advanced filtering
router.get('/', authenticateAdmin, requirePermission('orders.read'), async (req: Request, res: Response) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search, 
      status, 
      dateFrom, 
      dateTo,
      minAmount,
      maxAmount,
      orderType,
      paymentStatus
    } = req.query;
    
    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 100);
    const skip = (pageNum - 1) * limitNum;
    
    const where: any = {};
    
    // Search filter
    if (search) {
      where.OR = [
        { orderNumber: { contains: search as string, mode: 'insensitive' } },
        { buyer: { 
          OR: [
            { firstName: { contains: search as string, mode: 'insensitive' } },
            { lastName: { contains: search as string, mode: 'insensitive' } },
            { businessName: { contains: search as string, mode: 'insensitive' } },
            { email: { contains: search as string, mode: 'insensitive' } }
          ]
        }},
        { seller: { 
          OR: [
            { firstName: { contains: search as string, mode: 'insensitive' } },
            { lastName: { contains: search as string, mode: 'insensitive' } },
            { businessName: { contains: search as string, mode: 'insensitive' } },
            { email: { contains: search as string, mode: 'insensitive' } }
          ]
        }}
      ];
    }
    
    // Status filter
    if (status && status !== 'all') {
      where.status = status;
    }
    
    // Date range filter
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom as string);
      }
      if (dateTo) {
        where.createdAt.lte = new Date(dateTo as string);
      }
    }
    
    // Amount range filter
    if (minAmount || maxAmount) {
      where.totalAmount = {};
      if (minAmount) {
        where.totalAmount.gte = parseFloat(minAmount as string);
      }
      if (maxAmount) {
        where.totalAmount.lte = parseFloat(maxAmount as string);
      }
    }
    
    // Order type filter
    if (orderType && orderType !== 'all') {
      where.type = orderType;
    }
    
    // Payment status filter
    if (paymentStatus && paymentStatus !== 'all') {
      where.paymentStatus = paymentStatus;
    }
    
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          buyer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              email: true
            }
          },
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              email: true
            }
          },
          orderItems: {
            include: {
              product: {
                select: {
                  id: true,
                  title: true,
                  images: true
                }
              },
              service: {
                select: {
                  id: true,
                  title: true,
                  images: true
                }
              }
            }
          },
          payments: {
            select: {
              id: true,
              amount: true,
              status: true,
              method: true,
              createdAt: true
            }
          }
        },
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.order.count({ where })
    ]);
    
    res.json({
      success: true,
      data: {
        orders: orders.map(order => ({
          id: order.id,
          orderNumber: order.orderNumber,
          type: order.type,
          status: order.status,
          paymentStatus: order.paymentStatus,
          totalAmount: Number(order.totalAmount),
          buyer: {
            id: order.buyer.id,
            name: order.buyer.businessName || `${order.buyer.firstName} ${order.buyer.lastName}`,
            email: order.buyer.email
          },
          seller: {
            id: order.seller.id,
            name: order.seller.businessName || `${order.seller.firstName} ${order.seller.lastName}`,
            email: order.seller.email
          },
          itemsCount: order.orderItems.length,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          deliveryDate: order.deliveryDate,
          payments: order.payments
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
    console.error('Admin orders fetch error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch orders'
      }
    });
  }
});

// GET /api/admin/orders/:id - Get order details
router.get('/:id', authenticateAdmin, requirePermission('orders.read'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        buyer: {
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
        orderItems: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                description: true,
                images: true,
                price: true,
                category: { select: { name: true } },
                subcategory: { select: { name: true } }
              }
            },
            service: {
              select: {
                id: true,
                title: true,
                description: true,
                images: true,
                price: true,
                category: { select: { name: true } },
                subcategory: { select: { name: true } }
              }
            }
          }
        },
        payments: {
          orderBy: { createdAt: 'desc' }
        },
        deliveryInfo: true,
        orderHistory: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found'
        }
      });
    }
    
    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('Admin order details error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch order details'
      }
    });
  }
});

// PUT /api/admin/orders/:id/status - Update order status
router.put('/:id/status', authenticateAdmin, requirePermission('orders.write'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, reason, notifyUsers = true } = req.body;
    
    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: 'Invalid order status'
        }
      });
    }
    
    // Get current order
    const currentOrder = await prisma.order.findUnique({
      where: { id },
      select: { status: true }
    });
    
    if (!currentOrder) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found'
        }
      });
    }
    
    // Update order status
    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        status,
        updatedAt: new Date()
      },
      include: {
        buyer: { select: { firstName: true, lastName: true, email: true } },
        seller: { select: { firstName: true, lastName: true, email: true } }
      }
    });
    
    // Create order history entry
    await prisma.orderHistory.create({
      data: {
        orderId: id,
        status,
        notes: reason || `Status updated by admin: ${(req as any).adminUser.email}`,
        createdBy: (req as any).adminUser.id
      }
    });
    
    // Log admin action
    await prisma.adminAction.create({
      data: {
        adminId: (req as any).adminUser.id,
        action: 'ORDER_STATUS_UPDATE',
        targetType: 'ORDER',
        targetId: id,
        details: {
          oldStatus: currentOrder.status,
          newStatus: status,
          reason: reason || 'No reason provided'
        }
      }
    });
    
    res.json({
      success: true,
      data: updatedOrder,
      message: 'Order status updated successfully'
    });
  } catch (error) {
    console.error('Admin order status update error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to update order status'
      }
    });
  }
});

export default router;