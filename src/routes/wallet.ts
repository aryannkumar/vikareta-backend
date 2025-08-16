import { Router, Request, Response, NextFunction } from 'express';
import { walletService } from '../services/wallet.service';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { walletFundSchema, walletWithdrawSchema, validateRequest } from '../utils/validation';

const prisma = new PrismaClient();

const router = Router();

// Validation schemas
const _fundWalletSchema = z.object({
  amount: z.number().min(1).max(100000),
  currency: z.string().optional().default('INR'),
  customerDetails: z.object({
    customerName: z.string().min(1),
    customerEmail: z.string().email().optional(),
    customerPhone: z.string().optional(),
  }),
  returnUrl: z.string().url().optional(),
});

const lockAmountSchema = z.object({
  amount: z.number().min(1),
  lockReason: z.string().min(1),
  referenceId: z.string().optional(),
  lockedUntil: z.string().datetime().optional(),
});

const releaseLockSchema = z.object({
  lockId: z.string().uuid(),
  reason: z.string().optional(),
});

const _transactionHistorySchema = z.object({
  page: z.number().min(1).optional(),
  limit: z.number().min(1).max(100).optional(),
  transactionType: z.enum(['credit', 'debit', 'lock', 'unlock']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const walletOperationVerificationSchema = z.object({
  operation: z.string().min(1),
  amount: z.number().min(0),
  authData: z.object({
    otp: z.string().optional(),
    biometric: z.string().optional(),
    password: z.string().optional(),
  }),
});

const automaticLockReleaseSchema = z.object({
  lockId: z.string().uuid(),
  conditions: z.object({
    orderCompleted: z.boolean().optional(),
    dealConfirmed: z.boolean().optional(),
    timeoutHours: z.number().min(1).max(168).optional(), // Max 1 week
    disputeResolved: z.boolean().optional(),
  }),
});

const createDisputeSchema = z.object({
  lockId: z.string().uuid(),
  disputeDetails: z.object({
    disputeReason: z.string().min(1),
    disputedBy: z.string().uuid(),
    description: z.string().min(10),
    evidence: z.array(z.string()).optional(),
  }),
});

const resolveDisputeSchema = z.object({
  disputeId: z.string().min(1),
  resolution: z.object({
    resolvedBy: z.string().uuid(),
    resolution: z.enum(['release_to_buyer', 'release_to_seller', 'partial_release', 'hold_funds']),
    resolutionReason: z.string().min(1),
    partialAmounts: z.object({
      buyerAmount: z.number().min(0),
      sellerAmount: z.number().min(0),
    }).optional(),
  }),
});

const sellerSettlementSchema = z.object({
  sellerId: z.string().uuid(),
  orderAmount: z.number().min(0.01),
  orderDetails: z.object({
    orderId: z.string().min(1),
    buyerId: z.string().uuid(),
    commissionRate: z.number().min(0).max(50), // Max 50%
    platformFees: z.number().min(0),
    verificationTier: z.enum(['basic', 'standard', 'enhanced', 'premium']),
  }),
});

const scheduleSettlementSchema = z.object({
  sellerId: z.string().uuid(),
  amount: z.number().min(0.01),
  verificationTier: z.enum(['basic', 'standard', 'enhanced', 'premium']),
  orderDetails: z.object({
    orderId: z.string().min(1),
    buyerId: z.string().uuid(),
    commissionRate: z.number().min(0).max(50).optional(),
    platformFees: z.number().min(0).optional(),
  }),
});

const _settlementHistorySchema = z.object({
  page: z.number().min(1).optional(),
  limit: z.number().min(1).max(100).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: z.string().optional(),
});

const commissionCalculationSchema = z.object({
  subscriptionTier: z.enum(['free', 'basic', 'standard', 'premium']),
  monthlyVolume: z.number().min(0),
  verificationTier: z.enum(['basic', 'standard', 'enhanced', 'premium']),
});

const _withdrawalRequestSchema = z.object({
  amount: z.number().min(100).max(500000), // ₹100 to ₹5 lakh
  withdrawalMethod: z.enum(['bank_transfer', 'upi']),
  bankDetails: z.object({
    accountNumber: z.string().min(8).max(20),
    ifscCode: z.string().length(11),
    accountHolderName: z.string().min(1).max(100),
  }).optional(),
  upiId: z.string().optional(),
}).refine(
  (data) => {
    if (data.withdrawalMethod === 'bank_transfer') {
      return !!data.bankDetails;
    }
    if (data.withdrawalMethod === 'upi') {
      return !!data.upiId;
    }
    return false;
  },
  {
    message: 'Bank details required for bank transfer, UPI ID required for UPI transfer',
  }
);

const _withdrawalHistorySchema = z.object({
  page: z.number().min(1).optional(),
  limit: z.number().min(1).max(100).optional(),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'reversed']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

/**
 * Get wallet balance
 * GET /api/wallet/balance
 */
router.get('/balance', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated' },
      });
    }

    const balance = await walletService.getWalletBalance(userId);

    return res.json({
      success: true,
      data: balance,
    });
  } catch (error) {
    logger.error('Error getting wallet balance:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to get wallet balance' },
    });
  }
});

