import { Router } from 'express';
import { Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

// Validation schemas
const createShipmentSchema = z.object({
  orderId: z.string().uuid(),
  carrier: z.string().min(1).max(100).optional(),
  trackingNumber: z.string().max(100).optional(),
  estimatedDelivery: z.string().datetime().optional(),
  pickupAddress: z.object({
    name: z.string(),
    phone: z.string(),
    addressLine1: z.string(),
    addressLine2: z.string().optional(),
    city: z.string(),
    state: z.string(),
    postalCode: z.string(),
    country: z.string()
  }).optional(),
  deliveryAddress: z.object({
    name: z.string(),
    phone: z.string(),
    addressLine1: z.string(),
    addressLine2: z.string().optional(),
    city: z.string(),
    state: z.string(),
    postalCode: z.string(),
    country: z.string()
  }).optional(),
  packageDetails: z.object({
    weight: z.number().positive(),
    length: z.number().positive(),
    width: z.number().positive(),
    height: z.number().positive(),
    description: z.string().optional()
  }).optional()
});

const updateShipmentStatusSchema = z.object({
  status: z.enum(['pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned']),
  location: z.string().optional(),
  description: z.string().optional(),
  timestamp: z.string().datetime().optional()
});

// GET /api/shipments - Get shipments list
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { page = 1, limit = 20, search, status, carrier } = req.query;
    
    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 100);
    const skip = (pageNum - 1) * limitNum;
    
    // Build where clause - only show shipments for orders where user is the seller
    const where: any = {
      order: {
        sellerId: userId
      }
    };
    
    // Add search filter
    if (search && typeof search === 'string') {
      const searchTerm = search.trim();
      where.OR = [
        { trackingNumber: { contains: searchTerm, mode: 'insensitive' } },
        { order: { orderNumber: { contains: searchTerm, mode: 'insensitive' } } },
        { order: { buyer: { 
          OR: [
            { firstName: { contains: searchTerm, mode: 'insensitive' } },
            { lastName: { contains: searchTerm, mode: 'insensitive' } },
            { businessName: { contains: searchTerm, mode: 'insensitive' } }
          ]
        }}}
      ];
    }
    
    // Add status filter
    if (status && status !== 'all') {
      where.status = status;
    }
    
    // Add carrier filter
    if (carrier && carrier !== 'all') {
      where.carrier = carrier;
    }
    
    const [shipments, total] = await Promise.all([
      prisma.shipment.findMany({
        where,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              totalAmount: true,
              status: true,
              deliveryAddress: true,
              buyer: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  businessName: true,
                  email: true,
                  phone: true
                }
              },
              items: {
                select: {
                  id: true,
                  quantity: true,
                  product: {
                    select: {
                      id: true,
                      title: true,
                      media: {
                        take: 1,
                        select: { url: true, altText: true }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.shipment.count({ where })
    ]);
    
    // Transform data for frontend
    const transformedShipments = shipments.map(shipment => ({
      id: shipment.id,
      trackingNumber: shipment.trackingNumber,
      orderId: shipment.orderId,
      orderNumber: shipment.order.orderNumber,
      customer: {
        name: `${shipment.order.buyer.firstName || ''} ${shipment.order.buyer.lastName || ''}`.trim() || 
               shipment.order.buyer.businessName || 'Unknown',
        email: shipment.order.buyer.email,
        phone: shipment.order.buyer.phone
      },
      shippingAddress: shipment.deliveryAddress || shipment.order.deliveryAddress,
      carrier: shipment.carrier,
      status: shipment.status,
      estimatedDelivery: shipment.estimatedDelivery,
      actualDelivery: shipment.actualDelivery,
      cost: Number(shipment.shippingCost || 0),
      currency: 'INR',
      items: shipment.order.items.map(item => ({
        productId: item.product.id,
        name: item.product.title,
        quantity: item.quantity,
        image: item.product.media[0]?.url
      })),
      createdAt: shipment.createdAt,
      updatedAt: shipment.updatedAt
    }));
    
    res.json({
      success: true,
      data: {
        shipments: transformedShipments,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching shipments:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch shipments'
      }
    });
  }
});

// GET /api/shipments/stats - Get shipment statistics
router.get('/stats', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    
    const [
      totalShipments,
      pendingShipments,
      inTransitShipments,
      deliveredShipments,
      failedShipments,
      shippingCostResult
    ] = await Promise.all([
      prisma.shipment.count({
        where: { order: { sellerId: userId } }
      }),
      prisma.shipment.count({
        where: { 
          order: { sellerId: userId },
          status: 'pending'
        }
      }),
      prisma.shipment.count({
        where: { 
          order: { sellerId: userId },
          status: { in: ['picked_up', 'in_transit', 'out_for_delivery'] }
        }
      }),
      prisma.shipment.count({
        where: { 
          order: { sellerId: userId },
          status: 'delivered'
        }
      }),
      prisma.shipment.count({
        where: { 
          order: { sellerId: userId },
          status: { in: ['failed', 'returned'] }
        }
      }),
      prisma.shipment.aggregate({
        where: { order: { sellerId: userId } },
        _sum: { shippingCost: true }
      })
    ]);
    
    const stats = {
      totalShipments,
      pendingShipments,
      inTransitShipments,
      deliveredShipments,
      failedShipments,
      totalShippingCost: Number(shippingCostResult._sum.shippingCost || 0),
      averageDeliveryTime: 3.5, // Would need more complex calculation
      onTimeDeliveryRate: 92.5 // Would need more complex calculation
    };
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching shipment stats:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch shipment statistics'
      }
    });
  }
});

