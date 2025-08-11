/**
 * Advertisement Database Optimization Service
 * Optimizes database queries and manages indexing for advertisement system
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';

interface QueryPerformanceMetrics {
    queryType: string;
    executionTime: number;
    rowsAffected: number;
    indexesUsed: string[];
    timestamp: Date;
}

interface DatabaseOptimizationConfig {
    enableQueryLogging: boolean;
    slowQueryThreshold: number; // milliseconds
    connectionPoolSize: number;
    queryTimeout: number;
    enablePreparedStatements: boolean;
}

class AdDatabaseOptimizerService {
    private prisma: PrismaClient;
    private performanceMetrics: QueryPerformanceMetrics[] = [];
    private config: DatabaseOptimizationConfig;

    constructor() {
        this.config = {
            enableQueryLogging: process.env['NODE_ENV'] !== 'production',
            slowQueryThreshold: 1000, // 1 second
            connectionPoolSize: 20,
            queryTimeout: 30000, // 30 seconds
            enablePreparedStatements: true
        };

        this.prisma = new PrismaClient({
            log: this.config.enableQueryLogging ? [
                { emit: 'event', level: 'query' },
                { emit: 'event', level: 'error' },
                { emit: 'event', level: 'warn' }
            ] : [],
            datasources: {
                db: {
                    url: process.env['DATABASE_URL'] || 'postgresql://localhost:5432/vikareta'
                }
            }
        });

        this.setupQueryLogging();
    }

    /**
     * Optimized query for ad selection with proper indexing
     */
    async getOptimizedAdsForPlacement(
        placementId: string,
        _userContext: any,
        limit: number = 10
    ): Promise<any[]> {
        const startTime = Date.now();

        try {
            // Optimized query using indexes on status, priority, and budget
            const ads = await this.prisma.$queryRaw`
                SELECT 
                    a.id,
                    a.title,
                    a.description,
                    a.content,
                    a.priority,
                    a.call_to_action,
                    a.destination_url,
                    c.id as campaign_id,
                    c.bid_amount,
                    c.budget,
                    c.spent_amount,
                    c.targeting_config,
                    u.business_name
                FROM advertisements a
                INNER JOIN ad_campaigns c ON a.campaign_id = c.id
                INNER JOIN users u ON c.business_id = u.id
                WHERE 
                    a.status = 'active'
                    AND c.status = 'active'
                    AND c.start_date <= NOW()
                    AND (c.end_date IS NULL OR c.end_date >= NOW())
                    AND c.spent_amount < c.budget
                    AND EXISTS (
                        SELECT 1 FROM ad_placements ap 
                        WHERE ap.id = ${placementId} 
                        AND ap.is_active = true
                    )
                ORDER BY 
                    a.priority DESC,
                    c.bid_amount DESC,
                    RANDOM()
                LIMIT ${limit}
            `;

            const executionTime = Date.now() - startTime;
            this.recordQueryPerformance('getOptimizedAdsForPlacement', executionTime, (ads as any[]).length);

            return ads as any[];
        } catch (error) {
            logger.error('Failed to get optimized ads for placement:', error);
            throw error;
        }
    }

    /**
     * Optimized analytics query with proper aggregation
     */
    async getOptimizedCampaignAnalytics(
        campaignId: string,
        startDate: Date,
        endDate: Date
    ): Promise<any> {
        const startTime = Date.now();

        try {
            // Use materialized view or optimized aggregation query
            const analytics = await this.prisma.$queryRaw`
                SELECT 
                    DATE(ai.created_at) as date,
                    COUNT(DISTINCT ai.id) as impressions,
                    COUNT(DISTINCT ac.id) as clicks,
                    SUM(ai.cost) as impression_cost,
                    SUM(ac.cost) as click_cost,
                    COALESCE(COUNT(DISTINCT ac.id)::float / NULLIF(COUNT(DISTINCT ai.id), 0), 0) as ctr,
                    COALESCE(SUM(ac.cost) / NULLIF(COUNT(DISTINCT ac.id), 0), 0) as avg_cpc
                FROM ad_impressions ai
                LEFT JOIN ad_clicks ac ON ai.advertisement_id = ac.advertisement_id 
                    AND DATE(ai.created_at) = DATE(ac.created_at)
                INNER JOIN advertisements a ON ai.advertisement_id = a.id
                WHERE 
                    a.campaign_id = ${campaignId}
                    AND ai.created_at >= ${startDate}
                    AND ai.created_at <= ${endDate}
                GROUP BY DATE(ai.created_at)
                ORDER BY date DESC
            `;

            const executionTime = Date.now() - startTime;
            this.recordQueryPerformance('getOptimizedCampaignAnalytics', executionTime, (analytics as any[]).length);

            return analytics;
        } catch (error) {
            logger.error('Failed to get optimized campaign analytics:', error);
            throw error;
        }
    }

    /**
     * Optimized budget status query
     */
    async getOptimizedBudgetStatus(campaignId: string): Promise<any> {
        const startTime = Date.now();

        try {
            // Single optimized query to get budget status
            const budgetStatus = await this.prisma.$queryRaw`
                SELECT 
                    c.budget as total_budget,
                    c.spent_amount,
                    c.daily_budget,
                    (c.budget - c.spent_amount) as remaining_budget,
                    COALESCE(daily_spend.daily_spent, 0) as daily_spent,
                    CASE 
                        WHEN c.daily_budget IS NOT NULL 
                        THEN (c.daily_budget - COALESCE(daily_spend.daily_spent, 0))
                        ELSE NULL 
                    END as daily_remaining,
                    (c.spent_amount >= c.budget) as is_exhausted
                FROM ad_campaigns c
                LEFT JOIN (
                    SELECT 
                        a.campaign_id,
                        SUM(ai.cost + COALESCE(ac.cost, 0)) as daily_spent
                    FROM advertisements a
                    LEFT JOIN ad_impressions ai ON a.id = ai.advertisement_id 
                        AND DATE(ai.created_at) = CURRENT_DATE
                    LEFT JOIN ad_clicks ac ON a.id = ac.advertisement_id 
                        AND DATE(ac.created_at) = CURRENT_DATE
                    WHERE a.campaign_id = ${campaignId}
                    GROUP BY a.campaign_id
                ) daily_spend ON c.id = daily_spend.campaign_id
                WHERE c.id = ${campaignId}
            `;

            const executionTime = Date.now() - startTime;
            this.recordQueryPerformance('getOptimizedBudgetStatus', executionTime, 1);

            return (budgetStatus as any[])[0] || null;
        } catch (error) {
            logger.error('Failed to get optimized budget status:', error);
            throw error;
        }
    }

    /**
     * Optimized user targeting query
     */
    async getOptimizedTargetedAds(
        _placementId: string,
        userContext: any,
        limit: number = 5
    ): Promise<any[]> {
        const startTime = Date.now();

        try {
            const { location, demographics, interests } = userContext;

            // Use GIN indexes for JSON targeting queries
            const targetedAds = await this.prisma.$queryRaw`
                SELECT 
                    a.id,
                    a.title,
                    a.content,
                    a.priority,
                    c.bid_amount,
                    c.targeting_config,
                    -- Calculate targeting match score
                    (
                        CASE WHEN ${location?.country} = ANY(
                            SELECT jsonb_array_elements_text(c.targeting_config->'location'->'countries')
                        ) THEN 0.3 ELSE 0 END +
                        CASE WHEN ${demographics?.gender} = c.targeting_config->>'demographics'->>'gender' 
                             OR c.targeting_config->>'demographics'->>'gender' = 'all'
                        THEN 0.2 ELSE 0 END +
                        CASE WHEN c.targeting_config->'demographics'->'interests' ?| ${interests || []}
                        THEN 0.5 ELSE 0 END
                    ) as targeting_score
                FROM advertisements a
                INNER JOIN ad_campaigns c ON a.campaign_id = c.id
                WHERE 
                    a.status = 'active'
                    AND c.status = 'active'
                    AND c.start_date <= NOW()
                    AND (c.end_date IS NULL OR c.end_date >= NOW())
                    AND c.spent_amount < c.budget
                    -- Use GIN index for JSON containment
                    AND (
                        c.targeting_config->'location'->'countries' ? ${location?.country}
                        OR c.targeting_config->'demographics'->>'gender' IN ('all', ${demographics?.gender})
                        OR c.targeting_config->'demographics'->'interests' ?| ${interests || []}
                    )
                ORDER BY 
                    targeting_score DESC,
                    a.priority DESC,
                    c.bid_amount DESC
                LIMIT ${limit}
            `;

            const executionTime = Date.now() - startTime;
            this.recordQueryPerformance('getOptimizedTargetedAds', executionTime, (targetedAds as any[]).length);

            return targetedAds as any[];
        } catch (error) {
            logger.error('Failed to get optimized targeted ads:', error);
            throw error;
        }
    }

    /**
     * Batch insert optimized impressions
     */
    async batchInsertImpressions(impressions: any[]): Promise<void> {
        const startTime = Date.now();

        try {
            // Use batch insert for better performance
            await this.prisma.$transaction(async (tx) => {
                // Insert in batches of 1000
                const batchSize = 1000;
                for (let i = 0; i < impressions.length; i += batchSize) {
                    const batch = impressions.slice(i, i + batchSize);
                    
                    await tx.impressionRecord.createMany({
                        data: batch,
                        skipDuplicates: true
                    });
                }
            });

            const executionTime = Date.now() - startTime;
            this.recordQueryPerformance('batchInsertImpressions', executionTime, impressions.length);

            logger.info(`Batch inserted ${impressions.length} impressions in ${executionTime}ms`);
        } catch (error) {
            logger.error('Failed to batch insert impressions:', error);
            throw error;
        }
    }

    /**
     * Optimized campaign performance aggregation
     */
    async aggregateCampaignPerformance(campaignIds: string[]): Promise<any[]> {
        const startTime = Date.now();

        try {
            // Use window functions for efficient aggregation
            const performance = await this.prisma.$queryRaw`
                WITH campaign_metrics AS (
                    SELECT 
                        c.id as campaign_id,
                        c.name,
                        c.budget,
                        c.spent_amount,
                        COUNT(DISTINCT ai.id) as total_impressions,
                        COUNT(DISTINCT ac.id) as total_clicks,
                        SUM(ai.cost + COALESCE(ac.cost, 0)) as total_cost,
                        AVG(ai.cost) as avg_impression_cost,
                        AVG(ac.cost) as avg_click_cost
                    FROM ad_campaigns c
                    LEFT JOIN advertisements a ON c.id = a.campaign_id
                    LEFT JOIN ad_impressions ai ON a.id = ai.advertisement_id
                    LEFT JOIN ad_clicks ac ON a.id = ac.advertisement_id
                    WHERE c.id = ANY(${campaignIds})
                    GROUP BY c.id, c.name, c.budget, c.spent_amount
                )
                SELECT 
                    *,
                    CASE 
                        WHEN total_impressions > 0 
                        THEN (total_clicks::float / total_impressions * 100)
                        ELSE 0 
                    END as ctr,
                    CASE 
                        WHEN total_clicks > 0 
                        THEN (total_cost / total_clicks)
                        ELSE 0 
                    END as cpc,
                    CASE 
                        WHEN total_impressions > 0 
                        THEN (total_cost / total_impressions * 1000)
                        ELSE 0 
                    END as cpm
                FROM campaign_metrics
                ORDER BY total_impressions DESC
            `;

            const executionTime = Date.now() - startTime;
            this.recordQueryPerformance('aggregateCampaignPerformance', executionTime, (performance as any[]).length);

            return performance as any[];
        } catch (error) {
            logger.error('Failed to aggregate campaign performance:', error);
            throw error;
        }
    }

    /**
     * Create database indexes for advertisement system
     */
    async createOptimizedIndexes(): Promise<void> {
        logger.info('Creating optimized database indexes for advertisement system...');

        try {
            // Indexes for ad selection queries
            await this.executeIndexCreation([
                // Ad campaigns indexes
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ad_campaigns_status_dates ON ad_campaigns(status, start_date, end_date) WHERE status = \'active\'',
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ad_campaigns_budget_status ON ad_campaigns(spent_amount, budget, status) WHERE status = \'active\'',
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ad_campaigns_business_status ON ad_campaigns(business_id, status)',
                
                // Advertisements indexes
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_advertisements_campaign_status_priority ON advertisements(campaign_id, status, priority DESC) WHERE status = \'active\'',
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_advertisements_status_priority ON advertisements(status, priority DESC) WHERE status = \'active\'',
                
                // Ad impressions indexes for analytics
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ad_impressions_ad_date ON ad_impressions(advertisement_id, created_at DESC)',
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ad_impressions_date_cost ON ad_impressions(created_at, cost)',
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ad_impressions_session_date ON ad_impressions(session_id, created_at)',
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ad_impressions_user_date ON ad_impressions(user_id, created_at) WHERE user_id IS NOT NULL',
                
                // Ad clicks indexes for analytics
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ad_clicks_ad_date ON ad_clicks(advertisement_id, created_at DESC)',
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ad_clicks_date_cost ON ad_clicks(created_at, cost)',
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ad_clicks_session_date ON ad_clicks(session_id, created_at)',
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ad_clicks_user_date ON ad_clicks(user_id, created_at) WHERE user_id IS NOT NULL',
                
                // Ad placements indexes
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ad_placements_platform_location ON ad_placements(platform, location, is_active) WHERE is_active = true',
                
                // JSON targeting indexes (GIN indexes for JSONB)
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ad_campaigns_targeting_location ON ad_campaigns USING GIN ((targeting_config->\'location\'))',
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ad_campaigns_targeting_demographics ON ad_campaigns USING GIN ((targeting_config->\'demographics\'))',
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ad_campaigns_targeting_behavior ON ad_campaigns USING GIN ((targeting_config->\'behavior\'))',
                
                // Composite indexes for common query patterns
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaigns_active_budget_bid ON ad_campaigns(status, spent_amount, budget, bid_amount DESC) WHERE status = \'active\'',
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ads_campaign_active_priority ON advertisements(campaign_id, status, priority DESC) WHERE status = \'active\'',
                
                // Analytics aggregation indexes
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ad_analytics_campaign_date ON ad_analytics(campaign_id, date DESC)',
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ad_analytics_date_metrics ON ad_analytics(date, impressions, clicks, spend)',
                
                // Approval workflow indexes
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ad_approvals_status_created ON ad_approvals(status, created_at DESC)',
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ad_approvals_campaign_status ON ad_approvals(campaign_id, status)'
            ]);

            logger.info('Successfully created optimized database indexes');
        } catch (error) {
            logger.error('Failed to create optimized indexes:', error);
            throw error;
        }
    }

    /**
     * Execute index creation with error handling
     */
    private async executeIndexCreation(indexQueries: string[]): Promise<void> {
        for (const query of indexQueries) {
            try {
                await this.prisma.$executeRawUnsafe(query);
                logger.debug(`Created index: ${query.split(' ')[5]}`);
            } catch (error: any) {
                // Ignore "already exists" errors
                if (!error.message.includes('already exists')) {
                    logger.warn(`Failed to create index: ${error.message}`);
                }
            }
        }
    }

    /**
     * Analyze query performance and suggest optimizations
     */
    async analyzeQueryPerformance(): Promise<any> {
        const analysis = {
            slowQueries: this.performanceMetrics.filter(m => m.executionTime > this.config.slowQueryThreshold),
            averageExecutionTimes: this.getAverageExecutionTimes(),
            queryFrequency: this.getQueryFrequency(),
            recommendations: this.generateOptimizationRecommendations()
        };

        logger.info('Query Performance Analysis:', analysis);
        return analysis;
    }

    /**
     * Setup connection pooling optimization
     */
    async optimizeConnectionPool(): Promise<void> {
        logger.info('Optimizing database connection pool...');

        try {
            // Configure connection pool settings
            await this.prisma.$executeRaw`
                SET max_connections = 200;
                SET shared_buffers = '256MB';
                SET effective_cache_size = '1GB';
                SET maintenance_work_mem = '64MB';
                SET checkpoint_completion_target = 0.9;
                SET wal_buffers = '16MB';
                SET default_statistics_target = 100;
                SET random_page_cost = 1.1;
                SET effective_io_concurrency = 200;
            `;

            logger.info('Database connection pool optimized');
        } catch (error) {
            logger.error('Failed to optimize connection pool:', error);
        }
    }

    /**
     * Record query performance metrics
     */
    private recordQueryPerformance(queryType: string, executionTime: number, rowsAffected: number): void {
        this.performanceMetrics.push({
            queryType,
            executionTime,
            rowsAffected,
            indexesUsed: [], // Would be populated from EXPLAIN ANALYZE
            timestamp: new Date()
        });

        // Keep only last 1000 metrics
        if (this.performanceMetrics.length > 1000) {
            this.performanceMetrics = this.performanceMetrics.slice(-1000);
        }

        // Log slow queries
        if (executionTime > this.config.slowQueryThreshold) {
            logger.warn(`Slow query detected: ${queryType} took ${executionTime}ms`);
        }
    }

    /**
     * Setup query logging for performance monitoring
     */
    private setupQueryLogging(): void {
        if (!this.config.enableQueryLogging || process.env['NODE_ENV'] === 'test') return;

        try {
            (this.prisma as any).$on('query', (e: any) => {
                if (e.duration > this.config.slowQueryThreshold) {
                    logger.warn('Slow Query:', {
                        query: e.query,
                        duration: e.duration,
                        params: e.params
                    });
                }
            });

            (this.prisma as any).$on('error', (e: any) => {
                logger.error('Database Error:', e);
            });
        } catch (error) {
            // Ignore setup errors in test environment
            logger.debug('Query logging setup skipped:', error);
        }
    }

    /**
     * Get average execution times by query type
     */
    private getAverageExecutionTimes(): Record<string, number> {
        const averages: Record<string, number> = {};
        const grouped = this.groupMetricsByQueryType();

        for (const [queryType, metrics] of Object.entries(grouped)) {
            const totalTime = metrics.reduce((sum, m) => sum + m.executionTime, 0);
            averages[queryType] = totalTime / metrics.length;
        }

        return averages;
    }

    /**
     * Get query frequency statistics
     */
    private getQueryFrequency(): Record<string, number> {
        const frequency: Record<string, number> = {};
        
        for (const metric of this.performanceMetrics) {
            frequency[metric.queryType] = (frequency[metric.queryType] || 0) + 1;
        }

        return frequency;
    }

    /**
     * Group metrics by query type
     */
    private groupMetricsByQueryType(): Record<string, QueryPerformanceMetrics[]> {
        const grouped: Record<string, QueryPerformanceMetrics[]> = {};
        
        for (const metric of this.performanceMetrics) {
            if (!grouped[metric.queryType]) {
                grouped[metric.queryType] = [];
            }
            grouped[metric.queryType]!.push(metric);
        }

        return grouped;
    }

    /**
     * Generate optimization recommendations
     */
    private generateOptimizationRecommendations(): string[] {
        const recommendations: string[] = [];
        const averages = this.getAverageExecutionTimes();
        const frequency = this.getQueryFrequency();

        for (const [queryType, avgTime] of Object.entries(averages)) {
            if (avgTime > this.config.slowQueryThreshold) {
                recommendations.push(`Consider optimizing ${queryType} queries (avg: ${avgTime.toFixed(2)}ms)`);
            }

            if (frequency[queryType]! > 100) {
                recommendations.push(`Consider caching results for ${queryType} (${frequency[queryType]} calls)`);
            }
        }

        return recommendations;
    }

    /**
     * Get performance metrics
     */
    getPerformanceMetrics(): QueryPerformanceMetrics[] {
        return [...this.performanceMetrics];
    }

    /**
     * Clear performance metrics
     */
    clearPerformanceMetrics(): void {
        this.performanceMetrics = [];
    }

    /**
     * Health check for database optimization
     */
    async healthCheck(): Promise<any> {
        try {
            const startTime = Date.now();
            await this.prisma.$queryRaw`SELECT 1`;
            const connectionTime = Date.now() - startTime;

            return {
                status: 'healthy',
                connectionTime,
                activeConnections: await this.getActiveConnections(),
                slowQueries: this.performanceMetrics.filter(m => m.executionTime > this.config.slowQueryThreshold).length,
                totalQueries: this.performanceMetrics.length
            };
        } catch (error: any) {
            return {
                status: 'unhealthy',
                error: error.message
            };
        }
    }

    /**
     * Get active database connections
     */
    private async getActiveConnections(): Promise<number> {
        try {
            const result = await this.prisma.$queryRaw`
                SELECT count(*) as active_connections 
                FROM pg_stat_activity 
                WHERE state = 'active'
            ` as any[];
            
            return parseInt(result[0]?.active_connections || '0');
        } catch (error) {
            logger.error('Failed to get active connections:', error);
            return 0;
        }
    }
}

export const adDatabaseOptimizerService = new AdDatabaseOptimizerService();