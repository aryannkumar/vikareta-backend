import { BaseService } from '@/services/base.service';
import { logger } from '@/utils/logger';

export interface CreateDealMessageDto {
  dealId: string;
  senderId: string;
  message: string;
  messageType?: string;
}

export interface UpdateDealMessageDto {
  message?: string;
  isRead?: boolean;
}

export class DealMessageService extends BaseService {

  async create(createDealMessageDto: CreateDealMessageDto) {
    logger.info(`Creating deal message for deal ${createDealMessageDto.dealId}`);

    const message = await this.prisma.dealMessage.create({
      data: createDealMessageDto,
      include: {
        deal: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    logger.info(`Deal message created with ID: ${message.id}`);
    return message;
  }

  async findById(id: string) {
    logger.info(`Finding deal message by ID: ${id}`);

    const message = await this.prisma.dealMessage.findUnique({
      where: { id },
      include: {
        deal: {
          select: {
            id: true,
            title: true,
            status: true,
            buyer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
            seller: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!message) {
      throw new Error(`Deal message with ID ${id} not found`);
    }

    return message;
  }

  async findByDealId(dealId: string, includeRead: boolean = true) {
    logger.info(`Finding messages for deal ${dealId}`);

    const messages = await this.prisma.dealMessage.findMany({
      where: {
        dealId,
        ...(includeRead ? {} : { isRead: false }),
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return messages;
  }

  async findBySenderId(senderId: string, limit: number = 50) {
    logger.info(`Finding messages sent by user ${senderId}`);

    const messages = await this.prisma.dealMessage.findMany({
      where: { senderId },
      include: {
        deal: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return messages;
  }

  async update(id: string, updateDealMessageDto: UpdateDealMessageDto) {
    logger.info(`Updating deal message ${id}`);

    const message = await this.prisma.dealMessage.update({
      where: { id },
      data: updateDealMessageDto,
      include: {
        deal: {
          select: {
            id: true,
            title: true,
          },
        },
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    logger.info(`Deal message updated: ${message.id}`);
    return message;
  }

  async markAsRead(id: string) {
    logger.info(`Marking deal message ${id} as read`);

    const message = await this.prisma.dealMessage.update({
      where: { id },
      data: { isRead: true },
      include: {
        deal: {
          select: {
            id: true,
            title: true,
          },
        },
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    logger.info(`Deal message marked as read: ${message.id}`);
    return message;
  }

  async markMultipleAsRead(messageIds: string[]) {
    logger.info(`Marking ${messageIds.length} messages as read`);

    const result = await this.prisma.dealMessage.updateMany({
      where: {
        id: {
          in: messageIds,
        },
      },
      data: { isRead: true },
    });

    logger.info(`Marked ${result.count} messages as read`);
    return result;
  }

  async delete(id: string) {
    logger.info(`Deleting deal message ${id}`);

    const message = await this.prisma.dealMessage.delete({
      where: { id },
    });

    logger.info(`Deal message deleted: ${message.id}`);
    return message;
  }

  async getUnreadCount(dealId: string, userId?: string) {
    logger.info(`Getting unread message count for deal ${dealId}${userId ? ` and user ${userId}` : ''}`);

    const whereClause: any = {
      dealId,
      isRead: false,
    };

    // If userId is provided, only count messages not sent by this user
    if (userId) {
      whereClause.senderId = {
        not: userId,
      };
    }

    const count = await this.prisma.dealMessage.count({
      where: whereClause,
    });

    return count;
  }

  async getMessageStats(dealId: string) {
    logger.info(`Getting message statistics for deal ${dealId}`);

    const stats = await this.prisma.dealMessage.groupBy({
      by: ['senderId'],
      where: { dealId },
      _count: {
        id: true,
      },
    });

    return stats;
  }

  async getRecentMessages(limit: number = 20) {
    logger.info(`Getting ${limit} most recent deal messages`);

    const messages = await this.prisma.dealMessage.findMany({
      include: {
        deal: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return messages;
  }

  async searchMessages(dealId: string, searchTerm: string) {
    logger.info(`Searching messages in deal ${dealId} for term: ${searchTerm}`);

    const messages = await this.prisma.dealMessage.findMany({
      where: {
        dealId,
        message: {
          contains: searchTerm,
          mode: 'insensitive',
        },
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return messages;
  }
}