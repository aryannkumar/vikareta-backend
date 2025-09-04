import { Router } from 'express';
import multer from 'multer';
import { UploadController } from '@/controllers/upload.controller';
import { authMiddleware } from '@/middleware/auth-middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const uploadController = new UploadController();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(authMiddleware);

router.post('/image', upload.single('file'), asyncHandler(uploadController.uploadImage.bind(uploadController)));
router.post('/document', upload.single('file'), asyncHandler(uploadController.uploadDocument.bind(uploadController)));
router.post('/avatar', upload.single('file'), asyncHandler(uploadController.uploadAvatar.bind(uploadController)));
router.delete('/:fileId', asyncHandler(uploadController.deleteFile.bind(uploadController)));

export { router as uploadRoutes };