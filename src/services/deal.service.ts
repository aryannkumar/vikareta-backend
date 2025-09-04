import { prisma } from '@/config/database';

export class DealService {
  async listDeals(queryingUser: any, page: number, limit: number, filters: any) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (queryingUser.userType === 'buyer') where.buyerId = queryingUser.id;
    else if (queryingUser.userType === 'seller') where.sellerId = queryingUser.id;
    else { if (filters.buyerId) where.buyerId = filters.buyerId; if (filters.sellerId) where.sellerId = filters.sellerId; }
    if (filters.status) where.status = filters.status;

    const [deals, total] = await Promise.all([
      prisma.deal.findMany({ where, include: { buyer: { select: { id: true, businessName: true, firstName: true, lastName: true, email: true } }, seller: { select: { id: true, businessName: true, firstName: true, lastName: true, email: true } }, rfq: { select: { id: true, title: true, description: true } }, quote: { select: { id: true, totalPrice: true } }, order: { select: { id: true, orderNumber: true, totalAmount: true, status: true } } }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.deal.count({ where }),
    ]);

    return { deals, total };
  }

  async getDealById(id: string) {
    return prisma.deal.findUnique({ where: { id }, include: { buyer: { select: { id: true, businessName: true, firstName: true, lastName: true, email: true, avatar: true } }, seller: { select: { id: true, businessName: true, firstName: true, lastName: true, email: true, avatar: true } }, rfq: { include: { category: true, subcategory: true } }, quote: { include: { items: { include: { product: { select: { id: true, title: true, price: true } } } } } }, order: { select: { id: true, orderNumber: true, totalAmount: true, status: true, createdAt: true } }, messages: { include: { sender: { select: { id: true, firstName: true, lastName: true, businessName: true, avatar: true } } }, orderBy: { createdAt: 'asc' } } } });
  }

  async createDeal(payload: any) {
    const data: any = {
      title: payload.title,
      description: payload.description,
      milestone: payload.milestone,
      discountType: payload.discountType,
      discountValue: payload.discountValue,
      dealValue: payload.dealValue,
      buyerId: payload.buyerId,
      sellerId: payload.sellerId,
      rfqId: payload.rfqId,
      quoteId: payload.quoteId,
      orderId: payload.orderId,
      status: 'active',
    };

    if (payload.startDate) data.startDate = new Date(payload.startDate);
    if (payload.endDate) data.endDate = new Date(payload.endDate);
    data.nextFollowUp = payload.nextFollowUp ? new Date(payload.nextFollowUp) : null;

    const deal = await prisma.deal.create({
      data,
      include: {
        buyer: { select: { id: true, businessName: true, firstName: true, lastName: true } },
        seller: { select: { id: true, businessName: true, firstName: true, lastName: true } },
      },
    });

    return deal;
  }

  async updateDeal(id: string, updateData: any) {
    if (updateData.startDate) updateData.startDate = new Date(updateData.startDate);
    if (updateData.endDate) updateData.endDate = new Date(updateData.endDate);
    if (updateData.nextFollowUp) updateData.nextFollowUp = new Date(updateData.nextFollowUp);

    return prisma.deal.update({ where: { id }, data: updateData, include: { buyer: { select: { id: true, businessName: true, firstName: true, lastName: true } }, seller: { select: { id: true, businessName: true, firstName: true, lastName: true } } } });
  }

  async sendMessage(dealId: string, senderId: string, payload: any) {
    const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { buyerId: true, sellerId: true } });
    if (!deal) throw new Error('Deal not found');
    if (deal.buyerId !== senderId && deal.sellerId !== senderId) throw new Error('Access denied');

    const dealMessage = await prisma.dealMessage.create({ data: { dealId, senderId, message: payload.message, messageType: payload.messageType ?? 'text' }, include: { sender: { select: { id: true, firstName: true, lastName: true, businessName: true, avatar: true } } } });
    return dealMessage;
  }
}

export const dealService = new DealService();
