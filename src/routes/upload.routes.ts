import { Router } from 'express';
import { UploadController } from '@/controllers/upload.controller';
import { authMiddleware } from '@/middleware/auth-middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const uploadController = new UploadController();

router.use(authMiddleware);

router.post('/image', asyncHandler(uploadController.uploadImage.bind(uploadController)));
router.post('/document', asyncHandler(uploadController.uploadDocument.bind(uploadController)));
router.post('/avatar', asyncHandler(uploadController.uploadAvatar.bind(uploadController)));
router.delete('/:fileId', asyncHandler(uploadController.deleteFile.bind(uploadController)));

export { router as uploadRoutes };