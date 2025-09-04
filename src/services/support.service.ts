import { prisma } from '@/config/database';

export class SupportService {
  async getTickets(userId: string, page: number, limit: number, filters: any) {
    const skip = (page - 1) * limit;
    const where: any = { userId, ...filters };

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true, businessName: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { user: { select: { id: true, firstName: true, lastName: true, userType: true } } } },
          _count: { select: { messages: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.supportTicket.count({ where }),
    ]);

    return { tickets, total };
  }

  async getTicketById(id: string, userId: string) {
    return prisma.supportTicket.findFirst({
      where: { id, userId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, businessName: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, businessName: true } },
        messages: { include: { user: { select: { id: true, firstName: true, lastName: true, businessName: true, userType: true, avatar: true } } }, orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async createTicket(userId: string, payload: any) {
    const ticketNumber = `TKT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber,
        userId,
        subject: payload.subject,
        description: payload.description,
        category: payload.category,
        priority: payload.priority ?? 'medium',
        assignedToId: null,
        status: 'open',
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, businessName: true, email: true } } },
    });

    await prisma.supportMessage.create({ data: { ticketId: ticket.id, userId, content: payload.description, isFromSupport: false } });

    return ticket;
  }

  async addMessage(ticketId: string, userId: string, message: string) {
    const ticket = await prisma.supportTicket.findFirst({ where: { id: ticketId, userId } });
    if (!ticket) throw new Error('Support ticket not found');

    if (ticket.status === 'closed') throw new Error('Cannot add message to closed ticket');

    const supportMessage = await prisma.supportMessage.create({
      data: { ticketId, userId, content: message, isFromSupport: false },
      include: { user: { select: { id: true, firstName: true, lastName: true, businessName: true, userType: true, avatar: true } } },
    });

    if (ticket.status === 'open') {
      await prisma.supportTicket.update({ where: { id: ticketId }, data: { status: 'in_progress', updatedAt: new Date() } });
    }

    return supportMessage;
  }

  async updateTicket(id: string, userId: string, updateData: any) {
    const ticket = await prisma.supportTicket.findFirst({ where: { id, userId } });
    if (!ticket) throw new Error('Support ticket not found');
    if (ticket.status === 'closed') throw new Error('Cannot update closed ticket');

    const updated = await prisma.supportTicket.update({ where: { id }, data: { ...updateData, updatedAt: new Date() }, include: { user: { select: { id: true, firstName: true, lastName: true, businessName: true, email: true } } } });
    return updated;
  }

  async closeTicket(id: string, userId: string) {
    const ticket = await prisma.supportTicket.findFirst({ where: { id, userId } });
    if (!ticket) throw new Error('Support ticket not found');
    if (ticket.status === 'closed') throw new Error('Ticket is already closed');

    const updated = await prisma.supportTicket.update({ where: { id }, data: { status: 'closed', resolvedAt: new Date(), updatedAt: new Date() }, include: { user: { select: { id: true, firstName: true, lastName: true, businessName: true, email: true } } } });
    return updated;
  }

  async getTicketStats(userId: string) {
    const [totalTickets, openTickets, inProgressTickets, closedTickets, categoryStats] = await Promise.all([
      prisma.supportTicket.count({ where: { userId } }),
      prisma.supportTicket.count({ where: { userId, status: 'open' } }),
      prisma.supportTicket.count({ where: { userId, status: 'in_progress' } }),
      prisma.supportTicket.count({ where: { userId, status: 'closed' } }),
      prisma.supportTicket.groupBy({ by: ['category'], where: { userId }, _count: { id: true } }),
    ]);

    return { totalTickets, openTickets, inProgressTickets, closedTickets, categoryBreakdown: categoryStats.map(stat => ({ category: stat.category, count: stat._count.id })) };
  }
}

export const supportService = new SupportService();
