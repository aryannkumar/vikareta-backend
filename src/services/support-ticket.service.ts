/**
 * Support Ticket Service
 * Manages support tickets and messages with proper schema alignment
 */

import { PrismaClient, SupportTicket, SupportMessage } from '@prisma/client';

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
  }): Promise<SupportTicket> {
    try {
      // Generate ticket number
      const ticketNumber = await this.generateTicketNumber();

      return await this.prisma.supportTicket.create({
        data: {
          ticketNumber,
          subject: data.subject,
          description: data.description,
          category: data.category,
          priority: data.priority,
          userId: data.userId,
          status: 'open',
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
                },
              },
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
                },
              },
            },
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
  async getTicketsByUser(
    userId: string,
    filters?: {
      status?: string;
      category?: string;
      priority?: string;
    }
  ): Promise<SupportTicket[]> {
    try {
      const where: any = { userId };

      if (filters?.status) where.status = filters.status;
      if (filters?.category) where.category = filters.category;
      if (filters?.priority) where.priority = filters.priority;

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
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
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
   * Update ticket status
   */
  async updateTicketStatus(
    id: string,
    status: string,
    assignedToId?: string
  ): Promise<SupportTicket> {
    try {
      const updateData: any = {
        status,
        updatedAt: new Date(),
      };

      if (assignedToId) updateData.assignedToId = assignedToId;
      if (status === 'resolved') updateData.resolvedAt = new Date();

      return await this.prisma.supportTicket.update({
        where: { id },
        data: updateData,
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
              email: true,
            },
          },
        },
      });
    } catch (error) {
      console.error('Error updating ticket status:', error);
      throw new Error('Failed to update ticket status');
    }
  }

  /**
   * Add message to ticket
   */
  async addMessage(data: {
    ticketId: string;
    userId: string;
    content: string;
    isFromSupport?: boolean;
  }): Promise<SupportMessage> {
    try {
      return await this.prisma.supportMessage.create({
        data: {
          ticketId: data.ticketId,
          userId: data.userId,
          content: data.content,
          isFromSupport: data.isFromSupport || false,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          ticket: {
            select: {
              id: true,
              ticketNumber: true,
              subject: true,
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
   * Get all tickets with pagination
   */
  async getAllTickets(
    page: number = 1,
    limit: number = 10,
    filters?: {
      status?: string;
      category?: string;
      priority?: string;
      assignedToId?: string;
    }
  ): Promise<{
    tickets: SupportTicket[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    try {
      const skip = (page - 1) * limit;
      const where: any = {};

      if (filters?.status) where.status = filters.status;
      if (filters?.category) where.category = filters.category;
      if (filters?.priority) where.priority = filters.priority;
      if (filters?.assignedToId) where.assignedToId = filters.assignedToId;

      const [tickets, total] = await Promise.all([
        this.prisma.supportTicket.findMany({
          where,
          skip,
          take: limit,
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
                email: true,
              },
            },
            messages: {
              take: 1,
              orderBy: { createdAt: 'desc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.supportTicket.count({ where }),
      ]);

      return {
        tickets,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      };
    } catch (error) {
      console.error('Error fetching all tickets:', error);
      throw new Error('Failed to fetch all tickets');
    }
  }

  /**
   * Get ticket statistics
   */
  async getTicketStats(): Promise<{
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    closed: number;
    byCategory: Record<string, number>;
    byPriority: Record<string, number>;
  }> {
    try {
      const [total, open, inProgress, resolved, closed, allTickets] = await Promise.all([
        this.prisma.supportTicket.count(),
        this.prisma.supportTicket.count({ where: { status: 'open' } }),
        this.prisma.supportTicket.count({ where: { status: 'in_progress' } }),
        this.prisma.supportTicket.count({ where: { status: 'resolved' } }),
        this.prisma.supportTicket.count({ where: { status: 'closed' } }),
        this.prisma.supportTicket.findMany({
          select: {
            category: true,
            priority: true,
          },
        }),
      ]);

      const byCategory = allTickets.reduce((acc: Record<string, number>, ticket) => {
        acc[ticket.category] = (acc[ticket.category] || 0) + 1;
        return acc;
      }, {});

      const byPriority = allTickets.reduce((acc: Record<string, number>, ticket) => {
        acc[ticket.priority] = (acc[ticket.priority] || 0) + 1;
        return acc;
      }, {});

      return {
        total,
        open,
        inProgress,
        resolved,
        closed,
        byCategory,
        byPriority,
      };
    } catch (error) {
      console.error('Error fetching ticket stats:', error);
      throw new Error('Failed to fetch ticket stats');
    }
  }

  /**
   * Generate unique ticket number
   */
  private async generateTicketNumber(): Promise<string> {
    const prefix = 'TKT';
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    
    let ticketNumber = `${prefix}-${timestamp}-${random}`;
    
    // Ensure uniqueness
    const existing = await this.prisma.supportTicket.findUnique({
      where: { ticketNumber },
    });
    
    if (existing) {
      // If exists, try again with different random number
      return this.generateTicketNumber();
    }
    
    return ticketNumber;
  }

  /**
   * Close ticket
   */
  async closeTicket(id: string): Promise<SupportTicket> {
    try {
      return await this.updateTicketStatus(id, 'closed');
    } catch (error) {
      console.error('Error closing ticket:', error);
      throw new Error('Failed to close ticket');
    }
  }

  /**
   * Assign ticket to support agent
   */
  async assignTicket(id: string, assignedToId: string): Promise<SupportTicket> {
    try {
      return await this.prisma.supportTicket.update({
        where: { id },
        data: {
          assignedToId,
          status: 'in_progress',
          updatedAt: new Date(),
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
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });
    } catch (error) {
      console.error('Error assigning ticket:', error);
      throw new Error('Failed to assign ticket');
    }
  }
}

export const supportTicketService = new SupportTicketService();