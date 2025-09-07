import { Router } from 'express';
import { authMiddleware } from '@/middleware/auth.middleware';
import { validateBody, validateParams } from '@/middleware/zod-validate';
import { digilockerDocumentCreateSchema, digilockerDocumentUpdateSchema, digilockerDocumentIdParamsSchema } from '@/validation/schemas';
import { digiLockerDocumentController } from '@/controllers/digilocker-document.controller';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
router.use(authMiddleware);

router.get('/', asyncHandler(digiLockerDocumentController.list.bind(digiLockerDocumentController)));
router.post('/', validateBody(digilockerDocumentCreateSchema), asyncHandler(digiLockerDocumentController.create.bind(digiLockerDocumentController)));
router.patch('/:id', validateParams(digilockerDocumentIdParamsSchema), validateBody(digilockerDocumentUpdateSchema), asyncHandler(digiLockerDocumentController.update.bind(digiLockerDocumentController)));
router.delete('/:id', validateParams(digilockerDocumentIdParamsSchema), asyncHandler(digiLockerDocumentController.remove.bind(digiLockerDocumentController)));

export { router as digiLockerDocumentRoutes };