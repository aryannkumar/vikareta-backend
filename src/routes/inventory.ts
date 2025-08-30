import { Router } from 'express';
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

// Validation schemas
const adjustInventorySchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number(),
  type: z.enum(['in', 'out', 'adjustment']),
  reason: z.string().min(1),
  reference: z.string().optional()
});

const bulkAdjustInventorySchema = z.object({
  adjustments: z.array(adjustInventorySchema)
});

// GET /api/inventory/products - List inventory items
router.get('/products', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const {
      search,
      warehouse,
      status,
      category,
      sortBy = 'name',
      sortOrder = 'asc',
      page = '1',
      limit = '20'
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    // Build where clause
    const where: any = {
      product: {
        userId // Only show user's products
      }
    };

    if (search) {
      where.product.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { sku: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    if (warehouse && warehouse !== 'all') {
      where.warehouseId = warehouse;
    }

    if (category && category !== 'all') {
      where.product.category = category;
    }

    if (status && status !== 'all') {
      // Calculate status based on stock levels
      switch (status) {
        case 'out-of-stock':
          where.available = 0;
          break;
        case 'low-stock':
          // Low stock filter - items where available <= reorderLevel
          where.available = { lte: 0 }; // Will be handled by raw query
          break;
        case 'in-stock':
          // In stock filter - items where available > reorderLevel
          where.available = { gt: 0 }; // Will be handled by raw query
          break;
      }
    }

    // Get inventory items with product details
    const [inventoryItems, total] = await Promise.all([
      prisma.inventory.findMany({
        where,
        include: {
          product: {
            select: {
              id: true,
              title: true,
              stockQuantity: true,
              categoryId: true
            }
          },
          warehouse: {
            select: {
              id: true,
              name: true,
              location: true
            }
          }
        },
        orderBy: {
          ...(sortBy === 'name' ? { product: { title: sortOrder === 'asc' ? 'asc' : 'desc' } } : 
              sortBy === 'available' ? { available: sortOrder === 'asc' ? 'asc' : 'desc' } :
              sortBy === 'reorderLevel' ? { reorderLevel: sortOrder === 'asc' ? 'asc' : 'desc' } :
              { createdAt: sortOrder === 'asc' ? 'asc' : 'desc' })
        },
        skip: offset,
        take: limitNum
      }),
      prisma.inventory.count({ where })
    ]);

    // Transform data to match frontend interface
    const items = inventoryItems.map(item => {
      const available = item.available || 0;
      const reserved = item.reserved || 0;
      const reorderLevel = item.reorderLevel || 0;
      const maxStock = item.maxStock || 1000;

      let status = 'in-stock';
      if (available === 0) {
        status = 'out-of-stock';
      } else if (available <= reorderLevel) {
        status = 'low-stock';
      } else if (available >= maxStock * 0.9) {
        status = 'overstocked';
      }

      return {
        id: item.id,
        product: item.product,
        warehouse: item.warehouse,
        stock: {
          available,
          reserved,
          total: available + reserved,
          reorderLevel,
          maxStock
        },
        pricing: {
          costPrice: item.costPrice || 0,
          sellingPrice: item.sellingPrice || 0,
          margin: item.costPrice ? ((item.sellingPrice - item.costPrice) / item.costPrice) * 100 : 0
        },
        movement: {
          lastUpdated: item.updatedAt.toISOString(),
          lastMovement: item.lastMovementType || 'in',
          lastQuantity: item.lastMovementQuantity || 0,
          velocity: item.velocity || 0
        },
        status,
        alerts: []
      };
    });

    res.json({
      success: true,
      data: {
        items,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch inventory data'
      }
    });
  }
});

// GET /api/inventory/stats - Get inventory statistics
router.get('/stats', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const [
      totalItems,
      totalValue,
      lowStockItems,
      outOfStockItems,
      overstockedItems,
      warehouseCount
    ] = await Promise.all([
      prisma.inventory.count({
        where: {
          product: { sellerId: userId }
        }
      }),
      prisma.inventory.aggregate({
        where: {
          product: { sellerId: userId }
        },
        _sum: {
          totalValue: true
        }
      }),
      prisma.inventory.count({
        where: {
          product: { sellerId: userId },
          available: {
            lte: 0 // This will need to be a raw query or computed field
          }
        }
      }),
      prisma.inventory.count({
        where: {
          product: { sellerId: userId },
          available: 0
        }
      }),
      prisma.inventory.count({
        where: {
          product: { sellerId: userId },
          available: {
            gte: 900 // This will need to be a raw query or computed field
          }
        }
      }),
      prisma.warehouse.count({
        where: {
          userId
        }
      })
    ]);

    // Calculate average turnover (simplified calculation)
    const averageTurnover = 2.5; // This would be calculated based on historical data

    res.json({
      success: true,
      data: {
        totalItems,
        totalValue: totalValue._sum.totalValue || 0,
        lowStockItems,
        outOfStockItems,
        overstockedItems,
        averageTurnover,
        warehouseCount
      }
    });
  } catch (error) {
    console.error('Error fetching inventory stats:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'STATS_ERROR',
        message: 'Failed to fetch inventory statistics'
      }
    });
  }
});

