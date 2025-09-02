import { PrismaClient, InventoryMovement } from '@prisma/client';

export class InventoryMovementService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createMovement(data: {
    inventoryId: string;
    userId: string;
    movementType: string;
    quantity: number;
    reason?: string;
    referenceId?: string;
    referenceType?: string;
    notes?: string;
  }): Promise<InventoryMovement> {
    return this.prisma.inventoryMovement.create({
      data: {
        inventoryId: data.inventoryId,
        userId: data.userId,
        movementType: data.movementType,
        quantity: data.quantity,
        reason: data.reason,
        referenceId: data.referenceId,
        referenceType: data.referenceType,
        notes: data.notes,
      },
    });
  }

  async getMovementById(id: string): Promise<InventoryMovement | null> {
    return this.prisma.inventoryMovement.findUnique({
      where: { id },
      include: {
        inventory: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                stockKeepingUnit: true,
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
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  async getMovementsByInventory(inventoryId: string, filters?: {
    movementType?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<InventoryMovement[]> {
    return this.prisma.inventoryMovement.findMany({
      where: {
        inventoryId,
        ...(filters?.movementType && { movementType: filters.movementType }),
        ...(filters?.dateFrom && {
          createdAt: { gte: filters.dateFrom },
        }),
        ...(filters?.dateTo && {
          createdAt: { lte: filters.dateTo },
        }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async getMovementsByUser(userId: string, filters?: {
    movementType?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<InventoryMovement[]> {
    return this.prisma.inventoryMovement.findMany({
      where: {
        userId,
        ...(filters?.movementType && { movementType: filters.movementType }),
        ...(filters?.dateFrom && {
          createdAt: { gte: filters.dateFrom },
        }),
        ...(filters?.dateTo && {
          createdAt: { lte: filters.dateTo },
        }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        inventory: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                stockKeepingUnit: true,
              },
            },
            warehouse: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async getMovementsByWarehouse(warehouseId: string, filters?: {
    movementType?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<InventoryMovement[]> {
    return this.prisma.inventoryMovement.findMany({
      where: {
        inventory: { warehouseId },
        ...(filters?.movementType && { movementType: filters.movementType }),
        ...(filters?.dateFrom && {
          createdAt: { gte: filters.dateFrom },
        }),
        ...(filters?.dateTo && {
          createdAt: { lte: filters.dateTo },
        }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        inventory: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                stockKeepingUnit: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async getMovementStats(filters?: {
    warehouseId?: string;
    productId?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<{
    totalMovements: number;
    inboundMovements: number;
    outboundMovements: number;
    adjustmentMovements: number;
    totalInboundQuantity: number;
    totalOutboundQuantity: number;
  }> {
    const whereClause: any = {};
    
    if (filters?.warehouseId) {
      whereClause.inventory = { warehouseId: filters.warehouseId };
    }
    
    if (filters?.productId) {
      whereClause.inventory = { 
        ...whereClause.inventory,
        productId: filters.productId 
      };
    }
    
    if (filters?.dateFrom) {
      whereClause.createdAt = { gte: filters.dateFrom };
    }
    
    if (filters?.dateTo) {
      whereClause.createdAt = { 
        ...whereClause.createdAt,
        lte: filters.dateTo 
      };
    }

    const [totalCount, inboundCount, outboundCount, adjustmentCount, inboundSum, outboundSum] = await Promise.all([
      this.prisma.inventoryMovement.count({ where: whereClause }),
      this.prisma.inventoryMovement.count({ 
        where: { ...whereClause, movementType: 'inbound' } 
      }),
      this.prisma.inventoryMovement.count({ 
        where: { ...whereClause, movementType: 'outbound' } 
      }),
      this.prisma.inventoryMovement.count({ 
        where: { ...whereClause, movementType: 'adjustment' } 
      }),
      this.prisma.inventoryMovement.aggregate({
        where: { ...whereClause, movementType: 'inbound' },
        _sum: { quantity: true },
      }),
      this.prisma.inventoryMovement.aggregate({
        where: { ...whereClause, movementType: 'outbound' },
        _sum: { quantity: true },
      }),
    ]);

    return {
      totalMovements: totalCount,
      inboundMovements: inboundCount,
      outboundMovements: outboundCount,
      adjustmentMovements: adjustmentCount,
      totalInboundQuantity: Number(inboundSum._sum.quantity || 0),
      totalOutboundQuantity: Number(outboundSum._sum.quantity || 0),
    };
  }

  async recordStockIn(data: {
    inventoryId: string;
    userId: string;
    quantity: number;
    reason?: string;
    referenceId?: string;
    notes?: string;
  }): Promise<{ movement: InventoryMovement; updatedInventory: any }> {
    const movement = await this.createMovement({
      ...data,
      movementType: 'inbound',
      referenceType: 'stock_in',
    });

    // Update inventory available quantity
    const updatedInventory = await this.prisma.inventory.update({
      where: { id: data.inventoryId },
      data: {
        available: { increment: data.quantity },
      },
    });

    return { movement, updatedInventory };
  }

  async recordStockOut(data: {
    inventoryId: string;
    userId: string;
    quantity: number;
    reason?: string;
    referenceId?: string;
    notes?: string;
  }): Promise<{ movement: InventoryMovement; updatedInventory: any }> {
    const movement = await this.createMovement({
      ...data,
      movementType: 'outbound',
      referenceType: 'stock_out',
    });

    // Update inventory available quantity
    const updatedInventory = await this.prisma.inventory.update({
      where: { id: data.inventoryId },
      data: {
        available: { decrement: data.quantity },
      },
    });

    return { movement, updatedInventory };
  }

  async recordStockAdjustment(data: {
    inventoryId: string;
    userId: string;
    quantity: number; // Can be positive or negative
    reason: string;
    notes?: string;
  }): Promise<{ movement: InventoryMovement; updatedInventory: any }> {
    const movement = await this.createMovement({
      ...data,
      movementType: 'adjustment',
      referenceType: 'adjustment',
    });

    // Update inventory available quantity
    const updatedInventory = await this.prisma.inventory.update({
      where: { id: data.inventoryId },
      data: {
        available: { increment: data.quantity },
      },
    });

    return { movement, updatedInventory };
  }
}

export const inventoryMovementService = new InventoryMovementService(new PrismaClient());