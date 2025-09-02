/**
 * Support Ticket Service
 * Manages support tickets with proper schema alignment
 */

import { PrismaClient, SupportTicket } from '@prisma/client';

enum TicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  WAITING_RESPONSE = 'waiting_response',
  RESOLVED = 'resolved',
  CLOSED = 'closed'
}

export class SupportTicketService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Create a new support ticket
   */
  async createTicket(data: {
    subject: string;
    description: string;
    category: string;
    priority: string;
    userId: string;
    assigneeId?: string;
  }): Promise<SupportTicket> {
    try {
      const ticketNumber = await this.generateTicketNumber();

      return await this.prisma.supportTicket.create({
        data: {
          ticketNumber,
          subject: data.subject,
          description: data.description,
          category: data.category,
          priority: data.priority,
          userId: data.userId,
          assigneeId: data.assigneeId,
          status: TicketStatus.OPEN,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          assignee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });
    } catch (error) {
      console.error('Error creating support ticket:', error);
      throw new Error('Failed to create support ticket');
    }
  }

  /**
   * Get ticket by ID
   */
  async getTicketById(id: string): Promise<SupportTicket | null> {
    try {
      return await this.prisma.supportTicket.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          assignee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          messages: {
            include: {
              sender: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
    } catch (error) {
      console.error('Error fetching support ticket:', error);
      throw new Error('Failed to fetch support ticket');
    }
  }

  /**
   * Get tickets by user
   */
  async getTicketsByUser(userId: string, status?: string): Promise<SupportTicket[]> {
    try {
      const where: any = { userId };
      if (status) where.status = status;

      return await this.prisma.supportTicket.findMany({
        where,
        include: {
          assignee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      console.error('Error fetching tickets by user:', error);
      throw new Error('Failed to fetch tickets by user');
    }
  }

  /**
   * Get tickets by assignee
   */
  async getTicketsByAssignee(assigneeId: string, status?: string): Promise<SupportTicket[]> {
    try {
      const where: any = { assigneeId };
      if (status) where.status = status;

      return await this.prisma.supportTicket.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      console.error('Error fetching tickets by assignee:', error);
      throw new Error('Failed to fetch tickets by assignee');
    }
  }

  /**
   * Update ticket status
   */
  async updateTicketStatus(id: string, status: string): Promise<SupportTicket> {
    try {
      const updateData: any = { status };

      if (status === TicketStatus.RESOLVED || status === TicketStatus.CLOSED) {
        updateData.resolvedAt = new Date();
      }

      return await this.prisma.supportTicket.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      console.error('Error updating ticket status:', error);
      throw new Error('Failed to update ticket status');
    }
  }

  /**
   * Assign ticket to user
   */
  async assignTicket(id: string, assigneeId: string): Promise<SupportTicket> {
    try {
      return await this.prisma.supportTicket.update({
        where: { id },
        data: { 
          assigneeId,
          status: TicketStatus.IN_PROGRESS,
        },
      });
    } catch (error) {
      console.error('Error assigning ticket:', error);
      throw new Error('Failed to assign ticket');
    }
  }

  /**
   * Add message to ticket
   */
  async addMessage(ticketId: string, senderId: string, message: string): Promise<any> {
    try {
      return await this.prisma.supportMessage.create({
        data: {
          ticketId,
          senderId,
          message,
        },
        include: {
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });
    } catch (error) {
      console.error('Error adding message to ticket:', error);
      throw new Error('Failed to add message to ticket');
    }
  }

  /**
   * Get ticket statistics
   */
  async getTicketStats(assigneeId?: string): Promise<{
    total: number;
    open: number;
    inProgress: number;
    waitingResponse: number;
    resolved: number;
    closed: number;
  }> {
    try {
      const where = assigneeId ? { assigneeId } : {};

      const [totalCount, statusCounts] = await Promise.all([
        this.prisma.supportTicket.count({ where }),
        this.prisma.supportTicket.groupBy({
          by: ['status'],
          where,
          _count: { status: true },
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
      };
    } catch (error) {
      console.error('Error fetching ticket stats:', error);
      throw new Error('Failed to fetch ticket stats');
    }
  }

  /**
   * Search tickets
   */
  async searchTickets(query: string, filters?: {
    status?: string;
    category?: string;
    priority?: string;
    assigneeId?: string;
  }): Promise<SupportTicket[]> {
    try {
      return await this.prisma.supportTicket.findMany({
        where: {
          AND: [
            {
              OR: [
                { subject: { contains: query, mode: 'insensitive' } },
                { description: { contains: query, mode: 'insensitive' } },
                { ticketNumber: { contains: query, mode: 'insensitive' } },
              ],
            },
            ...(filters?.status ? [{ status: filters.status }] : []),
            ...(filters?.category ? [{ category: filters.category }] : []),
            ...(filters?.priority ? [{ priority: filters.priority }] : []),
            ...(filters?.assigneeId ? [{ assigneeId: filters.assigneeId }] : []),
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
          assignee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });
    } catch (error) {
      console.error('Error searching tickets:', error);
      throw new Error('Failed to search tickets');
    }
  }

  /**
   * Generate ticket number
   */
  private async generateTicketNumber(): Promise<string> {
    const currentYear = new Date().getFullYear();
    const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');

    const lastTicket = await this.prisma.supportTicket.findFirst({
      where: {
        ticketNumber: {
          startsWith: `TKT-${currentYear}${currentMonth}`,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let nextNumber = 1;
    if (lastTicket) {
      const lastNumber = parseInt(lastTicket.ticketNumber.split('-')[2]);
      nextNumber = lastNumber + 1;
    }

    return `TKT-${currentYear}${currentMonth}-${String(nextNumber).padStart(4, '0')}`;
  }
}

export const supportTicketService = new SupportTicketService();