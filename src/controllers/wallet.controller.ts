import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { WalletService } from '../services/wallet.service';

const walletService = new WalletService();

export class WalletController {
  async getWallet(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const wallet = await walletService.getWalletByUserId(userId);
      res.status(200).json({
        success: true,
        message: 'Wallet retrieved successfully',
        data: wallet,
      });
    } catch (error) {
      logger.error('Error getting wallet:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getWalletBalance(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const balance = await walletService.getWalletBalance(userId);
      res.status(200).json({
        success: true,
        message: 'Wallet balance retrieved successfully',
        data: balance,
      });
    } catch (error) {
      logger.error('Error getting wallet balance:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getTransactions(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const {
        page = 1,
        limit = 20,
        transactionType,
        referenceType,
        dateFrom,
        dateTo,
      } = req.query;

      const filters = {
        transactionType: transactionType as string,
        referenceType: referenceType as string,
        dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo: dateTo ? new Date(dateTo as string) : undefined,
      };

      const result = await walletService.getWalletTransactions(
        userId,
        filters,
        parseInt(page as string),
        parseInt(limit as string)
      );

      res.status(200).json({
        success: true,
        message: 'Wallet transactions retrieved successfully',
        data: result,
      });
    } catch (error) {
      logger.error('Error getting wallet transactions:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async addMoney(req: Request, res: Response): Promise<void> {
    try {

      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { amount, description, cashfreeTransactionId } = req.body;

      const transaction = await walletService.addFunds(userId, {
        transactionType: 'credit',
        amount: parseFloat(amount),
        referenceType: 'deposit',
        description,
        cashfreeTransactionId,
      });

      res.status(201).json({
        success: true,
        message: 'Money added successfully',
        data: transaction,
      });
    } catch (error) {
      logger.error('Error adding money:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async withdrawMoney(req: Request, res: Response): Promise<void> {
    try {

      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { amount, description } = req.body;

      const transaction = await walletService.deductFunds(userId, {
        transactionType: 'withdrawal',
        amount: parseFloat(amount),
        referenceType: 'withdrawal',
        description,
      });

      res.status(201).json({
        success: true,
        message: 'Money withdrawn successfully',
        data: transaction,
      });
    } catch (err) {
      logger.error('Error withdrawing money:', err);
      const error = err as any;
      if (error && error.message === 'Insufficient balance') {
        res.status(400).json({ error: 'Insufficient balance' });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async transferFunds(req: Request, res: Response): Promise<void> {
    try {

      const fromUserId = req.user?.id;
      if (!fromUserId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { toUserId, amount, description } = req.body;

      const result = await walletService.transferFunds(
        fromUserId,
        toUserId,
        parseFloat(amount),
        description
      );

      res.status(201).json({
        success: true,
        message: 'Funds transferred successfully',
        data: result,
      });
    } catch (err) {
      logger.error('Error transferring funds:', err);
      const error = err as any;
      if (error && error.message === 'Insufficient balance') {
        res.status(400).json({ error: 'Insufficient balance' });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async lockAmount(req: Request, res: Response): Promise<void> {
    try {

      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { amount, reason, lockReason, referenceId, lockedUntil } = req.body;

      const lockedAmount = await walletService.lockAmount(userId, {
        amount: parseFloat(amount),
        reason,
        lockReason,
        referenceId,
        lockedUntil: lockedUntil ? new Date(lockedUntil) : undefined,
      });

      res.status(201).json({
        success: true,
        message: 'Amount locked successfully',
        data: lockedAmount,
      });
    } catch (err) {
      logger.error('Error locking amount:', err);
      const error = err as any;
      if (error && error.message === 'Insufficient balance to lock') {
        res.status(400).json({ error: 'Insufficient balance to lock' });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async releaseLockedAmount(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const lockedAmount = await walletService.releaseLockedAmount(id);
      res.status(200).json({
        success: true,
        message: 'Locked amount released successfully',
        data: lockedAmount,
      });
    } catch (error) {
      logger.error('Error releasing locked amount:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getWalletAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { dateFrom, dateTo } = req.query;

      const analytics = await walletService.getWalletAnalytics(
        userId,
        dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo ? new Date(dateTo as string) : undefined
      );

      res.status(200).json({
        success: true,
        message: 'Wallet analytics retrieved successfully',
        data: analytics,
      });
    } catch (error) {
      logger.error('Error getting wallet analytics:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}