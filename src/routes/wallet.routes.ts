import { Router } from 'express';
import { WalletController } from '@/controllers/wallet.controller';
import { authMiddleware } from '../middleware/authentication.middleware';
import { validateQuery } from '@/middleware/zod-validate';
import { paginationQuerySchema } from '@/validation/schemas';
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
router.get('/transactions', validateQuery(paginationQuerySchema), asyncHandler(walletController.getTransactions.bind(walletController)));
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

/**
 * @openapi
 * /api/v1/wallet/balance:
 *   get:
 *     summary: Get wallet balance
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Balance retrieved
 */
router.get('/balance', asyncHandler(walletController.getWalletBalance.bind(walletController)));

/**
 * @openapi
 * /api/v1/wallet/analytics:
 *   get:
 *     summary: Get wallet analytics
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Analytics retrieved
 */
router.get('/analytics', asyncHandler(walletController.getWalletAnalytics.bind(walletController)));

/**
 * @openapi
 * /api/v1/wallet/bank-accounts:
 *   get:
 *     summary: Get bank accounts
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bank accounts retrieved
 */
router.get('/bank-accounts', asyncHandler(walletController.getBankAccounts.bind(walletController)));

/**
 * @openapi
 * /api/v1/wallet/bank-accounts:
 *   post:
 *     summary: Add bank account
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
 *       201:
 *         description: Bank account added
 */
router.post('/bank-accounts', asyncHandler(walletController.addBankAccount.bind(walletController)));

/**
 * @openapi
 * /api/v1/wallet/limits:
 *   get:
 *     summary: Get wallet limits
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Limits retrieved
 */
router.get('/limits', asyncHandler(walletController.getWalletLimits.bind(walletController)));

/**
 * @openapi
 * /api/v1/wallet/limits:
 *   put:
 *     summary: Update wallet limits
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
 *         description: Limits updated
 */
router.put('/limits', asyncHandler(walletController.updateWalletLimits.bind(walletController)));

/**
 * @openapi
 * /api/v1/wallet/history:
 *   get:
 *     summary: Get wallet history
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: History retrieved
 */
router.get('/history', asyncHandler(walletController.getWalletHistory.bind(walletController)));

/**
 * @openapi
 * /api/v1/wallet/locked-amounts:
 *   get:
 *     summary: Get locked amounts
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Locked amounts retrieved
 */
router.get('/locked-amounts', asyncHandler(walletController.getLockedAmounts.bind(walletController)));

/**
 * @openapi
 * /api/v1/wallet/transfer:
 *   post:
 *     summary: Transfer funds
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
 *       201:
 *         description: Funds transferred
 */
router.post('/transfer', asyncHandler(walletController.transferFunds.bind(walletController)));

/**
 * @openapi
 * /api/v1/wallet/lock-amount:
 *   post:
 *     summary: Lock amount
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
 *       201:
 *         description: Amount locked
 */
router.post('/lock-amount', asyncHandler(walletController.lockAmount.bind(walletController)));

/**
 * @openapi
 * /api/v1/wallet/release-locked-amount/{id}:
 *   post:
 *     summary: Release locked amount
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Amount released
 */
router.post('/release-locked-amount/:id', asyncHandler(walletController.releaseLockedAmount.bind(walletController)));

export { router as walletRoutes };