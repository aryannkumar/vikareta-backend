import { Client as MinioClient } from 'minio';
import { logger } from '../utils/logger';
import { redisClient } from '../config/redis';
import * as crypto from 'crypto';
import * as path from 'path';

export class MinioService {
    private client: MinioClient;
    private bucketName: string;

    constructor() {
        this.client = new MinioClient({
            endPoint: process.env.MINIO_ENDPOINT || 'localhost',
            port: parseInt(process.env.MINIO_PORT || '9000'),
            useSSL: process.env.MINIO_USE_SSL === 'true',
            accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
            secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
        });
        this.bucketName = process.env.MINIO_BUCKET_NAME || 'vikareta';
    }

    /**
     * Initialize MinIO service
     */
    async initialize(): Promise<void> {
        try {
            // Check if bucket exists, create if not
            const bucketExists = await this.client.bucketExists(this.bucketName);
            if (!bucketExists) {
                await this.client.makeBucket(this.bucketName, 'us-east-1');
                logger.info(`MinIO bucket created: ${this.bucketName}`);
            }

            // Set bucket policy for public read access to certain folders
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

            await this.client.setBucketPolicy(this.bucketName, JSON.stringify(policy));
            logger.info('MinIO service initialized successfully');
        } catch (error) {
            logger.error('Error initializing MinIO service:', error);
            throw error;
        }
    }

    /**
     * Upload file to MinIO
     */
    async uploadFile(
        file: Buffer | string,
        fileName: string,
        folder: string = 'uploads',
        metadata?: Record<string, string>
    ): Promise<{
        fileName: string;
        url: string;
        size: number;
        etag: string;
    }> {
        try {
            // Generate unique filename
            const fileExtension = path.extname(fileName);
            const baseName = path.basename(fileName, fileExtension);
            const uniqueFileName = `${baseName}-${crypto.randomUUID()}${fileExtension}`;
            const objectName = `${folder}/${uniqueFileName}`;

            // Upload file
            const uploadResult = await this.client.putObject(
                this.bucketName,
                objectName,
                file,
                undefined,
                metadata
            );

            // Get file stats
            const stats = await this.client.statObject(this.bucketName, objectName);

            // Generate URL
            const url = await this.getFileUrl(objectName);

            const result = {
                fileName: uniqueFileName,
                url,
                size: stats.size,
                etag: uploadResult.etag,
            };

            // Cache file info for 1 hour
            try {
                await redisClient.setex(`file:${uniqueFileName}`, 3600, JSON.stringify(result));
            } catch (cacheError) {
                logger.warn('Failed to cache file info:', cacheError);
            }

            logger.info(`File uploaded successfully: ${objectName}`);
            return result;
        } catch (error) {
            logger.error('Error uploading file to MinIO:', error);
            throw error;
        }
    }

    /**
     * Upload multiple files
     */
    async uploadMultipleFiles(
        files: Array<{ buffer: Buffer; fileName: string; metadata?: Record<string, string> }>,
        folder: string = 'uploads'
    ): Promise<Array<{
        fileName: string;
        url: string;
        size: number;
        etag: string;
    }>> {
        try {
            const uploadPromises = files.map(file =>
                this.uploadFile(file.buffer, file.fileName, folder, file.metadata)
            );

            const results = await Promise.all(uploadPromises);
            logger.info(`Multiple files uploaded successfully: ${results.length} files`);
            return results;
        } catch (error) {
            logger.error('Error uploading multiple files:', error);
            throw error;
        }
    }

    /**
     * Get file URL
     */
    async getFileUrl(objectName: string, expiry: number = 7 * 24 * 60 * 60): Promise<string> {
        try {
            // Check if it's a public file
            if (objectName.startsWith('public/')) {
                // If a public CDN/base URL is configured prefer it
                if (process.env.MINIO_PUBLIC_URL) {
                    return `${process.env.MINIO_PUBLIC_URL.replace(/\/$/, '')}/${objectName}`;
                }
                return `${this.getBaseUrl()}/${this.bucketName}/${objectName}`;
            }

            // Generate presigned URL for private files
            const url = await this.client.presignedGetObject(this.bucketName, objectName, expiry as any);
            return url as string;
        } catch (error) {
            logger.error('Error getting file URL:', error);
            throw error;
        }
    }

