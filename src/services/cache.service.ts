/**
 * Comprehensive Caching Service
 * Implements multi-layer caching strategies for Vikareta platform
 */

import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { config } from '@/config/environment';
import { PrismaClient } from '@prisma/client';

interface CacheConfig {
    ttl: number; // Time to live in seconds
    prefix: string;
    compression?: boolean;
    serialization?: 'json' | 'msgpack';
}

interface CacheStats {
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
    errors: number;
    hitRate: number;
}

class CacheService {
    private redis: Redis | null = null;
    private prisma: PrismaClient;
    private stats: CacheStats = {
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
        errors: 0,
        hitRate: 0
    };

    // Cache configurations for different data types
    private cacheConfigs: Record<string, CacheConfig> = {
        // User data - medium TTL
        user: { ttl: 1800, prefix: 'user:' }, // 30 minutes
        userProfile: { ttl: 3600, prefix: 'profile:' }, // 1 hour

        // Product data - longer TTL as it changes less frequently
        product: { ttl: 7200, prefix: 'product:' }, // 2 hours
        productList: { ttl: 1800, prefix: 'products:' }, // 30 minutes
        category: { ttl: 14400, prefix: 'category:' }, // 4 hours

        // RFQ and quotes - shorter TTL as they're time-sensitive
        rfq: { ttl: 900, prefix: 'rfq:' }, // 15 minutes
        quote: { ttl: 1800, prefix: 'quote:' }, // 30 minutes
        rfqList: { ttl: 300, prefix: 'rfqs:' }, // 5 minutes

        // Order data - medium TTL
        order: { ttl: 1800, prefix: 'order:' }, // 30 minutes
        orderList: { ttl: 600, prefix: 'orders:' }, // 10 minutes

        // Wallet and financial data - shorter TTL for accuracy
        wallet: { ttl: 300, prefix: 'wallet:' }, // 5 minutes
        walletTransactions: { ttl: 600, prefix: 'wallet_trans:' }, // 10 minutes

        // Analytics and reports - longer TTL
        analytics: { ttl: 3600, prefix: 'analytics:' }, // 1 hour
        report: { ttl: 7200, prefix: 'report:' }, // 2 hours

        // Search results - medium TTL
        search: { ttl: 1800, prefix: 'search:' }, // 30 minutes

        // Session and temporary data
    session: { ttl: 86400, prefix: 'session:' }, // 24 hours
    // Authorization codes for OAuth2 Authorization Code flow (short-lived)
    authCode: { ttl: 120, prefix: 'authcode:' }, // 2 minutes
    // Persistent refresh tokens for SSO (shorter than sessions but long-lived)
    refreshToken: { ttl: 7 * 24 * 60 * 60, prefix: 'refresh:' }, // 7 days
        otp: { ttl: 300, prefix: 'otp:' }, // 5 minutes

        // API rate limiting
        rateLimit: { ttl: 3600, prefix: 'rate:' }, // 1 hour

        // Notification data
        notifications: { ttl: 1800, prefix: 'notifications:' }, // 30 minutes

        // Advertisement data - optimized for high-frequency access
        adCampaign: { ttl: 900, prefix: 'ad_campaign:' }, // 15 minutes
        adCampaignList: { ttl: 300, prefix: 'ad_campaigns:' }, // 5 minutes
        advertisement: { ttl: 600, prefix: 'ad:' }, // 10 minutes
        adPlacement: { ttl: 3600, prefix: 'ad_placement:' }, // 1 hour
        adTargeting: { ttl: 1800, prefix: 'ad_targeting:' }, // 30 minutes
        adAnalytics: { ttl: 300, prefix: 'ad_analytics:' }, // 5 minutes
        adBudgetStatus: { ttl: 60, prefix: 'ad_budget:' }, // 1 minute - critical for real-time budget tracking
        adSelection: { ttl: 300, prefix: 'ad_selection:' }, // 5 minutes - for frequently served ads
        externalAd: { ttl: 1800, prefix: 'external_ad:' }, // 30 minutes
        adPerformance: { ttl: 600, prefix: 'ad_performance:' } // 10 minutes
    };

