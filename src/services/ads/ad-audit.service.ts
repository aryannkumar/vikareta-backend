import { PrismaClient } from '@prisma/client';
import { adLoggingService } from './ad-logging.service';
import { logger } from '../../utils/logger';
import crypto from 'crypto';

const prisma = new PrismaClient();

export interface AuditEntry {
  id: string;
  timestamp: Date;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  oldValues?: any;
  newValues?: any;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  checksum: string;
}

export interface FinancialTransaction {
  id: string;
  type: 'budget_lock' | 'budget_deduction' | 'budget_release' | 'revenue_share' | 'refund';
  amount: number;
  currency: string;
  userId: string;
  campaignId?: string;
  description: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  metadata?: any;
}

export class AdAuditService {
  // Campaign Audit Logging
  async auditCampaignCreation(campaignId: string, campaignData: any, userId: string, context: any) {
    await this.createAuditEntry({
      action: 'CAMPAIGN_CREATED',
      resourceType: 'campaign',
      resourceId: campaignId,
      userId,
      newValues: this.sanitizeData(campaignData),
      metadata: {
        budget: campaignData.budget,
        bidAmount: campaignData.bidAmount,
        adsCount: campaignData.ads?.length || 0,
      },
      ...context,
    });

    await adLoggingService.logCampaignCreated(campaignId, { userId, ...context });
  }

  async auditCampaignUpdate(campaignId: string, oldData: any, newData: any, userId: string, context: any) {
    const changes = this.calculateChanges(oldData, newData);
    
    await this.createAuditEntry({
      action: 'CAMPAIGN_UPDATED',
      resourceType: 'campaign',
      resourceId: campaignId,
      userId,
      oldValues: this.sanitizeData(oldData),
      newValues: this.sanitizeData(newData),
      metadata: {
        changedFields: Object.keys(changes),
        budgetChanged: 'budget' in changes,
        statusChanged: 'status' in changes,
      },
      ...context,
    });

    await adLoggingService.logCampaignUpdated(campaignId, changes, { userId, ...context });
  }

  async auditCampaignStatusChange(campaignId: string, oldStatus: string, newStatus: string, userId: string, reason?: string, context?: any) {
    await this.createAuditEntry({
      action: 'CAMPAIGN_STATUS_CHANGED',
      resourceType: 'campaign',
      resourceId: campaignId,
      userId,
      oldValues: { status: oldStatus },
      newValues: { status: newStatus },
      metadata: {
        reason,
        automated: !userId,
      },
      ...context,
    });

    await adLoggingService.logCampaignStatusChanged(campaignId, oldStatus, newStatus, { userId, ...context });
  }

  async auditCampaignDeletion(campaignId: string, campaignData: any, userId: string, context: any) {
    await this.createAuditEntry({
      action: 'CAMPAIGN_DELETED',
      resourceType: 'campaign',
      resourceId: campaignId,
      userId,
      oldValues: this.sanitizeData(campaignData),
      metadata: {
        budgetReleased: campaignData.budget - campaignData.spentAmount,
        wasActive: campaignData.status === 'active',
      },
      ...context,
    });
  }

  // Financial Transaction Audit Logging
  async auditBudgetLock(userId: string, campaignId: string, amount: number, lockId: string, context: any) {
    const transaction: FinancialTransaction = {
      id: lockId,
      type: 'budget_lock',
      amount,
      currency: 'USD',
      userId,
      campaignId,
      description: `Budget locked for campaign ${campaignId}`,
      status: 'completed',
      metadata: {
        lockReason: 'campaign_budget',
        campaignId,
      },
    };

    await this.auditFinancialTransaction(transaction, context);

    await this.createAuditEntry({
      action: 'BUDGET_LOCKED',
      resourceType: 'wallet',
      resourceId: userId,
      userId,
      newValues: {
        amount,
        campaignId,
        lockId,
      },
      metadata: {
        transactionType: 'budget_lock',
        impactType: 'debit',
      },
      ...context,
    });
  }

