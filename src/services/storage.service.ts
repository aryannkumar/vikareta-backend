import { Client as MinioClient } from 'minio';
import multer from 'multer';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/utils/logger';
import { config } from '@/config/environment';

export interface StorageUploadResult {
  url: string;
  key: string;
  size: number;
  mimeType: string;
  width?: number;
  height?: number;
}

export interface StorageProcessingOptions {
  resize?: {
    width?: number;
    height?: number;
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  };
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

export interface StorageProvider {
  upload(buffer: Buffer, key: string, mimeType: string, options?: any): Promise<{ url: string; key: string }>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
  fileExists(key: string): Promise<boolean>;
  getFileMetadata(key: string): Promise<{ size: number; lastModified: Date; contentType: string }>;
}



class MinIOStorageProvider implements StorageProvider {
  private client: MinioClient;
  private buckets: Map<string, string> = new Map();

  constructor() {
    // Use load balancer endpoint in production, direct endpoint in development
    const endpoint = config.env === 'production'
      ? 'storage.vikareta.com'
      : (config.minio.endpoint || 'localhost');

    const port = config.env === 'production'
      ? 443
      : (config.minio.port || 9000);

    const useSSL = config.env === 'production'
      ? true
      : (config.minio.useSSL || false);

    this.client = new MinioClient({
      endPoint: endpoint,
      port: port,
      useSSL: useSSL,
      accessKey: config.minio.accessKey || '',
      secretKey: config.minio.secretKey || '',
      region: config.minio.region,
    });

    // Initialize bucket mappings
    this.buckets.set('uploads', `${config.minio.bucketPrefix}-uploads`);
    this.buckets.set('media', `${config.minio.bucketPrefix}-media`);
    this.buckets.set('documents', `${config.minio.bucketPrefix}-documents`);
    this.buckets.set('temp', `${config.minio.bucketPrefix}-temp`);
    this.buckets.set('backups', `${config.minio.bucketPrefix}-backups`);
    this.buckets.set('logs', `${config.minio.bucketPrefix}-logs`);
  }

  private getBucketName(key: string): string {
    const folder = key.split('/')[0];
    return this.buckets.get(folder) || this.buckets.get('uploads')!;
  }

  private getObjectName(key: string): string {
    const parts = key.split('/');
    return parts.length > 1 ? parts.slice(1).join('/') : key;
  }

  async upload(buffer: Buffer, key: string, mimeType: string, options: any = {}): Promise<{ url: string; key: string }> {
    const bucketName = this.getBucketName(key);
    const objectName = this.getObjectName(key);

    // Ensure bucket exists
    const bucketExists = await this.client.bucketExists(bucketName);
    if (!bucketExists) {
      await this.client.makeBucket(bucketName, config.minio.region);
      logger.info(`Created MinIO bucket: ${bucketName}`);
    }

    const metadata = {
      'Content-Type': mimeType,
      'Cache-Control': 'max-age=31536000',
      ...options.metadata,
    };

    await this.client.putObject(bucketName, objectName, buffer, buffer.length, metadata);

    // Generate public URL using CDN or direct MinIO URL
    let baseUrl: string;

    if (config.storage.cdnUrl) {
      // Use CDN URL for production
      baseUrl = config.storage.cdnUrl;
    } else if (config.env === 'production') {
      // Use HTTPS storage domain in production
      baseUrl = 'https://storage.vikareta.com';
    } else {
      // Use direct MinIO endpoint for development
      baseUrl = `${config.minio.useSSL ? 'https' : 'http'}://${config.minio.endpoint}:${config.minio.port}`;
    }

    const url = `${baseUrl}/${bucketName}/${objectName}`;

    return { url, key };
  }

  async delete(key: string): Promise<void> {
    const bucketName = this.getBucketName(key);
    const objectName = this.getObjectName(key);

    await this.client.removeObject(bucketName, objectName);
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const bucketName = this.getBucketName(key);
    const objectName = this.getObjectName(key);

    return await this.client.presignedGetObject(bucketName, objectName, expiresIn);
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      const bucketName = this.getBucketName(key);
      const objectName = this.getObjectName(key);

      await this.client.statObject(bucketName, objectName);
      return true;
    } catch (error) {
      return false;
    }
  }

