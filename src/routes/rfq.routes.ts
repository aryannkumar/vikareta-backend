import { Router } from 'express';
import { RfqController } from '@/controllers/rfq.controller';
import { authMiddleware } from '@/middleware/auth-middleware';
import { validatePagination, validateSort } from '@/middleware/validation-middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const rfqController = new RfqController();

// All routes require authentication
router.use(authMiddleware);

router.get('/', validatePagination, validateSort(['createdAt', 'budgetMax', 'expiresAt']), asyncHandler(rfqController.getRfqs.bind(rfqController)));
router.post('/', asyncHandler(rfqController.createRfq.bind(rfqController)));
router.get('/:id', asyncHandler(rfqController.getRfqById.bind(rfqController)));
router.put('/:id', asyncHandler(rfqController.updateRfq.bind(rfqController)));
router.delete('/:id', asyncHandler(rfqController.deleteRfq.bind(rfqController)));

export { router as rfqRoutes };