    /**
     * Get file info
     */
    async getFileInfo(fileName: string): Promise<{
        fileName: string;
        size: number;
        lastModified: Date;
        etag: string;
        contentType: string;
    } | null> {
        try {
            // Try to get from cache first
            try {
                const cached = await redisClient.get(`file:${fileName}`);
                if (cached) {
                    return JSON.parse(cached);
                }
            } catch (cacheError) {
                logger.warn('Redis error getting file info:', cacheError);
            }

            // Find the file in different folders
            const folders = ['uploads', 'public', 'products', 'services', 'users', 'documents'];
            
            for (const folder of folders) {
                try {
                    const objectName = `${folder}/${fileName}`;
                    const stats = await this.client.statObject(this.bucketName, objectName);
                    
                    const fileInfo = {
                        fileName,
                        size: stats.size,
                        lastModified: stats.lastModified,
                        etag: stats.etag,
                        contentType: stats.metaData['content-type'] || 'application/octet-stream',
                    };

                    // Cache for 1 hour
                    try {
                        await redisClient.setex(`file:${fileName}`, 3600, JSON.stringify(fileInfo));
                    } catch (cacheError) {
                        logger.warn('Failed to cache file info:', cacheError);
                    }

                    return fileInfo;
                } catch (error) {
                    // Continue to next folder
                    continue;
                }
            }

            return null;
        } catch (error) {
            logger.error('Error getting file info:', error);
            return null;
        }
    }

    /**
     * Delete file
     */
    async deleteFile(fileName: string, folder: string = 'uploads'): Promise<boolean> {
        try {
            const objectName = `${folder}/${fileName}`;
            await this.client.removeObject(this.bucketName, objectName);

            // Remove from cache
            try {
                await redisClient.del(`file:${fileName}`);
            } catch (cacheError) {
                logger.warn('Failed to remove file from cache:', cacheError);
            }

            logger.info(`File deleted successfully: ${objectName}`);
            return true;
        } catch (error) {
            logger.error('Error deleting file:', error);
            return false;
        }
    }

    /**
     * Delete multiple files
     */
    async deleteMultipleFiles(fileNames: string[], folder: string = 'uploads'): Promise<{
        deleted: string[];
        failed: string[];
    }> {
        const deleted: string[] = [];
        const failed: string[] = [];

        for (const fileName of fileNames) {
            try {
                const success = await this.deleteFile(fileName, folder);
                if (success) {
                    deleted.push(fileName);
                } else {
                    failed.push(fileName);
                }
            } catch (error) {
                failed.push(fileName);
            }
        }

        logger.info(`Bulk delete completed: ${deleted.length} deleted, ${failed.length} failed`);
        return { deleted, failed };
    }

    /**
     * Copy file
     */
    async copyFile(
        sourceFileName: string,
        targetFileName: string,
        sourceFolder: string = 'uploads',
        targetFolder: string = 'uploads'
    ): Promise<boolean> {
        try {
            const sourceObjectName = `${sourceFolder}/${sourceFileName}`;
            const targetObjectName = `${targetFolder}/${targetFileName}`;

            await this.client.copyObject(
                this.bucketName,
                targetObjectName,
                `/${this.bucketName}/${sourceObjectName}`
            );

            logger.info(`File copied: ${sourceObjectName} -> ${targetObjectName}`);
            return true;
        } catch (error) {
            logger.error('Error copying file:', error);
            return false;
        }
    }

    /**
     * List files in folder
     */
    async listFiles(
        folder: string = 'uploads',
        prefix?: string,
        limit?: number
    ): Promise<Array<{
        name: string;
        size: number;
        lastModified: Date;
        etag: string;
    }>> {
        try {
            const files: Array<{
                name: string;
                size: number;
                lastModified: Date;
                etag: string;
            }> = [];

            const objectsStream = this.client.listObjects(
                this.bucketName,
                `${folder}/${prefix || ''}`,
                false
            );

            return new Promise((resolve, reject) => {
                let count = 0;
                
                objectsStream.on('data', (obj) => {
                    if (limit && count >= limit) {
                        return;
                    }

                    files.push({
                        name: path.basename(obj.name || ''),
                        size: obj.size || 0,
                        lastModified: obj.lastModified || new Date(),
                        etag: obj.etag || '',
                    });
                    count++;
                });

                objectsStream.on('end', () => {
                    resolve(files);
                });

                objectsStream.on('error', (error) => {
                    reject(error);
                });
            });
        } catch (error) {
            logger.error('Error listing files:', error);
            return [];
        }
    }

