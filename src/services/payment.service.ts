import { BaseService } from './base.service';
import { prisma } from '@/config/database';
import { OrderService } from './order.service';
import { ValidationError, NotFoundError } from '@/middleware/error-handler';

export interface CreatePaymentParams {
  orderId: string;
  amount: number;
  paymentMethod?: string;
  paymentGateway?: string;
  gatewayTransactionId?: string;
}

class PaymentService extends BaseService {
  private orderService: OrderService;
  constructor() {
    super();
    this.orderService = new OrderService();
  }

  async create(params: CreatePaymentParams) {
    if (!params.orderId || !params.amount) throw new ValidationError('orderId and amount required');
    const payment = await prisma.payment.create({
      data: {
        orderId: params.orderId,
        amount: Number(params.amount),
        paymentMethod: params.paymentMethod || 'upi',
        paymentGateway: params.paymentGateway || 'cashfree',
        gatewayTransactionId: params.gatewayTransactionId,
        status: 'pending'
      }
    });
    return payment;
  }

  async get(id: string) {
    const payment = await prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundError('Payment not found');
    return payment;
  }

  async verify(id: string, status?: string, gatewayTransactionId?: string) {
    const payment = await prisma.payment.update({ where: { id }, data: { status: status || 'processing', gatewayTransactionId } });
    if (payment.orderId && payment.status === 'paid') {
      await this.orderService.updatePaymentStatus(payment.orderId, 'paid');
    }
    return payment;
  }
}

export const paymentService = new PaymentService();
