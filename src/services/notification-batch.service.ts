import { prisma } from '@/config/database';
import { redisClient } from '@/config/redis';
import { logger } from '@/utils/logger';
import { notificationService } from './notification.service';
import { notificationBatchProcessedCounter, notificationSentCounter } from '@/observability/metrics';

interface CreateBatchInput {
  name: string;
  description?: string;
  type: string;
  channel?: string;
  templateId?: string;
  variables?: Record<string, any>;
  userIds?: string[];
  segment?: {
    role?: string;
    isVerified?: boolean;
    country?: string;
    userType?: string;
  };
  title: string;
  message: string;
  scheduleAt?: Date;
}

class NotificationBatchService {
  private queueKey = 'notification:batch:queue';
  private processingSet = 'notification:batch:processing';

  constructor() {
    this.startScheduleLoop();
  }

  private async startScheduleLoop() {
    const tick = async () => {
      try {
        const now = new Date();
        // Find batches that are pending with scheduledAt <= now and not yet queued
        const due = await prisma.notificationBatch.findMany({
          where: { status: 'pending', scheduledAt: { lte: now } },
          take: 20,
        });
        for (const b of due) {
          // Mark processing to avoid re-pick
          await prisma.notificationBatch.update({ where: { id: b.id }, data: { status: 'processing', startedAt: new Date() } });
          // We rely on initial create to have populated queue; if missed, skip (could rebuild recipients list if we stored criteria)
          // Trigger queue processing
          this.processQueue().catch(err => logger.error('Scheduled batch process error', err));
        }
      } catch (err) {
        logger.warn('Schedule loop error', err);
      }
      setTimeout(tick, 10000); // 10s cadence
    };
    tick();
  }

  async createBatch(input: CreateBatchInput) {
    // Determine recipients
    let recipients: string[] = [];
    if (input.userIds && input.userIds.length) {
      recipients = [...new Set(input.userIds)];
    } else if (input.segment) {
      const where: any = {};
      if (input.segment.role) where.role = input.segment.role;
      if (input.segment.isVerified !== undefined) where.isVerified = input.segment.isVerified;
      if (input.segment.country) where.country = input.segment.country;
      if (input.segment.userType) where.userType = input.segment.userType;
      const users = await prisma.user.findMany({ where, select: { id: true } });
      recipients = users.map(u => u.id);
    } else {
      throw new Error('Either userIds or segment must be provided');
    }

    const batch = await prisma.notificationBatch.create({
      data: {
        name: input.name,
        description: input.description,
        type: input.type,
        status: input.scheduleAt ? 'pending' : 'processing',
        totalCount: recipients.length,
        scheduledAt: input.scheduleAt || null,
      }
    });

    if (recipients.length) {
  await (prisma as any).notificationBatchRecipient.createMany({
        data: recipients.map(r => ({ batchId: batch.id, userId: r })),
        skipDuplicates: true,
      });
    }

    // Store batch metadata in Redis
    const meta = { id: batch.id, title: input.title, message: input.message, templateId: input.templateId, variables: input.variables, channel: input.channel || 'in_app' };
    await redisClient.set(`notification:batch:meta:${batch.id}`, JSON.stringify(meta));
    await redisClient.expire(`notification:batch:meta:${batch.id}`, 60 * 60 * 24);

    if (recipients.length) {
      const chunkSize = 500;
      for (let i = 0; i < recipients.length; i += chunkSize) {
        const slice = recipients.slice(i, i + chunkSize);
        const job = JSON.stringify({ batchId: batch.id, users: slice });
        await redisClient.rpush(this.queueKey, job);
      }
    }

    // Trigger immediate processing if not scheduled
    if (!input.scheduleAt) {
      this.processQueue().catch(err => logger.error('Batch immediate processing error', err));
    }

    return batch;
  }