    constructor() {
        // Skip Redis connection in test environment
        if (process.env.NODE_ENV !== 'test') {
            try {
                const redisUrl = config.redis.url || process.env['REDIS_URL'] || 'redis://localhost:6379';

                // Mask password for logs
                let safeRedisLog = redisUrl;
                try {
                    const parsed = new URL(redisUrl);
                    if (parsed.password) parsed.password = '*****';
                    safeRedisLog = parsed.toString();
                } catch {
                    // ignore parsing
                }

                logger.info('Initializing Redis client', { redis: safeRedisLog });

                this.redis = new Redis(redisUrl, {
                    enableReadyCheck: true,
                    maxRetriesPerRequest: 5,
                    lazyConnect: true,
                    // Connection optimizations
                    keepAlive: 30000,
                    connectTimeout: 10000,
                    commandTimeout: 5000,
                    enableOfflineQueue: false,
                    // Connection pool settings for better performance
                    family: 4,
                    // Pipeline optimizations
                    enableAutoPipelining: true,
                    // Retry strategy
                    retryStrategy(times) {
                        if (times > 20) return null;
                        return Math.min(times * 50, 2000);
                    }
                });

                this.setupEventHandlers();
                this.startStatsCollection();

                // Attempt a lazy connect but don't crash on failure
                this.redis.connect().catch((err) => {
                    logger.warn('Redis lazy connect failed, continuing without Redis', { message: err && err.message ? err.message : String(err) });
                    // leave this.redis as-is; event handlers will report state
                });
            } catch (error) {
                logger.error('Failed to initialize Redis in cache service:', { error: (error as any).message || String(error) });
                logger.warn('Cache service will operate without Redis');
                this.redis = null;
            }
        }

        this.prisma = new PrismaClient();
    }

    /**
     * Generic get method with automatic deserialization
     */
    async get<T>(type: string, key: string): Promise<T | null> {
        try {
            // Return null in test environment if Redis is not available
            if (process.env.NODE_ENV === 'test' && !this.redis) {
                return null;
            }

            const config = this.cacheConfigs[type];
            if (!config) {
                throw new Error(`Unknown cache type: ${type}`);
            }

            const fullKey = `${config.prefix}${key}`;
            const cached = await this.redis?.get(fullKey);

            if (cached) {
                this.stats.hits++;
                this.updateHitRate();
                return JSON.parse(cached) as T;
            } else {
                this.stats.misses++;
                this.updateHitRate();
                return null;
            }
        } catch (error) {
            this.stats.errors++;
            logger.error(`Cache get error for ${type}:${key}`, error);
            return null;
        }
    }

    /**
     * Generic set method with automatic serialization
     */
    async set<T>(type: string, key: string, value: T, customTtl?: number): Promise<boolean> {
        try {
            // Return true in test environment if Redis is not available
            if (process.env.NODE_ENV === 'test' && !this.redis) {
                return true;
            }

            const config = this.cacheConfigs[type];
            if (!config) {
                throw new Error(`Unknown cache type: ${type}`);
            }

            const fullKey = `${config.prefix}${key}`;
            const ttl = customTtl || config.ttl;
            const serialized = JSON.stringify(value);

            await this.redis?.setex(fullKey, ttl, serialized);
            this.stats.sets++;
            return true;
        } catch (error) {
            this.stats.errors++;
            logger.error(`Cache set error for ${type}:${key}`, error);
            return false;
        }
    }

    /**
     * Delete cache entry
     */
    async delete(type: string, key: string): Promise<boolean> {
        try {
            const config = this.cacheConfigs[type];
            if (!config) {
                throw new Error(`Unknown cache type: ${type}`);
            }

            const fullKey = `${config.prefix}${key}`;
            const result = await this.redis?.del(fullKey);
            this.stats.deletes++;
            return (result || 0) > 0;
        } catch (error) {
            this.stats.errors++;
            logger.error(`Cache delete error for ${type}:${key}`, error);
            return false;
        }
    }

    /**
     * Get or set pattern - fetch from cache or execute function and cache result
     */
    async getOrSet<T>(
        type: string,
        key: string,
        fetchFunction: () => Promise<T>,
        customTtl?: number
    ): Promise<T> {
        const cached = await this.get<T>(type, key);

        if (cached !== null) {
            return cached;
        }

        const fresh = await fetchFunction();
        await this.set(type, key, fresh, customTtl);
        return fresh;
    }

    /**
     * Invalidate cache by pattern
     */
    async invalidatePattern(pattern: string): Promise<number> {
        try {
            const keys = await this.redis?.keys(pattern);
            if (keys && keys.length > 0) {
                const result = await this.redis?.del(...keys);
                const deletedCount = result || 0;
                logger.info(`Invalidated ${deletedCount} cache entries matching pattern: ${pattern}`);
                return deletedCount;
            }
            return 0;
        } catch (error) {
            this.stats.errors++;
            logger.error(`Cache invalidation error for pattern ${pattern}`, error);
            return 0;
        }
    }

