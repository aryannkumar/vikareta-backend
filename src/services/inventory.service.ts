import { PrismaClient, Inventory } from '@prisma/client';

export class InventoryService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createInventoryRecord(data: {
    productId: string;
    warehouseId: string;
    available?: number;
    reserved?: number;
    reorderLevel?: number;
    reorderQuantity?: number;
    maxStock?: number;
    costPrice?: number;
    sellingPrice?: number;
  }): Promise<Inventory> {
    return this.prisma.inventory.create({
      data: {
        productId: data.productId,
        warehouseId: data.warehouseId,
        available: data.available || 0,
        reserved: data.reserved || 0,
        reorderLevel: data.reorderLevel || 0,
        reorderQuantity: data.reorderQuantity || 50,
        maxStock: data.maxStock || 1000,
        costPrice: data.costPrice,
        sellingPrice: data.sellingPrice,
      },
    });
  }

  async getInventoryByProduct(productId: string): Promise<Inventory[]> {
    return this.prisma.inventory.findMany({
      where: { productId },
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
      orderBy: { createdAt: 'desc' },
    });
  }

  async getInventoryByWarehouse(warehouseId: string): Promise<Inventory[]> {
    return this.prisma.inventory.findMany({
      where: { warehouseId },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            stockKeepingUnit: true,
            imageUrls: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async async updateInventoryQuantity(orderId: string
    id: string,
    available: number,
    operation: 'add' | 'subtract' | 'set' = 'set'
  ): Promise<Inventory> {
    const inventory = await this.prisma.inventory.findUnique({
      where: { id },
    });

    if (!inventory) {
      throw new Error('Inventory record not found');
    }

    let newAvailable: number;
    switch (operation) {
      case 'add':
        newAvailable = inventory.available + available;
        break;
      case 'subtract':
        newAvailable = Math.max(0, inventory.available - available);
        break;
      case 'set':
      default:
        newAvailable = available;
        break;
    }

    return this.prisma.inventory.update({
      where: { id },
      data: {
        available: newAvailable,
        updatedAt: new Date(),
      },
    });
  }

  async reserveInventory(productId: string, quantity: number, warehouseId?: string): Promise<boolean> {
    const where: any = { productId };
    if (warehouseId) where.warehouseId = warehouseId;

    const inventory = await this.prisma.inventory.findFirst({
      where: {
        ...where,
        available: { gte: quantity },
      },
    });

    if (!inventory) {
      return false;
    }

    await this.prisma.inventory.update({
      where: { id: inventory.id },
      data: {
        reserved: inventory.reserved + quantity,
        available: inventory.available - quantity,
      },
    });

    return true;
  }

  async releaseReservedInventory(productId: string, quantity: number, warehouseId?: string): Promise<void> {
    const where: any = { productId };
    if (warehouseId) where.warehouseId = warehouseId;

    const inventory = await this.prisma.inventory.findFirst({
      where: {
        ...where,
        reserved: { gte: quantity },
      },
    });

    if (inventory) {
      await this.prisma.inventory.update({
        where: { id: inventory.id },
        data: {
          reserved: inventory.reserved - quantity,
          available: inventory.available + quantity,
        },
      });
    }
  }

  async confirmReservedInventory(productId: string, quantity: number, warehouseId?: string): Promise<void> {
    const where: any = { productId };
    if (warehouseId) where.warehouseId = warehouseId;

    const inventory = await this.prisma.inventory.findFirst({
      where: {
        ...where,
        reserved: { gte: quantity },
      },
    });

    if (inventory) {
      await this.prisma.inventory.update({
        where: { id: inventory.id },
        data: {
          reserved: inventory.reserved - quantity,
        },
      });
    }
  }

  async getLowStockItems(warehouseId?: string): Promise<Inventory[]> {
    const where: any = {};

    if (warehouseId) {
      where.warehouseId = warehouseId;
    }

    return this.prisma.inventory.findMany({
      where: {
        ...where,
        available: { lte: 10 }, // Low stock threshold
      },
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
      orderBy: { available: 'asc' },
    });
  }

  async getExpiringItems(days = 30): Promise<Inventory[]> {
    // Since the schema doesn't have expiryDate, return empty array
    // This can be implemented when expiry tracking is added to the schema
    return [];
  }

  async getInventoryStats(warehouseId?: string): Promise<{
    totalProducts: number;
    totalQuantity: number;
    totalValue: number;
    lowStockItems: number;
    expiringItems: number;
  }> {
    const where = warehouseId ? { warehouseId } : {};

    const [inventoryItems, lowStock, expiring] = await Promise.all([
      this.prisma.inventory.findMany({
        where,
        include: {
          product: {
            select: { price: true },
          },
        },
      }),
      this.getLowStockItems(warehouseId),
      this.getExpiringItems(),
    ]);

    const totalProducts = inventoryItems.length;
    const totalQuantity = inventoryItems.reduce((sum, item) => sum + item.available, 0);
    const totalValue = inventoryItems.reduce(
      (sum, item) => sum + (item.available * Number(item.product.price)),
      0
    );

    return {
      totalProducts,
      totalQuantity,
      totalValue,
      lowStockItems: lowStock.length,
      expiringItems: expiring.length,
    };
  }

  async deleteInventoryRecord(id: string): Promise<void> {
    await this.prisma.inventory.delete({
      where: { id },
    });
  }
}export 
const inventoryService = new InventoryService(new PrismaClient());