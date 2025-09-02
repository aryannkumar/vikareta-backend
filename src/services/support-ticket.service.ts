import { PrismaClient, SupportTicket, TicketStatus } from '@prisma/client';

export class SupportTicketService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createTicket(data: {
    userId: string;
    subject: string;
    description: string;
    category?: string;
    priority?: string;
    attachments?: any;
  }): Promise<SupportTicket> {
    const ticketNumber = await this.generateTicketNumber();
    
    return this.prisma.supportTicket.create({
      data: {
        userId: data.userId,
        ticketNumber,
        subject: data.subject,
        description: data.description,
        category: data.category || 'general',
        priority: data.priority || 'medium',
        status: TicketStatus.OPEN,
        // Field removed
      },
    });
  }

  async getTicketById(id: string): Promise<SupportTicket | null> {
    return this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            businessName: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
        },
      },
    });
  }

  async getTicketsByUser(userId: string, filters?: {
    status?: TicketStatus;
    category?: string;
    priority?: string;
  }): Promise<SupportTicket[]> {
    return this.prisma.supportTicket.findMany({
      where: {
        userId,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.category && { category: filters.category }),
        ...(filters?.priority && { priority: filters.priority }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
    });
  }

  async getAssignedTickets(assigneeId: string, filters?: {
    status?: TicketStatus;
    category?: string;
    priority?: string;
  }): Promise<SupportTicket[]> {
    return this.prisma.supportTicket.findMany({
      where: {
        assignedTo: assigneeId,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.category && { category: filters.category }),
        ...(filters?.priority && { priority: filters.priority }),
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            businessName: true,
          },
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
    });
  }

  async assignTicket(ticketId: string, assigneeId: string): Promise<SupportTicket> {
    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        assignedTo: assigneeId,
        status: TicketStatus.IN_PROGRESS,
      },
    });
  }

  async updateTicketStatus(ticketId: string, status: TicketStatus): Promise<SupportTicket> {
    const updateData: any = { status };
    
    if (status === TicketStatus.RESOLVED) {
      updateData.resolvedAt = new Date();
    } else if (status === TicketStatus.CLOSED) {
      updateData.closedAt = new Date();
    }

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: updateData,
    });
  }

  async updateTicketPriority(ticketId: string, priority: string): Promise<SupportTicket> {
    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { priority },
    });
  }

  async addMessage(data: {
    ticketId: string;
    userId: string;
    message: string;
    attachments?: any;
    isInternal?: boolean;
  }): Promise<void> {
    const supportMessage = await this.prisma.supportMessage.create({
      data: {
        ticketId: data.ticketId,
        userId: data.userId,
        message: data.message,
        isInternal: data.isInternal || false,
      },
    });

    // Update ticket's last activity
    await this.prisma.supportTicket.update({
      where: { id: data.ticketId },
      data: { updatedAt: new Date() },
    });

    return supportMessage;
  }

  async getTicketStats(assigneeId?: string): Promise<{
    total: number;
    open: number;
    inProgress: number;
    waitingResponse: number;
    resolved: number;
    closed: number;
    avgResolutionTime: number;
  }> {
    const where = assigneeId ? { assignedTo: assigneeId } : {};

    const [totalCount, statusCounts, avgResolution] = await Promise.all([
      this.prisma.supportTicket.count({ where }),
      this.prisma.supportTicket.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
      }),
      this.prisma.supportTicket.aggregate({
        where: {
          ...where,
          },
          createdAt: { not: null },
        },
        _avg: {
          // This would need a computed field for resolution time
          // For now, we'll calculate it differently
        },
      }),
    ]);

    const statusMap = statusCounts.reduce((acc, item) => {
      acc[item.status] = item._count.status;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: totalCount,
      open: statusMap[TicketStatus.OPEN] || 0,
      inProgress: statusMap[TicketStatus.IN_PROGRESS] || 0,
      waitingResponse: statusMap[TicketStatus.WAITING_RESPONSE] || 0,
      resolved: statusMap[TicketStatus.RESOLVED] || 0,
      closed: statusMap[TicketStatus.CLOSED] || 0,
      avgResolutionTime: 0, // Would need to calculate based on created/resolved dates
    };
  }

  async searchTickets(query: string, filters?: {
    status?: TicketStatus;
    category?: string;
    priority?: string;
    assigneeId?: string;
  }): Promise<SupportTicket[]> {
    return this.prisma.supportTicket.findMany({
      where: {
        ...(filters?.status && { status: filters.status }),
        ...(filters?.category && { category: filters.category }),
        ...(filters?.priority && { priority: filters.priority }),
        ...(filters?.assigneeId && { assignedTo: filters.assigneeId }),
        OR: [
          { subject: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  private async generateTicketNumber(): Promise<string> {
    const currentYear = new Date().getFullYear();
    const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
    
    const lastTicket = await this.prisma.supportTicket.findFirst({
      where: {
        
          startsWith: `TKT-${currentYear}${currentMonth}`,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let sequence = 1;
    if (lastTicket) {
      const lastSequence = parseInt(lastTicket.ticketNumber.split('-').pop() || '0');
      sequence = lastSequence + 1;
    }

    return `TKT-${currentYear}${currentMonth}-${String(sequence).padStart(4, '0')}`;
  }
}

export const supportTicketService = new SupportTicketService(new PrismaClient());