    /**
     * Get file download stream
     */
    async getFileStream(fileName: string, folder: string = 'uploads'): Promise<NodeJS.ReadableStream> {
        try {
            const objectName = `${folder}/${fileName}`;
            const stream = await this.client.getObject(this.bucketName, objectName);
            return stream;
        } catch (error) {
            logger.error('Error getting file stream:', error);
            throw error;
        }
    }

    /**
     * Generate upload presigned URL
     */
    async generateUploadUrl(
        fileName: string,
        folder: string = 'uploads',
        expiry: number = 60 * 60 // 1 hour
    ): Promise<string> {
        try {
            const objectName = `${folder}/${fileName}`;
            const url = await this.client.presignedPutObject(this.bucketName, objectName, expiry);
            return url;
        } catch (error) {
            logger.error('Error generating upload URL:', error);
            throw error;
        }
    }

    /**
     * Get storage statistics
     */
    async getStorageStats(): Promise<{
        totalFiles: number;
        totalSize: number;
        folderStats: Record<string, { files: number; size: number }>;
    }> {
        try {
            const cacheKey = 'minio:storage_stats';
            
            // Try to get from cache first
            try {
                const cached = await redisClient.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            } catch (cacheError) {
                logger.warn('Redis error getting storage stats:', cacheError);
            }

            const folders = ['uploads', 'public', 'products', 'services', 'users', 'documents'];
            const folderStats: Record<string, { files: number; size: number }> = {};
            let totalFiles = 0;
            let totalSize = 0;

            for (const folder of folders) {
                const files = await this.listFiles(folder);
                const folderSize = files.reduce((sum, file) => sum + file.size, 0);
                
                folderStats[folder] = {
                    files: files.length,
                    size: folderSize,
                };

                totalFiles += files.length;
                totalSize += folderSize;
            }

            const stats = {
                totalFiles,
                totalSize,
                folderStats,
            };

            // Cache for 30 minutes
            try {
                await redisClient.setex(cacheKey, 1800, JSON.stringify(stats));
            } catch (cacheError) {
                logger.warn('Failed to cache storage stats:', cacheError);
            }

            return stats;
        } catch (error) {
            logger.error('Error getting storage stats:', error);
            return {
                totalFiles: 0,
                totalSize: 0,
                folderStats: {},
            };
        }
    }

    /**
     * Clean up expired files
     */
    async cleanupExpiredFiles(folder: string = 'temp', maxAge: number = 24 * 60 * 60 * 1000): Promise<number> {
        try {
            const files = await this.listFiles(folder);
            const now = new Date();
            let deletedCount = 0;

            for (const file of files) {
                const fileAge = now.getTime() - file.lastModified.getTime();
                if (fileAge > maxAge) {
                    const success = await this.deleteFile(file.name, folder);
                    if (success) {
                        deletedCount++;
                    }
                }
            }

            logger.info(`Cleanup completed: ${deletedCount} expired files deleted from ${folder}`);
            return deletedCount;
        } catch (error) {
            logger.error('Error cleaning up expired files:', error);
            return 0;
        }
    }

    /**
     * Get base URL for MinIO
     */
    private getBaseUrl(): string {
        // Prefer MINIO_PUBLIC_URL when set
        if (process.env.MINIO_PUBLIC_URL) {
            return process.env.MINIO_PUBLIC_URL.replace(/\/$/, '');
        }

        const protocol = process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http';
        const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
        const port = process.env.MINIO_PORT || '9000';

        if (port === '80' || port === '443') {
            return `${protocol}://${endpoint}`;
        }

        return `${protocol}://${endpoint}:${port}`;
    }

    /**
     * Health check
     */
    async healthCheck(): Promise<boolean> {
        try {
            await this.client.bucketExists(this.bucketName);
            return true;
        } catch (error) {
            logger.error('MinIO health check failed:', error);
            return false;
        }
    }
}

export const minioService = new MinioService();