import * as Minio from 'minio';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';

// Create MinIO client
export const minioClient = new Minio.Client({
  endPoint: config.minio.endpoint,
  port: config.minio.port,
  useSSL: config.minio.useSSL,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey,
});

// MinIO helper functions
export const minioHelper = {
  // Upload file
  async uploadFile(
    bucketName: string,
    objectName: string,
    stream: any,
    size?: number,
    metaData?: Record<string, any>
  ): Promise<string> {
    try {
      await minioClient.putObject(bucketName, objectName, stream, size, metaData);
      
      // Generate public URL
      const publicUrl = config.minio.publicUrl 
        ? `${config.minio.publicUrl}/${bucketName}/${objectName}`
        : `${config.minio.useSSL ? 'https' : 'http'}://${config.minio.endpoint}:${config.minio.port}/${bucketName}/${objectName}`;
      
      logger.info(`File uploaded successfully: ${objectName}`);
      return publicUrl;
    } catch (error) {
      logger.error(`MinIO upload error for ${objectName}:`, error);
      throw error;
    }
  },

  // Download file
  async downloadFile(bucketName: string, objectName: string): Promise<any> {
    try {
      return await minioClient.getObject(bucketName, objectName);
    } catch (error) {
      logger.error(`MinIO download error for ${objectName}:`, error);
      throw error;
    }
  },

  // Delete file
  async deleteFile(bucketName: string, objectName: string): Promise<void> {
    try {
      await minioClient.removeObject(bucketName, objectName);
      logger.info(`File deleted successfully: ${objectName}`);
    } catch (error) {
      logger.error(`MinIO delete error for ${objectName}:`, error);
      throw error;
    }
  },

  // Check if file exists
  async fileExists(bucketName: string, objectName: string): Promise<boolean> {
    try {
      await minioClient.statObject(bucketName, objectName);
      return true;
    } catch (error) {
      return false;
    }
  },

  // Get file info
  async getFileInfo(bucketName: string, objectName: string): Promise<any> {
    try {
      return await minioClient.statObject(bucketName, objectName);
    } catch (error) {
      logger.error(`MinIO stat error for ${objectName}:`, error);
      throw error;
    }
  },

  // List files in bucket
  async listFiles(bucketName: string, prefix?: string): Promise<any[]> {
    try {
      const objects: any[] = [];
      const stream = minioClient.listObjects(bucketName, prefix, true);
      
      return new Promise((resolve, reject) => {
        stream.on('data', (obj) => objects.push(obj));
        stream.on('error', reject);
        stream.on('end', () => resolve(objects));
      });
    } catch (error) {
      logger.error(`MinIO list error for bucket ${bucketName}:`, error);
      throw error;
    }
  },

  // Generate presigned URL for upload
  async generatePresignedUploadUrl(
    bucketName: string,
    objectName: string,
    expiry: number = 3600
  ): Promise<string> {
    try {
      return await minioClient.presignedPutObject(bucketName, objectName, expiry);
    } catch (error) {
      logger.error(`MinIO presigned upload URL error for ${objectName}:`, error);
      throw error;
    }
  },

  // Generate presigned URL for download
  async generatePresignedDownloadUrl(
    bucketName: string,
    objectName: string,
    expiry: number = 3600
  ): Promise<string> {
    try {
      return await minioClient.presignedGetObject(bucketName, objectName, expiry);
    } catch (error) {
      logger.error(`MinIO presigned download URL error for ${objectName}:`, error);
      throw error;
    }
  },

  // Create bucket if not exists
  async ensureBucket(bucketName: string): Promise<void> {
    try {
      const exists = await minioClient.bucketExists(bucketName);
      if (!exists) {
        await minioClient.makeBucket(bucketName, config.minio.region);
        logger.info(`Bucket created: ${bucketName}`);
      }
    } catch (error) {
      logger.error(`MinIO bucket creation error for ${bucketName}:`, error);
      throw error;
    }
  },

  // Set bucket policy
  async setBucketPolicy(bucketName: string, policy: any): Promise<void> {
    try {
      await minioClient.setBucketPolicy(bucketName, JSON.stringify(policy));
      logger.info(`Bucket policy set for: ${bucketName}`);
    } catch (error) {
      logger.error(`MinIO bucket policy error for ${bucketName}:`, error);
      throw error;
    }
  },

  // Get public read policy
  getPublicReadPolicy(bucketName: string): any {
    return {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${bucketName}/*`],
        },
      ],
    };
  },
};

// Initialize MinIO buckets
export const initializeMinIO = async (): Promise<void> => {
  try {
    // Ensure main bucket exists
    await minioHelper.ensureBucket(config.minio.bucketName);
    
    // Set public read policy for uploads bucket
    const publicPolicy = minioHelper.getPublicReadPolicy(config.minio.bucketName);
    await minioHelper.setBucketPolicy(config.minio.bucketName, publicPolicy);
    
    logger.info('✅ MinIO initialized successfully');
  } catch (error) {
    logger.error('❌ MinIO initialization failed:', error);
    throw error;
  }
};

// MinIO health check
export const checkMinIOHealth = async (): Promise<boolean> => {
  try {
    await minioClient.listBuckets();
    return true;
  } catch (error) {
    logger.error('MinIO health check failed:', error);
    return false;
  }
};

export default minioClient;