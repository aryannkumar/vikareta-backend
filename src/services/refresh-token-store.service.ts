import { cacheService } from './cache.service';
import { logger } from '@/utils/logger';

type RefreshEntry = {
  userId: string;
  createdAt: string;
  expiresAt: string;
};

class RefreshTokenStoreService {
  private inMemory = new Map<string, RefreshEntry>();

  constructor() {
    // nothing to init: we reuse the global cacheService which manages Redis connection
  }

  async set(token: string, userId: string, ttlSeconds: number) {
    const entry: RefreshEntry = { userId, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString() };

    try {
      // Use dedicated 'refreshToken' cache type with explicit TTL
      const ok = await cacheService.set('refreshToken', token, entry, ttlSeconds);
      if (ok) return;
    } catch (err) {
      logger.warn('RefreshTokenStoreService: cacheService set failed, falling back to memory', err && (err as any).message ? (err as any).message : err);
    }

    // Fallback to in-memory
    this.inMemory.set(token, entry);
  }

  async get(token: string): Promise<RefreshEntry | null> {
    try {
      const raw = await cacheService.get<RefreshEntry>('refreshToken', token);
      if (raw) return raw;
    } catch (err) {
      logger.warn('RefreshTokenStoreService: cacheService get failed, falling back to memory', err && (err as any).message ? (err as any).message : err);
    }

    const entry = this.inMemory.get(token) || null;
    if (entry) {
      if (new Date(entry.expiresAt) < new Date()) {
        this.inMemory.delete(token);
        return null;
      }
    }
    return entry;
  }

  async delete(token: string) {
    try {
      const ok = await cacheService.delete('refreshToken', token);
      if (ok) return;
    } catch (err) {
      logger.warn('RefreshTokenStoreService: cacheService delete failed, falling back to memory', err && (err as any).message ? (err as any).message : err);
    }

    this.inMemory.delete(token);
  }
}

export const refreshTokenStoreService = new RefreshTokenStoreService();