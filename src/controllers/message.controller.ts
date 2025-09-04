import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

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

      const { page = 1, limit = 20, status, type, relatedType } = req.query;
      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      const where: any = {
        OR: [
          { senderId: userId },
          { recipientId: userId },
        ],
      };

      if (status) where.status = status;
      if (type) where.type = type;
      if (relatedType) where.relatedType = relatedType;

      const [messages, total] = await Promise.all([
        prisma.message.findMany({
          where,
          include: {
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                businessName: true,
                avatar: true,
                userType: true,
              },
            },
            recipient: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                businessName: true,
                avatar: true,
                userType: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit as string),
        }),
        prisma.message.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        message: 'Messages retrieved successfully',
        data: {
          messages,
          total,
          page: parseInt(page as string),
          totalPages: Math.ceil(total / parseInt(limit as string)),
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

      const message = await prisma.message.findUnique({
        where: { id },
        include: {
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              avatar: true,
              userType: true,
            },
          },
          recipient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              avatar: true,
              userType: true,
            },
          },
        },
      });

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

      // Verify recipient exists
      const recipient = await prisma.user.findUnique({
        where: { id: recipientId },
        select: { id: true, firstName: true, lastName: true, businessName: true },
      });

      if (!recipient) {
        res.status(404).json({ 
          success: false,
          error: 'Recipient not found' 
        });
        return;
      }

      const message = await prisma.message.create({
        data: {
          subject,
          content,
          senderId: userId,
          recipientId,
          messageType,
          priority,
          type,
          relatedType,
          relatedId,
          status: 'unread',
          isRead: false,
        },
        include: {
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              avatar: true,
            },
          },
          recipient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              avatar: true,
            },
          },
        },
      });

      // TODO: Send notification to recipient
      // await notificationService.sendMessageNotification(message);

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

      // Verify message exists and user is the recipient
      const existingMessage = await prisma.message.findUnique({
        where: { id },
        select: { recipientId: true, isRead: true },
      });

      if (!existingMessage) {
        res.status(404).json({ 
          success: false,
          error: 'Message not found' 
        });
        return;
      }

      if (existingMessage.recipientId !== userId) {
        res.status(403).json({ 
          success: false,
          error: 'Access denied' 
        });
        return;
      }

      if (existingMessage.isRead) {
        res.status(200).json({
          success: true,
          message: 'Message already marked as read',
        });
        return;
      }

      await prisma.message.update({
        where: { id },
        data: {
          isRead: true,
          status: 'read',
          updatedAt: new Date(),
        },
      });

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

      const unreadCount = await prisma.message.count({
        where: {
          recipientId: userId,
          isRead: false,
        },
      });

      res.status(200).json({
        success: true,
        message: 'Unread count retrieved successfully',
        data: { unreadCount },
      });
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

      const { page = 1, limit = 50 } = req.query;
      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      const [messages, total] = await Promise.all([
        prisma.message.findMany({
          where: {
            OR: [
              { senderId: userId, recipientId: otherUserId },
              { senderId: otherUserId, recipientId: userId },
            ],
          },
          include: {
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                businessName: true,
                avatar: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit as string),
        }),
        prisma.message.count({
          where: {
            OR: [
              { senderId: userId, recipientId: otherUserId },
              { senderId: otherUserId, recipientId: userId },
            ],
          },
        }),
      ]);

      // Mark messages from other user as read
      await prisma.message.updateMany({
        where: {
          senderId: otherUserId,
          recipientId: userId,
          isRead: false,
        },
        data: {
          isRead: true,
          status: 'read',
          updatedAt: new Date(),
        },
      });

      res.status(200).json({
        success: true,
        message: 'Conversation retrieved successfully',
        data: {
          messages: messages.reverse(), // Return in chronological order
          total,
          page: parseInt(page as string),
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      });
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

      const message = await prisma.message.findUnique({
        where: { id },
        select: { senderId: true, recipientId: true },
      });

      if (!message) {
        res.status(404).json({ 
          success: false,
          error: 'Message not found' 
        });
        return;
      }

      // Only sender or recipient can delete the message
      if (message.senderId !== userId && message.recipientId !== userId) {
        res.status(403).json({ 
          success: false,
          error: 'Access denied' 
        });
        return;
      }

      await prisma.message.delete({
        where: { id },
      });

      res.status(200).json({
        success: true,
        message: 'Message deleted successfully',
      });
    } catch (error) {
      logger.error('Error deleting message:', error);
      if (error.code === 'P2025') {
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