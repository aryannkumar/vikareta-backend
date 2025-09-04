import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { inventoryService } from '@/services/inventory.service';

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

      const { page = 1, limit = 20, warehouseId, lowStock = 'false' } = req.query;
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);

      const { inventory, total } = await inventoryService.listInventory(
        sellerId,
        pageNum,
        limitNum,
        warehouseId as string | undefined,
        lowStock === 'true'
      );

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

      const warehouses = await inventoryService.getWarehouses(sellerId);

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

      const warehouse = await inventoryService.createWarehouse(sellerId, {
        name,
        location,
        address,
        city,
        state,
        country,
        postalCode,
        contactPerson,
        contactPhone,
        contactEmail,
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

      const { page = 1, limit = 20, productId, warehouseId: wid, movementType } = req.query;
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);

      const { movements, total } = await inventoryService.listMovements(
        sellerId,
        pageNum,
        limitNum,
        productId as string | undefined,
        wid as string | undefined,
        movementType as string | undefined
      );

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
      } = req.body;

      // Verify product belongs to seller
      const { inventory: resultInventory, movement } = await inventoryService.adjustInventory(sellerId, {
        productId,
        warehouseId,
        movementType,
        quantity,
        reason,
      });

      res.status(200).json({
        success: true,
        message: 'Inventory adjusted successfully',
        data: {
          inventory: resultInventory,
          movement,
        },
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

      const analytics = await inventoryService.getAnalytics(sellerId);

      res.status(200).json({
        success: true,
        message: 'Inventory analytics retrieved successfully',
        data: analytics,
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