  async auditBudgetDeduction(userId: string, campaignId: string, amount: number, reason: string, context: any) {
    const transactionId = `deduction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const transaction: FinancialTransaction = {
      id: transactionId,
      type: 'budget_deduction',
      amount,
      currency: 'USD',
      userId,
      campaignId,
      description: `Budget deducted: ${reason}`,
      status: 'completed',
      metadata: {
        reason,
        campaignId,
        deductionType: reason,
      },
    };

    await this.auditFinancialTransaction(transaction, context);

    await this.createAuditEntry({
      action: 'BUDGET_DEDUCTED',
      resourceType: 'campaign',
      resourceId: campaignId,
      userId,
      newValues: {
        amount,
        reason,
        transactionId,
      },
      metadata: {
        transactionType: 'budget_deduction',
        impactType: 'expense',
      },
      ...context,
    });

    await adLoggingService.logBudgetDeduction(campaignId, amount, reason, { userId, ...context });
  }

  async auditBudgetRelease(userId: string, campaignId: string, amount: number, reason: string, context: any) {
    const transactionId = `release_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const transaction: FinancialTransaction = {
      id: transactionId,
      type: 'budget_release',
      amount,
      currency: 'USD',
      userId,
      campaignId,
      description: `Budget released: ${reason}`,
      status: 'completed',
      metadata: {
        reason,
        campaignId,
        releaseType: reason,
      },
    };

    await this.auditFinancialTransaction(transaction, context);

    await this.createAuditEntry({
      action: 'BUDGET_RELEASED',
      resourceType: 'wallet',
      resourceId: userId,
      userId,
      newValues: {
        amount,
        reason,
        campaignId,
        transactionId,
      },
      metadata: {
        transactionType: 'budget_release',
        impactType: 'credit',
      },
      ...context,
    });
  }

