import { Router } from 'express';
import multer from 'multer';
import { UploadController } from '@/controllers/upload.controller';
import { authMiddleware } from '@/middleware/authentication.middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const uploadController = new UploadController();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(authMiddleware);

/**
 * @openapi
 * /api/v1/uploads/image:
 *   post:
 *     summary: Upload an image
 *     tags:
 *       - Uploads
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Uploaded image
 */
router.post('/image', upload.single('file'), asyncHandler(uploadController.uploadImage.bind(uploadController)));

/**
 * @openapi
 * /api/v1/uploads/document:
 *   post:
 *     summary: Upload a document
 *     tags:
 *       - Uploads
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Uploaded document
 */
router.post('/document', upload.single('file'), asyncHandler(uploadController.uploadDocument.bind(uploadController)));

/**
 * @openapi
 * /api/v1/uploads/avatar:
 *   post:
 *     summary: Upload user avatar
 *     tags:
 *       - Uploads
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Uploaded avatar
 */
router.post('/avatar', upload.single('file'), asyncHandler(uploadController.uploadAvatar.bind(uploadController)));

/**
 * @openapi
 * /api/v1/uploads/{fileId}:
 *   delete:
 *     summary: Delete an uploaded file
 *     tags:
 *       - Uploads
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted
 */
router.delete('/:fileId', asyncHandler(uploadController.deleteFile.bind(uploadController)));
router.get('/presign', asyncHandler(uploadController.presign.bind(uploadController)));

export { router as uploadRoutes };