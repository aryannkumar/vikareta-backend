
import Redis from 'ioredis';
import { logger } from './logger';

export interface CacheStrategy {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  invalidate(pattern: string): Promise<void>;
}

export class WriteThroughCache implements CacheStrategy {
  constructor(private redis: Redis, private dataSource: any) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
      
      // Cache miss - fetch from data source
      const data = await this.dataSource.get(key);
      if (data) {
        await this.set(key, data);
      }
      return data;
    } catch (error) {
      logger.error('Write-through cache get error:', error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl: number = 3600): Promise<void> {
    try {
      // Write to cache and data source simultaneously
      await Promise.all([
        this.redis.setex(key, ttl, JSON.stringify(value)),
        this.dataSource.set(key, value)
      ]);
    } catch (error) {
      logger.error('Write-through cache set error:', error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await Promise.all([
        this.redis.del(key),
        this.dataSource.delete(key)
      ]);
    } catch (error) {
      logger.error('Write-through cache delete error:', error);
    }
  }

  async invalidate(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      logger.error('Write-through cache invalidate error:', error);
    }
  }
}

export class CacheAsideStrategy implements CacheStrategy {
  constructor(private redis: Redis, private dataSource: any) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
      return null;
    } catch (error) {
      logger.error('Cache-aside get error:', error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl: number = 3600): Promise<void> {
    try {
      await this.redis.setex(key, ttl, JSON.stringify(value));
    } catch (error) {
      logger.error('Cache-aside set error:', error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      logger.error('Cache-aside delete error:', error);
    }
  }

  async invalidate(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      logger.error('Cache-aside invalidate error:', error);
    }
  }
}

export class RefreshAheadCache implements CacheStrategy {
  private refreshThreshold = 0.8; // Refresh when 80% of TTL has passed

  constructor(private redis: Redis, private dataSource: any) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        const data = JSON.parse(cached);
        
        // Check if refresh is needed
        const ttl = await this.redis.ttl(key);
        const originalTtl = await this.redis.get(`${key}:ttl`);
        
        if (originalTtl && ttl < (parseInt(originalTtl) * this.refreshThreshold)) {
          // Refresh in background
          this.refreshInBackground(key);
        }
        
        return data;
      }
      
      // Cache miss
      const data = await this.dataSource.get(key);
      if (data) {
        await this.set(key, data);
      }
      return data;
    } catch (error) {
      logger.error('Refresh-ahead cache get error:', error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl: number = 3600): Promise<void> {
    try {
      await Promise.all([
        this.redis.setex(key, ttl, JSON.stringify(value)),
        this.redis.setex(`${key}:ttl`, ttl, ttl.toString())
      ]);
    } catch (error) {
      logger.error('Refresh-ahead cache set error:', error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await Promise.all([
        this.redis.del(key),
        this.redis.del(`${key}:ttl`)
      ]);
    } catch (error) {
      logger.error('Refresh-ahead cache delete error:', error);
    }
  }

  async invalidate(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      const ttlKeys = await this.redis.keys(`${pattern}:ttl`);
      const allKeys = [...keys, ...ttlKeys];
      
      if (allKeys.length > 0) {
        await this.redis.del(...allKeys);
      }
    } catch (error) {
      logger.error('Refresh-ahead cache invalidate error:', error);
    }
  }

  private async refreshInBackground(key: string): Promise<void> {
    try {
      const data = await this.dataSource.get(key);
      if (data) {
        await this.set(key, data);
      }
    } catch (error) {
      logger.error('Background refresh error:', error);
    }
  }
}
