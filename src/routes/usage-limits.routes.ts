import { Router } from 'express';
import { UsageLimitsController } from '../controllers/usage-limits.controller';
import { authenticateToken } from '../middleware/authentication.middleware';

const router = Router();
const usageLimitsController = new UsageLimitsController();

// Get current user's usage summary
router.get('/summary', authenticateToken, (req, res) => usageLimitsController.getUsageSummary(req, res));

// Check if user can post an RFQ
router.get('/rfq/can-post', authenticateToken, (req, res) => usageLimitsController.canPostRfq(req, res));

// Check if user can respond to an RFQ
router.get('/rfq/can-respond', authenticateToken, (req, res) => usageLimitsController.canRespondToRfq(req, res));

// Get user's usage history
router.get('/history', authenticateToken, (req, res) => usageLimitsController.getUsageHistory(req, res));

export default router;