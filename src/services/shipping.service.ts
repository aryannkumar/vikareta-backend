import { BaseService } from './base.service';
import { prisma } from '@/config/database';
import { NotFoundError, ValidationError } from '@/middleware/error-handler';

interface CalculateShippingParams {
  weight: number;
  distance: number;
  service: string;
}

interface CreateShipmentParams {
  orderId: string;
  providerId?: string;
  trackingNumber?: string;
  carrier?: string;
  shippingCost?: number;
  packageDetails?: any;
}

interface AddTrackingEventParams {
  orderId: string;
  trackingNumber?: string;
  carrier?: string;
  status?: string;
  trackingUrl?: string;
  notes?: string;
}

export class ShippingService extends BaseService {
  async getProviders() {
    return prisma.logisticsProvider.findMany({ where: { isActive: true }, orderBy: { priority: 'asc' } });
  }

  calculateShipping({ weight = 0, distance = 0, service = 'standard' }: Partial<CalculateShippingParams>) {
    const base = 30;
    const ratePerKg = service === 'express' ? 40 : 20;
    const distanceRate = 0.5;
    const cost = base + weight * ratePerKg + distance * distanceRate;
    return { cost: Number(cost.toFixed(2)) };
  }

  async createShipment(params: CreateShipmentParams) {
    if (!params.orderId) throw new ValidationError('orderId is required');
    const order = await prisma.order.findUnique({ where: { id: params.orderId } });
    if (!order) throw new NotFoundError('Order not found');

    const shipment = await prisma.shipment.create({
      data: {
        orderId: params.orderId,
        providerId: params.providerId || null,
        trackingNumber: params.trackingNumber || undefined,
        carrier: params.carrier || undefined,
        shippingCost: params.shippingCost !== undefined ? Number(params.shippingCost) : undefined,
        packageDetails: params.packageDetails || undefined,
        status: 'shipped',
      },
    });

    await prisma.order.update({
      where: { id: params.orderId },
      data: {
        trackingNumber: shipment.trackingNumber || undefined,
        shippingProvider: params.carrier || undefined,
        shippingAmount: shipment.shippingCost ?? undefined,
      },
    });

    return shipment;
  }

  async trackShipment(trackingNumber: string) {
    if (!trackingNumber) throw new ValidationError('trackingNumber is required');
    const shipment = await prisma.shipment.findUnique({
      where: { trackingNumber },
      include: { order: true, logisticsProvider: true },
    });
    if (!shipment) throw new NotFoundError('Shipment not found');
    return {
      status: shipment.status,
      estimatedDelivery: shipment.estimatedDelivery,
      trackingUrl: shipment.labelUrl || shipment.trackingNumber,
      shipment,
    };
  }

  async listAddresses(userId: string) {
    return prisma.shippingAddress.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createAddress(userId: string, data: any) {
    const required = ['name', 'phone', 'addressLine1', 'city', 'state', 'postalCode'];
    for (const field of required) if (!data[field]) throw new ValidationError(`Missing required field: ${field}`);
    if (data.isDefault) {
      await prisma.shippingAddress.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    }
    return prisma.shippingAddress.create({
      data: {
        userId,
        name: data.name,
        phone: data.phone,
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2 || null,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode,
        country: data.country || 'India',
        isDefault: !!data.isDefault,
      },
    });
  }

  async updateAddress(id: string, userId: string, data: any) {
    if (data.isDefault) {
      await prisma.shippingAddress.updateMany({ where: { userId, isDefault: true, NOT: { id } }, data: { isDefault: false } });
    }
    return prisma.shippingAddress.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.phone && { phone: data.phone }),
        ...(data.addressLine1 && { addressLine1: data.addressLine1 }),
        ...(data.addressLine2 !== undefined && { addressLine2: data.addressLine2 }),
        ...(data.city && { city: data.city }),
        ...(data.state && { state: data.state }),
        ...(data.postalCode && { postalCode: data.postalCode }),
        ...(data.country && { country: data.country }),
        ...(data.isDefault != null && { isDefault: data.isDefault }),
      },
    });
  }

  async deleteAddress(id: string) {
    await prisma.shippingAddress.delete({ where: { id } });
  }

  async setDefaultAddress(id: string, userId: string) {
    await prisma.shippingAddress.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    return prisma.shippingAddress.update({ where: { id }, data: { isDefault: true } });
  }

  async addTrackingEvent(data: AddTrackingEventParams) {
    if (!data.orderId) throw new ValidationError('orderId required');
    return prisma.deliveryTracking.create({
      data: {
        orderId: data.orderId,
        trackingNumber: data.trackingNumber || null,
        carrier: data.carrier || null,
        status: data.status || 'in_transit',
        trackingUrl: data.trackingUrl || null,
        notes: data.notes || null,
      },
    });
  }

  async listTrackingEvents(orderId?: string) {
    const where: any = {};
    if (orderId) where.orderId = orderId;
    return prisma.deliveryTracking.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async handleProviderWebhook(payload: any) {
    const trackingNumber = payload.trackingNumber || payload.awb || payload.awbNumber;
    const orderId = payload.orderId || payload.order_id || payload.order;
    if (trackingNumber) {
      await prisma.shipment.updateMany({ where: { trackingNumber }, data: { status: payload.status || 'in_transit', trackingNumber } });
      await prisma.deliveryTracking.create({ data: { orderId: orderId || (payload.orderId as string) || '', trackingNumber, carrier: payload.carrier || payload.provider, status: payload.status || 'in_transit', trackingUrl: payload.trackingUrl || undefined } }).catch(() => null);
    }
    if (payload.orderId && payload.paymentStatus) {
      await prisma.order.updateMany({ where: { id: payload.orderId }, data: { paymentStatus: payload.paymentStatus } }).catch(() => null);
    }
    return { processed: true };
  }
}

export const shippingService = new ShippingService();
