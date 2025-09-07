import { Router } from 'express';
import { notificationBatchController } from '@/controllers/notification-batch.controller';
import { validateBody, validateQuery, validateParams } from '@/middleware/zod-validate';
import { notificationBatchCreateSchema, notificationBatchIdParamsSchema, notificationBatchListQuerySchema } from '@/validation/schemas';

const router = Router();

router.post('/', validateBody(notificationBatchCreateSchema), (req, res) => notificationBatchController.create(req, res));
router.get('/', validateQuery(notificationBatchListQuerySchema), (req, res) => notificationBatchController.list(req, res));
router.get('/:id', validateParams(notificationBatchIdParamsSchema), (req, res) => notificationBatchController.get(req, res));
router.get('/:id/progress', validateParams(notificationBatchIdParamsSchema), (req, res) => notificationBatchController.progress(req, res));
router.post('/process', (req, res) => notificationBatchController.processQueue(req, res));
router.post('/:id/cancel', validateParams(notificationBatchIdParamsSchema), (req, res) => notificationBatchController.cancel(req, res));
router.post('/:id/retry-failed', validateParams(notificationBatchIdParamsSchema), (req, res) => notificationBatchController.retryFailed(req, res));

export default router;
