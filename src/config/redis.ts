import Redis, { Redis as RedisClient, RedisOptions } from 'ioredis';
import { logger } from '../utils/logger';

// Redis configuration - prefer REDIS_URL if present
let redisClient: RedisClient;
if (process.env.REDIS_URL) {
    redisClient = new Redis(process.env.REDIS_URL) as RedisClient;
} else {
    const redisConfig: RedisOptions = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        keepAlive: 30000,
        connectTimeout: 10000,
        commandTimeout: 5000,
    };

    redisClient = new Redis(redisConfig) as RedisClient;
}

// Export the client
export { redisClient };

// Redis event handlers
redisClient.on('connect', () => {
    logger.info('Redis client connected');
});

redisClient.on('ready', () => {
    logger.info('Redis client ready');
});

redisClient.on('error', (error) => {
    logger.error('Redis client error:', error);
});

redisClient.on('close', () => {
    logger.warn('Redis client connection closed');
});

redisClient.on('reconnecting', () => {
    logger.info('Redis client reconnecting...');
});

// Cache helper functions
export class CacheService {

    static async get<T = any>(key: string): Promise<T | null> {
        try {
            const raw = await redisClient.get(key);
            if (raw === null) return null;
            try {
                return JSON.parse(raw) as T;
            } catch {
                // If not JSON, return the raw string
                return (raw as unknown) as T;
            }
        } catch (error) {
            logger.error(`Error getting cache key ${key}:`, error);
            return null;
        }
    }

    static async set<T = any>(key: string, value: T, ttl?: number): Promise<boolean> {
        try {
            const raw = typeof value === 'string' ? (value as unknown as string) : JSON.stringify(value);
            if (ttl) {
                await redisClient.set(key, raw);
                await redisClient.expire(key, ttl);
            } else {
                await redisClient.set(key, raw);
            }
            return true;
        } catch (error) {
            logger.error(`Error setting cache key ${key}:`, error);
            return false;
        }
    }

    // Backwards-compatible setex signature (key, ttl, value)
    static async setex(key: string, ttl: number, value: any): Promise<boolean> {
        return await CacheService.set(key, value, ttl);
    }

    static async del(key: string): Promise<boolean> {
        try {
            await redisClient.del(key);
            return true;
        } catch (error) {
            logger.error(`Error deleting cache key ${key}:`, error);
            return false;
        }
    }

    static async exists(key: string): Promise<boolean> {
        try {
            const result = await redisClient.exists(key);
            return result === 1;
        } catch (error) {
            logger.error(`Error checking cache key ${key}:`, error);
            return false;
        }
    }

    static async expire(key: string, ttl: number): Promise<boolean> {
        try {
            await redisClient.expire(key, ttl);
            return true;
        } catch (error) {
            logger.error(`Error setting expiry for cache key ${key}:`, error);
            return false;
        }
    }

    static async flushAll(): Promise<boolean> {
        try {
            await redisClient.flushall();
            return true;
        } catch (error) {
            logger.error('Error flushing all cache:', error);
            return false;
        }
    }

    static async keys(pattern: string): Promise<string[]> {
        try {
            return await redisClient.keys(pattern);
        } catch (error) {
            logger.error(`Error getting keys with pattern ${pattern}:`, error);
            return [];
        }
    }

    static async mget(keys: string[]): Promise<(string | null)[]> {
        try {
            return await redisClient.mget(...keys);
        } catch (error) {
            logger.error(`Error getting multiple keys:`, error);
            return [];
        }
    }

    static async mset(keyValuePairs: Record<string, string>): Promise<boolean> {
        try {
            const pairs = Object.entries(keyValuePairs).flat();
            await redisClient.mset(...pairs);
            return true;
        } catch (error) {
            logger.error('Error setting multiple keys:', error);
            return false;
        }
    }

    // Hash operations
    static async hget(key: string, field: string): Promise<string | null> {
        try {
            return await redisClient.hget(key, field);
        } catch (error) {
            logger.error(`Error getting hash field ${field} from ${key}:`, error);
            return null;
        }
    }

    static async hset(key: string, field: string, value: string): Promise<boolean> {
        try {
            await redisClient.hset(key, field, value);
            return true;
        } catch (error) {
            logger.error(`Error setting hash field ${field} in ${key}:`, error);
            return false;
        }
    }

