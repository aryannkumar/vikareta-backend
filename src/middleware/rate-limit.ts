import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';

interface RateLimitOptions {
  windowMs: number; // timeframe in ms
  max: number; // max requests per window per key
  keyGenerator?: (req: Request) => string;
  redis?: Redis;
  prefix?: string;
}

interface RateLimitState {
  count: number;
  expiresAt: number;
}

// In-memory fallback (per-process) — acceptable for low volume admin/test endpoints
const memoryStore = new Map<string, RateLimitState>();

export function rateLimit(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    keyGenerator = (req) => req.ip || 'unknown',
    redis,
    prefix = 'rl:'
  } = options;

  return async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    try {
      const key = prefix + keyGenerator(req);
      const now = Date.now();

      if (redis) {
        const ttlScript = `local current = redis.call('INCR', KEYS[1])\nif tonumber(current) == 1 then\n  redis.call('PEXPIRE', KEYS[1], ARGV[1])\nend\nreturn current`;
        const current = await redis.eval(ttlScript, 1, key, windowMs);
        if (Number(current) > max) {
          res.status(429).json({ message: 'Too many requests, please try again later.' });
          return;
        }
        return next();
      }

      // In-memory fallback
      const existing = memoryStore.get(key);
      if (!existing || existing.expiresAt < now) {
        memoryStore.set(key, { count: 1, expiresAt: now + windowMs });
        return next();
      }
      existing.count += 1;
      if (existing.count > max) {
        res.status(429).json({ message: 'Too many requests, please try again later.' });
        return;
      }
      return next();
    } catch (err) {
      // Fail-open on rate limit errors
      return next();
    }
  };
}

export const burstyTestWebhookLimiter = rateLimit({ windowMs: 60_000, max: 5 });
export const retryWebhookLimiter = rateLimit({ windowMs: 60_000, max: 10 });
