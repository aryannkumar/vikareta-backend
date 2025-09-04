import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { messageService } from '@/services/message.service';
import { notificationService } from '@/services/notification.service';

export class MessageController {
  async getMessages(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ 
          success: false,
          error: 'Unauthorized' 
        });
        return;
      }

      const pageNum = parseInt((req.query.page as string) || '1');
      const limitNum = parseInt((req.query.limit as string) || '20');
      const { messages, total } = await messageService.getMessages(userId, pageNum, limitNum, req.query as any);

      res.status(200).json({
        success: true,
        message: 'Messages retrieved successfully',
        data: {
          messages,
          total,
          page: pageNum,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      logger.error('Error getting messages:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  async getMessageById(req: Request, res: Response): Promise<void> {
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

  const message = await messageService.getMessageById(id);

      if (!message) {
        res.status(404).json({ 
          success: false,
          error: 'Message not found' 
        });
        return;
      }

      // Check if user has access to this message
      if (message.senderId !== userId && message.recipientId !== userId) {
        res.status(403).json({ 
          success: false,
          error: 'Access denied' 
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Message retrieved successfully',
        data: message,
      });
    } catch (error) {
      logger.error('Error getting message:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  async sendMessage(req: Request, res: Response): Promise<void> {
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
        content,
        recipientId,
        messageType = 'email',
        priority = 'normal',
        type = 'email',
        relatedType,
        relatedId,
      } = req.body;

      const message = await messageService.sendMessage(userId, {
        recipientId,
        content,
        subject,
        messageType,
        priority,
        type,
        relatedType,
        relatedId,
      });

      // Send in-app notification to recipient
      try {
        await notificationService.createNotification({
          userId: message.recipientId,
          title: subject || 'New message',
          message: content || 'You have received a new message',
          type: 'message',
          channel: 'in_app',
          data: { messageId: message.id, senderId: userId },
        });
      } catch (notifErr) {
        logger.warn('Failed to send message notification:', notifErr);
      }

      res.status(201).json({
        success: true,
        message: 'Message sent successfully',
        data: message,
      });
    } catch (error) {
      logger.error('Error sending message:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  async markAsRead(req: Request, res: Response): Promise<void> {
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

      try {
        await messageService.markAsRead(id, userId);
      } catch (err) {
        const error: any = err;
        if (error.message === 'Message not found') {
          res.status(404).json({ success: false, error: 'Message not found' });
          return;
        }
        if (error.message === 'Access denied') {
          res.status(403).json({ success: false, error: 'Access denied' });
          return;
        }
        throw err;
      }

      res.status(200).json({
        success: true,
        message: 'Message marked as read',
      });
    } catch (error) {
      logger.error('Error marking message as read:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  async getUnreadCount(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ 
          success: false,
          error: 'Unauthorized' 
        });
        return;
      }

  const unreadCount = await messageService.getUnreadCount(userId);
  res.status(200).json({ success: true, message: 'Unread count retrieved successfully', data: { unreadCount } });
    } catch (error) {
      logger.error('Error getting unread count:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  async getConversation(req: Request, res: Response): Promise<void> {
    try {
      const { otherUserId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ 
          success: false,
          error: 'Unauthorized' 
        });
        return;
      }

      const pageNum = parseInt((req.query.page as string) || '1');
      const limitNum = parseInt((req.query.limit as string) || '50');
      const { messages, total } = await messageService.getConversation(userId, otherUserId, pageNum, limitNum);

      res.status(200).json({ success: true, message: 'Conversation retrieved successfully', data: {
        messages,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
      } });
    } catch (error) {
      logger.error('Error getting conversation:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  async deleteMessage(req: Request, res: Response): Promise<void> {
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

      try {
        await messageService.deleteMessage(id, userId);
      } catch (err) {
        const error: any = err;
        if (error.message === 'Message not found') {
          res.status(404).json({ success: false, error: 'Message not found' });
          return;
        }
        if (error.message === 'Access denied') {
          res.status(403).json({ success: false, error: 'Access denied' });
          return;
        }
        throw err;
      }

      res.status(200).json({
        success: true,
        message: 'Message deleted successfully',
      });
    } catch (err) {
      const error: any = err;
      logger.error('Error deleting message:', error);
      if (error?.code === 'P2025') {
        res.status(404).json({ 
          success: false,
          error: 'Message not found' 
        });
        return;
      }
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }
}