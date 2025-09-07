import { BaseService } from './base.service';
import { NotFoundError, ValidationError } from '@/middleware/error-handler';
import { logger } from '@/utils/logger';

export interface ServiceAppointmentFilters {
  serviceId?: string;
  status?: string;
  providerId?: string; // provider (service provider)
  customerId?: string; // buyer (order buyer)
  from?: Date;
  to?: Date;
}

export class ServiceAppointmentService extends BaseService {
  async getById(id: string) {
    this.validateUUID(id, 'id');
    const appt = await this.prisma.serviceAppointment.findUnique({
      where: { id },
      include: {
        service: { select: { id: true, title: true, providerId: true, price: true, duration: true } },
        order: { select: { id: true, orderNumber: true, buyerId: true, sellerId: true, status: true } },
      },
    });
    if (!appt) throw new NotFoundError('Service appointment not found');
    return appt;
  }

  async list(filters: ServiceAppointmentFilters, page = 1, limit = 20) {
    const where: any = {};
    if (filters.serviceId) where.serviceId = filters.serviceId;
    if (filters.status) where.status = filters.status;

    // Date range
    if (filters.from || filters.to) {
      where.scheduledDate = {};
      if (filters.from) where.scheduledDate.gte = filters.from;
      if (filters.to) where.scheduledDate.lte = filters.to;
    }

    // Provider or customer constraints via relations
    if (filters.providerId || filters.customerId) {
      where.AND = where.AND || [];
      if (filters.providerId) {
        where.AND.push({ service: { providerId: filters.providerId } });
      }
      if (filters.customerId) {
        where.AND.push({ order: { buyerId: filters.customerId } });
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.serviceAppointment.findMany({
        where,
        include: {
          service: { select: { id: true, title: true, providerId: true } },
          order: { select: { id: true, orderNumber: true, buyerId: true } },
        },
        orderBy: { scheduledDate: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.serviceAppointment.count({ where }),
    ]);

    return this.createPaginatedResult(data, total, { page, limit, skip: (page - 1) * limit });
  }

  async updateStatus(id: string, status: string, userId: string) {
    this.validateUUID(id, 'id');
    const appt = await this.prisma.serviceAppointment.findUnique({
      where: { id },
      include: { service: true, order: true },
    });
    if (!appt) throw new NotFoundError('Service appointment not found');

    // Permission: provider or buyer
    if (appt.service.providerId !== userId && appt.order.buyerId !== userId) {
      throw new ValidationError('Not authorized to update this appointment');
    }

    const allowedStatuses = ['scheduled', 'in_progress', 'completed', 'cancelled'];
    if (!allowedStatuses.includes(status)) {
      throw new ValidationError('Invalid status');
    }

    // Simple transition guards
    if (appt.status === 'completed' || appt.status === 'cancelled') {
      throw new ValidationError('Cannot modify a completed or cancelled appointment');
    }

    const updated = await this.prisma.serviceAppointment.update({
      where: { id },
      data: { status },
    });

    // Audit trail in orderHistory
    await this.prisma.orderHistory.create({
      data: {
        orderId: appt.orderId,
        action: 'SERVICE_APPOINTMENT_STATUS',
        details: `Appointment ${id} -> ${status}`,
        userId,
      },
    });

    logger.info(`ServiceAppointment status updated id=${id} status=${status}`);
    return updated;
  }

  async reschedule(id: string, scheduledDate: Date, duration: string | undefined, userId: string) {
    this.validateUUID(id, 'id');
    const appt = await this.prisma.serviceAppointment.findUnique({
      where: { id },
      include: { service: true, order: true },
    });
    if (!appt) throw new NotFoundError('Service appointment not found');
    if (appt.service.providerId !== userId && appt.order.buyerId !== userId) {
      throw new ValidationError('Not authorized to reschedule this appointment');
    }
    if (appt.status === 'completed' || appt.status === 'cancelled') {
      throw new ValidationError('Cannot reschedule a completed or cancelled appointment');
    }
    if (scheduledDate.getTime() < Date.now() - 5 * 60 * 1000) {
      throw new ValidationError('Scheduled date must be in the future');
    }

    const updated = await this.prisma.serviceAppointment.update({
      where: { id },
      data: { scheduledDate, duration: duration || appt.duration },
    });

    await this.prisma.orderHistory.create({
      data: {
        orderId: appt.orderId,
        action: 'SERVICE_APPOINTMENT_RESCHEDULE',
        details: `Appointment ${id} rescheduled to ${scheduledDate.toISOString()}`,
        userId,
      },
    });

    logger.info(`ServiceAppointment rescheduled id=${id}`);
    return updated;
  }

  async createManual(data: { orderId: string; serviceId: string; scheduledDate: Date; duration?: string; notes?: string; userId: string }) {
    // Validate order & service coherence
    this.validateUUID(data.orderId, 'orderId');
    this.validateUUID(data.serviceId, 'serviceId');
    const order = await this.prisma.order.findUnique({ where: { id: data.orderId } });
    if (!order) throw new NotFoundError('Order not found');
    const service = await this.prisma.service.findUnique({ where: { id: data.serviceId } });
    if (!service) throw new NotFoundError('Service not found');
    if (order.sellerId !== service.providerId) {
      throw new ValidationError('Order and service provider mismatch');
    }

    const appt = await this.prisma.serviceAppointment.create({
      data: {
        orderId: data.orderId,
        serviceId: data.serviceId,
        scheduledDate: data.scheduledDate,
        duration: data.duration,
        status: 'scheduled',
        notes: data.notes,
      },
    });

    await this.prisma.orderHistory.create({
      data: {
        orderId: data.orderId,
        action: 'SERVICE_APPOINTMENT_CREATE',
        details: `Manual appointment created ${appt.id}`,
        userId: data.userId,
      },
    });
    logger.info(`ServiceAppointment created id=${appt.id}`);
    return appt;
  }
}

export const serviceAppointmentService = new ServiceAppointmentService();
