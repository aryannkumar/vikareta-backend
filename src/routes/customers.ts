import { Router } from 'express';
import { Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

// Validation schemas
const createCustomerSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional(),
  phone: z.string().min(10).max(20).optional(),
  businessName: z.string().max(255).optional(),
  gstin: z.string().max(15).optional(),
  address: z.string().optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
});

const updateCustomerSchema = createCustomerSchema.partial();

// GET /api/customers - Get customers list
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { page = 1, limit = 20, search, status } = req.query;
    
    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 100); // Max 100 per page
    const skip = (pageNum - 1) * limitNum;
    
    // Build where clause
    const where: any = {
      // Get customers who have placed orders with this seller
      buyerOrders: {
        some: {
          sellerId: userId
        }
      }
    };
    
    // Add search filter
    if (search && typeof search === 'string') {
      const searchTerm = search.trim();
      where.OR = [
        { firstName: { contains: searchTerm, mode: 'insensitive' } },
        { lastName: { contains: searchTerm, mode: 'insensitive' } },
        { email: { contains: searchTerm, mode: 'insensitive' } },
        { businessName: { contains: searchTerm, mode: 'insensitive' } },
        { phone: { contains: searchTerm } }
      ];
    }
    
    // Add status filter
    if (status && status !== 'all') {
      where.isActive = status === 'active';
    }
    
    // Get customers with order statistics
    const [customers, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          businessName: true,
          city: true,
          state: true,
          country: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          buyerOrders: {
            where: { sellerId: userId },
            select: {
              id: true,
              totalAmount: true,
              status: true,
              createdAt: true
            }
          }
        },
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.user.count({ where })
    ]);
    
    // Transform data to include customer statistics
    const transformedCustomers = customers.map(customer => {
      const orders = customer.buyerOrders;
      const totalOrders = orders.length;
      const totalSpent = orders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
      const lastOrderDate = orders.length > 0 ? orders[0].createdAt : null;
      
      return {
        id: customer.id,
        name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Unknown',
        email: customer.email,
        phone: customer.phone,
        company: customer.businessName,
        address: {
          city: customer.city,
          state: customer.state,
          country: customer.country
        },
        totalOrders,
        totalSpent,
        lastOrderDate,
        status: customer.isActive ? 'active' : 'inactive',
        createdAt: customer.createdAt,
        tags: [] // Can be extended later
      };
    });
    
    res.json({
      success: true,
      data: {
        customers: transformedCustomers,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch customers'
      }
    });
  }
});

// GET /api/customers/stats - Get customer statistics
router.get('/stats', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    
    // Get current date boundaries
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Get customer statistics using aggregations
    const [
      totalCustomersResult,
      activeCustomersResult,
      newThisMonthResult,
      revenueResult
    ] = await Promise.all([
      // Total unique customers who have ordered from this seller
      prisma.user.count({
        where: {
          buyerOrders: {
            some: { sellerId: userId }
          }
        }
      }),
      
      // Active customers (have placed orders in last 90 days)
      prisma.user.count({
        where: {
          isActive: true,
          buyerOrders: {
            some: {
              sellerId: userId,
              createdAt: {
                gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // 90 days ago
              }
            }
          }
        }
      }),
      
      // New customers this month
      prisma.user.count({
        where: {
          buyerOrders: {
            some: {
              sellerId: userId,
              createdAt: { gte: startOfMonth }
            }
          },
          createdAt: { gte: startOfMonth }
        }
      }),
      
      // Revenue and order statistics
      prisma.order.aggregate({
        where: {
          sellerId: userId,
          status: { in: ['delivered', 'completed'] }
        },
        _sum: { totalAmount: true },
        _count: { id: true }
      })
    ]);
    
    const totalRevenue = Number(revenueResult._sum.totalAmount || 0);
    const totalOrders = Number(revenueResult._count);
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    
    const stats = {
      totalCustomers: totalCustomersResult,
      activeCustomers: activeCustomersResult,
      newThisMonth: newThisMonthResult,
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
      totalRevenue: Math.round(totalRevenue * 100) / 100
    };
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching customer stats:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch customer statistics'
      }
    });
  }
});

