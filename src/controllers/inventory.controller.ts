import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export class InventoryController {
  async getInventory(req: Request, res: Response): Promise<void> {
    try {
      const sellerId = req.user?.id;
      if (!sellerId) {
        res.status(401).json({ 
          success: false,
          error: 'Unauthorized' 
        });
        return;
      }

      const { page = 1, limit = 20, warehouseId, lowStock = false } = req.query;
      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      const where: any = {
        product: {
          sellerId,
          isActive: true,
        },
      };

      if (warehouseId) {
        where.warehouseId = warehouseId;
      }

      if (lowStock === 'true') {
        where.available = {
          lte: 10, // Consider items with 10 or fewer as low stock
        };
      }

      const [inventory, total] = await Promise.all([
        prisma.inventory.findMany({
          where,
          include: {
            product: {
              select: {
                id: true,
                title: true,
                sku: true,
                price: true,
                currency: true,
                category: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                media: {
                  take: 1,
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
            warehouse: {
              select: {
                id: true,
                name: true,
                location: true,
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
          skip,
          take: parseInt(limit as string),
        }),
        prisma.inventory.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        message: 'Inventory retrieved successfully',
        data: {
          inventory,
          total,
          page: parseInt(page as string),
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      });
    } catch (error) {
      logger.error('Error getting inventory:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  async getWarehouses(req: Request, res: Response): Promise<void> {
    try {
      const sellerId = req.user?.id;
      if (!sellerId) {
        res.status(401).json({ 
          success: false,
          error: 'Unauthorized' 
        });
        return;
      }

      const warehouses = await prisma.warehouse.findMany({
        where: {
          userId: sellerId,
          isActive: true,
        },
        include: {
          _count: {
            select: {
              inventory: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      });

      res.status(200).json({
        success: true,
        message: 'Warehouses retrieved successfully',
        data: warehouses,
      });
    } catch (error) {
      logger.error('Error getting warehouses:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  async createWarehouse(req: Request, res: Response): Promise<void> {
    try {
      const sellerId = req.user?.id;
      if (!sellerId) {
        res.status(401).json({ 
          success: false,
          error: 'Unauthorized' 
        });
        return;
      }

      const {
        name,
        description,
        location,
        address,
        city,
        state,
        country,
        postalCode,
        contactPerson,
        contactPhone,
        contactEmail,
      } = req.body;

      const warehouse = await prisma.warehouse.create({
        data: {
          userId: sellerId,
          name,
          location: location ?? undefined,
          address: address ? { address, city, state, country, postalCode, contactPerson, contactPhone, contactEmail } : undefined,
          isActive: true,
        },
      });

      res.status(201).json({
        success: true,
        message: 'Warehouse created successfully',
        data: warehouse,
      });
    } catch (error) {
      logger.error('Error creating warehouse:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  async getMovements(req: Request, res: Response): Promise<void> {
    try {
      const sellerId = req.user?.id;
      if (!sellerId) {
        res.status(401).json({ 
          success: false,
          error: 'Unauthorized' 
        });
        return;
      }

      const { page = 1, limit = 20, productId, warehouseId, movementType } = req.query;
      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      const where: any = {};

      // Filter movements for products owned by this seller
      where['inventory'] = { product: { sellerId } };
      if (productId) where.inventory = { productId };
      if (warehouseId) where.inventory = { warehouseId };
      if (movementType) where.type = movementType;

      const [movements, total] = await Promise.all([
        prisma.inventoryMovement.findMany({
          where,
          include: {
            inventory: {
              include: {
                product: {
                  select: { id: true, title: true, sku: true },
                },
                warehouse: { select: { id: true, name: true } },
              },
            },
            user: { select: { id: true, firstName: true, lastName: true, businessName: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit as string),
        }),
        prisma.inventoryMovement.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        message: 'Inventory movements retrieved successfully',
        data: {
          movements,
          total,
          page: parseInt(page as string),
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      });
    } catch (error) {
      logger.error('Error getting inventory movements:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  async adjustInventory(req: Request, res: Response): Promise<void> {
    try {
      const sellerId = req.user?.id;
      if (!sellerId) {
        res.status(401).json({ 
          success: false,
          error: 'Unauthorized' 
        });
        return;
      }

      const {
        productId,
        warehouseId,
        movementType, // 'in', 'out', 'adjustment'
        quantity,
        reason,
        notes,
      } = req.body;

      // Verify product belongs to seller
      const product = await prisma.product.findFirst({
        where: {
          id: productId,
          sellerId,
        },
      });

      if (!product) {
        res.status(404).json({ 
          success: false,
          error: 'Product not found or unauthorized' 
        });
        return;
      }

      // Get current inventory
      const currentInventory = await prisma.inventory.findFirst({
        where: {
          productId,
          warehouseId,
        },
      });

      let newQuantity = quantity;
      let previousQuantity = 0;

      if (currentInventory) {
        previousQuantity = currentInventory.available;
        
        if (movementType === 'in' || movementType === 'adjustment') {
          newQuantity = movementType === 'in' 
            ? previousQuantity + quantity 
            : quantity;
        } else if (movementType === 'out') {
          newQuantity = previousQuantity - quantity;
          if (newQuantity < 0) {
            res.status(400).json({ 
              success: false,
              error: 'Insufficient inventory' 
            });
            return;
          }
        }
      } else if (movementType === 'out') {
        res.status(400).json({ 
          success: false,
          error: 'No inventory found for this product' 
        });
        return;
      }

      // Use transaction to ensure consistency
      const result = await prisma.$transaction(async (tx) => {
        // Update or create inventory record
        const inventory = await tx.inventory.upsert({
          where: {
            productId_warehouseId: {
              productId,
              warehouseId,
            },
          },
          update: {
            available: newQuantity,
            reserved: currentInventory?.reserved || 0,
            updatedAt: new Date(),
          },
          create: {
            productId,
            warehouseId,
            available: newQuantity,
            reserved: 0,
          },
        });

        // Create movement record
        const movement = await tx.inventoryMovement.create({
          data: {
            inventoryId: inventory.id,
            type: movementType,
            quantity: movementType === 'out' ? -quantity : quantity,
            reason,
            reference: '',
            userId: sellerId,
          },
          include: {
            inventory: {
              include: {
                product: { select: { id: true, title: true, sku: true } },
                warehouse: { select: { id: true, name: true } },
              },
            },
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        });

        return { inventory, movement };
      });

      res.status(200).json({
        success: true,
        message: 'Inventory adjusted successfully',
        data: result,
      });
    } catch (error) {
      logger.error('Error adjusting inventory:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  async getInventoryAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const sellerId = req.user?.id;
      if (!sellerId) {
        res.status(401).json({ 
          success: false,
          error: 'Unauthorized' 
        });
        return;
      }

      const [
        totalProducts,
        totalStock,
        lowStockCount,
        outOfStockCount,
        warehouseBreakdown,
        categoryBreakdown,
      ] = await Promise.all([
        // Total products
        prisma.product.count({
          where: {
            sellerId,
            isActive: true,
          },
        }),
        // Total stock value
        prisma.inventory.aggregate({
          where: {
            product: {
              sellerId,
              isActive: true,
            },
          },
          _sum: {
            available: true,
          },
        }),
        // Low stock count (<=10)
        prisma.inventory.count({
          where: {
            product: {
              sellerId,
              isActive: true,
            },
            available: {
              lte: 10,
              gt: 0,
            },
          },
        }),
        // Out of stock count
        prisma.inventory.count({
          where: {
            product: {
              sellerId,
              isActive: true,
            },
            available: 0,
          },
        }),
        // Warehouse breakdown
        prisma.inventory.groupBy({
          by: ['warehouseId'],
          where: {
            product: {
              sellerId,
              isActive: true,
            },
          },
          _count: {
            id: true,
          },
          _sum: {
            available: true,
          },
        }),
        // Category breakdown
        prisma.inventory.groupBy({
          by: ['productId'],
          where: {
            product: {
              sellerId,
              isActive: true,
            },
          },
          _sum: {
            available: true,
          },
        }),
      ]);

      // Get warehouse names
      const warehouseIds = warehouseBreakdown.map(wb => wb.warehouseId);
      const warehouses = await prisma.warehouse.findMany({
        where: {
          id: {
            in: warehouseIds,
          },
        },
        select: {
          id: true,
          name: true,
        },
      });

      const warehouseMap = warehouses.reduce((acc, warehouse) => {
        acc[warehouse.id] = warehouse.name;
        return acc;
      }, {} as Record<string, string>);

      const warehouseAnalytics = warehouseBreakdown.map(wb => ({
        warehouseId: wb.warehouseId,
        warehouseName: warehouseMap[wb.warehouseId] || 'Unknown',
        productCount: wb._count.id,
        totalStock: wb._sum.available || 0,
      }));

      res.status(200).json({
        success: true,
        message: 'Inventory analytics retrieved successfully',
        data: {
          totalProducts,
          totalStock: totalStock._sum.available || 0,
          lowStockCount,
          outOfStockCount,
          inStockCount: totalProducts - outOfStockCount,
          warehouseBreakdown: warehouseAnalytics,
        },
      });
    } catch (error) {
      logger.error('Error getting inventory analytics:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }
}