  async processQueue(limit = 5) {
    // Basic in-process worker (no concurrency control beyond simple loop)
    for (let i = 0; i < limit; i++) {
      const job = await redisClient.lpop(this.queueKey);
      if (!job) break;
      try {
        const parsed: { batchId: string; users: string[] } = JSON.parse(job);
        await this.processJob(parsed.batchId, parsed.users);
      } catch (err) {
        logger.error('Failed processing batch job', err);
      }
    }
  }

  private async processJob(batchId: string, users: string[]) {
    const metaRaw = await redisClient.get(`notification:batch:meta:${batchId}`);
    if (!metaRaw) {
      logger.warn('Missing batch meta for', batchId);
      return;
    }
    const meta = JSON.parse(metaRaw);

    // Mark batch processing if not already
    const batch = await prisma.notificationBatch.findUnique({ where: { id: batchId } });
    if (!batch) return;
    if (batch.status === 'pending') {
      await prisma.notificationBatch.update({ where: { id: batchId }, data: { status: 'processing', startedAt: new Date() } });
    }

  let sent = 0; let failed = 0;
    for (const userId of users) {
      const start = Date.now();
      try {
        const result = await notificationService.createNotification({
          userId,
          title: meta.title,
          message: meta.message,
          type: meta.type || 'general',
          channel: meta.channel,
          templateId: meta.templateId,
          variables: meta.variables,
        });
        if (result && result.skipped) {
          await (prisma as any).notificationBatchRecipient.update({
            where: { batchId_userId: { batchId, userId } },
            data: { status: 'skipped', attempts: { increment: 1 }, lastAttemptAt: new Date(), lastError: result.reason },
          });
          notificationSentCounter.labels({ channel: meta.channel, type: meta.type || 'general', status: 'skipped' }).inc();
        } else {
          sent++;
          await (prisma as any).notificationBatchRecipient.update({
            where: { batchId_userId: { batchId, userId } },
            data: { status: 'sent', attempts: { increment: 1 }, lastAttemptAt: new Date(), lastError: null },
          });
          notificationSentCounter.labels({ channel: meta.channel, type: meta.type || 'general', status: 'sent' }).inc();
        }
      } catch (err: any) {
        failed++;
  await (prisma as any).notificationBatchRecipient.update({
          where: { batchId_userId: { batchId, userId } },
          data: { status: 'failed', attempts: { increment: 1 }, lastAttemptAt: new Date(), lastError: err?.message?.substring(0, 500) },
        });
        notificationSentCounter.labels({ channel: meta.channel, type: meta.type || 'general', status: 'failed' }).inc();
      } finally {
        const durationMs = Date.now() - start;
        if (durationMs > 5000) {
          logger.warn('Slow batch notification send', { batchId, userId, durationMs });
        }
      }
    }

    if (sent || failed) {
      await prisma.notificationBatch.update({
        where: { id: batchId },
        data: {
          sentCount: { increment: sent },
          failedCount: { increment: failed },
          processedAt: new Date(),
        }
      });
    }

    // If all chunks processed, mark completed
    const updated = await prisma.notificationBatch.findUnique({ where: { id: batchId } });
    if (updated && updated.sentCount + updated.failedCount >= updated.totalCount) {
      await prisma.notificationBatch.update({ where: { id: batchId }, data: { status: 'completed', completedAt: new Date() } });
      notificationBatchProcessedCounter.labels({ status: 'completed' }).inc();
    }
  }

  async getBatch(id: string) {
    return prisma.notificationBatch.findUnique({ where: { id } });
  }

  async getProgress(id: string) {
    const b = await prisma.notificationBatch.findUnique({ where: { id } });
    if (!b) throw new Error('Batch not found');
    const processed = b.sentCount + b.failedCount;
    const pct = b.totalCount === 0 ? 0 : Math.min(100, Math.round((processed / b.totalCount) * 100));
    return {
      id: b.id,
      status: b.status,
      total: b.totalCount,
      sent: b.sentCount,
      failed: b.failedCount,
      processed,
      percentage: pct,
      startedAt: b.startedAt,
      completedAt: b.completedAt,
    };
  }

