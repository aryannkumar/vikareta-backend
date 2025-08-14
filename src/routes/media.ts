/**
 * Media Upload Routes with MinIO S3 Integration
 * Handles file uploads, image processing, and media management
 */
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { body, query, validationResult } from 'express-validator';
import { minioService, MediaProcessingOptions } from '../services/minio.service';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10, // Maximum 10 files per request
  },
  fileFilter: (req, file, cb) => {
    // Allow images, documents, and videos
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'video/mp4',
      'video/webm',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});

// Validation middleware
const handleValidationErrors = (req: Request, res: Response, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        details: errors.array(),
      },
    });
  }
  return next();
};

/**
 * POST /api/media/upload - Upload single file
 */
router.post('/upload', [
  authenticate,
  upload.single('file'),
  body('folder').optional().isString().withMessage('Folder must be a string'),
  body('resize_width').optional().isInt({ min: 1 }).withMessage('Width must be positive integer'),
  body('resize_height').optional().isInt({ min: 1 }).withMessage('Height must be positive integer'),
  body('quality').optional().isInt({ min: 1, max: 100 }).withMessage('Quality must be between 1-100'),
  body('generate_thumbnail').optional().isBoolean().withMessage('Generate thumbnail must be boolean'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_FILE',
          message: 'No file provided',
        },
      });
    }

    const userId = (req as any).authUser?.userId;
    const folder = req.body.folder || `users/${userId}/uploads`;

    // Processing options
    const options: MediaProcessingOptions = {
      resize: req.body.resize_width || req.body.resize_height ? {
        width: req.body.resize_width ? parseInt(req.body.resize_width) : undefined,
        height: req.body.resize_height ? parseInt(req.body.resize_height) : undefined,
        quality: req.body.quality ? parseInt(req.body.quality) : 85,
      } : undefined,
      generateThumbnail: req.body.generate_thumbnail === 'true',
      watermark: false, // Can be enabled later
    };

    const result = await minioService.uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      folder,
      options
    );

    if (result.success) {
      logger.info(`Media uploaded successfully: ${result.key}`, {
        userId,
        fileName: req.file.originalname,
        size: req.file.size,
      });

      return res.json({
        success: true,
        data: {
          url: result.url,
          key: result.key,
          metadata: result.metadata,
        },
      });
    } else {
      return res.status(500).json({
        success: false,
        error: {
          code: 'UPLOAD_FAILED',
          message: result.error || 'Upload failed',
        },
      });
    }
  } catch (error) {
    logger.error('Media upload error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'UPLOAD_ERROR',
        message: 'Internal server error during upload',
      },
    });
  }
});

/**
 * POST /api/media/upload-multiple - Upload multiple files
 */
router.post('/upload-multiple', [
  authenticate,
  upload.array('files', 10),
  body('folder').optional().isString().withMessage('Folder must be a string'),
  body('resize_width').optional().isInt({ min: 1 }).withMessage('Width must be positive integer'),
  body('resize_height').optional().isInt({ min: 1 }).withMessage('Height must be positive integer'),
  body('quality').optional().isInt({ min: 1, max: 100 }).withMessage('Quality must be between 1-100'),
  body('generate_thumbnail').optional().isBoolean().withMessage('Generate thumbnail must be boolean'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_FILES',
          message: 'No files provided',
        },
      });
    }

    const userId = (req as any).authUser?.userId;
    const folder = req.body.folder || `users/${userId}/uploads`;

    // Processing options
    const options: MediaProcessingOptions = {
      resize: req.body.resize_width || req.body.resize_height ? {
        width: req.body.resize_width ? parseInt(req.body.resize_width) : undefined,
        height: req.body.resize_height ? parseInt(req.body.resize_height) : undefined,
        quality: req.body.quality ? parseInt(req.body.quality) : 85,
      } : undefined,
      generateThumbnail: req.body.generate_thumbnail === 'true',
      watermark: false,
    };

    const fileData = files.map(file => ({
      buffer: file.buffer,
      originalName: file.originalname,
      mimetype: file.mimetype,
    }));

    const results = await minioService.uploadMultipleFiles(fileData, folder, options);

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    logger.info(`Multiple media upload completed: ${successful.length} successful, ${failed.length} failed`, {
      userId,
      totalFiles: files.length,
    });

    return res.json({
      success: true,
      data: {
        successful: successful.map(r => ({
          url: r.url,
          key: r.key,
          metadata: r.metadata,
        })),
        failed: failed.map(r => ({
          error: r.error,
        })),
        summary: {
          total: files.length,
          successful: successful.length,
          failed: failed.length,
        },
      },
    });
  } catch (error) {
    logger.error('Multiple media upload error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'UPLOAD_ERROR',
        message: 'Internal server error during upload',
      },
    });
  }
});

/**
 * DELETE /api/media/:key - Delete file
 */
router.delete('/:key(*)', [
  authenticate,
], async (req: Request, res: Response) => {
  try {
    const objectKey = req.params.key;
    const userId = (req as any).authUser?.userId;

    // Security check: ensure user can only delete their own files
    if (!objectKey.includes(`users/${userId}/`)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You can only delete your own files',
        },
      });
    }

    const deleted = await minioService.deleteFile(objectKey);

    if (deleted) {
      logger.info(`Media deleted successfully: ${objectKey}`, { userId });
      return res.json({
        success: true,
        message: 'File deleted successfully',
      });
    } else {
      return res.status(404).json({
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: 'File not found or could not be deleted',
        },
      });
    }
  } catch (error) {
    logger.error('Media delete error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_ERROR',
        message: 'Internal server error during deletion',
      },
    });
  }
});

/**
 * GET /api/media/list - List user's files
 */
router.get('/list', [
  authenticate,
  query('folder').optional().isString().withMessage('Folder must be a string'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1-100'),
  handleValidationErrors,
], async (req: Request, res: Response) => {
  try {
    const userId = (req as any).authUser?.userId;
    const folder = req.query.folder as string || `users/${userId}/`;
    const limit = parseInt(req.query.limit as string) || 50;

    const files = await minioService.listFiles(folder, limit);

    return res.json({
      success: true,
      data: {
        files: files.map(file => ({
          key: file.key,
          url: `${process.env.MINIO_PUBLIC_URL || 'http://localhost:9000'}/${process.env.MINIO_BUCKET_NAME || 'vikareta-media'}/${file.key}`,
          size: file.size,
          lastModified: file.lastModified,
        })),
        total: files.length,
        folder,
      },
    });
  } catch (error) {
    logger.error('Media list error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'LIST_ERROR',
        message: 'Internal server error while listing files',
      },
    });
  }
});

/**
 * GET /api/media/presigned/:key - Get presigned URL for secure access
 */
router.get('/presigned/:key(*)', [
  authenticate,
], async (req: Request, res: Response) => {
  try {
    const objectKey = req.params.key;
    const userId = (req as any).authUser?.userId;
    const expiry = parseInt(req.query.expiry as string) || 3600; // 1 hour default

    // Security check: ensure user can only access their own files or public files
    if (!objectKey.includes(`users/${userId}/`) && !objectKey.includes('public/')) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You can only access your own files',
        },
      });
    }

    const presignedUrl = await minioService.getPresignedUrl(objectKey, expiry);

    return res.json({
      success: true,
      data: {
        url: presignedUrl,
        expiry: expiry,
        expiresAt: new Date(Date.now() + expiry * 1000).toISOString(),
      },
    });
  } catch (error) {
    logger.error('Presigned URL error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'PRESIGNED_ERROR',
        message: 'Internal server error while generating presigned URL',
      },
    });
  }
});

export default router;