    /**
     * Cache warming for frequently accessed data
     */
    async warmCache(): Promise<void> {
        if (!this.redis) {
            logger.warn('Redis not available, skipping cache warming');
            return;
        }

        logger.info('Starting cache warming process...');

        try {
            // Check if Redis is connected before warming
            await this.redis.ping();

            // Warm up categories
            await this.warmCategories();

            // Warm up popular products
            await this.warmPopularProducts();

            // Warm up active RFQs
            await this.warmActiveRFQs();

            logger.info('Cache warming completed successfully');
        } catch (error) {
            logger.error('Cache warming failed:', error);
            logger.warn('Application will continue without cache warming');
        }
    }

    /**
     * Warm up categories cache
     */
    private async warmCategories(): Promise<void> {
        const categories = await this.prisma.category.findMany({
            where: { isActive: true },
            include: {
                children: true,
                _count: {
                    select: { products: true }
                }
            }
        });

        for (const category of categories) {
            await this.set('category', category.id, category);
        }

        // Cache category tree
        await this.set('category', 'tree', categories);
        logger.info(`Warmed ${categories.length} categories`);
    }

    /**
     * Warm up popular products cache
     */
    private async warmPopularProducts(): Promise<void> {
        const popularProducts = await this.prisma.product.findMany({
            where: { status: 'active' },
            include: {
                seller: {
                    select: { id: true, businessName: true, verificationTier: true }
                },
                category: true,
                media: true,
                _count: {
                    select: { orderItems: true }
                }
            },
            orderBy: {
                orderItems: {
                    _count: 'desc'
                }
            },
            take: 100 // Top 100 popular products
        });

        for (const product of popularProducts) {
            await this.set('product', product.id, product);
        }

        logger.info(`Warmed ${popularProducts.length} popular products`);
    }

