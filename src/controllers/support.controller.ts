import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export class SupportController {
  async getTickets(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ 
          success: false,
          error: 'Unauthorized' 
        });
        return;
      }

      const {
        page = 1,
        limit = 20,
        status,
        category,
        priority,
      } = req.query;
      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      const where: any = { userId };

      if (status) where.status = status;
      if (category) where.category = category;
      if (priority) where.priority = priority;

      const [tickets, total] = await Promise.all([
        prisma.supportTicket.findMany({
          where,
          include: {
            assignedTo: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                businessName: true,
              },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    userType: true,
                  },
                },
              },
            },
            _count: {
              select: { messages: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit as string),
        }),
        prisma.supportTicket.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        message: 'Support tickets retrieved successfully',
        data: {
          tickets,
          total,
          page: parseInt(page as string),
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      });
    } catch (error) {
      logger.error('Error getting support tickets:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  async getTicketById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ 
          success: false,
          error: 'Unauthorized' 
        });
        return;
      }

      const ticket = await prisma.supportTicket.findFirst({
        where: {
          id,
          userId, // Ensure user can only access their own tickets
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              email: true,
            },
          },
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
            },
          },
          messages: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  businessName: true,
                  userType: true,
                  avatar: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!ticket) {
        res.status(404).json({ 
          success: false,
          error: 'Support ticket not found' 
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Support ticket retrieved successfully',
        data: ticket,
      });
    } catch (error) {
      logger.error('Error getting support ticket:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  async createTicket(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ 
          success: false,
          error: 'Unauthorized' 
        });
        return;
      }

      const {
        subject,
        description,
        category,
        priority = 'medium',
        relatedId,
      } = req.body;

      const ticketNumber = `TKT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

      const ticket = await prisma.supportTicket.create({
        data: {
          ticketNumber,
          userId,
          subject,
          description,
          category,
          priority,
          assignedToId: null,
          status: 'open',
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              email: true,
            },
          },
        },
      });

      // Create initial message (SupportMessage uses 'content')
      await prisma.supportMessage.create({
        data: {
          ticketId: ticket.id,
          userId,
          content: description,
          isFromSupport: false,
        },
      });

      res.status(201).json({
        success: true,
        message: 'Support ticket created successfully',
        data: ticket,
      });
    } catch (error) {
      logger.error('Error creating support ticket:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  async addMessage(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { message } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ 
          success: false,
          error: 'Unauthorized' 
        });
        return;
      }

      // Verify ticket exists and belongs to user
      const ticket = await prisma.supportTicket.findFirst({
        where: {
          id,
          userId,
        },
      });

      if (!ticket) {
        res.status(404).json({ 
          success: false,
          error: 'Support ticket not found' 
        });
        return;
      }

      if (ticket.status === 'closed') {
        res.status(400).json({ 
          success: false,
          error: 'Cannot add message to closed ticket' 
        });
        return;
      }

      const supportMessage = await prisma.supportMessage.create({
        data: {
          ticketId: id,
          userId,
          content: message,
          isFromSupport: false,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              userType: true,
              avatar: true,
            },
          },
        },
      });

      // Update ticket status to 'in_progress' if it was 'open'
      if (ticket.status === 'open') {
        await prisma.supportTicket.update({
          where: { id },
          data: {
            status: 'in_progress',
            updatedAt: new Date(),
          },
        });
      }

      res.status(201).json({
        success: true,
        message: 'Message added successfully',
        data: supportMessage,
      });
    } catch (error) {
      logger.error('Error adding support message:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  async updateTicket(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { subject, description, category, priority } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ 
          success: false,
          error: 'Unauthorized' 
        });
        return;
      }

      const ticket = await prisma.supportTicket.findFirst({
        where: {
          id,
          userId,
        },
      });

      if (!ticket) {
        res.status(404).json({ 
          success: false,
          error: 'Support ticket not found' 
        });
        return;
      }

      if (ticket.status === 'closed') {
        res.status(400).json({ 
          success: false,
          error: 'Cannot update closed ticket' 
        });
        return;
      }

      const updatedTicket = await prisma.supportTicket.update({
        where: { id },
        data: {
          subject: subject || ticket.subject,
          description: description || ticket.description,
          category: category || ticket.category,
          priority: priority || ticket.priority,
          updatedAt: new Date(),
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              email: true,
            },
          },
        },
      });

      res.status(200).json({
        success: true,
        message: 'Support ticket updated successfully',
        data: updatedTicket,
      });
    } catch (error) {
      logger.error('Error updating support ticket:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  async closeTicket(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ 
          success: false,
          error: 'Unauthorized' 
        });
        return;
      }

      const ticket = await prisma.supportTicket.findFirst({
        where: {
          id,
          userId,
        },
      });

      if (!ticket) {
        res.status(404).json({ 
          success: false,
          error: 'Support ticket not found' 
        });
        return;
      }

      if (ticket.status === 'closed') {
        res.status(400).json({ 
          success: false,
          error: 'Ticket is already closed' 
        });
        return;
      }

      const updatedTicket = await prisma.supportTicket.update({
        where: { id },
        data: {
          status: 'closed',
          resolvedAt: new Date(),
          updatedAt: new Date(),
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              email: true,
            },
          },
        },
      });

      res.status(200).json({
        success: true,
        message: 'Support ticket closed successfully',
        data: updatedTicket,
      });
    } catch (error) {
      logger.error('Error closing support ticket:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  async getTicketStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ 
          success: false,
          error: 'Unauthorized' 
        });
        return;
      }

      const [totalTickets, openTickets, inProgressTickets, closedTickets, categoryStats] = await Promise.all([
        prisma.supportTicket.count({ where: { userId } }),
        prisma.supportTicket.count({ where: { userId, status: 'open' } }),
        prisma.supportTicket.count({ where: { userId, status: 'in_progress' } }),
        prisma.supportTicket.count({ where: { userId, status: 'closed' } }),
        prisma.supportTicket.groupBy({
          by: ['category'],
          where: { userId },
          _count: { id: true },
        }),
      ]);

      res.status(200).json({
        success: true,
        message: 'Ticket statistics retrieved successfully',
        data: {
          totalTickets,
          openTickets,
          inProgressTickets,
          closedTickets,
          categoryBreakdown: categoryStats.map(stat => ({
            category: stat.category,
            count: stat._count.id,
          })),
        },
      });
    } catch (error) {
      logger.error('Error getting ticket stats:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }
}