// GET /api/shipments/:id - Get shipment details
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    
    const shipment = await prisma.shipment.findFirst({
      where: {
        id,
        order: { sellerId: userId }
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            totalAmount: true,
            status: true,
            deliveryAddress: true,
            buyer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                businessName: true,
                email: true,
                phone: true
              }
            },
            items: {
              select: {
                id: true,
                quantity: true,
                product: {
                  select: {
                    id: true,
                    title: true,
                    media: {
                      take: 1,
                      select: { url: true, altText: true }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });
    
    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Shipment not found'
        }
      });
    }
    
    // Transform data for frontend
    const transformedShipment = {
      id: shipment.id,
      trackingNumber: shipment.trackingNumber,
      orderId: shipment.orderId,
      orderNumber: shipment.order.orderNumber,
      customer: {
        name: `${shipment.order.buyer.firstName || ''} ${shipment.order.buyer.lastName || ''}`.trim() || 
               shipment.order.buyer.businessName || 'Unknown',
        email: shipment.order.buyer.email,
        phone: shipment.order.buyer.phone
      },
      shippingAddress: shipment.deliveryAddress || shipment.order.deliveryAddress,
      carrier: shipment.carrier,
      status: shipment.status,
      estimatedDelivery: shipment.estimatedDelivery,
      actualDelivery: shipment.actualDelivery,
      cost: Number(shipment.shippingCost || 0),
      currency: 'INR',
      items: shipment.order.items.map(item => ({
        productId: item.product.id,
        name: item.product.title,
        quantity: item.quantity,
        image: item.product.media[0]?.url
      })),
      createdAt: shipment.createdAt,
      updatedAt: shipment.updatedAt
    };
    
    res.json({
      success: true,
      data: transformedShipment
    });
  } catch (error) {
    console.error('Error fetching shipment:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch shipment'
      }
    });
  }
});