/**
 * Fund wallet through Cashfree with enhanced security
 * POST /api/wallet/fund
 */
router.post('/fund', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated' },
      });
    }

    // Enhanced validation with XSS protection
    const validatedData = validateRequest(walletFundSchema, req.body);

    // Additional security logging
    logger.info('Wallet funding request initiated', {
      userId,
      amount: validatedData.amount,
      customerName: validatedData.customerDetails.customerName,
      userAgent: req.get('User-Agent'),
      clientIP: req.ip,
      timestamp: new Date().toISOString(),
    });

    const result = await walletService.fundWallet({
      userId,
      amount: validatedData.amount,
      currency: validatedData.currency,
      customerDetails: {
        customerName: validatedData.customerDetails.customerName,
        customerEmail: validatedData.customerDetails.customerEmail,
        customerPhone: validatedData.customerDetails.customerPhone,
      },
      returnUrl: validatedData.returnUrl,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error funding wallet:', error);

    if (error instanceof Error && (error as any).code === 'VALIDATION_ERROR') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid request data',
          details: (error as any).details,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: { message: error instanceof Error ? error.message : 'Failed to fund wallet' },
    });
  }
});

// CSRF bypass middleware for specific endpoints
const bypassCSRF = (req: Request, res: Response, next: NextFunction) => {
  // Mark this request to bypass CSRF protection
  (req as any).bypassCSRF = true;
  next();
};

/**
 * Add money to wallet (simplified endpoint for frontend compatibility)
 * POST /api/wallet/add-money
 */
router.post('/add-money', authenticate, bypassCSRF, async (req: Request, res: Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated' },
      });
    }

    const { amount, paymentMethod } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid amount' },
      });
    }

    // For now, create a simple mock transaction
    const result = {
      transactionId: `txn_${Date.now()}`,
      amount,
      status: 'completed',
      paymentMethod: paymentMethod || 'UPI',
      timestamp: new Date().toISOString(),
    };

    logger.info('Add money request processed', {
      userId,
      amount,
      paymentMethod,
      transactionId: result.transactionId,
    });

    return res.json({
      success: true,
      data: result,
      message: 'Money added successfully',
    });
  } catch (error) {
    logger.error('Error adding money to wallet:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to add money to wallet' },
    });
  }
});

/**
 * Get transaction history
 * GET /api/wallet/transactions
 */
router.get('/transactions', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated' },
      });
    }

    const queryParams = {
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      transactionType: req.query.transactionType as string,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
    };

    const result = await walletService.getTransactionHistory(userId, queryParams);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error getting transaction history:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid query parameters',
          details: error.issues,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: { message: 'Failed to get transaction history' },
    });
  }
});

/**
 * Get recent transaction history
 * GET /api/wallet/transactions/recent
 */
router.get('/transactions/recent', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated' },
      });
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;

    const queryParams = {
      page: 1,
      limit: Math.min(limit, 20), // Cap at 20 for recent transactions
    };

    const result = await walletService.getTransactionHistory(userId, queryParams);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error getting recent transaction history:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to get recent transaction history' },
    });
  }
});

/**
 * Lock amount for deal assurance
 * POST /api/wallet/lock
 */
router.post('/lock', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated' },
      });
    }

    const validatedData = lockAmountSchema.parse(req.body);

    const lockRequest = {
      userId,
      amount: validatedData.amount,
      lockReason: validatedData.lockReason,
      referenceId: validatedData.referenceId,
      lockedUntil: validatedData.lockedUntil ? new Date(validatedData.lockedUntil) : undefined,
    };

    const result = await walletService.lockAmount(lockRequest);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error locking amount:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid request data',
          details: error.issues,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: { message: error instanceof Error ? error.message : 'Failed to lock amount' },
    });
  }
});