    /**
     * Warm up active RFQs cache
     */
    private async warmActiveRFQs(): Promise<void> {
        const activeRfqs = await this.prisma.rfq.findMany({
            where: {
                status: 'active',
                expiresAt: {
                    gt: new Date()
                }
            },
            include: {
                buyer: {
                    select: { id: true, businessName: true, verificationTier: true }
                },
                category: true,
                subcategory: true,
                _count: {
                    select: { quotes: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 50
        });

        for (const rfq of activeRfqs) {
            await this.set('rfq', rfq.id, rfq);
        }

        logger.info(`Warmed ${activeRfqs.length} active RFQs`);
    }

    /**
     * Implement cache-aside pattern for user data
     */
    async getUserWithCache(userId: string): Promise<any> {
        return this.getOrSet('user', userId, async () => {
            return await this.prisma.user.findUnique({
                where: { id: userId },
                include: {
                    wallet: true,
                    subscriptions: {
                        where: { status: 'active' }
                    }
                }
            });
        });
    }

    /**
     * Implement cache-aside pattern for product data
     */
    async getProductWithCache(productId: string): Promise<any> {
        return this.getOrSet('product', productId, async () => {
            return await this.prisma.product.findUnique({
                where: { id: productId },
                include: {
                    seller: {
                        select: { id: true, businessName: true, verificationTier: true }
                    },
                    category: true,
                    subcategory: true,
                    variants: true,
                    media: true
                }
            });
        });
    }

    /**
     * Cache search results with pagination
     */
    async cacheSearchResults(
        query: string,
        filters: any,
        page: number,
        limit: number,
        results: any
    ): Promise<void> {
        const searchKey = this.generateSearchKey(query, filters, page, limit);
        await this.set('search', searchKey, results, 1800); // 30 minutes
    }

    /**
     * Get cached search results
     */
    async getCachedSearchResults(
        query: string,
        filters: any,
        page: number,
        limit: number
    ): Promise<any> {
        const searchKey = this.generateSearchKey(query, filters, page, limit);
        return await this.get('search', searchKey);
    }

    /**
     * Generate search cache key
     */
    private generateSearchKey(query: string, filters: any, page: number, limit: number): string {
        const filterString = JSON.stringify(filters);
        const hash = require('crypto')
            .createHash('md5')
            .update(`${query}:${filterString}:${page}:${limit}`)
            .digest('hex');
        return hash;
    }

    /**
     * Implement write-through caching for critical data
     */
    async updateUserWithCache(userId: string, updateData: any): Promise<any> {
        // Update database first
        const updatedUser = await this.prisma.user.update({
            where: { id: userId },
            data: updateData,
            include: {
                wallet: true,
                subscriptions: {
                    where: { status: 'active' }
                }
            }
        });

        // Update cache
        await this.set('user', userId, updatedUser);

        // Invalidate related caches
        await this.invalidatePattern(`profile:${userId}*`);

        return updatedUser;
    }

    /**
     * Setup event handlers for cache invalidation
     */
    private setupEventHandlers(): void {
        if (!this.redis) return;

        this.redis.on('connect', () => {
            logger.info('Redis cache connected');
        });

        this.redis.on('ready', () => {
            logger.info('Redis cache ready');
        });

        this.redis.on('error', (error) => {
            logger.error('Redis cache error:', error);
            this.stats.errors++;
            // Don't crash the application on Redis errors
        });

        this.redis.on('close', () => {
            logger.warn('Redis cache connection closed');
        });

        this.redis.on('reconnecting', (delay) => {
            logger.warn(`Redis cache reconnecting in ${delay}ms...`);
        });

        this.redis.on('end', () => {
            logger.warn('Redis cache connection ended');
        });

        // Handle connection failures gracefully
        this.redis.on('lazyConnect', () => {
            logger.info('Redis cache lazy connect initiated');
        });
    }

    /**
     * Start collecting cache statistics
     */
    private startStatsCollection(): void {
        setInterval(() => {
            this.updateHitRate();
            logger.info('Cache statistics', this.stats);
        }, 300000); // Every 5 minutes
    }

    /**
     * Update hit rate calculation
     */
    private updateHitRate(): void {
        const total = this.stats.hits + this.stats.misses;
        this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
    }

    /**
     * Get cache statistics
     */
    getStats(): CacheStats {
        return { ...this.stats };
    }

    /**
     * Clear all cache
     */
    async clearAll(): Promise<void> {
        try {
            await this.redis?.flushall();
            logger.info('All cache cleared');
        } catch (error) {
            logger.error('Failed to clear cache:', error);
        }
    }

    /**
     * Advertisement-specific caching methods
     */

    /**
     * Cache ad campaign with budget status
     */
    async cacheAdCampaign(campaignId: string, campaign: any): Promise<void> {
        await this.set('adCampaign', campaignId, campaign);

        // Also cache budget status separately for faster access
        if (campaign.budgetStatus) {
            await this.set('adBudgetStatus', campaignId, campaign.budgetStatus, 60); // 1 minute TTL
        }
    }

    /**
     * Get cached ad campaign
     */
    async getCachedAdCampaign(campaignId: string): Promise<any> {
        return await this.get('adCampaign', campaignId);
    }

    /**
     * Cache ad selection results for frequently served ads
     */
    async cacheAdSelection(
        placementId: string,
        userContext: any,
        selectedAd: any
    ): Promise<void> {
        const selectionKey = this.generateAdSelectionKey(placementId, userContext);
        await this.set('adSelection', selectionKey, selectedAd, 300); // 5 minutes
    }

    /**
     * Get cached ad selection
     */
    async getCachedAdSelection(placementId: string, userContext: any): Promise<any> {
        const selectionKey = this.generateAdSelectionKey(placementId, userContext);
        return await this.get('adSelection', selectionKey);
    }

    /**
     * Cache ad targeting data for user segments
     */
    async cacheAdTargeting(targetingKey: string, targetingData: any): Promise<void> {
        await this.set('adTargeting', targetingKey, targetingData);
    }

    /**
     * Get cached ad targeting data
     */
    async getCachedAdTargeting(targetingKey: string): Promise<any> {
        return await this.get('adTargeting', targetingKey);
    }

    /**
     * Cache ad performance metrics
     */
    async cacheAdPerformance(campaignId: string, metrics: any): Promise<void> {
        await this.set('adPerformance', campaignId, metrics);
    }

    /**
     * Get cached ad performance metrics
     */
    async getCachedAdPerformance(campaignId: string): Promise<any> {
        return await this.get('adPerformance', campaignId);
    }

    /**
     * Cache external ad network responses
     */
    async cacheExternalAd(networkName: string, placementId: string, adData: any): Promise<void> {
        const externalKey = `${networkName}:${placementId}`;
        await this.set('externalAd', externalKey, adData);
    }

    /**
     * Get cached external ad
     */
    async getCachedExternalAd(networkName: string, placementId: string): Promise<any> {
        const externalKey = `${networkName}:${placementId}`;
        return await this.get('externalAd', externalKey);
    }

    /**
     * Cache ad budget status with short TTL for real-time tracking
     */
    async cacheAdBudgetStatus(campaignId: string, budgetStatus: any): Promise<void> {
        await this.set('adBudgetStatus', campaignId, budgetStatus, 60); // 1 minute TTL
    }

    /**
     * Get cached ad budget status
     */
    async getCachedAdBudgetStatus(campaignId: string): Promise<any> {
        return await this.get('adBudgetStatus', campaignId);
    }

    /**
     * Invalidate all ad-related cache for a campaign
     */
    async invalidateAdCampaignCache(campaignId: string): Promise<void> {
        await Promise.all([
            this.delete('adCampaign', campaignId),
            this.delete('adBudgetStatus', campaignId),
            this.delete('adPerformance', campaignId),
            this.invalidatePattern(`ad_selection:*${campaignId}*`),
            this.invalidatePattern(`ad_analytics:${campaignId}*`)
        ]);
    }

    /**
     * Warm up advertisement cache with active campaigns
     */
    async warmAdCache(): Promise<void> {
        logger.info('Starting advertisement cache warming...');

        try {
            // Warm up active campaigns
            await this.warmActiveCampaigns();

            // Warm up ad placements
            await this.warmAdPlacements();

            // Warm up high-performing ads
            await this.warmHighPerformingAds();

            logger.info('Advertisement cache warming completed');
        } catch (error) {
            logger.error('Advertisement cache warming failed:', error);
        }
    }

    /**
     * Warm up active campaigns cache
     */
    private async warmActiveCampaigns(): Promise<void> {
        const activeCampaigns = await this.prisma.adCampaign.findMany({
            where: {
                status: 'active',
                startDate: { lte: new Date() },
                OR: [
                    { endDate: null },
                    { endDate: { gte: new Date() } }
                ]
            },
            include: {
                business: {
                    select: { id: true, businessName: true }
                },
                advertisements: {
                    where: { status: 'active' }
                },
                analytics: {
                    where: {
                        date: {
                            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
                        }
                    }
                }
            }
        });

        for (const campaign of activeCampaigns) {
            await this.cacheAdCampaign(campaign.id, campaign);
        }

        logger.info(`Warmed ${activeCampaigns.length} active ad campaigns`);
    }

    /**
     * Warm up ad placements cache
     */
    private async warmAdPlacements(): Promise<void> {
        const placements = await this.prisma.adPlacement.findMany({
            where: { isActive: true }
        });

        for (const placement of placements) {
            await this.set('adPlacement', placement.id, placement);
        }

        logger.info(`Warmed ${placements.length} ad placements`);
    }

    /**
     * Warm up high-performing ads cache
     */
    private async warmHighPerformingAds(): Promise<void> {
        // Get top performing ads from the last 30 days
        const highPerformingAds = await this.prisma.advertisement.findMany({
            where: {
                status: 'active',
                campaign: {
                    status: 'active'
                }
            },
            include: {
                campaign: true,
                impressionRecords: {
                    where: {
                        viewedAt: {
                            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                        }
                    }
                },
                clickRecords: {
                    where: {
                        clickedAt: {
                            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                        }
                    }
                }
            },
            orderBy: {
                priority: 'desc'
            },
            take: 50
        });

        for (const ad of highPerformingAds) {
            await this.set('advertisement', ad.id, ad);
        }

        logger.info(`Warmed ${highPerformingAds.length} high-performing ads`);
    }

    /**
     * Generate ad selection cache key based on placement and user context
     */
    private generateAdSelectionKey(placementId: string, userContext: any): string {
        const contextHash = require('crypto')
            .createHash('md5')
            .update(JSON.stringify({
                platform: userContext.platform,
                location: userContext.location,
                demographics: userContext.demographics,
                interests: userContext.behavior?.interests?.slice(0, 5) // Limit to top 5 interests
            }))
            .digest('hex');

        return `${placementId}:${contextHash}`;
    }

    /**
     * Preload ads for specific placements and user segments
     */
    async preloadAdsForPlacement(placementId: string, userSegments: any[]): Promise<void> {
        for (const segment of userSegments) {
            try {
                // This would typically call the ad selection service
                // For now, we'll create a placeholder cache entry
                const selectionKey = this.generateAdSelectionKey(placementId, segment);
                await this.set('adSelection', selectionKey, { preloaded: true, timestamp: Date.now() }, 300);
            } catch (error) {
                logger.error(`Failed to preload ads for placement ${placementId}:`, error);
            }
        }
    }

    /**
     * Cache invalidation strategies for real-time updates
     */
    async invalidateAdCacheOnBudgetUpdate(campaignId: string): Promise<void> {
        await Promise.all([
            this.delete('adBudgetStatus', campaignId),
            this.delete('adCampaign', campaignId),
            this.invalidatePattern(`ad_selection:*${campaignId}*`)
        ]);
    }

    async invalidateAdCacheOnCampaignUpdate(campaignId: string): Promise<void> {
        await this.invalidateAdCampaignCache(campaignId);
    }

    async invalidateAdCacheOnPerformanceUpdate(campaignId: string): Promise<void> {
        await Promise.all([
            this.delete('adPerformance', campaignId),
            this.invalidatePattern(`ad_analytics:${campaignId}*`)
        ]);
    }

    /**
     * Health check for cache service with Redis 8 enhanced metrics
     */
    async healthCheck(): Promise<{ status: string; latency: number; memory: any; redis8Features?: any }> {
        const start = Date.now();

        try {
            if (!this.redis) {
                return {
                    status: 'disabled',
                    latency: 0,
                    memory: null
                };
            }

            await this.redis.ping();
            const latency = Date.now() - start;
            const memory = await this.redis.memory('STATS');

            // Redis 8 specific health metrics
            const redis8Features = await this.getRedis8Features();

            return {
                status: 'healthy',
                latency,
                memory,
                redis8Features
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                latency: Date.now() - start,
                memory: null
            };
        }
    }

    /**
     * Get Redis 8 specific features and metrics
     */
    private async getRedis8Features(): Promise<any> {
        try {
            if (!this.redis) return null;

            const info = await this.redis.info();
            const serverInfo = info.split('\r\n').reduce((acc: any, line: string) => {
                if (line.includes(':')) {
                    const [key, value] = line.split(':');
                    acc[key] = value;
                }
                return acc;
            }, {});

            return {
                version: serverInfo.redis_version,
                mode: serverInfo.redis_mode,
                os: serverInfo.os,
                arch_bits: serverInfo.arch_bits,
                multiplexing_api: serverInfo.multiplexing_api,
                gcc_version: serverInfo.gcc_version,
                process_id: serverInfo.process_id,
                tcp_port: serverInfo.tcp_port,
                uptime_in_seconds: serverInfo.uptime_in_seconds,
                connected_clients: serverInfo.connected_clients,
                used_memory_human: serverInfo.used_memory_human,
                used_memory_peak_human: serverInfo.used_memory_peak_human,
                total_system_memory_human: serverInfo.total_system_memory_human,
                maxmemory_human: serverInfo.maxmemory_human,
                maxmemory_policy: serverInfo.maxmemory_policy
            };
        } catch (error) {
            logger.error('Failed to get Redis 8 features:', error);
            return null;
        }
    }

    /**
     * Redis 8 memory optimization - trigger memory cleanup
     */
    async optimizeMemory(): Promise<void> {
        try {
            if (!this.redis) return;

            // Use Redis 8 MEMORY PURGE command for better memory management
            await this.redis.call('MEMORY', 'PURGE');

            // Trigger background save if needed
            const info = await this.redis.info('persistence');
            if (info.includes('rdb_bgsave_in_progress:0')) {
                await this.redis.bgsave();
            }

            logger.info('Redis 8 memory optimization completed');
        } catch (error) {
            logger.error('Redis 8 memory optimization failed:', error);
        }
    }

    /**
     * Redis 8 enhanced pipeline operations for better performance
     */
    async batchOperations(operations: Array<{ type: 'get' | 'set' | 'del', key: string, value?: any, ttl?: number }>): Promise<any[]> {
        try {
            if (!this.redis) return [];

            const pipeline = this.redis.pipeline();

            for (const op of operations) {
                switch (op.type) {
                    case 'get':
                        pipeline.get(op.key);
                        break;
                    case 'set':
                        if (op.ttl) {
                            pipeline.setex(op.key, op.ttl, JSON.stringify(op.value));
                        } else {
                            pipeline.set(op.key, JSON.stringify(op.value));
                        }
                        break;
                    case 'del':
                        pipeline.del(op.key);
                        break;
                }
            }

            const results = await pipeline.exec();
            return results?.map(([err, result]) => err ? null : result) || [];
        } catch (error) {
            logger.error('Redis 8 batch operations failed:', error);
            return [];
        }
    }
}

export const cacheService = new CacheService();