  async getFileMetadata(key: string): Promise<{ size: number; lastModified: Date; contentType: string }> {
    const bucketName = this.getBucketName(key);
    const objectName = this.getObjectName(key);

    const stat = await this.client.statObject(bucketName, objectName);

    return {
      size: stat.size,
      lastModified: stat.lastModified,
      contentType: stat.metaData['content-type'] || 'application/octet-stream',
    };
  }

  // MinIO specific methods
  async createBucket(bucketName: string, region?: string): Promise<void> {
    const exists = await this.client.bucketExists(bucketName);
    if (!exists) {
      await this.client.makeBucket(bucketName, region || config.minio.region);
      logger.info(`Created MinIO bucket: ${bucketName}`);
    }
  }

  async initializeBuckets(): Promise<void> {
    logger.info('Initializing MinIO buckets...');

    const buckets = [
      'vikareta-uploads',
      'vikareta-media',
      'vikareta-documents',
      'vikareta-temp',
      'vikareta-backups',
      'vikareta-logs'
    ];

    for (const bucket of buckets) {
      try {
        await this.createBucket(bucket);

        // Enable versioning for critical buckets
        if (['vikareta-uploads', 'vikareta-media', 'vikareta-documents'].includes(bucket)) {
          // Note: MinIO client doesn't have direct versioning API, 
          // this would be handled by the initialization script
          logger.info(`Bucket ${bucket} should have versioning enabled`);
        }

        logger.info(`✓ Bucket ${bucket} initialized successfully`);
      } catch (error) {
        logger.error(`Failed to initialize bucket ${bucket}:`, error);
        throw error;
      }
    }

    logger.info('✅ All MinIO buckets initialized successfully');
  }