    static async hgetall(key: string): Promise<Record<string, string>> {
        try {
            return await redisClient.hgetall(key);
        } catch (error) {
            logger.error(`Error getting all hash fields from ${key}:`, error);
            return {};
        }
    }

    // List operations
    static async lpush(key: string, ...values: string[]): Promise<number> {
        try {
            return await redisClient.lpush(key, ...values);
        } catch (error) {
            logger.error(`Error pushing to list ${key}:`, error);
            return 0;
        }
    }

    static async rpop(key: string): Promise<string | null> {
        try {
            return await redisClient.rpop(key);
        } catch (error) {
            logger.error(`Error popping from list ${key}:`, error);
            return null;
        }
    }

    static async lrange(key: string, start: number, stop: number): Promise<string[]> {
        try {
            return await redisClient.lrange(key, start, stop);
        } catch (error) {
            logger.error(`Error getting range from list ${key}:`, error);
            return [];
        }
    }

    // Set operations
    static async sadd(key: string, ...members: string[]): Promise<number> {
        try {
            return await redisClient.sadd(key, ...members);
        } catch (error) {
            logger.error(`Error adding to set ${key}:`, error);
            return 0;
        }
    }

    static async smembers(key: string): Promise<string[]> {
        try {
            return await redisClient.smembers(key);
        } catch (error) {
            logger.error(`Error getting set members from ${key}:`, error);
            return [];
        }
    }

    static async sismember(key: string, member: string): Promise<boolean> {
        try {
            const result = await redisClient.sismember(key, member);
            return result === 1;
        } catch (error) {
            logger.error(`Error checking set membership in ${key}:`, error);
            return false;
        }
    }

    // Sorted set operations
    static async zadd(key: string, score: number, member: string): Promise<number> {
        try {
            return await redisClient.zadd(key, score, member);
        } catch (error) {
            logger.error(`Error adding to sorted set ${key}:`, error);
            return 0;
        }
    }

    static async zrange(key: string, start: number, stop: number, withScores?: boolean): Promise<string[]> {
        try {
            if (withScores) {
                return await redisClient.zrange(key, start, stop, 'WITHSCORES');
            }
            return await redisClient.zrange(key, start, stop);
        } catch (error) {
            logger.error(`Error getting range from sorted set ${key}:`, error);
            return [];
        }
    }

    static async zrevrange(key: string, start: number, stop: number, withScores?: boolean): Promise<string[]> {
        try {
            if (withScores) {
                return await redisClient.zrevrange(key, start, stop, 'WITHSCORES');
            }
            return await redisClient.zrevrange(key, start, stop);
        } catch (error) {
            logger.error(`Error getting reverse range from sorted set ${key}:`, error);
            return [];
        }
    }

    // Pub/Sub operations
    static async publish(channel: string, message: string): Promise<number> {
        try {
            return await redisClient.publish(channel, message);
        } catch (error) {
            logger.error(`Error publishing to channel ${channel}:`, error);
            return 0;
        }
    }

    static subscribe(channel: string, callback: (message: string) => void): void {
        try {
            const subscriber = redisClient.duplicate();
            subscriber.subscribe(channel);
            subscriber.on('message', (receivedChannel, message) => {
                if (receivedChannel === channel) {
                    callback(message);
                }
            });
        } catch (error) {
            logger.error(`Error subscribing to channel ${channel}:`, error);
        }
    }
}

// Backward-compatible alias
export const cacheHelper = CacheService;

// Initialize Redis connection
export const initializeRedis = async (): Promise<boolean> => {
    try {
        // Check if already connected
        if (redisClient.status === 'ready') {
            logger.info('Redis already connected');
            return true;
        }
        // Only connect if not already connecting or ready
        if (redisClient.status === 'connecting') {
            logger.info('Redis is already connecting, waiting...');
            return true;
        }
        await redisClient.connect();
        logger.info('Redis connection initialized successfully');
        return true;
    } catch (error) {
        logger.error('Failed to initialize Redis connection:', error);
        return false;
    }
};

// Graceful shutdown
export const closeRedisConnection = async (): Promise<void> => {
    try {
        await redisClient.quit();
        logger.info('Redis connection closed gracefully');
    } catch (error) {
        logger.error('Error closing Redis connection:', error);
    }
};

export default redisClient;