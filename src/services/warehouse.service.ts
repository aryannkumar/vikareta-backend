import { PrismaClient, Warehouse } from '@prisma/client';

export class WarehouseService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createWarehouse(data: {
    userId: string;
    name: string;
    location: string;
    address?: any;
    isActive?: boolean;
  }): Promise<Warehouse> {
    return this.prisma.warehouse.create({
      data: {
        userId: data.userId,
        name: data.name,
        location: data.location,
        address: data.address,
        isActive: data.isActive ?? true,
      },
    });
  }

  async getWarehouseById(id: string): Promise<Warehouse | null> {
    return this.prisma.warehouse.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        inventory: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                stockKeepingUnit: true,
                price: true,
              },
            },
          },
        },
        _count: {
          select: {
            inventory: true,
          },
        },
      },
    });
  }

  async getWarehouseByUserId(userId: string): Promise<Warehouse[]> {
    return this.prisma.warehouse.findMany({
      where: { userId },
      include: {
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

  async getAllWarehouses(isActive?: boolean): Promise<Warehouse[]> {
    const where = isActive !== undefined ? { isActive } : {};

    return this.prisma.warehouse.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        _count: {
          select: {
            inventory: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getWarehousesByLocation(location?: string): Promise<Warehouse[]> {
    const where: any = { isActive: true };
    
    if (location) where.location = { contains: location };

    return this.prisma.warehouse.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        _count: {
          select: {
            inventory: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async updateWarehouse(id: string, data: {
    name?: string;
    location?: string;
    address?: any;
    isActive?: boolean;
  }): Promise<Warehouse> {
    return this.prisma.warehouse.update({
      where: { id },
      data,
    });
  }

  async assignUser(warehouseId: string, userId: string): Promise<Warehouse> {
    return this.prisma.warehouse.update({
      where: { id: warehouseId },
      data: { userId },
    });
  }

  async getWarehouseInventoryInfo(id: string): Promise<{
    totalProducts: number;
    totalAvailable: number;
    totalReserved: number;
  }> {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: {
        inventory: {
          select: {
            available: true,
            reserved: true,
          },
        },
      },
    });

    if (!warehouse) {
      throw new Error('Warehouse not found');
    }

    const totalProducts = warehouse.inventory.length;
    const totalAvailable = warehouse.inventory.reduce((sum, item) => sum + item.available, 0);
    const totalReserved = warehouse.inventory.reduce((sum, item) => sum + item.reserved, 0);

    return {
      totalProducts,
      totalAvailable,
      totalReserved,
    };
  }

  async getWarehouseInventoryValue(id: string): Promise<{
    totalValue: number;
    totalQuantity: number;
    productCount: number;
  }> {
    const inventory = await this.prisma.inventory.findMany({
      where: { warehouseId: id },
      include: {
        product: {
          select: {
            price: true,
          },
        },
      },
    });

    const totalValue = inventory.reduce(
      (sum, item) => sum + (item.available * Number(item.product.price)),
      0
    );
    const totalQuantity = inventory.reduce((sum, item) => sum + item.available, 0);
    const productCount = inventory.length;

    return {
      totalValue,
      totalQuantity,
      productCount,
    };
  }

  async findWarehousesByLocation(locationQuery: string): Promise<Warehouse[]> {
    return this.prisma.warehouse.findMany({
      where: { 
        isActive: true,
        location: {
          contains: locationQuery,
        },
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
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in kilometers
    return distance;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  async deactivateWarehouse(id: string): Promise<Warehouse> {
    return this.prisma.warehouse.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async activateWarehouse(id: string): Promise<Warehouse> {
    return this.prisma.warehouse.update({
      where: { id },
      data: { isActive: true },
    });
  }

  async deleteWarehouse(id: string): Promise<void> {
    // Check if warehouse has inventory
    const inventoryCount = await this.prisma.inventory.count({
      where: { warehouseId: id },
    });

    if (inventoryCount > 0) {
      throw new Error('Cannot delete warehouse with existing inventory');
    }

    await this.prisma.warehouse.delete({
      where: { id },
    });
  }

  async getWarehouseStats(): Promise<{
    totalWarehouses: number;
    activeWarehouses: number;
    totalInventoryValue: number;
    totalProducts: number;
  }> {
    const warehouses = await this.prisma.warehouse.findMany({
      include: {
        inventory: {
          include: {
            product: {
              select: {
                price: true,
              },
            },
          },
        },
      },
    });

    const totalWarehouses = warehouses.length;
    const activeWarehouses = warehouses.filter(w => w.isActive).length;
    
    let totalInventoryValue = 0;
    let totalProducts = 0;

    warehouses.forEach(warehouse => {
      const inventoryValue = warehouse.inventory.reduce(
        (sum, item) => sum + (item.available * Number(item.product.price)),
        0
      );
      totalInventoryValue += inventoryValue;
      totalProducts += warehouse.inventory.length;
    });

    return {
      totalWarehouses,
      activeWarehouses,
      totalInventoryValue,
      totalProducts,
    };
  }
}

export const warehouseService = new WarehouseService();