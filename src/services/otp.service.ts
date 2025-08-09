import { createClient } from 'redis';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';

const redisClient = createClient({
  url: config.redis.url,
});

redisClient.on('error', (err) => {
  logger.error('OTP Redis Client Error:', err);
});

// Initialize Redis connection for OTP service
redisClient.connect().catch((err) => {
  logger.error('Failed to connect to Redis for OTP service:', err);
});

export interface OtpData {
  otp: string;
  attempts: number;
  expiresAt: number;
}

export class OtpService {
  private static readonly OTP_EXPIRY_MINUTES = 10;
  private static readonly MAX_ATTEMPTS = 3;
  private static readonly OTP_LENGTH = 6;

  /**
   * Generate a random OTP
   */
  private static generateRandomOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Get Redis key for OTP storage
   */
  private static getOtpKey(identifier: string, type: 'email' | 'phone'): string {
    return `otp:${type}:${identifier}`;
  }

  /**
   * Generate and store OTP
   */
  static async generateOtp(identifier: string, type: 'email' | 'phone'): Promise<string> {
    try {
      const otp = this.generateRandomOtp();
      const expiresAt = Date.now() + (this.OTP_EXPIRY_MINUTES * 60 * 1000);
      
      const otpData: OtpData = {
        otp,
        attempts: 0,
        expiresAt,
      };

      const key = this.getOtpKey(identifier, type);
      
      // Store OTP in Redis with expiration
      await redisClient.setEx(
        key,
        this.OTP_EXPIRY_MINUTES * 60,
        JSON.stringify(otpData)
      );

      logger.info(`OTP generated for ${type}: ${identifier}`);
      
      // In development, log the OTP for testing
      if (config.env === 'development') {
        logger.info(`Generated OTP for ${identifier}: ${otp}`);
      }

      return otp;
    } catch (error) {
      logger.error('Failed to generate OTP:', error);
      throw new Error('Failed to generate OTP');
    }
  }

  /**
   * Verify OTP
   */
  static async verifyOtp(
    identifier: string, 
    type: 'email' | 'phone', 
    providedOtp: string
  ): Promise<boolean> {
    try {
      const key = this.getOtpKey(identifier, type);
      const storedData = await redisClient.get(key);

      if (!storedData) {
        logger.warn(`OTP not found or expired for ${type}: ${identifier}`);
        return false;
      }

      const otpData: OtpData = JSON.parse(storedData);

      // Check if OTP has expired
      if (Date.now() > otpData.expiresAt) {
        await redisClient.del(key);
        logger.warn(`OTP expired for ${type}: ${identifier}`);
        return false;
      }

      // Check if max attempts exceeded
      if (otpData.attempts >= this.MAX_ATTEMPTS) {
        await redisClient.del(key);
        logger.warn(`Max OTP attempts exceeded for ${type}: ${identifier}`);
        return false;
      }

      // Increment attempts
      otpData.attempts += 1;
      await redisClient.setEx(
        key,
        Math.ceil((otpData.expiresAt - Date.now()) / 1000),
        JSON.stringify(otpData)
      );

      // Verify OTP
      if (otpData.otp === providedOtp) {
        // OTP is correct, delete it
        await redisClient.del(key);
        logger.info(`OTP verified successfully for ${type}: ${identifier}`);
        return true;
      } else {
        logger.warn(`Invalid OTP provided for ${type}: ${identifier}`);
        return false;
      }
    } catch (error) {
      logger.error('Failed to verify OTP:', error);
      throw new Error('Failed to verify OTP');
    }
  }

  /**
   * Check if OTP exists and is valid
   */
  static async isOtpValid(identifier: string, type: 'email' | 'phone'): Promise<boolean> {
    try {
      const key = this.getOtpKey(identifier, type);
      const storedData = await redisClient.get(key);

      if (!storedData) {
        return false;
      }

      const otpData: OtpData = JSON.parse(storedData);
      return Date.now() <= otpData.expiresAt && otpData.attempts < this.MAX_ATTEMPTS;
    } catch (error) {
      logger.error('Failed to check OTP validity:', error);
      return false;
    }
  }

  /**
   * Delete OTP (useful for cleanup)
   */
  static async deleteOtp(identifier: string, type: 'email' | 'phone'): Promise<void> {
    try {
      const key = this.getOtpKey(identifier, type);
      await redisClient.del(key);
      logger.info(`OTP deleted for ${type}: ${identifier}`);
    } catch (error) {
      logger.error('Failed to delete OTP:', error);
    }
  }

  /**
   * Get remaining attempts for OTP
   */
  static async getRemainingAttempts(identifier: string, type: 'email' | 'phone'): Promise<number> {
    try {
      const key = this.getOtpKey(identifier, type);
      const storedData = await redisClient.get(key);

      if (!storedData) {
        return 0;
      }

      const otpData: OtpData = JSON.parse(storedData);
      
      if (Date.now() > otpData.expiresAt) {
        return 0;
      }

      return Math.max(0, this.MAX_ATTEMPTS - otpData.attempts);
    } catch (error) {
      logger.error('Failed to get remaining attempts:', error);
      return 0;
    }
  }
}