  async healthCheck(): Promise<{ status: string; buckets: string[]; error?: string }> {
    try {
      const buckets = await this.listBuckets();
      return {
        status: 'healthy',
        buckets: buckets
      };
    } catch (error) {
      logger.error('MinIO health check failed:', error);
      return {
        status: 'unhealthy',
        buckets: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async setBucketPolicy(bucketName: string, policy: any): Promise<void> {
    await this.client.setBucketPolicy(bucketName, JSON.stringify(policy));
  }

  async getBucketPolicy(bucketName: string): Promise<any> {
    const policy = await this.client.getBucketPolicy(bucketName);
    return JSON.parse(policy);
  }

  async listBuckets(): Promise<string[]> {
    const buckets = await this.client.listBuckets();
    return buckets.map(bucket => bucket.name);
  }

  async listObjects(bucketName: string, prefix?: string): Promise<any[]> {
    const objects: any[] = [];
    const stream = this.client.listObjects(bucketName, prefix, true);

    return new Promise((resolve, reject) => {
      stream.on('data', (obj) => objects.push(obj));
      stream.on('error', reject);
      stream.on('end', () => resolve(objects));
    });
  }
}

export class StorageService {
  private provider: StorageProvider;

  private static readonly ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif'
  ];

  private static readonly ALLOWED_VIDEO_TYPES = [
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/x-msvideo'
  ];

  private static readonly ALLOWED_DOCUMENT_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];

  private static readonly MAX_FILE_SIZE = {
    image: 10 * 1024 * 1024, // 10MB
    video: 100 * 1024 * 1024, // 100MB
    document: 25 * 1024 * 1024, // 25MB
  };

  constructor() {
    this.provider = new MinIOStorageProvider();
    logger.info('Initialized MinIO storage provider');
  }

  /**
   * Configure multer for file upload
   */
  static getMulterConfig() {
    return multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: Math.max(...Object.values(this.MAX_FILE_SIZE)),
      },
      fileFilter: (_, file, cb) => {
        const isValidType = [
          ...this.ALLOWED_IMAGE_TYPES,
          ...this.ALLOWED_VIDEO_TYPES,
          ...this.ALLOWED_DOCUMENT_TYPES,
        ].includes(file.mimetype);

        if (!isValidType) {
          return cb(new Error(`Unsupported file type: ${file.mimetype}`));
        }

        cb(null, true);
      },
    });
  }

  /**
   * Validate file based on type and size
   */
  static validateFile(file: Express.Multer.File): { isValid: boolean; error?: string; mediaType?: string } {
    // Determine media type
    let mediaType: string;
    let maxSize: number;

    if (this.ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      mediaType = 'image';
      maxSize = this.MAX_FILE_SIZE.image;
    } else if (this.ALLOWED_VIDEO_TYPES.includes(file.mimetype)) {
      mediaType = 'video';
      maxSize = this.MAX_FILE_SIZE.video;
    } else if (this.ALLOWED_DOCUMENT_TYPES.includes(file.mimetype)) {
      mediaType = 'document';
      maxSize = this.MAX_FILE_SIZE.document;
    } else {
      return { isValid: false, error: `Unsupported file type: ${file.mimetype}` };
    }

    // Check file size
    if (file.size > maxSize) {
      const maxSizeMB = Math.round(maxSize / (1024 * 1024));
      return {
        isValid: false,
        error: `File size exceeds ${maxSizeMB}MB limit for ${mediaType} files`
      };
    }

    return { isValid: true, mediaType };
  }

  /**
   * Process image (resize, optimize, convert format)
   */
  static async processImage(
    buffer: Buffer,
    options: StorageProcessingOptions = {}
  ): Promise<{ buffer: Buffer; width: number; height: number }> {
    try {
      let sharpInstance = sharp(buffer);

      // Apply resize if specified
      if (options.resize) {
        sharpInstance = sharpInstance.resize({
          width: options.resize.width,
          height: options.resize.height,
          fit: options.resize.fit || 'cover',
          withoutEnlargement: true,
        });
      }

      // Set format and quality
      const format = options.format || 'jpeg';
      const quality = options.quality || 85;

      switch (format) {
        case 'jpeg':
          sharpInstance = sharpInstance.jpeg({ quality });
          break;
        case 'png':
          sharpInstance = sharpInstance.png({ quality });
          break;
        case 'webp':
          sharpInstance = sharpInstance.webp({ quality });
          break;
      }

      const processedBuffer = await sharpInstance.toBuffer();
      const metadata = await sharp(processedBuffer).metadata();

      return {
        buffer: processedBuffer,
        width: metadata.width || 0,
        height: metadata.height || 0,
      };
    } catch (error) {
      logger.error('Image processing failed:', error);
      throw new Error('Failed to process image');
    }
  }

  /**
   * Upload single file with processing
   */
  async uploadFile(
    file: Express.Multer.File,
    options: {
      folder?: string;
      processImage?: StorageProcessingOptions;
      generateThumbnail?: boolean;
    } = {}
  ): Promise<StorageUploadResult & { thumbnail?: StorageUploadResult }> {
    try {
      // Validate file
      const validation = StorageService.validateFile(file);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const { mediaType } = validation;
      const folder = options.folder || mediaType || 'uploads';

      let uploadBuffer = file.buffer;
      let width: number | undefined;
      let height: number | undefined;

      // Process image if it's an image file
      if (mediaType === 'image') {
        const processed = await StorageService.processImage(uploadBuffer, options.processImage);
        uploadBuffer = processed.buffer;
        width = processed.width;
        height = processed.height;
      }

      // Generate unique key
      const fileExtension = this.getFileExtension(file.mimetype);
      const fileName = `${uuidv4()}${fileExtension}`;
      const key = `${folder}/${fileName}`;

      // Upload main file
      const upload = await this.provider.upload(uploadBuffer, key, file.mimetype);

      const result: StorageUploadResult = {
        url: upload.url,
        key: upload.key,
        size: uploadBuffer.length,
        mimeType: file.mimetype,
        width,
        height,
      };

      // Generate thumbnail for images if requested
      let thumbnail: StorageUploadResult | undefined;
      if (mediaType === 'image' && options.generateThumbnail) {
        const thumbnailProcessed = await StorageService.processImage(file.buffer, {
          resize: { width: 300, height: 300, fit: 'cover' },
          quality: 80,
          format: 'jpeg',
        });

        const thumbnailKey = `${folder}/thumbnails/${uuidv4()}.jpg`;
        const thumbnailUpload = await this.provider.upload(
          thumbnailProcessed.buffer,
          thumbnailKey,
          'image/jpeg'
        );

        thumbnail = {
          url: thumbnailUpload.url,
          key: thumbnailUpload.key,
          size: thumbnailProcessed.buffer.length,
          mimeType: 'image/jpeg',
          width: thumbnailProcessed.width,
          height: thumbnailProcessed.height,
        };
      }

      logger.info(`File uploaded successfully: ${upload.key}`);

      return { ...result, thumbnail };
    } catch (error) {
      logger.error('File upload failed:', error);
      throw error;
    }
  }

  /**
   * Upload multiple files
   */
  async uploadMultipleFiles(
    files: Express.Multer.File[],
    options: {
      folder?: string;
      processImage?: StorageProcessingOptions;
      generateThumbnail?: boolean;
    } = {}
  ): Promise<(StorageUploadResult & { thumbnail?: StorageUploadResult })[]> {
    try {
      const uploadPromises = files.map(file => this.uploadFile(file, options));
      return await Promise.all(uploadPromises);
    } catch (error) {
      logger.error('Multiple file upload failed:', error);
      throw error;
    }
  }

  /**
   * Delete file
   */
  async deleteFile(key: string): Promise<void> {
    try {
      await this.provider.delete(key);
      logger.info(`File deleted successfully: ${key}`);
    } catch (error) {
      logger.error('File deletion failed:', error);
      throw new Error('Failed to delete file');
    }
  }

  /**
   * Get signed URL for private files
   */
  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      return await this.provider.getSignedUrl(key, expiresIn);
    } catch (error) {
      logger.error('Failed to generate signed URL:', error);
      throw new Error('Failed to generate signed URL');
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(key: string): Promise<boolean> {
    return await this.provider.fileExists(key);
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(key: string): Promise<{
    size: number;
    lastModified: Date;
    contentType: string;
  }> {
    try {
      return await this.provider.getFileMetadata(key);
    } catch (error) {
      logger.error('Failed to get file metadata:', error);
      throw new Error('Failed to get file metadata');
    }
  }

  /**
   * Generate different image sizes
   */
  async generateImageVariants(
    file: Express.Multer.File,
    variants: { name: string; width?: number; height?: number; quality?: number }[],
    folder: string = 'media'
  ): Promise<Record<string, StorageUploadResult>> {
    try {
      const validation = StorageService.validateFile(file);
      if (!validation.isValid || validation.mediaType !== 'image') {
        throw new Error('File must be a valid image');
      }

      const results: Record<string, StorageUploadResult> = {};

      for (const variant of variants) {
        const processed = await StorageService.processImage(file.buffer, {
          resize: { width: variant.width, height: variant.height, fit: 'cover' },
          quality: variant.quality || 85,
          format: 'jpeg',
        });

        const fileName = `${uuidv4()}.jpg`;
        const key = `${folder}/${variant.name}/${fileName}`;

        const upload = await this.provider.upload(
          processed.buffer,
          key,
          'image/jpeg'
        );

        results[variant.name] = {
          url: upload.url,
          key: upload.key,
          size: processed.buffer.length,
          mimeType: 'image/jpeg',
          width: processed.width,
          height: processed.height,
        };
      }

      return results;
    } catch (error) {
      logger.error('Image variant generation failed:', error);
      throw error;
    }
  }

  /**
   * Get file extension from MIME type
   */
  private getFileExtension(mimeType: string): string {
    const extensions: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'video/mp4': '.mp4',
      'video/mpeg': '.mpeg',
      'video/quicktime': '.mov',
      'video/x-msvideo': '.avi',
      'application/pdf': '.pdf',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    };

    return extensions[mimeType] || '';
  }

  /**
   * Get MinIO provider (if using MinIO)
   */
  getMinIOProvider(): MinIOStorageProvider | null {
    return this.provider instanceof MinIOStorageProvider ? this.provider : null;
  }

  /**
   * Initialize storage provider (MinIO buckets, etc.)
   */
  async initializeProvider(): Promise<void> {
    if (this.provider instanceof MinIOStorageProvider) {
      await this.provider.initializeBuckets();
    }
  }

  /**
   * Get storage provider health status
   */
  async getHealthStatus(): Promise<{ provider: string; status: string; details?: any }> {
    const health = await (this.provider as MinIOStorageProvider).healthCheck();
    return {
      provider: 'minio',
      status: health.status,
      details: health
    };
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{ provider: string; buckets?: any[]; usage?: any }> {
    try {
      const buckets = await (this.provider as MinIOStorageProvider).listBuckets();
      const stats = {
        provider: 'minio',
        buckets: buckets,
        bucketCount: buckets.length
      };

      return stats;
    } catch (error) {
      logger.error('Failed to get storage stats:', error);
      return {
        provider: 'minio',
        buckets: [],
      };
    }
  }
}

export const storageService = new StorageService();