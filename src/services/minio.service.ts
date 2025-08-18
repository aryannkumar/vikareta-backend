/**
 * MinIO S3 Service for Media Upload and Management
 * Handles file uploads, downloads, and media management
 */
import { Client as MinioClient } from 'minio';
import { config } from '@/config/environment';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { processImage, createThumbnail } from '@/utils/sharp-wrapper';

export interface UploadResult {
    success: boolean;
    url?: string;
    key?: string;
    error?: string;
    metadata?: {
        size: number;
        mimetype: string;
        originalName: string;
    };
}

export interface MediaProcessingOptions {
    resize?: {
        width?: number;
        height?: number;
        quality?: number;
    };
    generateThumbnail?: boolean;
    watermark?: boolean;
}

export class MinIOService {
    private client: MinioClient;
    private bucketName: string;
    private region: string;

    constructor() {
        // Prefer validated config values
        const minioCfg = config.minio || {};

        // Support full URL for endpoint (e.g. https://storage.vikareta.com)
        let endpoint = minioCfg.endpoint || process.env.MINIO_ENDPOINT || 'localhost';
        let port = minioCfg.port || (process.env.MINIO_PORT ? parseInt(process.env.MINIO_PORT) : 9000);
        let useSSL = typeof minioCfg.useSSL === 'boolean' ? minioCfg.useSSL : (process.env.MINIO_USE_SSL === 'true');
    const accessKey = (minioCfg as any).accessKey || process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER || 'vikareta_admin';
    const secretKey = (minioCfg as any).secretKey || process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || 'VkRt_M1n10_2025_Pr0d_S3cur3_P@ssw0rd!';
    this.bucketName = process.env.MINIO_BUCKET_NAME || `${(minioCfg as any).bucketPrefix || 'vikareta'}-media`;
    this.region = (minioCfg as any).region || process.env.MINIO_REGION || 'us-east-1';

        try {
            if (/^https?:\/\//.test(String(endpoint))) {
                const parsed = new URL(String(endpoint));
                endpoint = parsed.hostname;
                if (parsed.port) port = parseInt(parsed.port);
                useSSL = parsed.protocol === 'https:';
            }

            this.client = new MinioClient({
                endPoint: endpoint,
                port: typeof port === 'number' ? port : parseInt(String(port || 9000)),
                useSSL: !!useSSL,
                accessKey: String(accessKey),
                secretKey: String(secretKey),
            });
        } catch (err) {
            // If MinIO client cannot be constructed, keep client undefined and log
            // other methods will handle missing client gracefully
            // eslint-disable-next-line no-console
            console.error('❌ MinIO: Failed to construct client:', err);
            // @ts-ignore
            this.client = null;
        }
    }

    /**
     * Initialize MinIO service and create buckets
     */
    async initialize(): Promise<void> {
        try {
            if (!this.client) {
                // eslint-disable-next-line no-console
                console.warn('⚠️ MinIO: Client not configured, skipping initialization');
                return;
            }

            // Check if bucket exists, create if not
            const bucketExists = await this.client.bucketExists(this.bucketName);
            if (!bucketExists) {
                await this.client.makeBucket(this.bucketName, this.region);
                // eslint-disable-next-line no-console
                console.log(`✅ MinIO: Created bucket ${this.bucketName}`);

                // Set bucket policy for public read access to certain paths
                await this.setBucketPolicy();
            }

            // eslint-disable-next-line no-console
            console.log(`✅ MinIO: Service initialized successfully`);
        } catch (error) {
            // Log and continue - do not crash the app if MinIO is unavailable
            // eslint-disable-next-line no-console
            console.error('❌ MinIO: Initialization failed:', error && (error as any).message ? (error as any).message : error);
            // Keep client reference so other callers can return friendly errors
            // don't rethrow to avoid blocking startup
        }
    }

    /**
     * Set bucket policy for public access to media files
     */
    private async setBucketPolicy(): Promise<void> {
        const policy = {
            Version: '2012-10-17',
            Statement: [
                {
                    Effect: 'Allow',
                    Principal: { AWS: ['*'] },
                    Action: ['s3:GetObject'],
                    Resource: [`arn:aws:s3:::${this.bucketName}/public/*`],
                },
            ],
        };

        try {
            await this.client.setBucketPolicy(this.bucketName, JSON.stringify(policy));
            console.log('✅ MinIO: Bucket policy set for public access');
        } catch (error) {
            console.warn('⚠️ MinIO: Could not set bucket policy:', error);
        }
    }

    /**
     * Upload file to MinIO with processing options
     */
    async uploadFile(
        file: Buffer | string,
        originalName: string,
        mimetype: string,
        folder: string = 'uploads',
        options: MediaProcessingOptions = {}
    ): Promise<UploadResult> {
        try {
            if (!this.client) {
                return {
                    success: false,
                    error: 'MinIO client not configured or connection failed'
                } as UploadResult;
            }
            const fileExtension = path.extname(originalName);
            const fileName = `${uuidv4()}${fileExtension}`;
            const objectKey = `${folder}/${fileName}`;

            let processedBuffer: Buffer;
            let finalMimetype = mimetype;

            // Process image if it's an image file
            if (mimetype.startsWith('image/') && Buffer.isBuffer(file)) {
                processedBuffer = await this.processImage(file, options);
                finalMimetype = 'image/jpeg'; // Convert all images to JPEG for consistency
            } else {
                processedBuffer = Buffer.isBuffer(file) ? file : Buffer.from(file);
            }

            // Upload to MinIO
            await this.client.putObject(
                this.bucketName,
                objectKey,
                processedBuffer,
                processedBuffer.length,
                {
                    'Content-Type': finalMimetype,
                    'X-Original-Name': originalName,
                    'X-Upload-Date': new Date().toISOString(),
                }
            );

            // Generate public URL
            const publicUrl = await this.getPublicUrl(objectKey);

            // Generate thumbnail if requested
            if (options.generateThumbnail && mimetype.startsWith('image/')) {
                // generateThumbnail will upload and return URL; we don't need to keep it here
                await this.generateThumbnail(processedBuffer, objectKey);
            }

            return {
                success: true,
                url: publicUrl,
                key: objectKey,
                metadata: {
                    size: processedBuffer.length,
                    mimetype: finalMimetype,
                    originalName,
                },
            };
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('❌ MinIO: Upload failed:', error && (error as any).message ? (error as any).message : error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Upload failed',
            };
        }
    }

