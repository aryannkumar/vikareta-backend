import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';
import path from 'path';
import fs from 'fs';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/attachments';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow common file types
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images, PDFs, and documents are allowed'));
    }
  }
});

/**
 * POST /api/attachments/upload
 * Upload file attachment
 */
router.post('/upload', authenticate, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_FILE',
          message: 'No file uploaded',
        },
      });
    }

    const fileInfo = {
      id: req.file.filename,
      originalName: req.file.originalname,
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadedBy: req.authUser!.userId,
      uploadedAt: new Date(),
      url: `/uploads/attachments/${req.file.filename}`,
    };

    logger.info('File uploaded successfully:', fileInfo);

    return res.status(201).json({
      success: true,
      data: fileInfo,
      message: 'File uploaded successfully',
    });
  } catch (error) {
    logger.error('Error uploading file:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'UPLOAD_ERROR',
        message: 'Failed to upload file',
      },
    });
  }
});

/**
 * GET /api/attachments/:filename
 * Download/view attachment
 */
router.get('/:filename', async (req: Request, res: Response) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join('uploads/attachments', filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: 'File not found',
        },
      });
    }

    // Set appropriate headers
    const stat = fs.statSync(filePath);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    logger.error('Error downloading file:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'DOWNLOAD_ERROR',
        message: 'Failed to download file',
      },
    });
  }
});

/**
 * DELETE /api/attachments/:filename
 * Delete attachment
 */
router.delete('/:filename', authenticate, async (req: Request, res: Response) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join('uploads/attachments', filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: 'File not found',
        },
      });
    }

    // Delete the file
    fs.unlinkSync(filePath);

    logger.info('File deleted successfully:', { filename, userId: req.authUser!.userId });

    return res.json({
      success: true,
      message: 'File deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting file:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_ERROR',
        message: 'Failed to delete file',
      },
    });
  }
});

export { router as mediaRoutes };