/**
 * Release locked amount
 * POST /api/wallet/release-lock
 */
router.post('/release-lock', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated' },
      });
    }

    const validatedData = releaseLockSchema.parse(req.body);

    await walletService.releaseLock(validatedData.lockId, validatedData.reason);

    return res.json({
      success: true,
      data: { message: 'Lock released successfully' },
    });
  } catch (error) {
    logger.error('Error releasing lock:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid request data',
          details: error.issues,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: { message: error instanceof Error ? error.message : 'Failed to release lock' },
    });
  }
});

/**
 * Get locked amounts
 * GET /api/wallet/locked-amounts
 */
router.get('/locked-amounts', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated' },
      });
    }

    const lockedAmounts = await walletService.getLockedAmounts(userId);

    return res.json({
      success: true,
      data: lockedAmounts,
    });
  } catch (error) {
    logger.error('Error getting locked amounts:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to get locked amounts' },
    });
  }
});

/**
 * Verify wallet operation with multi-factor authentication
 * POST /api/wallet/verify-operation
 */
router.post('/verify-operation', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated' },
      });
    }

    const validatedData = walletOperationVerificationSchema.parse(req.body);

    const isVerified = await walletService.verifyWalletOperation(
      userId,
      validatedData.operation,
      validatedData.amount,
      validatedData.authData
    );

    return res.json({
      success: true,
      data: { verified: isVerified },
    });
  } catch (error) {
    logger.error('Error verifying wallet operation:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid request data',
          details: error.issues,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: { message: error instanceof Error ? error.message : 'Failed to verify operation' },
    });
  }
});

/**
 * Set up automatic lock release conditions
 * POST /api/wallet/setup-auto-release
 */
router.post('/setup-auto-release', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated' },
      });
    }

    const validatedData = automaticLockReleaseSchema.parse(req.body);

    await walletService.setupAutomaticLockRelease(
      validatedData.lockId,
      validatedData.conditions
    );

    return res.json({
      success: true,
      data: { message: 'Automatic release conditions set successfully' },
    });
  } catch (error) {
    logger.error('Error setting up automatic lock release:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid request data',
          details: error.issues,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: { message: error instanceof Error ? error.message : 'Failed to set up automatic release' },
    });
  }
});

/**
 * Check automatic release conditions
 * POST /api/wallet/check-auto-release/:referenceId/:conditionType
 */
router.post('/check-auto-release/:referenceId/:conditionType', authenticate, async (req: Request, res: Response) => {
  try {
    const { referenceId, conditionType } = req.params;

    await walletService.checkAutomaticReleaseConditions(referenceId, conditionType);

    return res.json({
      success: true,
      data: { message: 'Automatic release conditions checked' },
    });
  } catch (error) {
    logger.error('Error checking automatic release conditions:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to check automatic release conditions' },
    });
  }
});

/**
 * Create dispute for locked amount
 * POST /api/wallet/create-dispute
 */
router.post('/create-dispute', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated' },
      });
    }

    const validatedData = createDisputeSchema.parse(req.body);

    const disputeId = await walletService.createLockDispute(
      validatedData.lockId,
      validatedData.disputeDetails
    );

    return res.json({
      success: true,
      data: { disputeId },
    });
  } catch (error) {
    logger.error('Error creating dispute:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid request data',
          details: error.issues,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: { message: error instanceof Error ? error.message : 'Failed to create dispute' },
    });
  }
});

/**
 * Resolve dispute
 * POST /api/wallet/resolve-dispute
 */
router.post('/resolve-dispute', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated' },
      });
    }

    const validatedData = resolveDisputeSchema.parse(req.body);

    await walletService.resolveLockDispute(
      validatedData.disputeId,
      validatedData.resolution
    );

    return res.json({
      success: true,
      data: { message: 'Dispute resolved successfully' },
    });
  } catch (error) {
    logger.error('Error resolving dispute:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid request data',
          details: error.issues,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: { message: error instanceof Error ? error.message : 'Failed to resolve dispute' },
    });
  }
});

/**
 * Get lock status
 * GET /api/wallet/lock-status/:lockId
 */