    /**
     * Process image with Sharp
     */
    private async processImage(
        buffer: Buffer,
        options: MediaProcessingOptions
    ): Promise<Buffer> {
        try {
            const result = await processImage(buffer, {
                resize: options.resize ? {
                    width: options.resize.width,
                    height: options.resize.height,
                    fit: 'inside',
                    quality: options.resize.quality || 85
                } : undefined,
                format: 'jpeg',
                quality: options.resize?.quality || 85
            });
            
            return result.buffer;
        } catch (error) {
            throw new Error(`Image processing failed: ${error}`);
        }
    }

    /**
     * Generate thumbnail for image
     */
    private async generateThumbnail(
        originalBuffer: Buffer,
        originalKey: string
    ): Promise<string> {
        try {
            const thumbnailBuffer = await createThumbnail(originalBuffer, 300, 300);

            const thumbnailKey = originalKey.replace(/(\.[^.]+)$/, '_thumb$1');

            await this.client.putObject(
                this.bucketName,
                thumbnailKey,
                thumbnailBuffer,
                thumbnailBuffer.length,
                { 'Content-Type': 'image/jpeg' }
            );

            return await this.getPublicUrl(thumbnailKey);
        } catch (error) {
            console.error('❌ MinIO: Thumbnail generation failed:', error);
            throw error;
        }
    }

    /**
     * Get public URL for object
     */
    async getPublicUrl(objectKey: string): Promise<string> {
        // Allow an explicit public URL override (CDN or gateway)
        const publicOverride = process.env.MINIO_PUBLIC_URL || config.storage.cdnUrl;
        if (publicOverride) {
            // Trim trailing slash
            return `${publicOverride.replace(/\/$/, '')}/${this.bucketName}/${objectKey}`;
        }

        const useSSL = config.minio.useSSL ? true : (process.env.MINIO_USE_SSL === 'true');
        let endpoint = config.minio.endpoint || process.env.MINIO_ENDPOINT || 'localhost';
        let port = config.minio.port || (process.env.MINIO_PORT ? String(process.env.MINIO_PORT) : '9000');

        if (/^https?:\/\//.test(String(endpoint))) {
            try {
                const parsed = new URL(String(endpoint));
                endpoint = parsed.hostname;
                if (parsed.port) port = parsed.port;
            } catch {
                // ignore and use raw endpoint
            }
        }

        const protocol = useSSL ? 'https' : 'http';

        // Omit port for standard ports
        const portPart = (port === '80' || port === '443' || !port) ? '' : `:${port}`;
        return `${protocol}://${endpoint}${portPart}/${this.bucketName}/${objectKey}`;
    }

    /**
     * Get presigned URL for secure access
     */
    async getPresignedUrl(
        objectKey: string,
        expiry: number = 24 * 60 * 60 // 24 hours
    ): Promise<string> {
        try {
            return await this.client.presignedGetObject(this.bucketName, objectKey, expiry);
        } catch (error) {
            console.error('❌ MinIO: Presigned URL generation failed:', error);
            throw error;
        }
    }

    /**
     * Delete file from MinIO
     */
    async deleteFile(objectKey: string): Promise<boolean> {
        try {
            await this.client.removeObject(this.bucketName, objectKey);

            // Also try to delete thumbnail if it exists
            const thumbnailKey = objectKey.replace(/(\.[^.]+)$/, '_thumb$1');
            try {
                await this.client.removeObject(this.bucketName, thumbnailKey);
            } catch {
                // Thumbnail might not exist, ignore error
            }

            return true;
        } catch (error) {
            console.error('❌ MinIO: Delete failed:', error);
            return false;
        }
    }

    /**
     * List files in a folder
     */
    async listFiles(
        folder: string = '',
        limit: number = 100
    ): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
        try {
            const objects: Array<{ key: string; size: number; lastModified: Date }> = [];
            const stream = this.client.listObjects(this.bucketName, folder, true);

            return new Promise((resolve, reject) => {
                let count = 0;
                stream.on('data', (obj) => {
                    if (count < limit) {
                        objects.push({
                            key: obj.name || '',
                            size: obj.size || 0,
                            lastModified: obj.lastModified || new Date(),
                        });
                        count++;
                    }
                });
                stream.on('end', () => resolve(objects));
                stream.on('error', reject);
            });
        } catch (error) {
            console.error('❌ MinIO: List files failed:', error);
            return [];
        }
    }

    /**
     * Upload multiple files
     */
    async uploadMultipleFiles(
        files: Array<{
            buffer: Buffer;
            originalName: string;
            mimetype: string;
        }>,
        folder: string = 'uploads',
        options: MediaProcessingOptions = {}
    ): Promise<UploadResult[]> {
        const uploadPromises = files.map((file) =>
            this.uploadFile(file.buffer, file.originalName, file.mimetype, folder, options)
        );
        return await Promise.all(uploadPromises);
    }
}

// Export singleton instance
export const minioService = new MinIOService();