  async listBatches(params: { page?: number; limit?: number; status?: string; type?: string; }) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (params.status) where.status = params.status;
    if (params.type) where.type = params.type;
    const [batches, total] = await Promise.all([
      prisma.notificationBatch.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.notificationBatch.count({ where })
    ]);
    return { batches, total, page, limit };
  }

  async cancelBatch(id: string) {
    const batch = await prisma.notificationBatch.findUnique({ where: { id } });
    if (!batch) throw new Error('Batch not found');
    if (batch.status === 'completed' || batch.status === 'failed') {
      return batch; // nothing to cancel
    }
    const updated = await prisma.notificationBatch.update({ where: { id }, data: { status: 'cancelled', completedAt: new Date() } });
  await (prisma as any).notificationBatchRecipient.updateMany({ where: { batchId: id, status: 'pending' }, data: { status: 'cancelled' } });
    notificationBatchProcessedCounter.labels({ status: 'cancelled' }).inc();
    // Remove queued jobs for this batch
    try {
      const tempKey = `${this.queueKey}:temp_filter`;
      // Drain queue and requeue others (simple but effective for modest queue size)
      // Drain queue
      for (;;) {
        const job = await redisClient.lpop(this.queueKey);
        if (!job) break;
        try {
          const parsed = JSON.parse(job);
            if (parsed.batchId !== id) {
              await redisClient.rpush(tempKey, job);
            }
        } catch {
          await redisClient.rpush(tempKey, job);
        }
      }
      // Move back filtered jobs
      for (;;) {
        const job = await redisClient.lpop(tempKey);
        if (!job) break;
        await redisClient.rpush(this.queueKey, job);
      }
    } catch (err) {
      logger.warn('Failed to prune batch queue on cancel', { id, error: (err as Error).message });
    }
    return updated;
  }

  async retryFailed(id: string) {
    const batch = await prisma.notificationBatch.findUnique({ where: { id } });
    if (!batch) throw new Error('Batch not found');
    // Fetch failed recipients
  const failedRecipients = await (prisma as any).notificationBatchRecipient.findMany({ where: { batchId: id, status: 'failed' }, select: { userId: true } });
    if (!failedRecipients.length) return batch;

    // Reset their status to pending for retry
  await (prisma as any).notificationBatchRecipient.updateMany({ where: { batchId: id, status: 'failed' }, data: { status: 'pending' } });

    // Requeue them
    const chunkSize = 500;
  const users = failedRecipients.map((r: { userId: string }) => r.userId);
    for (let i = 0; i < users.length; i += chunkSize) {
      const slice = users.slice(i, i + chunkSize);
      const job = JSON.stringify({ batchId: id, users: slice });
      await redisClient.rpush(this.queueKey, job);
    }
    await prisma.notificationBatch.update({ where: { id }, data: { status: 'processing', completedAt: null } });
    notificationBatchProcessedCounter.labels({ status: 'retry_started' }).inc();
    this.processQueue().catch(err => logger.error('Retry batch processing error', err));
    return prisma.notificationBatch.findUnique({ where: { id } });
  }

  async listRecipients(batchId: string, params: { page?: number; limit?: number; status?: string }) {
    const page = params.page || 1;
    const limit = params.limit || 50;
    const skip = (page - 1) * limit;
    const where: any = { batchId };
    if (params.status) where.status = params.status;
    const [items, total] = await Promise.all([
  (prisma as any).notificationBatchRecipient.findMany({ where, orderBy: { createdAt: 'asc' }, skip, take: limit }),
  (prisma as any).notificationBatchRecipient.count({ where })
    ]);
    return { recipients: items, total, page, limit };
  }

  async getRecipient(batchId: string, userId: string) {
  return (prisma as any).notificationBatchRecipient.findUnique({ where: { batchId_userId: { batchId, userId } } });
  }
}

export const notificationBatchService = new NotificationBatchService();
