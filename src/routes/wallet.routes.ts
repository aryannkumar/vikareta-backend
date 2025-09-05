import { Router } from 'express';
import { WalletController } from '@/controllers/wallet.controller';
import { authMiddleware } from '../middleware/auth-middleware';
import { validatePagination } from '../middleware/validation-middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const walletController = new WalletController();

router.use(authMiddleware);

/**
 * @openapi
 * /api/v1/wallet:
 *   get:
 *     summary: Get wallet summary for current user
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet summary
 */
router.get('/', asyncHandler(walletController.getWallet.bind(walletController)));
/**
 * @openapi
 * /api/v1/wallet/transactions:
 *   get:
 *     summary: Get wallet transactions
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Transactions
 */
router.get('/transactions', validatePagination, asyncHandler(walletController.getTransactions.bind(walletController)));
/**
 * @openapi
 * /api/v1/wallet/add-money:
 *   post:
 *     summary: Add money to wallet
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Added
 */
router.post('/add-money', asyncHandler(walletController.addMoney.bind(walletController)));
/**
 * @openapi
 * /api/v1/wallet/withdraw:
 *   post:
 *     summary: Withdraw money from wallet
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Withdrawn
 */
router.post('/withdraw', asyncHandler(walletController.withdrawMoney.bind(walletController)));

export { router as walletRoutes };