// GET /api/customers/:id - Get customer details
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    
    const customer = await prisma.user.findFirst({
      where: {
        id,
        buyerOrders: {
          some: { sellerId: userId }
        }
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        businessName: true,
        city: true,
        state: true,
        country: true,
        address: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        buyerOrders: {
          where: { sellerId: userId },
          select: {
            id: true,
            totalAmount: true,
            status: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Customer not found'
        }
      });
    }
    
    // Transform data
    const orders = customer.buyerOrders;
    const transformedCustomer = {
      id: customer.id,
      name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Unknown',
      email: customer.email,
      phone: customer.phone,
      company: customer.businessName,
      address: {
        street: customer.address,
        city: customer.city,
        state: customer.state,
        country: customer.country
      },
      totalOrders: orders.length,
      totalSpent: orders.reduce((sum, order) => sum + Number(order.totalAmount), 0),
      lastOrderDate: orders.length > 0 ? orders[0].createdAt : null,
      status: customer.isActive ? 'active' : 'inactive',
      createdAt: customer.createdAt,
      orders: orders.map(order => ({
        id: order.id,
        amount: Number(order.totalAmount),
        status: order.status,
        date: order.createdAt
      }))
    };
    
    res.json({
      success: true,
      data: transformedCustomer
    });
  } catch (error) {
    console.error('Error fetching customer:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch customer'
      }
    });
  }
});

// POST /api/customers - Create new customer
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const validatedData = createCustomerSchema.parse(req.body);
    
    const newCustomer = await prisma.user.create({
      data: {
        ...validatedData,
        userType: 'buyer',
        isActive: true
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        businessName: true,
        city: true,
        state: true,
        country: true,
        address: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });
    
    res.status(201).json({
      success: true,
      data: {
        id: newCustomer.id,
        name: `${newCustomer.firstName || ''} ${newCustomer.lastName || ''}`.trim() || 'Unknown',
        email: newCustomer.email,
        phone: newCustomer.phone,
        company: newCustomer.businessName,
        address: {
          street: newCustomer.address,
          city: newCustomer.city,
          state: newCustomer.state,
          country: newCustomer.country
        },
        totalOrders: 0,
        totalSpent: 0,
        status: newCustomer.isActive ? 'active' : 'inactive',
        createdAt: newCustomer.createdAt
      },
      message: 'Customer created successfully'
    });
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: 'Failed to create customer'
      }
    });
  }
});

// PUT /api/customers/:id - Update customer
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = updateCustomerSchema.parse(req.body);
    
    const updatedCustomer = await prisma.user.update({
      where: { id },
      data: validatedData,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        businessName: true,
        city: true,
        state: true,
        country: true,
        address: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });
    
    res.json({
      success: true,
      data: {
        id: updatedCustomer.id,
        name: `${updatedCustomer.firstName || ''} ${updatedCustomer.lastName || ''}`.trim() || 'Unknown',
        email: updatedCustomer.email,
        phone: updatedCustomer.phone,
        company: updatedCustomer.businessName,
        address: {
          street: updatedCustomer.address,
          city: updatedCustomer.city,
          state: updatedCustomer.state,
          country: updatedCustomer.country
        },
        status: updatedCustomer.isActive ? 'active' : 'inactive',
        createdAt: updatedCustomer.createdAt,
        updatedAt: updatedCustomer.updatedAt
      },
      message: 'Customer updated successfully'
    });
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to update customer'
      }
    });
  }
});

// DELETE /api/customers/:id - Delete customer (soft delete)
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Soft delete by setting isActive to false
    await prisma.user.update({
      where: { id },
      data: { isActive: false }
    });
    
    res.json({
      success: true,
      message: 'Customer deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_ERROR',
        message: 'Failed to delete customer'
      }
    });
  }
});

export default router;