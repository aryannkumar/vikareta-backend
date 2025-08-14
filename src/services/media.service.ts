import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/utils/logger';
import { config } from '@/config/environment';
import { storageService } from './storage.service';
import { processImage, createThumbnail, isImageProcessingAvailable } from '@/utils/sharp-wrapper';

export interface MediaUploadResult {
  url: string;
  key: string;
  size: number;
  mimeType: string;
  width?: number;
  height?: number;
}

export interface MediaProcessingOptions {
  resize?: {
    width?: number;
    height?: number;
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  };
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

export class MediaService {
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
    options: MediaProcessingOptions = {}
  ): Promise<{ buffer: Buffer; width: number; height: number }> {
    try {
      const result = await processImage(buffer, {
        resize: options.resize ? {
          width: options.resize.width,
          height: options.resize.height,
          fit: options.resize.fit || 'cover',
          quality: options.quality || 85
        } : undefined,
        format: options.format || 'jpeg',
        quality: options.quality || 85
      });

      return {
        buffer: result.buffer,
        width: result.width,
        height: result.height,
      };
    } catch (error) {
      logger.error('Image processing failed:', error);
      throw new Error('Failed to process image');
    }
  }

  /**
   * Upload file to storage
   */
  static async uploadToStorage(
    buffer: Buffer,
    mimeType: string,
    folder: string = 'uploads'
  ): Promise<{ url: string; key: string }> {
    try {
      const fileExtension = this.getFileExtension(mimeType);
      const fileName = `${uuidv4()}${fileExtension}`;
      const key = `${folder}/${fileName}`;

      // Create a mock file object for the storage service
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: fileName,
        encoding: '7bit',
        mimetype: mimeType,
        size: buffer.length,
        buffer: buffer,
        destination: '',
        filename: fileName,
        path: '',
        stream: null as any
      };

      const result = await storageService.uploadFile(mockFile, { folder });

      return {
        url: result.url,
        key: result.key,
      };
    } catch (error) {
      logger.error('Storage upload failed:', error);
      throw new Error('Failed to upload file to storage');
    }
  }

  /**
   * Delete file from storage
   */
  static async deleteFromStorage(key: string): Promise<void> {
    try {
      await storageService.deleteFile(key);
      logger.info(`File deleted from storage: ${key}`);
    } catch (error) {
      logger.error('Storage delete failed:', error);
      throw new Error('Failed to delete file from storage');
    }
  }

  /**
   * Upload single file with processing
   */
  static async uploadFile(
    file: Express.Multer.File,
    options: {
      folder?: string;
      processImage?: MediaProcessingOptions;
      generateThumbnail?: boolean;
    } = {}
  ): Promise<MediaUploadResult & { thumbnail?: MediaUploadResult }> {
    try {
      // Validate file
      const validation = this.validateFile(file);
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
        const processed = await this.processImage(uploadBuffer, options.processImage);
        uploadBuffer = processed.buffer;
        width = processed.width;
        height = processed.height;
      }

      // Upload main file
      const upload = await this.uploadToStorage(uploadBuffer, file.mimetype, folder);

      const result: MediaUploadResult = {
        url: upload.url,
        key: upload.key,
        size: uploadBuffer.length,
        mimeType: file.mimetype,
        width,
        height,
      };

      // Generate thumbnail for images if requested
      let thumbnail: MediaUploadResult | undefined;
      if (mediaType === 'image' && options.generateThumbnail) {
        const thumbnailProcessed = await this.processImage(file.buffer, {
          resize: { width: 300, height: 300, fit: 'cover' },
          quality: 80,
          format: 'jpeg',
        });

        const thumbnailUpload = await this.uploadToStorage(
          thumbnailProcessed.buffer,
          'image/jpeg',
          `${folder}/thumbnails`
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
  static async uploadMultipleFiles(
    files: Express.Multer.File[],
    options: {
      folder?: string;
      processImage?: MediaProcessingOptions;
      generateThumbnail?: boolean;
    } = {}
  ): Promise<(MediaUploadResult & { thumbnail?: MediaUploadResult })[]> {
    try {
      const uploadPromises = files.map(file => this.uploadFile(file, options));
      return await Promise.all(uploadPromises);
    } catch (error) {
      logger.error('Multiple file upload failed:', error);
      throw error;
    }
  }

  /**
   * Generate different image sizes
   */
  static async generateImageVariants(
    file: Express.Multer.File,
    variants: { name: string; width?: number; height?: number; quality?: number }[],
    folder: string = 'images'
  ): Promise<Record<string, MediaUploadResult>> {
    try {
      const validation = this.validateFile(file);
      if (!validation.isValid || validation.mediaType !== 'image') {
        throw new Error('File must be a valid image');
      }

      const results: Record<string, MediaUploadResult> = {};

      for (const variant of variants) {
        const processed = await this.processImage(file.buffer, {
          resize: { width: variant.width, height: variant.height, fit: 'cover' },
          quality: variant.quality || 85,
          format: 'jpeg',
        });

        const upload = await this.uploadToStorage(
          processed.buffer,
          'image/jpeg',
          `${folder}/${variant.name}`
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
  private static getFileExtension(mimeType: string): string {
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
   * Get signed URL for private files
   */
  static async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      return await storageService.getSignedUrl(key, expiresIn);
    } catch (error) {
      logger.error('Failed to generate signed URL:', error);
      throw new Error('Failed to generate signed URL');
    }
  }

  /**
   * Check if file exists in storage
   */
  static async fileExists(key: string): Promise<boolean> {
    try {
      return await storageService.fileExists(key);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get file metadata from storage
   */
  static async getFileMetadata(key: string): Promise<{
    size: number;
    lastModified: Date;
    contentType: string;
  }> {
    try {
      return await storageService.getFileMetadata(key);
    } catch (error) {
      logger.error('Failed to get file metadata:', error);
      throw new Error('Failed to get file metadata');
    }
  }
}

export const mediaService = new MediaService();