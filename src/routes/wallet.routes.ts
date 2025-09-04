import { Router } from 'express';
import { WalletController } from '@/controllers/wallet.controller';
import { authMiddleware } from '../middleware/auth-middleware';
import { validatePagination } from '../middleware/validation-middleware';
import { asyncHandler } from '@/middleware/error-handler';

const router = Router();
const walletController = new WalletController();

router.use(authMiddleware);

router.get('/', asyncHandler(walletController.getWallet.bind(walletController)));
router.get('/transactions', validatePagination, asyncHandler(walletController.getTransactions.bind(walletController)));
router.post('/add-money', asyncHandler(walletController.addMoney.bind(walletController)));
router.post('/withdraw', asyncHandler(walletController.withdrawMoney.bind(walletController)));

export { router as walletRoutes };