// POST /api/shipments - Create new shipment
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const validatedData = createShipmentSchema.parse(req.body);
    
    // Verify the order belongs to this seller
    const order = await prisma.order.findFirst({
      where: {
        id: validatedData.orderId,
        sellerId: userId
      }
    });
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found or access denied'
        }
      });
    }
    
    const newShipment = await prisma.shipment.create({
      data: {
        orderId: validatedData.orderId,
        trackingNumber: `TRK${Date.now()}`,
        carrier: validatedData.carrier,
        status: 'pending',
        estimatedDelivery: validatedData.estimatedDelivery ? new Date(validatedData.estimatedDelivery) : null,
        pickupAddress: validatedData.pickupAddress,
        deliveryAddress: validatedData.deliveryAddress,
        packageDetails: validatedData.packageDetails
      },
      include: {
        order: {
          select: {
            orderNumber: true,
            buyer: {
              select: {
                firstName: true,
                lastName: true,
                businessName: true
              }
            }
          }
        }
      }
    });
    
    res.status(201).json({
      success: true,
      data: {
        id: newShipment.id,
        trackingNumber: newShipment.trackingNumber,
        orderId: newShipment.orderId,
        orderNumber: newShipment.order.orderNumber,
        customer: {
          name: `${newShipment.order.buyer.firstName || ''} ${newShipment.order.buyer.lastName || ''}`.trim() || 
                 newShipment.order.buyer.businessName || 'Unknown'
        },
        status: newShipment.status,
        estimatedDelivery: newShipment.estimatedDelivery,
        createdAt: newShipment.createdAt
      },
      message: 'Shipment created successfully'
    });
  } catch (error) {
    console.error('Error creating shipment:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: 'Failed to create shipment'
      }
    });
  }
});

// PUT /api/shipments/:id/status - Update shipment status
router.put('/:id/status', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const validatedData = updateShipmentStatusSchema.parse(req.body);
    
    // Verify shipment belongs to this seller
    const existingShipment = await prisma.shipment.findFirst({
      where: {
        id,
        order: { sellerId: userId }
      }
    });
    
    if (!existingShipment) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Shipment not found'
        }
      });
    }
    
    // Update shipment status
    const updateData: any = {
      status: validatedData.status
    };
    
    // Set delivery date if delivered
    if (validatedData.status === 'delivered') {
      updateData.deliveredAt = new Date();
      updateData.actualDelivery = new Date();
    }
    
    // Set shipped date if picked up
    if (validatedData.status === 'picked_up' && !existingShipment.shippedAt) {
      updateData.shippedAt = new Date();
    }
    
    const updatedShipment = await prisma.shipment.update({
      where: { id },
      data: updateData,
      include: {
        order: {
          select: {
            orderNumber: true,
            buyer: {
              select: {
                firstName: true,
                lastName: true,
                businessName: true
              }
            }
          }
        }
      }
    });
    
    res.json({
      success: true,
      data: {
        id: updatedShipment.id,
        trackingNumber: updatedShipment.trackingNumber,
        status: updatedShipment.status,
        updatedAt: updatedShipment.updatedAt
      },
      message: 'Shipment status updated successfully'
    });
  } catch (error) {
    console.error('Error updating shipment status:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to update shipment status'
      }
    });
  }
});

// PUT /api/shipments/:id - Update shipment
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const updateData = req.body;
    
    // Verify shipment belongs to this seller
    const existingShipment = await prisma.shipment.findFirst({
      where: {
        id,
        order: { sellerId: userId }
      }
    });
    
    if (!existingShipment) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Shipment not found'
        }
      });
    }
    
    const updatedShipment = await prisma.shipment.update({
      where: { id },
      data: {
        ...updateData,
        updatedAt: new Date()
      }
    });
    
    res.json({
      success: true,
      data: updatedShipment,
      message: 'Shipment updated successfully'
    });
  } catch (error) {
    console.error('Error updating shipment:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to update shipment'
      }
    });
  }
});

// DELETE /api/shipments/:id - Delete shipment
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    
    // Find the shipment
    const shipment = await prisma.shipment.findFirst({
      where: {
        id,
        order: {
          OR: [
            { buyerId: userId },
            { sellerId: userId }
          ]
        }
      }
    });
    
    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Shipment not found'
        }
      });
    }
    
    // Delete the shipment
    await prisma.shipment.delete({
      where: { id }
    });
    
    res.json({
      success: true,
      message: 'Shipment deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting shipment:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_ERROR',
        message: 'Failed to delete shipment'
      }
    });
  }
});

export default router;