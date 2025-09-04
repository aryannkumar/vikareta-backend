import { prisma } from '@/config/database';

export class MessageService {
  async getMessages(userId: string, page: number, limit: number, filters: any) {
    const skip = (page - 1) * limit;
    const where: any = { OR: [{ senderId: userId }, { recipientId: userId }], ...filters };

    const [messages, total] = await Promise.all([
      prisma.message.findMany({ where, include: { sender: { select: { id: true, firstName: true, lastName: true, businessName: true, avatar: true, userType: true } }, recipient: { select: { id: true, firstName: true, lastName: true, businessName: true, avatar: true, userType: true } } }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.message.count({ where }),
    ]);

    return { messages, total };
  }

  async getMessageById(id: string) {
    return prisma.message.findUnique({ where: { id }, include: { sender: true, recipient: true } });
  }

  async sendMessage(senderId: string, payload: any) {
    const recipient = await prisma.user.findUnique({ where: { id: payload.recipientId }, select: { id: true, firstName: true, lastName: true, businessName: true } });
    if (!recipient) throw new Error('Recipient not found');

    const message = await prisma.message.create({ data: { subject: payload.subject, content: payload.content, senderId, recipientId: payload.recipientId, messageType: payload.messageType ?? 'email', priority: payload.priority ?? 'normal', type: payload.type ?? 'email', relatedType: payload.relatedType, relatedId: payload.relatedId, status: 'unread', isRead: false }, include: { sender: { select: { id: true, firstName: true, lastName: true, businessName: true, avatar: true } }, recipient: { select: { id: true, firstName: true, lastName: true, businessName: true, avatar: true } } } });

    return message;
  }

  async markAsRead(messageId: string, userId: string) {
    const existing = await prisma.message.findUnique({ where: { id: messageId }, select: { recipientId: true, isRead: true } });
    if (!existing) throw new Error('Message not found');
    if (existing.recipientId !== userId) throw new Error('Access denied');
    if (existing.isRead) return;

    await prisma.message.update({ where: { id: messageId }, data: { isRead: true, status: 'read', updatedAt: new Date() } });
    return;
  }

  async deleteMessage(messageId: string, userId: string) {
    const message = await prisma.message.findUnique({ where: { id: messageId }, select: { senderId: true, recipientId: true } });
    if (!message) throw new Error('Message not found');
    if (message.senderId !== userId && message.recipientId !== userId) throw new Error('Access denied');

    await prisma.message.delete({ where: { id: messageId } });
    return;
  }

  async getUnreadCount(userId: string) {
    return prisma.message.count({ where: { recipientId: userId, isRead: false } });
  }

  async getConversation(userId: string, otherUserId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [messages, total] = await Promise.all([
      prisma.message.findMany({ where: { OR: [{ senderId: userId, recipientId: otherUserId }, { senderId: otherUserId, recipientId: userId }] }, include: { sender: { select: { id: true, firstName: true, lastName: true, businessName: true, avatar: true } } }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.message.count({ where: { OR: [{ senderId: userId, recipientId: otherUserId }, { senderId: otherUserId, recipientId: userId }] } }),
    ]);

    // Mark messages from other user as read
    await prisma.message.updateMany({ where: { senderId: otherUserId, recipientId: userId, isRead: false }, data: { isRead: true, status: 'read', updatedAt: new Date() } });

    return { messages: messages.reverse(), total };
  }
}

export const messageService = new MessageService();