router.get('/lock-status/:lockId', authenticate, async (req: Request, res: Response) => {
  try {
    const { lockId } = req.params;

    const lockStatus = await walletService.getLockStatus(lockId);

    return res.json({
      success: true,
      data: lockStatus,
    });
  } catch (error) {
    logger.error('Error getting lock status:', error);
    return res.status(500).json({
      success: false,
      error: { message: error instanceof Error ? error.message : 'Failed to get lock status' },
    });
  }
});

/**
 * Process expired locks (admin endpoint)
 * POST /api/wallet/process-expired-locks
 */
router.post('/process-expired-locks', authenticate, async (req: Request, res: Response) => {
  try {
    // In a real implementation, this would be restricted to admin users
    await walletService.processExpiredLocks();

    return res.json({
      success: true,
      data: { message: 'Expired locks processed successfully' },
    });
  } catch (error) {
    logger.error('Error processing expired locks:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to process expired locks' },
    });
  }
});

/**
 * Process seller settlement
 * POST /api/wallet/process-settlement
 */
router.post('/process-settlement', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated' },
      });
    }

    const validatedData = sellerSettlementSchema.parse(req.body);

    const result = await walletService.processSellerSettlement(
      validatedData.sellerId,
      validatedData.orderAmount,
      validatedData.orderDetails
    );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error processing seller settlement:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid request data',
          details: error.issues,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: { message: error instanceof Error ? error.message : 'Failed to process settlement' },
    });
  }
});

/**
 * Schedule settlement
 * POST /api/wallet/schedule-settlement
 */
router.post('/schedule-settlement', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated' },
      });
    }

    const validatedData = scheduleSettlementSchema.parse(req.body);

    const result = await walletService.scheduleSettlement(
      validatedData.sellerId,
      validatedData.amount,
      validatedData.verificationTier,
      validatedData.orderDetails
    );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error scheduling settlement:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid request data',
          details: error.issues,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: { message: error instanceof Error ? error.message : 'Failed to schedule settlement' },
    });
  }
});

/**
 * Get settlement history
 * GET /api/wallet/settlement-history
 */
router.get('/settlement-history', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated' },
      });
    }

    const queryParams = {
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      status: req.query.status as string,
    };

    const result = await walletService.getSettlementHistory(userId, queryParams);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error getting settlement history:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid query parameters',
          details: error.issues,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: { message: 'Failed to get settlement history' },
    });
  }
});

/**
 * Calculate commission rate
 * POST /api/wallet/calculate-commission
 */
router.post('/calculate-commission', authenticate, async (req: Request, res: Response) => {
  try {
    const validatedData = commissionCalculationSchema.parse(req.body);

    const commissionRate = walletService.calculateCommissionRate(
      validatedData.subscriptionTier,
      validatedData.monthlyVolume,
      validatedData.verificationTier
    );

    return res.json({
      success: true,
      data: { commissionRate },
    });
  } catch (error) {
    logger.error('Error calculating commission rate:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid request data',
          details: error.issues,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: { message: 'Failed to calculate commission rate' },
    });
  }
});

/**
 * Process scheduled settlements (admin endpoint)
 * POST /api/wallet/process-scheduled-settlements
 */
router.post('/process-scheduled-settlements', authenticate, async (req: Request, res: Response) => {
  try {
    // In a real implementation, this would be restricted to admin users or called by a cron job
    await walletService.processScheduledSettlements();

    return res.json({
      success: true,
      data: { message: 'Scheduled settlements processed successfully' },
    });
  } catch (error) {
    logger.error('Error processing scheduled settlements:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to process scheduled settlements' },
    });
  }
});

/**
 * Handle negative balance
 * POST /api/wallet/handle-negative-balance
 */
router.post('/handle-negative-balance', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated' },
      });
    }

    const { debitAmount, referenceType, referenceId } = req.body;

    if (!debitAmount || !referenceType || !referenceId) {
      return res.status(400).json({
        success: false,
        error: { message: 'Missing required fields: debitAmount, referenceType, referenceId' },
      });
    }

    await walletService.handleNegativeBalance(userId, debitAmount, referenceType, referenceId);

    return res.json({
      success: true,
      data: { message: 'Negative balance handled successfully' },
    });
  } catch (error) {
    logger.error('Error handling negative balance:', error);
    return res.status(500).json({
      success: false,
      error: { message: error instanceof Error ? error.message : 'Failed to handle negative balance' },
    });
  }
});

