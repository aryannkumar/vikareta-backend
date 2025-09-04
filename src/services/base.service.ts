import { PrismaClient } from '@prisma/client';
import { prisma } from '@/config/database';
import { redisClient, cacheHelper } from '../config/redis';
import { logger } from '@/utils/logger';
import { NotFoundError, ValidationError } from '@/middleware/error-handler';

export interface PaginationOptions {
  page: number;
  limit: number;
  skip: number;
}

export interface SortOptions {
  field: string;
  order: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export abstract class BaseService {
  protected prisma: PrismaClient;
  protected cache: typeof cacheHelper = cacheHelper;
  protected logger = logger;

  constructor() {
    this.prisma = prisma;
  }

  /**
   * Create a paginated result
   */
  protected createPaginatedResult<T>(
    data: T[],
    total: number,
    pagination: PaginationOptions
  ): PaginatedResult<T> {
    const totalPages = Math.ceil(total / pagination.limit);
    
    return {
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages,
        hasNext: pagination.page < totalPages,
        hasPrev: pagination.page > 1,
      },
    };
  }

  /**
   * Build Prisma orderBy from sort options
   */
  protected buildOrderBy(sort: SortOptions): Record<string, 'asc' | 'desc'> {
    return { [sort.field]: sort.order };
  }

  /**
   * Build cache key
   */
  protected buildCacheKey(prefix: string, ...parts: (string | number)[]): string {
    return `${prefix}:${parts.join(':')}`;
  }

  /**
   * Get from cache with fallback to database
   */
  protected async getWithCache<T>(
    cacheKey: string,
    fallback: () => Promise<T>,
    ttl: number = 3600
  ): Promise<T> {
    try {
      // Try to get from cache first
      const cached = await this.cache.get<T>(cacheKey);
      if (cached !== null) {
        return cached;
      }

      // Fallback to database
      const result = await fallback();
      
      // Cache the result
      await this.cache.set(cacheKey, result, ttl);
      
      return result;
    } catch (error) {
      this.logger.error(`Cache operation failed for key ${cacheKey}:`, error);
      // Return database result even if caching fails
      return await fallback();
    }
  }

  /**
   * Invalidate cache by pattern
   */
  protected async invalidateCache(pattern: string): Promise<void> {
    try {
      const keys = await this.cache.keys(pattern);
      if (keys.length > 0) {
        await Promise.all(keys.map(key => this.cache.del(key)));
      }
    } catch (error) {
      this.logger.error(`Cache invalidation failed for pattern ${pattern}:`, error);
    }
  }

  /**
   * Validate UUID format
   */
  protected validateUUID(id: string, fieldName: string = 'id'): void {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new ValidationError(`Invalid ${fieldName} format`);
    }
  }

  /**
   * Check if record exists
   */
  protected async checkRecordExists(
    model: any,
    id: string,
    errorMessage?: string
  ): Promise<void> {
    const record = await model.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundError(errorMessage || 'Record not found');
    }
  }

  /**
   * Sanitize data for logging (remove sensitive fields)
   */
  protected sanitizeForLog(data: any): any {
    const sensitiveFields = ['password', 'passwordHash', 'token', 'secret', 'key'];
    
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const sanitized = { ...data };
    
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Execute database transaction
   */
  protected async executeTransaction<T>(
    callback: (tx: PrismaClient) => Promise<T>
  ): Promise<T> {
    return await this.prisma.$transaction(callback);
  }

  /**
   * Build search conditions for text fields
   */
  protected buildTextSearch(query: string, fields: string[]): any {
    if (!query || !fields.length) {
      return {};
    }

    const searchTerms = query.split(' ').filter(term => term.length > 0);
    
    return {
      OR: fields.flatMap(field => 
        searchTerms.map(term => ({
          [field]: {
            contains: term,
            mode: 'insensitive'
          }
        }))
      )
    };
  }

  /**
   * Build date range filter
   */
  protected buildDateRangeFilter(
    field: string,
    startDate?: Date,
    endDate?: Date
  ): any {
    const filter: any = {};

    if (startDate || endDate) {
      filter[field] = {};
      
      if (startDate) {
        filter[field].gte = startDate;
      }
      
      if (endDate) {
        filter[field].lte = endDate;
      }
    }

    return filter;
  }

  /**
   * Build numeric range filter
   */
  protected buildNumericRangeFilter(
    field: string,
    min?: number,
    max?: number
  ): any {
    const filter: any = {};

    if (min !== undefined || max !== undefined) {
      filter[field] = {};
      
      if (min !== undefined) {
        filter[field].gte = min;
      }
      
      if (max !== undefined) {
        filter[field].lte = max;
      }
    }

    return filter;
  }

  /**
   * Log service operation
   */
  protected logOperation(
    operation: string,
    data?: any,
    userId?: string,
    duration?: number
  ): void {
    this.logger.info(`Service operation: ${operation}`, {
      operation,
      userId,
      duration,
      data: this.sanitizeForLog(data),
    });
  }

  /**
   * Handle service error
   */
  protected handleError(error: any, operation: string, context?: any): never {
    this.logger.error(`Service error in ${operation}:`, {
      error: error.message,
      stack: error.stack,
      operation,
      context: this.sanitizeForLog(context),
    });
    
    throw error;
  }
}