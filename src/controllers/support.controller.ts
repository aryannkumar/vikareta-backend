import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { supportService } from '@/services/support.service';

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

      const { page = 1, limit = 20, status, category, priority } = req.query;
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const filters: any = {};
      if (status) filters.status = status;
      if (category) filters.category = category;
      if (priority) filters.priority = priority;

      const { tickets, total } = await supportService.getTickets(userId, pageNum, limitNum, filters);

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

      const ticket = await supportService.getTicketById(id, userId);

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
      logger.error('Error creating support ticket:', error);
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
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { subject, description, category, priority = 'medium' } = req.body;

      const ticket = await supportService.createTicket(userId, { subject, description, category, priority });

      res.status(201).json({ success: true, message: 'Support ticket created successfully', data: ticket });
    } catch (error) {
      logger.error('Error creating support ticket:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
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
      const supportMessage = await supportService.addMessage(id, userId, message);

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

      const updatedTicket = await supportService.updateTicket(id, userId, { subject, description, category, priority });

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
  // const { reason } = req.body; // reason not used currently
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ 
          success: false,
          error: 'Unauthorized' 
        });
        return;
      }

      const updatedTicket = await supportService.closeTicket(id, userId);

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

      const stats = await supportService.getTicketStats(userId);
      res.status(200).json({ success: true, message: 'Ticket statistics retrieved successfully', data: stats });
    } catch (error) {
      logger.error('Error getting ticket stats:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }
}