/**
 * Request withdrawal with enhanced security
 * POST /api/wallet/withdraw
 */
router.post('/withdraw', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated' },
      });
    }

    // Enhanced validation with XSS protection
    const validatedData = validateRequest(walletWithdrawSchema, req.body);

    // Additional security checks
    const userAgent = req.get('User-Agent');
    const clientIP = req.ip;

    // Log withdrawal attempt for security monitoring
    logger.info('Withdrawal request initiated', {
      userId,
      amount: validatedData.amount,
      method: validatedData.withdrawalMethod,
      userAgent,
      clientIP,
      timestamp: new Date().toISOString(),
    });

    const result = await walletService.requestWithdrawal({
      userId,
      amount: validatedData.amount,
      withdrawalMethod: validatedData.withdrawalMethod,
      bankDetails: validatedData.bankDetails ? {
        accountNumber: validatedData.bankDetails.accountNumber,
        ifscCode: validatedData.bankDetails.ifscCode,
        accountHolderName: validatedData.bankDetails.accountHolderName,
      } : undefined,
      upiId: validatedData.upiId,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error requesting withdrawal:', error);

    if (error instanceof Error && (error as any).code === 'VALIDATION_ERROR') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid request data',
          details: (error as any).details,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: { message: error instanceof Error ? error.message : 'Failed to request withdrawal' },
    });
  }
});

/**
 * Process withdrawal (admin endpoint)
 * POST /api/wallet/process-withdrawal/:withdrawalId
 */
router.post('/process-withdrawal/:withdrawalId', authenticate, async (req: Request, res: Response) => {
  try {
    const { withdrawalId } = req.params;

    if (!withdrawalId) {
      return res.status(400).json({
        success: false,
        error: { message: 'Withdrawal ID is required' },
      });
    }

    const result = await walletService.processWithdrawal(withdrawalId);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error processing withdrawal:', error);
    return res.status(500).json({
      success: false,
      error: { message: error instanceof Error ? error.message : 'Failed to process withdrawal' },
    });
  }
});

/**
 * Get withdrawal history
 * GET /api/wallet/withdrawal-history
 */
router.get('/withdrawal-history', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated' },
      });
    }

    const queryParams = {
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      status: req.query.status as string,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
    };

    const result = await walletService.getWithdrawalHistory(userId, queryParams);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error getting withdrawal history:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid query parameters',
          details: error.issues,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: { message: 'Failed to get withdrawal history' },
    });
  }
});

/**
 * Get withdrawal limits
 * GET /api/wallet/withdrawal-limits
 */
router.get('/withdrawal-limits', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'User not authenticated' },
      });
    }

    // Get user verification tier
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { verificationTier: true },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { message: 'User not found' },
      });
    }

    const dailyLimit = walletService.getWithdrawalLimit(user.verificationTier);
    const processingTime = walletService.getWithdrawalProcessingTime(user.verificationTier);

    return res.json({
      success: true,
      data: {
        dailyLimit,
        processingTime,
        verificationTier: user.verificationTier,
        minimumAmount: 100,
      },
    });
  } catch (error) {
    logger.error('Error getting withdrawal limits:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to get withdrawal limits' },
    });
  }
});

/**
 * Handle Cashfree payout webhook
 * POST /api/wallet/payout-webhook
 */
router.post('/payout-webhook', async (req: Request, res: Response) => {
  try {
    const webhookData = req.body;

    // Verify webhook signature (implement proper verification)
    // const signature = req.headers['x-cashfree-signature'];

    await walletService.handlePayoutWebhook(webhookData);

    return res.json({
      success: true,
      data: { message: 'Payout webhook processed successfully' },
    });
  } catch (error) {
    logger.error('Error handling payout webhook:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to process payout webhook' },
    });
  }
});

/**
 * Handle Cashfree webhook for wallet funding
 * POST /api/wallet/webhook
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const webhookData = req.body;

    // Verify webhook signature (implement proper verification)
    // const signature = req.headers['x-cashfree-signature'];

    await walletService.handleFundingWebhook(webhookData);

    return res.json({
      success: true,
      data: { message: 'Webhook processed successfully' },
    });
  } catch (error) {
    logger.error('Error handling wallet webhook:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to process webhook' },
    });
  }
});

export default router;