  async auditRevenueShare(networkName: string, amount: number, campaignId: string, context: any) {
    const transactionId = `revenue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const transaction: FinancialTransaction = {
      id: transactionId,
      type: 'revenue_share',
      amount,
      currency: 'USD',
      userId: 'system',
      campaignId,
      description: `Revenue share from ${networkName}`,
      status: 'completed',
      metadata: {
        networkName,
        campaignId,
        revenueType: 'external_network',
      },
    };

    await this.auditFinancialTransaction(transaction, context);

    await this.createAuditEntry({
      action: 'REVENUE_EARNED',
      resourceType: 'system',
      resourceId: 'revenue_system',
      newValues: {
        amount,
        networkName,
        campaignId,
        transactionId,
      },
      metadata: {
        transactionType: 'revenue_share',
        impactType: 'income',
      },
      ...context,
    });
  }

  // Campaign Approval Audit Logging
  async auditCampaignSubmission(campaignId: string, userId: string, context: any) {
    await this.createAuditEntry({
      action: 'CAMPAIGN_SUBMITTED',
      resourceType: 'campaign',
      resourceId: campaignId,
      userId,
      newValues: {
        status: 'pending_approval',
        submittedAt: new Date(),
      },
      metadata: {
        approvalRequired: true,
        submissionType: 'manual',
      },
      ...context,
    });
  }

  async auditCampaignApproval(campaignId: string, adminId: string, decision: 'approved' | 'rejected', reason?: string, context?: any) {
    await this.createAuditEntry({
      action: 'CAMPAIGN_APPROVAL_DECISION',
      resourceType: 'campaign',
      resourceId: campaignId,
      userId: adminId,
      newValues: {
        approvalStatus: decision,
        approvedBy: adminId,
        approvedAt: new Date(),
        reason,
      },
      metadata: {
        decision,
        hasReason: !!reason,
        approvalType: 'manual',
      },
      ...context,
    });

    await adLoggingService.logCampaignApproval(campaignId, adminId, decision, reason);
  }

  async auditApprovalEscalation(campaignId: string, fromAdminId: string, toAdminId: string, reason: string, context: any) {
    await this.createAuditEntry({
      action: 'APPROVAL_ESCALATED',
      resourceType: 'campaign',
      resourceId: campaignId,
      userId: fromAdminId,
      oldValues: {
        assignedTo: fromAdminId,
      },
      newValues: {
        assignedTo: toAdminId,
        escalationReason: reason,
        escalatedAt: new Date(),
      },
      metadata: {
        escalationType: 'manual',
        reason,
      },
      ...context,
    });
  }

  // Admin Action Audit Logging
  async auditAdminLogin(adminId: string, context: any) {
    await this.createAuditEntry({
      action: 'ADMIN_LOGIN',
      resourceType: 'admin',
      resourceId: adminId,
      userId: adminId,
      metadata: {
        loginType: 'manual',
        sessionStart: new Date(),
      },
      ...context,
    });
  }

  async auditAdminAction(adminId: string, action: string, resourceType: string, resourceId: string, details: any, context: any) {
    await this.createAuditEntry({
      action: `ADMIN_${action.toUpperCase()}`,
      resourceType,
      resourceId,
      userId: adminId,
      newValues: details,
      metadata: {
        adminAction: action,
        isAdminAction: true,
      },
      ...context,
    });

    await adLoggingService.logAdminAction(adminId, action, resourceId, details);
  }

  async auditSystemConfiguration(adminId: string, configType: string, oldConfig: any, newConfig: any, context: any) {
    await this.createAuditEntry({
      action: 'SYSTEM_CONFIG_CHANGED',
      resourceType: 'system_config',
      resourceId: configType,
      userId: adminId,
      oldValues: this.sanitizeData(oldConfig),
      newValues: this.sanitizeData(newConfig),
      metadata: {
        configType,
        changedFields: Object.keys(this.calculateChanges(oldConfig, newConfig)),
      },
      ...context,
    });
  }

  // Fraud Detection Audit Logging
  async auditFraudDetection(type: string, resourceId: string, details: any, severity: string, context: any) {
    await this.createAuditEntry({
      action: 'FRAUD_DETECTED',
      resourceType: 'fraud_detection',
      resourceId,
      newValues: {
        fraudType: type,
        severity,
        details: this.sanitizeData(details),
        detectedAt: new Date(),
      },
      metadata: {
        fraudType: type,
        severity,
        requiresInvestigation: severity === 'high' || severity === 'critical',
      },
      ...context,
    });

    await adLoggingService.logFraudDetection(type, details, context);
  }

  async auditFraudInvestigation(fraudId: string, investigatorId: string, findings: any, action: string, context: any) {
    await this.createAuditEntry({
      action: 'FRAUD_INVESTIGATED',
      resourceType: 'fraud_detection',
      resourceId: fraudId,
      userId: investigatorId,
      newValues: {
        findings: this.sanitizeData(findings),
        action,
        investigatedAt: new Date(),
        investigatedBy: investigatorId,
      },
      metadata: {
        investigationAction: action,
        hasFindings: Object.keys(findings).length > 0,
      },
      ...context,
    });
  }

  // Private Helper Methods
  private async createAuditEntry(data: Omit<AuditEntry, 'id' | 'timestamp' | 'checksum'>) {
    const auditEntry: AuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      checksum: '',
      ...data,
    };

    // Generate checksum for integrity
    auditEntry.checksum = this.generateChecksum(auditEntry);

    try {
      // TODO: Implement auditLog model in Prisma schema
      // await prisma.auditLog.create({
      //   data: {
      //     auditId: auditEntry.id,
      //     action: auditEntry.action,
      //     resourceType: auditEntry.resourceType,
      //     resourceId: auditEntry.resourceId,
      //     userId: auditEntry.userId,
      //     oldValues: auditEntry.oldValues || {},
      //     newValues: auditEntry.newValues || {},
      //     metadata: auditEntry.metadata || {},
      //     ipAddress: auditEntry.ipAddress,
      //     userAgent: auditEntry.userAgent,
      //     checksum: auditEntry.checksum,
      //     timestamp: auditEntry.timestamp,
      //   },
      // });
      logger.info('Audit entry would be persisted:', auditEntry);
    } catch (error) {
      // Log error but don't fail the operation
      await adLoggingService.logError(
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: 'create_audit_entry',
          auditAction: auditEntry.action,
          resourceId: auditEntry.resourceId,
        },
        'high'
      );
    }
  }

  private async auditFinancialTransaction(transaction: FinancialTransaction, context: any) {
    try {
      // TODO: Implement financialAuditLog model in Prisma schema
      // await prisma.financialAuditLog.create({
      //   data: {
      //     transactionId: transaction.id,
      //     transactionType: transaction.type,
      //     amount: transaction.amount,
      //     currency: transaction.currency,
      //     userId: transaction.userId,
      //     campaignId: transaction.campaignId,
      //     description: transaction.description,
      //     status: transaction.status,
      //     metadata: transaction.metadata || {},
      //     ipAddress: context.ipAddress,
      //     userAgent: context.userAgent,
      //     timestamp: new Date(),
      //   },
      // });
      logger.info('Financial audit log would be created:', transaction);

      await adLoggingService.logWalletTransaction(
        transaction.userId,
        transaction.type,
        transaction.amount,
        { ...context, transactionId: transaction.id }
      );
    } catch (error) {
      await adLoggingService.logError(
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: 'audit_financial_transaction',
          transactionId: transaction.id,
          transactionType: transaction.type,
        },
        'critical'
      );
    }
  }

  private generateChecksum(auditEntry: Omit<AuditEntry, 'checksum'>): string {
    const data = JSON.stringify({
      id: auditEntry.id,
      timestamp: auditEntry.timestamp,
      action: auditEntry.action,
      resourceType: auditEntry.resourceType,
      resourceId: auditEntry.resourceId,
      userId: auditEntry.userId,
      oldValues: auditEntry.oldValues,
      newValues: auditEntry.newValues,
    });

    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private sanitizeData(data: any): any {
    if (!data) return data;

    const sanitized = { ...data };
    
    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'apiKey', 'privateKey'];
    
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  private calculateChanges(oldData: any, newData: any): any {
    const changes: any = {};
    
    if (!oldData || !newData) return changes;

    for (const key in newData) {
      if (oldData[key] !== newData[key]) {
        changes[key] = {
          old: oldData[key],
          new: newData[key],
        };
      }
    }

    return changes;
  }

  // Query Methods
  async getAuditTrail(resourceType: string, resourceId: string, limit: number = 100): Promise<AuditEntry[]> {
    try {
      // TODO: Implement auditLog model in Prisma schema
      // const auditLogs = await prisma.auditLog.findMany({
      //   where: {
      //     resourceType,
      //     resourceId,
      //   },
      //   orderBy: { timestamp: 'desc' },
      //   take: limit,
      // });

      // return auditLogs.map(log => ({
      return [].map((log: any) => ({
        id: log.auditId,
        timestamp: log.timestamp,
        userId: log.userId || undefined,
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        oldValues: log.oldValues,
        newValues: log.newValues,
        metadata: log.metadata,
        ipAddress: log.ipAddress || undefined,
        userAgent: log.userAgent || undefined,
        checksum: log.checksum,
      }));
    } catch (error) {
      await adLoggingService.logError(error instanceof Error ? error : new Error(String(error)), { operation: 'get_audit_trail' }, 'medium');
      return [];
    }
  }

  async getFinancialAuditTrail(userId?: string, campaignId?: string, limit: number = 100): Promise<FinancialTransaction[]> {
    try {
      // TODO: Implement financialAuditLog model in Prisma schema
      // const financialLogs = await prisma.financialAuditLog.findMany({
      //   where: {
      //     ...(userId && { userId }),
      //     ...(campaignId && { campaignId }),
      //   },
      //   orderBy: { timestamp: 'desc' },
      //   take: limit,
      // });

      // return financialLogs.map(log => ({
      return [].map((log: any) => ({
        id: log.transactionId,
        type: log.transactionType as any,
        amount: log.amount.toNumber(),
        currency: log.currency,
        userId: log.userId,
        campaignId: log.campaignId || undefined,
        description: log.description,
        status: log.status as any,
        metadata: log.metadata,
      }));
    } catch (error) {
      await adLoggingService.logError(error instanceof Error ? error : new Error(String(error)), { operation: 'get_financial_audit_trail' }, 'medium');
      return [];
    }
  }

  async verifyAuditIntegrity(auditId: string): Promise<boolean> {
    try {
      // TODO: Implement auditLog model in Prisma schema
      // const auditLog = await prisma.auditLog.findUnique({
      //   where: { auditId },
      // });

      // if (!auditLog) return false;
      const auditLog: any = null;
      if (!auditLog) return false;

      const auditEntry: Omit<AuditEntry, 'checksum'> = {
        id: auditLog.auditId,
        timestamp: auditLog.timestamp,
        userId: auditLog.userId || undefined,
        action: auditLog.action,
        resourceType: auditLog.resourceType,
        resourceId: auditLog.resourceId,
        oldValues: auditLog.oldValues,
        newValues: auditLog.newValues,
        metadata: auditLog.metadata,
        ipAddress: auditLog.ipAddress || undefined,
        userAgent: auditLog.userAgent || undefined,
      };

      const expectedChecksum = this.generateChecksum(auditEntry);
      return expectedChecksum === auditLog.checksum;
    } catch (error) {
      await adLoggingService.logError(error instanceof Error ? error : new Error(String(error)), { operation: 'verify_audit_integrity', auditId }, 'high');
      return false;
    }
  }

  async getAuditStatistics(startDate: Date, endDate: Date) {
    try {
      // TODO: Implement auditLog and financialAuditLog models in Prisma schema
      const [totalAudits, financialTransactions, adminActions, fraudDetections] = await Promise.all([
        Promise.resolve(0), // prisma.auditLog.count
        Promise.resolve(0), // prisma.financialAuditLog.count
        Promise.resolve(0), // prisma.auditLog.count (admin actions)
        Promise.resolve(0), // prisma.auditLog.count (fraud detections)
      ]);

      return {
        totalAudits,
        financialTransactions,
        adminActions,
        fraudDetections,
        period: {
          startDate,
          endDate,
        },
      };
    } catch (error) {
      await adLoggingService.logError(error instanceof Error ? error : new Error(String(error)), { operation: 'get_audit_statistics' }, 'medium');
      return null;
    }
  }
}

export const adAuditService = new AdAuditService();