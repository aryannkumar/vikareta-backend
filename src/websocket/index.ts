import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '@/config/environment';
import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userType?: string;
}

interface JWTPayload {
  userId: string;
  userType: string;
}

export const setupWebSocket = (io: any): void => {
  // Authentication middleware for WebSocket
  (io as any).use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = jwt.verify(token, config.jwt.secret) as JWTPayload;
      
      // Verify user exists and is active
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, userType: true, isActive: true },
      });

      if (!user || !user.isActive) {
        return next(new Error('Invalid user or inactive account'));
      }

      socket.userId = user.id;
      socket.userType = user.userType;
      
      logger.info(`WebSocket user authenticated: ${user.id}`);
      next();
    } catch (error) {
      logger.error('WebSocket authentication failed:', error);
      next(new Error('Authentication failed'));
    }
  });

  // Connection handler
  (io as any).on('connection', (socket: AuthenticatedSocket) => {
    logger.info(`WebSocket client connected: ${socket.userId}`);

    // Join user-specific room
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
      
      // Join user type room
      if (socket.userType) {
        socket.join(`userType:${socket.userType}`);
      }
    }

    // Handle RFQ events
    socket.on('rfq:subscribe', (rfqId: string) => {
      socket.join(`rfq:${rfqId}`);
      logger.info(`User ${socket.userId} subscribed to RFQ ${rfqId}`);
    });

    socket.on('rfq:unsubscribe', (rfqId: string) => {
      socket.leave(`rfq:${rfqId}`);
      logger.info(`User ${socket.userId} unsubscribed from RFQ ${rfqId}`);
    });

    // Handle order events
    socket.on('order:subscribe', (orderId: string) => {
      socket.join(`order:${orderId}`);
      logger.info(`User ${socket.userId} subscribed to order ${orderId}`);
    });

    socket.on('order:unsubscribe', (orderId: string) => {
      socket.leave(`order:${orderId}`);
      logger.info(`User ${socket.userId} unsubscribed from order ${orderId}`);
    });

    // Handle chat/messaging events
    socket.on('chat:join', (chatId: string) => {
      socket.join(`chat:${chatId}`);
      logger.info(`User ${socket.userId} joined chat ${chatId}`);
    });

    socket.on('chat:leave', (chatId: string) => {
      socket.leave(`chat:${chatId}`);
      logger.info(`User ${socket.userId} left chat ${chatId}`);
    });

    socket.on('chat:message', async (data: { chatId: string; message: string; type?: string }) => {
      try {
        // Broadcast message to chat room
        socket.to(`chat:${data.chatId}`).emit('chat:message', {
          chatId: data.chatId,
          message: data.message,
          type: data.type || 'text',
          senderId: socket.userId,
          timestamp: new Date().toISOString(),
        });

        logger.info(`Chat message sent by ${socket.userId} in chat ${data.chatId}`);
      } catch (error) {
        logger.error('Chat message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle notification events
    socket.on('notifications:subscribe', () => {
      socket.join(`notifications:${socket.userId}`);
      logger.info(`User ${socket.userId} subscribed to notifications`);
    });

    socket.on('notifications:unsubscribe', () => {
      socket.leave(`notifications:${socket.userId}`);
      logger.info(`User ${socket.userId} unsubscribed from notifications`);
    });

    // Handle typing indicators
    socket.on('typing:start', (data: { chatId: string }) => {
      socket.to(`chat:${data.chatId}`).emit('typing:start', {
        chatId: data.chatId,
        userId: socket.userId,
      });
    });

    socket.on('typing:stop', (data: { chatId: string }) => {
      socket.to(`chat:${data.chatId}`).emit('typing:stop', {
        chatId: data.chatId,
        userId: socket.userId,
      });
    });

    // Handle presence events
    socket.on('presence:online', () => {
      socket.broadcast.emit('presence:user_online', { userId: socket.userId });
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info(`WebSocket client disconnected: ${socket.userId}, reason: ${reason}`);
      
      // Broadcast user offline status
      socket.broadcast.emit('presence:user_offline', { userId: socket.userId });
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error(`WebSocket error for user ${socket.userId}:`, error);
    });
  });

  logger.info('✅ WebSocket server initialized');
};

// WebSocket event emitters for use in services
export class WebSocketService {
  private static io: any;

  static setIO(io: SocketIOServer): void {
    this.io = io;
  }

  // Emit to specific user
  static emitToUser(userId: string, event: string, data: any): void {
    if (this.io) {
      this.io.to(`user:${userId}`).emit(event, data);
    }
  }

  // Emit to all users of a specific type
  static emitToUserType(userType: string, event: string, data: any): void {
    if (this.io) {
      this.io.to(`userType:${userType}`).emit(event, data);
    }
  }

  // Emit to RFQ subscribers
  static emitToRFQ(rfqId: string, event: string, data: any): void {
    if (this.io) {
      this.io.to(`rfq:${rfqId}`).emit(event, data);
    }
  }

  // Emit to order subscribers
  static emitToOrder(orderId: string, event: string, data: any): void {
    if (this.io) {
      this.io.to(`order:${orderId}`).emit(event, data);
    }
  }

  // Emit to chat room
  static emitToChat(chatId: string, event: string, data: any): void {
    if (this.io) {
      this.io.to(`chat:${chatId}`).emit(event, data);
    }
  }

  // Emit notification to user
  static emitNotification(userId: string, notification: any): void {
    if (this.io) {
      this.io.to(`notifications:${userId}`).emit('notification:new', notification);
    }
  }

  // Broadcast to all connected clients
  static broadcast(event: string, data: any): void {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  // Get connected users count
  static async getConnectedUsersCount(): Promise<number> {
    if (this.io) {
      const sockets = await this.io.fetchSockets();
      return sockets.length;
    }
    return 0;
  }

  // Check if user is online
  static async isUserOnline(userId: string): Promise<boolean> {
    if (this.io) {
      const sockets = await this.io.in(`user:${userId}`).fetchSockets();
      return sockets.length > 0;
    }
    return false;
  }
}