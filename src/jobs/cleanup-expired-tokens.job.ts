import { cacheHelper } from '@/config/redis';
import { logger } from '@/utils/logger';

export const cleanupExpiredTokensJob = async (): Promise<void> => {
  try {
    // Get all blacklisted token keys
    const blacklistKeys = await cacheHelper.keys('blacklist:*');
    
    if (blacklistKeys.length === 0) {
      logger.info('No blacklisted tokens to cleanup');
      return;
    }

    let cleanedCount = 0;
    
    // Check each blacklisted token and remove if expired
    for (const key of blacklistKeys) {
      try {
        const exists = await cacheHelper.exists(key);
        if (!exists) {
          cleanedCount++;
        }
      } catch (error) {
        logger.error(`Error checking blacklisted token ${key}:`, error);
      }
    }

    logger.info(`Cleaned up ${cleanedCount} expired blacklisted tokens`);
  } catch (error) {
    logger.error('Error in cleanup expired tokens job:', error);
    throw error;
  }
};