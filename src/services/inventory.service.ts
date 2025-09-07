import { prisma } from '@/config/database';
import { inventoryMovementsCounter } from '@/observability/metrics';
import { trace } from '@opentelemetry/api';
// logger intentionally unused in this service for now

export class InventoryService {
  async listInventory(sellerId: string, page: number, limit: number, warehouseId?: string, lowStock?: boolean) {
    const skip = (page - 1) * limit;

    const where: any = {
      product: {
        sellerId,
        isActive: true,
      },
    };

    if (warehouseId) where.warehouseId = warehouseId;
    if (lowStock) where.available = { lte: 10 };

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
              category: { select: { id: true, name: true } },
              media: { take: 1, orderBy: { sortOrder: 'asc' } },
            },
          },
          warehouse: { select: { id: true, name: true, location: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.inventory.count({ where }),
    ]);

    return { inventory, total };
  }

  async getWarehouses(sellerId: string) {
    return await prisma.warehouse.findMany({
      where: { userId: sellerId, isActive: true },
      include: { _count: { select: { inventory: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createWarehouse(sellerId: string, data: any) {
    return await prisma.warehouse.create({
      data: {
        userId: sellerId,
        name: data.name,
        location: data.location ?? undefined,
        address: data.address ? {
          address: data.address,
          city: data.city,
          state: data.state,
          country: data.country,
          postalCode: data.postalCode,
          contactPerson: data.contactPerson,
          contactPhone: data.contactPhone,
          contactEmail: data.contactEmail,
        } : undefined,
        isActive: true,
      },
    });
  }

  async listMovements(sellerId: string, page: number, limit: number, productId?: string, warehouseId?: string, movementType?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    where['inventory'] = { product: { sellerId } };
    if (productId) where.inventory = { productId };
    if (warehouseId) where.inventory = { warehouseId };
    if (movementType) where.type = movementType;

    const [movements, total] = await Promise.all([
      prisma.inventoryMovement.findMany({
        where,
        include: {
          inventory: { include: { product: { select: { id: true, title: true, sku: true } }, warehouse: { select: { id: true, name: true } } } },
          user: { select: { id: true, firstName: true, lastName: true, businessName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.inventoryMovement.count({ where }),
    ]);

    return { movements, total };
  }

  async adjustInventory(sellerId: string, payload: any) {
    const tracer = trace.getTracer('vikareta-inventory');
    return await tracer.startActiveSpan('inventory.adjust', async (span) => {
    const { productId, warehouseId, movementType, quantity, reason } = payload;

    const product = await prisma.product.findFirst({ where: { id: productId, sellerId } });
    if (!product) throw new Error('Product not found or unauthorized');

    const currentInventory = await prisma.inventory.findFirst({ where: { productId, warehouseId } });

    let newQuantity = quantity;
    let previousQuantity = 0;

    if (currentInventory) {
      previousQuantity = currentInventory.available;
      if (movementType === 'in' || movementType === 'adjustment') {
        newQuantity = movementType === 'in' ? previousQuantity + quantity : quantity;
      } else if (movementType === 'out') {
        newQuantity = previousQuantity - quantity;
        if (newQuantity < 0) throw new Error('Insufficient inventory');
      }
    } else if (movementType === 'out') {
      throw new Error('No inventory found for this product');
    }

    const result = await prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.upsert({
        where: { productId_warehouseId: { productId, warehouseId } },
        update: { available: newQuantity, reserved: currentInventory?.reserved || 0, updatedAt: new Date() },
        create: { productId, warehouseId, available: newQuantity, reserved: 0 },
      });

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
          inventory: { include: { product: { select: { id: true, title: true, sku: true } }, warehouse: { select: { id: true, name: true } } } },
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      });

  inventoryMovementsCounter.inc({ type: movementType });
  return { inventory, movement };
    });

    span.setAttribute('inventory.productId', productId);
    span.setAttribute('inventory.warehouseId', warehouseId);
    span.setAttribute('inventory.movementType', movementType);
    span.setAttribute('inventory.quantity', quantity);
    span.end();
    return result;
    });
  }

  async getAnalytics(sellerId: string) {
    const [
      totalProducts,
      totalStock,
      lowStockCount,
      outOfStockCount,
      warehouseBreakdown,
    ] = await Promise.all([
      prisma.product.count({ where: { sellerId, isActive: true } }),
      prisma.inventory.aggregate({ where: { product: { sellerId, isActive: true } }, _sum: { available: true } }),
      prisma.inventory.count({ where: { product: { sellerId, isActive: true }, available: { lte: 10, gt: 0 } } }),
      prisma.inventory.count({ where: { product: { sellerId, isActive: true }, available: 0 } }),
      prisma.inventory.groupBy({ by: ['warehouseId'], where: { product: { sellerId, isActive: true } }, _count: { id: true }, _sum: { available: true } }),
      prisma.inventory.groupBy({ by: ['productId'], where: { product: { sellerId, isActive: true } }, _sum: { available: true } }),
    ]);

  const warehouseIds = warehouseBreakdown.map(wb => wb.warehouseId);
    const warehouses = await prisma.warehouse.findMany({ where: { id: { in: warehouseIds } }, select: { id: true, name: true } });
    const warehouseMap = warehouses.reduce((acc, w) => { acc[w.id] = w.name; return acc; }, {} as Record<string,string>);

    const warehouseAnalytics = warehouseBreakdown.map(wb => ({
      warehouseId: wb.warehouseId,
      warehouseName: warehouseMap[wb.warehouseId] || 'Unknown',
      productCount: wb._count.id,
      totalStock: wb._sum.available || 0,
    }));

    return {
      totalProducts,
      totalStock: totalStock._sum.available || 0,
      lowStockCount,
      outOfStockCount,
      inStockCount: totalProducts - outOfStockCount,
      warehouseBreakdown: warehouseAnalytics,
    };
  }
}

export const inventoryService = new InventoryService();
