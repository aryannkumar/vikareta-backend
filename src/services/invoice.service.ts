import { PrismaClient, Invoice, PaymentStatus } from '@prisma/client';

export class InvoiceService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createInvoice(data: {
    
    buyerId: string;
    sellerId: string;
    invoiceNumber: string;
    subtotal: number;
    taxAmount: number;
    discountAmount?: number;
    totalAmount: number;
    currency?: string;
    dueDate: Date;
    items: any;
    taxDetails?: any;
    billingAddress?: any;
    shippingAddress?: any;
    notes?: string;
    termsConditions?: string;
  }): Promise<Invoice> {
    return this.prisma.invoice.create({
      data: {
        // Field removed
        buyerId: data.buyerId,
        sellerId: data.sellerId,
        invoiceNumber: data.invoiceNumber,
        subtotal: data.subtotal,
        taxAmount: data.taxAmount,
        discountAmount: data.discountAmount || 0,
        totalAmount: data.totalAmount,
        currency: data.currency || 'INR',
        dueDate: data.dueDate,
        items: data.items,
        taxDetails: data.taxDetails,
        billingAddress: data.billingAddress,
        shippingAddress: data.shippingAddress,
        notes: data.notes,
        termsConditions: data.termsConditions,
        status: 'draft',
        paymentStatus: PaymentStatus.PENDING,
      },
    });
  }

  async getInvoiceById(id: string): Promise<Invoice | null> {
    return this.prisma.invoice.findUnique({
      where: { id },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            orderType: true,
            createdAt: true,
          },
        },
        buyer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
            email: true,
            phone: true,
            gstNumber: true,
          },
        },
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
            email: true,
            phone: true,
            gstNumber: true,
          },
        },
      },
    });
  }

  async getInvoicesByBuyer(buyerId: string, filters?: {
    status?: string;
    paymentStatus?: PaymentStatus;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<Invoice[]> {
    return this.prisma.invoice.findMany({
      where: {
        buyerId,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.paymentStatus && { paymentStatus: filters.paymentStatus }),
        ...(filters?.dateFrom && {
          createdAt: { gte: filters.dateFrom },
        }),
        ...(filters?.dateTo && {
          createdAt: { lte: filters.dateTo },
        }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
          },
        },
      },
    });
  }

  async getInvoicesBySeller(sellerId: string, filters?: {
    status?: string;
    paymentStatus?: PaymentStatus;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<Invoice[]> {
    return this.prisma.invoice.findMany({
      where: {
        sellerId,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.paymentStatus && { paymentStatus: filters.paymentStatus }),
        ...(filters?.dateFrom && {
          createdAt: { gte: filters.dateFrom },
        }),
        ...(filters?.dateTo && {
          createdAt: { lte: filters.dateTo },
        }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        buyer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
          },
        },
      },
    });
  }

  async updateInvoiceStatus(id: string, status: string): Promise<Invoice> {
    const updateData: any = { status };
    
    if (status === 'sent') {
      updateData.sentAt = new Date();
    }

    return this.prisma.invoice.update({
      where: { id },
      data: updateData,
    });
  }

  async updatePaymentStatus(id: string, paymentStatus: PaymentStatus): Promise<Invoice> {
    const updateData: any = { paymentStatus };
    
    if (paymentStatus === PaymentStatus.PAID) {
      updateData.paidAt = new Date();
    }

    return this.prisma.invoice.update({
      where: { id },
      data: updateData,
    });
  }

  async generateInvoiceNumber(): Promise<string> {
    const currentYear = new Date().getFullYear();
    const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
    
    const lastInvoice = await this.prisma.invoice.findFirst({
      where: {
        invoiceNumber: {
          startsWith: `INV-${currentYear}${currentMonth}`,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let sequence = 1;
    if (lastInvoice) {
      const lastSequence = parseInt(lastInvoice.invoiceNumber.split('-').pop() || '0');
      sequence = lastSequence + 1;
    }

    return `INV-${currentYear}${currentMonth}-${String(sequence).padStart(4, '0')}`;
  }

  async getInvoiceStats(sellerId?: string): Promise<{
    totalInvoices: number;
    totalAmount: number;
    paidAmount: number;
    pendingAmount: number;
    overdueAmount: number;
  }> {
    const where = sellerId ? { sellerId } : {};

    const [totalStats, paidStats, pendingStats, overdueStats] = await Promise.all([
      this.prisma.invoice.aggregate({
        where,
        _count: { id: true },
        _sum: { totalAmount: true },
      }),
      this.prisma.invoice.aggregate({
        where: { ...where, paymentStatus: PaymentStatus.PAID },
        _sum: { totalAmount: true },
      }),
      this.prisma.invoice.aggregate({
        where: { ...where, paymentStatus: PaymentStatus.PENDING },
        _sum: { totalAmount: true },
      }),
      this.prisma.invoice.aggregate({
        where: {
          ...where,
          paymentStatus: PaymentStatus.PENDING,
          dueDate: { lt: new Date() },
        },
        _sum: { totalAmount: true },
      }),
    ]);

    return {
      totalInvoices: totalStats._count.id,
      totalAmount: Number(totalStats._sum.totalAmount || 0),
      paidAmount: Number(paidStats._sum.totalAmount || 0),
      pendingAmount: Number(pendingStats._sum.totalAmount || 0),
      overdueAmount: Number(overdueStats._sum.totalAmount || 0),
    };
  }

  async getOverdueInvoices(sellerId?: string): Promise<Invoice[]> {
    return this.prisma.invoice.findMany({
      where: {
        ...(sellerId && { sellerId }),
        paymentStatus: PaymentStatus.PENDING,
        dueDate: { lt: new Date() },
      },
      orderBy: { dueDate: 'asc' },
      include: {
        buyer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
            email: true,
            phone: true,
          },
        },
      },
    });
  }

  async sendInvoiceReminder(id: string): Promise<Invoice> {
    return this.prisma.invoice.update({
      where: { id },
      data: {
        reminderSentAt: new Date(),
      },
    });
  }
}

export const invoiceService = new InvoiceService(new PrismaClient());