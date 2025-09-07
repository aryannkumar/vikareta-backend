import { prisma } from '@/config/database';
import { Prisma } from '@prisma/client';
import { logger } from '@/utils/logger';

export interface CreateNegotiationInput {
  quoteId: string;
  buyerId: string;
  sellerId: string;
  fromUserId: string;
  toUserId: string;
  offerPrice: string | number; // decimal
  price: string | number;      // current price
  offerType?: string;          // initial | counter | final
  message?: string;
  terms?: string;
  validUntil?: Date | string;
}

export class NegotiationService {
  async listForQuote(quoteId: string) {
    return prisma.negotiationHistory.findMany({
      where: { quoteId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(data: CreateNegotiationInput) {
    try {
      return await prisma.negotiationHistory.create({
        data: {
          quoteId: data.quoteId,
          buyerId: data.buyerId,
          sellerId: data.sellerId,
          fromUserId: data.fromUserId,
          toUserId: data.toUserId,
          offerPrice: new Prisma.Decimal(data.offerPrice),
          price: new Prisma.Decimal(data.price),
          offerType: data.offerType || 'initial',
          message: data.message || null,
          terms: data.terms || null,
          validUntil: data.validUntil ? new Date(data.validUntil) : null,
          expiresAt: data.validUntil ? new Date(data.validUntil) : null,
          status: 'pending',
        },
      });
    } catch (err: any) {
      logger.error('Negotiation create failed', err?.message || err);
      throw err;
    }
  }

  async counter(id: string, userId: string, price: string | number, message?: string) {
    const existing = await prisma.negotiationHistory.findUnique({ where: { id } });
    if (!existing) throw new Error('Negotiation not found');
    return prisma.negotiationHistory.create({
      data: {
        quoteId: existing.quoteId,
        buyerId: existing.buyerId,
        sellerId: existing.sellerId,
        fromUserId: userId,
        toUserId: userId === existing.fromUserId ? existing.toUserId : existing.fromUserId,
        offerPrice: new Prisma.Decimal(price),
        price: new Prisma.Decimal(price),
        offerType: 'counter',
        message: message || null,
        status: 'pending',
      },
    });
  }

  async markFinal(id: string, userId: string) {
    const existing = await prisma.negotiationHistory.findUnique({ where: { id } });
    if (!existing) throw new Error('Negotiation not found');
    if (existing.fromUserId !== userId) throw new Error('Not authorized to finalize this negotiation');
    return prisma.negotiationHistory.update({ where: { id }, data: { offerType: 'final', status: 'pending' } });
  }

  async accept(id: string, userId: string) {
    const existing = await prisma.negotiationHistory.findUnique({ where: { id } });
    if (!existing) throw new Error('Negotiation not found');
    if (existing.toUserId !== userId) throw new Error('Not authorized to accept this negotiation');
    return prisma.negotiationHistory.update({ where: { id }, data: { status: 'accepted' } });
  }

  async reject(id: string, userId: string) {
    const existing = await prisma.negotiationHistory.findUnique({ where: { id } });
    if (!existing) throw new Error('Negotiation not found');
    if (existing.toUserId !== userId) throw new Error('Not authorized to reject this negotiation');
    return prisma.negotiationHistory.update({ where: { id }, data: { status: 'rejected' } });
  }
}

export const negotiationService = new NegotiationService();
