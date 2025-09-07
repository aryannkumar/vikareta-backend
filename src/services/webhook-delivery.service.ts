import axios from 'axios';
import { prisma } from '@/config/database';
import { redisClient } from '@/config/redis';
import { webhookDeliveriesCounter } from '@/observability/metrics';
import { trace } from '@opentelemetry/api';

interface DeliveryResult {
  status: 'success' | 'failure';
  statusCode?: number;
  durationMs: number;
  error?: string;
  responseBody?: any;
}

class WebhookDeliveryService {
  private attemptKey(id: string) { return `webhook:attempts:${id}`; }
  private lastPayloadKey(id: string) { return `webhook:last_payload:${id}`; }
  private retryMetaKey(id: string) { return `webhook:retry_meta:${id}`; }
  private retryQueueKey = 'webhook:retry_queue';
  private maxRetries = 8;

  constructor() {
    // Best-effort background poller; in production replace with real job runner / queue consumer
    this.startRetryLoop();
  }

  private async startRetryLoop() {
    const loop = async () => {
      try {
        const now = Date.now();
        // ZRANGEBYSCORE pattern if we stored with score; here using list with JSON entries
        const entries = await redisClient.lrange(this.retryQueueKey, 0, -1);
        const remaining: string[] = [];
        for (const raw of entries) {
          try {
            const job = JSON.parse(raw);
            if (job.runAt <= now) {
              await this.processRetry(job);
            } else {
              remaining.push(raw);
            }
          } catch { /* ignore */ }
        }
        // Rewrite queue with remaining (simple approach for limited volume)
        await redisClient.del(this.retryQueueKey);
        if (remaining.length) await redisClient.rpush(this.retryQueueKey, ...remaining);
      } catch { /* swallow */ }
      setTimeout(loop, 3000); // 3s cadence
    };
    loop();
  }

  private async scheduleRetry(webhookId: string, event: string, payload: any, attempt: number) {
    if (attempt >= this.maxRetries) return; // give up
    const delayMs = Math.min(60000, Math.pow(2, attempt) * 1000); // exponential up to 60s
    const runAt = Date.now() + delayMs;
    const job = JSON.stringify({ webhookId, event, payload, attempt: attempt + 1, runAt });
    await redisClient.rpush(this.retryQueueKey, job);
    await redisClient.set(this.retryMetaKey(webhookId), String(attempt + 1));
  }

  private async processRetry(job: { webhookId: string; event: string; payload: any; attempt: number; runAt: number; }) {
    const result = await this.deliver(job.webhookId, job.event, job.payload);
    if (result.status === 'failure') {
      await this.scheduleRetry(job.webhookId, job.event, job.payload, job.attempt);
    } else {
      await redisClient.del(this.retryMetaKey(job.webhookId));
    }
  }

  async deliver(webhookId: string, event: string, payload: any): Promise<DeliveryResult> {
    const tracer = trace.getTracer('vikareta-webhook');
    return await tracer.startActiveSpan('webhook.deliver', async (span) => {
    const hook = await prisma.webhook.findUnique({ where: { id: webhookId } });
    if (!hook || !hook.isActive) throw new Error('Webhook inactive or missing');

    const signedPayload = this.signPayload(hook.secret, payload);
    const started = Date.now();
    try {
      const resp = await axios.post(hook.url, payload, {
        headers: {
          'X-Vikareta-Event': event,
          'X-Vikareta-Signature': signedPayload.signature,
          'X-Vikareta-Timestamp': signedPayload.timestamp.toString(),
          'Content-Type': 'application/json'
        }, timeout: 8000,
        validateStatus: () => true
      });
      const durationMs = Date.now() - started;
      const status: DeliveryResult = { status: resp.status >= 200 && resp.status < 300 ? 'success' : 'failure', statusCode: resp.status, durationMs, responseBody: resp.data };
      webhookDeliveriesCounter.inc({ webhookId, status: status.status });
      await this.persistAttempt(webhookId, event, payload, status);
      await prisma.webhook.update({ where: { id: webhookId }, data: {
        lastTriggered: new Date(),
        ...(status.status === 'success' ? { successCount: { increment: 1 } } : { failureCount: { increment: 1 } })
      } });
      span.setAttribute('webhook.id', webhookId);
      span.setAttribute('webhook.event', event);
      span.setAttribute('delivery.status', status.status);
      span.setAttribute('delivery.code', status.statusCode || 0);
      span.end();
      return status;
    } catch (err: any) {
      const durationMs = Date.now() - started;
      const status: DeliveryResult = { status: 'failure', durationMs, error: err.message };
      webhookDeliveriesCounter.inc({ webhookId, status: 'failure' });
      await this.persistAttempt(webhookId, event, payload, status);
      await prisma.webhook.update({ where: { id: webhookId }, data: { failureCount: { increment: 1 }, lastTriggered: new Date() } }).catch(() => null);
      // Schedule retry
      const metaRaw = await redisClient.get(this.retryMetaKey(webhookId));
      const attempt = metaRaw ? parseInt(metaRaw, 10) : 0;
      await this.scheduleRetry(webhookId, event, payload, attempt);
      span.recordException(err);
      span.setStatus({ code: 2, message: err.message });
      span.end();
      return status;
    }
    });
  }

  private signPayload(secret: string, payload: any) {
    const timestamp = Date.now();
    const crypto = require('crypto');
    const body = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', secret).update(timestamp + '.' + body).digest('hex');
    return { signature, timestamp };
  }

  private async persistAttempt(webhookId: string, event: string, payload: any, result: DeliveryResult) {
    const entry = JSON.stringify({ ts: Date.now(), event, payload, result });
    const key = this.attemptKey(webhookId);
    await redisClient.lpush(key, entry);
    await redisClient.ltrim(key, 0, 49); // keep last 50 attempts
  const lastKey = this.lastPayloadKey(webhookId);
  await redisClient.set(lastKey, JSON.stringify(payload));
  await redisClient.expire(lastKey, 60 * 60 * 24);
    // Persist in DB (non-blocking)
  prisma.webhookAttempt.create({
      data: {
        webhookId,
        event,
        status: result.status,
        statusCode: result.statusCode,
        durationMs: result.durationMs,
        error: result.error
      }
    }).catch(() => null);
  }

  async getAttempts(webhookId: string) {
    const cached = await redisClient.lrange(this.attemptKey(webhookId), 0, 49);
    const parsed = cached.map((r: string) => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
  const db = await prisma.webhookAttempt.findMany({ where: { webhookId }, orderBy: { createdAt: 'desc' }, take: 20 }).catch(() => [] as any[]);
    return { db, recentCached: parsed };
  }

  async retryLast(webhookId: string, event: string) {
    const raw = await redisClient.get(this.lastPayloadKey(webhookId));
    if (!raw) throw new Error('No recent payload to retry');
    return this.deliver(webhookId, event, JSON.parse(raw));
  }

  async testFire(webhookId: string, event: string, extra?: Record<string, any>) {
    const payload = { id: webhookId, event, test: true, timestamp: new Date().toISOString(), ...extra };
    return this.deliver(webhookId, event, payload);
  }
}

export const webhookDeliveryService = new WebhookDeliveryService();
