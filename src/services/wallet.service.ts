import { PrismaClient, Wallet, WalletTransaction, LockedAmount } from '@prisma/client';
import { BaseService } from './base.service';
import { logger } from '../utils/logger';

export interface CreateWalletTransactionData {
  transactionType: 'credit' | 'debit' | 'refund' | 'withdrawal' | 'deposit';
  amount: number;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  cashfreeTransactionId?: string;
}

export interface LockAmountData {
  amount: number;
  reason: string;
  lockReason: string;
  referenceId?: string;
  lockedUntil?: Date;
}

export interface WalletFilters {
  userId?: string;
  transactionType?: string;
  referenceType?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export class WalletService extends BaseService {
  constructor() {
    super();
  }

  async createWallet(userId: string): Promise<Wallet> {
    try {
      const wallet = await this.prisma.wallet.create({
        data: {
          userId,
          availableBalance: 0,
          lockedBalance: 0,
          negativeBalance: 0,
        },
      });

      logger.info(`Wallet created for user: ${userId}`);
      return wallet;
    } catch (error) {
      logger.error('Error creating wallet:', error);
      throw error;
    }
  }

  async getWalletByUserId(userId: string): Promise<Wallet | null> {
    try {
      let wallet = await this.prisma.wallet.findUnique({
        where: { userId },
        include: {
          transactions: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
          lockedAmounts: {
            where: { status: 'active' },
          },
        },
      });

      // Create wallet if it doesn't exist
      if (!wallet) {
        await this.createWallet(userId);
        wallet = await this.prisma.wallet.findUnique({
          where: { userId },
          include: {
            transactions: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
            lockedAmounts: {
              where: { status: 'active' },
            },
          },
        });
      }

      return wallet;
    } catch (error) {
      logger.error('Error fetching wallet:', error);
      throw error;
    }
  }

  async addFunds(userId: string, data: CreateWalletTransactionData): Promise<WalletTransaction> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.findUnique({
          where: { userId },
        });

        if (!wallet) {
          throw new Error('Wallet not found');
        }

        const newBalance = wallet.availableBalance.toNumber() + data.amount;

        // Update wallet balance
        await tx.wallet.update({
          where: { userId },
          data: {
            availableBalance: newBalance,
          },
        });

        // Create transaction record
        const transaction = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            transactionType: data.transactionType,
            amount: data.amount,
            balanceAfter: newBalance,
            referenceType: data.referenceType,
            referenceId: data.referenceId,
            description: data.description,
            cashfreeTransactionId: data.cashfreeTransactionId,
          },
        });

        logger.info(`Funds added to wallet: ${userId}, amount: ${data.amount}`);
        return transaction;
      });
    } catch (error) {
      logger.error('Error adding funds:', error);
      throw error;
    }
  }

  async deductFunds(userId: string, data: CreateWalletTransactionData): Promise<WalletTransaction> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.findUnique({
          where: { userId },
        });

        if (!wallet) {
          throw new Error('Wallet not found');
        }

        const currentBalance = wallet.availableBalance.toNumber();
        if (currentBalance < data.amount) {
          throw new Error('Insufficient balance');
        }

        const newBalance = currentBalance - data.amount;

        // Update wallet balance
        await tx.wallet.update({
          where: { userId },
          data: {
            availableBalance: newBalance,
          },
        });

        // Create transaction record
        const transaction = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            transactionType: data.transactionType,
            amount: -data.amount, // Negative for debit
            balanceAfter: newBalance,
            referenceType: data.referenceType,
            referenceId: data.referenceId,
            description: data.description,
            cashfreeTransactionId: data.cashfreeTransactionId,
          },
        });

        logger.info(`Funds deducted from wallet: ${userId}, amount: ${data.amount}`);
        return transaction;
      });
    } catch (error) {
      logger.error('Error deducting funds:', error);
      throw error;
    }
  }

  async lockAmount(userId: string, data: LockAmountData): Promise<LockedAmount> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.findUnique({
          where: { userId },
        });

        if (!wallet) {
          throw new Error('Wallet not found');
        }

        const currentBalance = wallet.availableBalance.toNumber();
        if (currentBalance < data.amount) {
          throw new Error('Insufficient balance to lock');
        }

        // Update wallet balances
        await tx.wallet.update({
          where: { userId },
          data: {
            availableBalance: currentBalance - data.amount,
            lockedBalance: wallet.lockedBalance.toNumber() + data.amount,
          },
        });

        // Create locked amount record
        const lockedAmount = await tx.lockedAmount.create({
          data: {
            walletId: wallet.id,
            amount: data.amount,
            reason: data.reason,
            lockReason: data.lockReason,
            referenceId: data.referenceId,
            lockedUntil: data.lockedUntil,
            status: 'active',
          },
        });

        logger.info(`Amount locked in wallet: ${userId}, amount: ${data.amount}`);
        return lockedAmount;
      });
    } catch (error) {
      logger.error('Error locking amount:', error);
      throw error;
    }
  }

  async releaseLockedAmount(lockedAmountId: string): Promise<LockedAmount> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const lockedAmount = await tx.lockedAmount.findUnique({
          where: { id: lockedAmountId },
          include: { wallet: true },
        });

        if (!lockedAmount || lockedAmount.status !== 'active') {
          throw new Error('Locked amount not found or already released');
        }

        const wallet = lockedAmount.wallet;
        const amount = lockedAmount.amount.toNumber();

        // Update wallet balances
        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            availableBalance: wallet.availableBalance.toNumber() + amount,
            lockedBalance: wallet.lockedBalance.toNumber() - amount,
          },
        });

        // Update locked amount status
        const updatedLockedAmount = await tx.lockedAmount.update({
          where: { id: lockedAmountId },
          data: {
            status: 'released',
            releasedAt: new Date(),
          },
        });

        logger.info(`Locked amount released: ${lockedAmountId}, amount: ${amount}`);
        return updatedLockedAmount;
      });
    } catch (error) {
      logger.error('Error releasing locked amount:', error);
      throw error;
    }
  }

  async getWalletTransactions(
    userId: string,
    filters: WalletFilters = {},
    page = 1,
    limit = 20
  ): Promise<{
    transactions: WalletTransaction[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const wallet = await this.getWalletByUserId(userId);
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      const where: any = { walletId: wallet.id };

      if (filters.transactionType) where.transactionType = filters.transactionType;
      if (filters.referenceType) where.referenceType = filters.referenceType;

      if (filters.dateFrom || filters.dateTo) {
        where.createdAt = {};
        if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
        if (filters.dateTo) where.createdAt.lte = filters.dateTo;
      }

      const [transactions, total] = await Promise.all([
        this.prisma.walletTransaction.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.walletTransaction.count({ where }),
      ]);

      return {
        transactions,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error('Error fetching wallet transactions:', error);
      throw error;
    }
  }

  async getWalletBalance(userId: string): Promise<{
    availableBalance: number;
    lockedBalance: number;
    totalBalance: number;
  }> {
    try {
      const wallet = await this.getWalletByUserId(userId);
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      const availableBalance = wallet.availableBalance.toNumber();
      const lockedBalance = wallet.lockedBalance.toNumber();
      const totalBalance = availableBalance + lockedBalance;

      return {
        availableBalance,
        lockedBalance,
        totalBalance,
      };
    } catch (error) {
      logger.error('Error fetching wallet balance:', error);
      throw error;
    }
  }

  async transferFunds(
    fromUserId: string,
    toUserId: string,
    amount: number,
    description?: string
  ): Promise<{ fromTransaction: WalletTransaction; toTransaction: WalletTransaction }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Deduct from sender
        const fromTransaction = await this.deductFunds(fromUserId, {
          transactionType: 'debit',
          amount,
          referenceType: 'transfer',
          referenceId: toUserId,
          description: description || `Transfer to user ${toUserId}`,
        });

        // Add to receiver
        const toTransaction = await this.addFunds(toUserId, {
          transactionType: 'credit',
          amount,
          referenceType: 'transfer',
          referenceId: fromUserId,
          description: description || `Transfer from user ${fromUserId}`,
        });

        logger.info(`Funds transferred: ${fromUserId} -> ${toUserId}, amount: ${amount}`);
        return { fromTransaction, toTransaction };
      });
    } catch (error) {
      logger.error('Error transferring funds:', error);
      throw error;
    }
  }

  async getWalletAnalytics(userId: string, dateFrom?: Date, dateTo?: Date): Promise<{
    totalCredits: number;
    totalDebits: number;
    transactionCount: number;
    averageTransactionAmount: number;
    topTransactionTypes: Array<{ type: string; count: number; amount: number }>;
  }> {
    try {
      const wallet = await this.getWalletByUserId(userId);
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      const where: any = { walletId: wallet.id };
      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = dateFrom;
        if (dateTo) where.createdAt.lte = dateTo;
      }

      const [
        creditSum,
        debitSum,
        transactionCount,
        transactionTypes,
      ] = await Promise.all([
        this.prisma.walletTransaction.aggregate({
          where: { ...where, amount: { gt: 0 } },
          _sum: { amount: true },
        }),
        this.prisma.walletTransaction.aggregate({
          where: { ...where, amount: { lt: 0 } },
          _sum: { amount: true },
        }),
        this.prisma.walletTransaction.count({ where }),
        this.prisma.walletTransaction.groupBy({
          by: ['transactionType'],
          where,
          _count: true,
          _sum: { amount: true },
        }),
      ]);

      const totalCredits = creditSum._sum.amount?.toNumber() || 0;
      const totalDebits = Math.abs(debitSum._sum.amount?.toNumber() || 0);
      const averageTransactionAmount = transactionCount > 0 ? (totalCredits + totalDebits) / transactionCount : 0;

      const topTransactionTypes = transactionTypes.map(tt => ({
        type: tt.transactionType,
        count: tt._count,
        amount: tt._sum.amount?.toNumber() || 0,
      }));

      return {
        totalCredits,
        totalDebits,
        transactionCount,
        averageTransactionAmount,
        topTransactionTypes,
      };
    } catch (error) {
      logger.error('Error fetching wallet analytics:', error);
      throw error;
    }
  }
}