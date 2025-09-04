import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';

export const cleanupExpiredRFQsJob = async (): Promise<void> => {
  try {
    const now = new Date();
    
    // Find expired RFQs that are still active
    const expiredRFQs = await prisma.rfq.findMany({
      where: {
        status: 'active',
        expiresAt: {
          lt: now,
        },
      },
    });

    if (expiredRFQs.length === 0) {
      logger.info('No expired RFQs to cleanup');
      return;
    }

    // Update expired RFQs to 'expired' status
    const result = await prisma.rfq.updateMany({
      where: {
        id: {
          in: expiredRFQs.map(rfq => rfq.id),
        },
      },
      data: {
        status: 'expired',
      },
    });

    logger.info(`Marked ${result.count} RFQs as expired`);

    // Also update related quotes to 'expired' status
    const expiredQuotes = await prisma.quote.updateMany({
      where: {
        rfqId: {
          in: expiredRFQs.map(rfq => rfq.id),
        },
        status: {
          in: ['pending', 'active'],
        },
      },
      data: {
        status: 'expired',
      },
    });

    logger.info(`Marked ${expiredQuotes.count} related quotes as expired`);
  } catch (error) {
    logger.error('Error in cleanup expired RFQs job:', error);
    throw error;
  }
};