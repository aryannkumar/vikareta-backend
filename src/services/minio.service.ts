/**
 * MinIO S3 Service for Media Upload and Management
 * Handles file uploads, downloads, and media management
 */
import { Client as MinioClient } from 'minio';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import sharp from 'sharp';

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
        this.client = new MinioClient({
            endPoint: process.env.MINIO_ENDPOINT || 'localhost',
            port: parseInt(process.env.MINIO_PORT || '9000'),
            useSSL: process.env.MINIO_USE_SSL === 'true',
            accessKey: process.env.MINIO_ROOT_USER || 'vikareta_admin',
            secretKey: process.env.MINIO_ROOT_PASSWORD || 'VkRt_M1n10_2025_Pr0d_S3cur3_P@ssw0rd!',
        });

        this.bucketName = process.env.MINIO_BUCKET_NAME || 'vikareta-media';
        this.region = process.env.MINIO_REGION || 'us-east-1';
    }

    /**
     * Initialize MinIO service and create buckets
     */
    async initialize(): Promise<void> {
        try {
            // Check if bucket exists, create if not
            const bucketExists = await this.client.bucketExists(this.bucketName);
            if (!bucketExists) {
                await this.client.makeBucket(this.bucketName, this.region);
                console.log(`✅ MinIO: Created bucket ${this.bucketName}`);

                // Set bucket policy for public read access to certain paths
                await this.setBucketPolicy();
            }

            console.log(`✅ MinIO: Service initialized successfully`);
        } catch (error) {
            console.error('❌ MinIO: Initialization failed:', error);
            throw error;
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
            const uploadInfo = await this.client.putObject(
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
            let thumbnailUrl: string | undefined;
            if (options.generateThumbnail && mimetype.startsWith('image/')) {
                thumbnailUrl = await this.generateThumbnail(processedBuffer, objectKey);
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
            console.error('❌ MinIO: Upload failed:', error);
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
        let sharpInstance = sharp(buffer);

        // Resize if specified
        if (options.resize) {
            sharpInstance = sharpInstance.resize(
                options.resize.width,
                options.resize.height,
                { fit: 'inside', withoutEnlargement: true }
            );
        }

        // Convert to JPEG with quality setting
        sharpInstance = sharpInstance.jpeg({
            quality: options.resize?.quality || 85,
            progressive: true,
        });

        return await sharpInstance.toBuffer();
    }

    /**
     * Generate thumbnail for image
     */
    private async generateThumbnail(
        originalBuffer: Buffer,
        originalKey: string
    ): Promise<string> {
        try {
            const thumbnailBuffer = await sharp(originalBuffer)
                .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 70 })
                .toBuffer();

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
        const protocol = process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http';
        const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
        const port = process.env.MINIO_PORT || '9000';
        return `${protocol}://${endpoint}:${port}/${this.bucketName}/${objectKey}`;
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