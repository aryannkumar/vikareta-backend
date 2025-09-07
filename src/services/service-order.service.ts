import { BaseService } from './base.service';
import { logger } from '@/utils/logger';

export class ServiceOrderService extends BaseService {
  async updateStatus(id: string, data: { status: string; scheduledDate?: string; providerNotes?: string; customerNotes?: string; userId?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const so = await tx.serviceOrder.findUnique({ where: { id } });
      if (!so) throw new Error('Service order not found');
      const updated = await tx.serviceOrder.update({
        where: { id },
        data: {
          status: data.status,
          scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : so.scheduledDate,
          providerNotes: data.providerNotes,
          customerNotes: data.customerNotes,
        },
      });
      await tx.orderHistory.create({
        data: {
          orderId: so.orderId,
            action: 'SERVICE_ORDER_STATUS',
            details: `Service order ${id} -> ${data.status}`,
            userId: data.userId,
        },
      });
      logger.info(`ServiceOrder status updated id=${id} status=${data.status}`);
      return updated;
    });
  }
}

export const serviceOrderService = new ServiceOrderService();