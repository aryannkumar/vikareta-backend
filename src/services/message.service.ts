import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export class MessageService {
  /**
   * Get messages with pagination and filtering
   */
  async getMessages(
    userId: string,
    filters: {
      search?: string;
      status?: string;
      type?: string;
      priority?: string;
      page?: number;
      limit?: number;
    } = {}
  ) {
    try {
      const {
        search,
        status,
        type,
        priority,
        page = 1,
        limit = 20
      } = filters;

      const skip = (page - 1) * limit;

      // Build where clause
      const whereClause: any = {
        OR: [
          { senderId: userId },
          { recipientId: userId }
        ]
      };

      if (search) {
        whereClause.OR = [
          ...whereClause.OR,
          {
            subject: {
              contains: search,
              mode: 'insensitive'
            }
          },
          {
            content: {
              contains: search,
              mode: 'insensitive'
            }
          }
        ];
      }

      if (status && status !== 'all') {
        whereClause.status = status;
      }

      if (type && type !== 'all') {
        whereClause.type = type;
      }

      if (priority && priority !== 'all') {
        whereClause.priority = priority;
      }

      // Get total count
      const total = await prisma.message.count({ where: whereClause });

      // Get messages with sender and recipient details
      const messages = await prisma.message.findMany({
        where: whereClause,
        include: {
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              businessName: true,
              userType: true
            }
          },
          recipient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              businessName: true,
              userType: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take: limit
      });

      // Format messages for frontend
      const formattedMessages = messages.map(message => ({
        id: message.id,
        subject: message.subject,
        content: message.content,
        sender: {
          id: message.sender.id,
          name: `${message.sender.firstName || ''} ${message.sender.lastName || ''}`.trim() || message.sender.businessName || 'Unknown',
          email: message.sender.email || '',
          type: message.sender.userType === 'supplier' ? 'supplier' : 
                message.sender.userType === 'admin' ? 'internal' : 'customer',
          company: message.sender.businessName
        },
        recipient: {
          id: message.recipient.id,
          name: `${message.recipient.firstName || ''} ${message.recipient.lastName || ''}`.trim() || message.recipient.businessName || 'Unknown',
          email: message.recipient.email || ''
        },
        status: message.status,
        priority: message.priority,
        type: message.type,
        createdAt: message.createdAt.toISOString(),
        updatedAt: message.updatedAt.toISOString(),
        relatedTo: message.relatedType && message.relatedId ? {
          type: message.relatedType,
          id: message.relatedId,
          title: `${message.relatedType.toUpperCase()} ${message.relatedId}`
        } : undefined
      }));

      return {
        success: true,
        data: {
          messages: formattedMessages,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasMore: skip + messages.length < total
          }
        }
      };
    } catch (error) {
      logger.error('Error getting messages:', error);
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Failed to get messages'
        }
      };
    }
  }

  /**
   * Get communication statistics
   */
  async getCommunicationStats(userId: string) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get total messages count
      const totalMessages = await prisma.message.count({
        where: {
          OR: [
            { senderId: userId },
            { recipientId: userId }
          ]
        }
      });

      // Get unread messages count
      const unreadMessages = await prisma.message.count({
        where: {
          recipientId: userId,
          status: 'unread'
        }
      });

      // Get today's messages count
      const todayMessages = await prisma.message.count({
        where: {
          OR: [
            { senderId: userId },
            { recipientId: userId }
          ],
          createdAt: {
            gte: today
          }
        }
      });

      // Calculate response rate (replied messages / received messages)
      const receivedMessages = await prisma.message.count({
        where: {
          recipientId: userId
        }
      });

      const repliedMessages = await prisma.message.count({
        where: {
          recipientId: userId,
          status: 'replied'
        }
      });

      const responseRate = receivedMessages > 0 ? 
        Number(((repliedMessages / receivedMessages) * 100).toFixed(1)) : 0;

      // Calculate average response time (simplified - using hours)
      const averageResponseTime = 2.3; // Placeholder - would need more complex calculation

      // Get active conversations (unique senders/recipients in last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentMessages = await prisma.message.findMany({
        where: {
          OR: [
            { senderId: userId },
            { recipientId: userId }
          ],
          createdAt: {
            gte: sevenDaysAgo
          }
        },
        select: {
          senderId: true,
          recipientId: true
        }
      });

      const uniqueContacts = new Set();
      recentMessages.forEach(msg => {
        if (msg.senderId !== userId) uniqueContacts.add(msg.senderId);
        if (msg.recipientId !== userId) uniqueContacts.add(msg.recipientId);
      });

      const activeConversations = uniqueContacts.size;

      return {
        success: true,
        data: {
          totalMessages,
          unreadMessages,
          todayMessages,
          responseRate,
          averageResponseTime,
          activeConversations
        }
      };
    } catch (error) {
      logger.error('Error getting communication stats:', error);
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Failed to get communication stats'
        }
      };
    }
  }

  /**
   * Send a new message
   */
  async sendMessage(
    senderId: string,
    data: {
      to: string;
      subject: string;
      content: string;
      type?: string;
      priority?: string;
      relatedType?: string;
      relatedId?: string;
    }
  ) {
    try {
      // Find recipient by email or ID
      let recipientId = data.to;
      
      // If 'to' looks like an email, find user by email
      if (data.to.includes('@')) {
        const recipient = await prisma.user.findUnique({
          where: { email: data.to },
          select: { id: true }
        });
        
        if (!recipient) {
          return {
            success: false,
            error: { message: 'Recipient not found' }
          };
        }
        
        recipientId = recipient.id;
      }

      const message = await prisma.message.create({
        data: {
          subject: data.subject,
          content: data.content,
          senderId,
          recipientId,
          type: data.type || 'email',
          priority: data.priority || 'normal',
          relatedType: data.relatedType,
          relatedId: data.relatedId,
          status: 'unread'
        },
        include: {
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              businessName: true
            }
          },
          recipient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              businessName: true
            }
          }
        }
      });

      return {
        success: true,
        data: {
          id: message.id,
          subject: message.subject,
          content: message.content,
          createdAt: message.createdAt.toISOString()
        }
      };
    } catch (error) {
      logger.error('Error sending message:', error);
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Failed to send message'
        }
      };
    }
  }

  /**
   * Mark message as read
   */
  async markAsRead(messageId: string, userId: string) {
    try {
      const message = await prisma.message.findFirst({
        where: {
          id: messageId,
          recipientId: userId
        }
      });

      if (!message) {
        return {
          success: false,
          error: { message: 'Message not found or unauthorized' }
        };
      }

      await prisma.message.update({
        where: { id: messageId },
        data: { 
          status: 'read',
          updatedAt: new Date()
        }
      });

      return {
        success: true,
        data: { message: 'Message marked as read' }
      };
    } catch (error) {
      logger.error('Error marking message as read:', error);
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Failed to mark message as read'
        }
      };
    }
  }

  /**
   * Archive message
   */
  async archiveMessage(messageId: string, userId: string) {
    try {
      const message = await prisma.message.findFirst({
        where: {
          id: messageId,
          OR: [
            { senderId: userId },
            { recipientId: userId }
          ]
        }
      });

      if (!message) {
        return {
          success: false,
          error: { message: 'Message not found or unauthorized' }
        };
      }

      await prisma.message.update({
        where: { id: messageId },
        data: { 
          status: 'archived',
          updatedAt: new Date()
        }
      });

      return {
        success: true,
        data: { message: 'Message archived' }
      };
    } catch (error) {
      logger.error('Error archiving message:', error);
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Failed to archive message'
        }
      };
    }
  }
}

export const messageService = new MessageService();