// GET /api/inventory/movements - Get inventory movements
router.get('/movements', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { limit = '20', productId, type } = req.query;

    const limitNum = parseInt(limit as string);

    const where: any = {
      inventory: {
        product: { userId }
      }
    };

    if (productId) {
      where.inventory.productId = productId;
    }

    if (type && type !== 'all') {
      where.type = type;
    }

    const movements = await prisma.inventoryMovement.findMany({
      where,
      include: {
        inventory: {
          include: {
            product: {
              select: {
                title: true,
                id: true
              }
            },
            warehouse: {
              select: {
                name: true
              }
            }
          }
        },
        user: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limitNum
    });

    const formattedMovements = movements.map(movement => ({
      id: movement.id,
      type: movement.type,
      productName: movement.inventory.product.title,
      sku: movement.inventory.product.id,
      quantity: movement.quantity,
      warehouse: movement.inventory.warehouse.name,
      reason: movement.reason,
      reference: movement.reference,
      timestamp: movement.createdAt.toISOString(),
      user: `${movement.user.firstName || ''} ${movement.user.lastName || ''}`.trim() || 'Unknown User'
    }));

    res.json({
      success: true,
      data: {
        movements: formattedMovements
      }
    });
  } catch (error) {
    console.error('Error fetching inventory movements:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch inventory movements'
      }
    });
  }
});

// POST /api/inventory/products/:id/adjust - Adjust inventory
router.post('/products/:id/adjust', 
  authenticate, 
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = (req as any).user.id;
      const { adjustment, reason } = req.body;

      // Find inventory item
      const inventoryItem = await prisma.inventory.findFirst({
        where: {
          id,
          product: { sellerId: userId }
        }
      });

      if (!inventoryItem) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Inventory item not found'
          }
        });
      }

      // Calculate new quantity
      const newQuantity = Math.max(0, (inventoryItem.available || 0) + adjustment);
      const movementType = adjustment > 0 ? 'in' : 'out';

      // Update inventory in transaction
      await prisma.$transaction(async (tx) => {
        // Update inventory
        await tx.inventory.update({
          where: { id },
          data: {
            available: newQuantity,
            lastMovementType: movementType,
            lastMovementQuantity: Math.abs(adjustment),
            updatedAt: new Date()
          }
        });

        // Create movement record
        await tx.inventoryMovement.create({
          data: {
            inventoryId: id,
            type: movementType,
            quantity: Math.abs(adjustment),
            reason,
            userId
          }
        });
      });

      res.json({
        success: true,
        message: 'Inventory adjusted successfully'
      });
    } catch (error) {
      console.error('Error adjusting inventory:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'ADJUST_ERROR',
          message: 'Failed to adjust inventory'
        }
      });
    }
  }
);

// POST /api/inventory/bulk-update - Bulk update inventory
router.post('/bulk-update', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { updates } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DATA',
          message: 'Updates array is required'
        }
      });
    }

    // Process bulk updates in transaction
    await prisma.$transaction(async (tx) => {
      for (const update of updates) {
        const { id, stock } = update;

        // Verify ownership
        const inventoryItem = await tx.inventory.findFirst({
          where: {
            id,
            product: { sellerId: userId }
          }
        });

        if (inventoryItem) {
          await tx.inventory.update({
            where: { id },
            data: {
              available: stock,
              updatedAt: new Date()
            }
          });

          // Create movement record
          await tx.inventoryMovement.create({
            data: {
              inventoryId: id,
              type: 'adjustment',
              quantity: Math.abs(stock - (inventoryItem.available || 0)),
              reason: 'Bulk update',
              userId
            }
          });
        }
      }
    });

    res.json({
      success: true,
      message: 'Bulk update completed successfully'
    });
  } catch (error) {
    console.error('Error performing bulk update:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'BULK_UPDATE_ERROR',
        message: 'Failed to perform bulk update'
      }
    });
  }
});

// GET /api/inventory/alerts - Get inventory alerts
router.get('/alerts', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const alerts = await prisma.inventory.findMany({
      where: {
        product: { sellerId: userId },
        OR: [
          { available: 0 }, // Out of stock
          { available: { lte: 10 } } // Low stock - simplified for now
        ]
      },
      include: {
        product: {
          select: {
            title: true,
            id: true
          }
        },
        warehouse: {
          select: {
            name: true
          }
        }
      }
    });

    const formattedAlerts = alerts.map(alert => ({
      id: alert.id,
      type: alert.available === 0 ? 'out-of-stock' : 'low-stock',
      productName: alert.product.title,
      sku: alert.product.id,
      warehouse: alert.warehouse.name,
      currentStock: alert.available,
      reorderLevel: alert.reorderLevel,
      severity: alert.available === 0 ? 'high' : 'medium',
      createdAt: alert.updatedAt.toISOString()
    }));

    res.json({
      success: true,
      data: formattedAlerts
    });
  } catch (error) {
    console.error('Error fetching inventory alerts:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch inventory alerts'
      }
    });
  }
});

// GET /api/inventory/export - Export inventory data
router.get('/export', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const inventoryItems = await prisma.inventory.findMany({
      where: {
        product: { sellerId: userId }
      },
      include: {
        product: {
          select: {
            title: true,
            id: true,
            categoryId: true,
            description: true
          }
        },
        warehouse: {
          select: {
            name: true,
            location: true
          }
        }
      }
    });

    // Convert to CSV format
    const csvHeaders = [
      'Product Name',
      'SKU',
      'Category',
      'Brand',
      'Warehouse',
      'Available Stock',
      'Reserved Stock',
      'Reorder Level',
      'Max Stock',
      'Cost Price',
      'Selling Price',
      'Total Value'
    ];

    const csvRows = inventoryItems.map(item => [
      item.product.title,
      item.product.id,
      item.product.categoryId || '',
      item.product.description || '',
      item.warehouse.name,
      item.available || 0,
      item.reserved || 0,
      item.reorderLevel || 0,
      item.maxStock || 0,
      item.costPrice || 0,
      item.sellingPrice || 0,
      (item.available || 0) * (item.costPrice || 0)
    ]);

    const csvContent = [csvHeaders, ...csvRows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=inventory-export.csv');
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting inventory:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'EXPORT_ERROR',
        message: 'Failed to export inventory data'
      }
    });
  }
});

export default router;