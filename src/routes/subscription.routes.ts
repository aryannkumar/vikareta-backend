import { Router } from 'express';
import { subscriptionController } from '@/controllers/subscription.controller';
import { authenticateToken } from '@/middleware/authentication.middleware';

const router = Router();

// All subscription routes require authentication
router.use(authenticateToken);

router.get('/current', (req, res) => subscriptionController.current(req, res));
router.get('/history', (req, res) => subscriptionController.history(req, res));
router.post('/', (req, res) => subscriptionController.create(req, res));
router.put('/:id', (req, res) => subscriptionController.upgrade(req, res));
router.post('/:id/cancel', (req, res) => subscriptionController.cancel(req, res));
router.post('/:id/reactivate', (req, res) => subscriptionController.reactivate(req, res));

export default router;
