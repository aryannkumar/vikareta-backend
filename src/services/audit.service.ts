import { logger } from '@/utils/logger';
import { PrismaClient } from '@prisma/client';
import { encryptionUtils } from '@/utils/encryption';

const prisma = new PrismaClient();

// Audit interfaces
export interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: AuditCategory;
  metadata?: any;
}

export type AuditCategory = 
  | 'authentication'
  | 'authorization'
  | 'data_access'
  | 'data_modification'
  | 'financial_transaction'
  | 'user_management'
  | 'system_configuration'
  | 'security_event'
  | 'compliance_event';

export interface ComplianceReport {
  id: string;
  reportType: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  data: any;
  generatedAt: Date;
  generatedBy: string;
  status: 'draft' | 'final' | 'submitted';
}

export interface DataRetentionPolicy {
  dataType: string;
  retentionPeriod: number; // in days
  archiveAfter?: number; // in days
  deleteAfter: number; // in days
  encryptionRequired: boolean;
  complianceReason: string;
}

class AuditService {
  private readonly DATA_RETENTION_POLICIES: DataRetentionPolicy[] = [
    {
      dataType: 'user_personal_data',
      retentionPeriod: 2555, // 7 years for financial records
      archiveAfter: 1095, // 3 years
      deleteAfter: 2555,
      encryptionRequired: true,
      complianceReason: 'GDPR, Financial regulations',
    },
    {
      dataType: 'transaction_records',
      retentionPeriod: 2555, // 7 years
      archiveAfter: 1095,
      deleteAfter: 2555,
      encryptionRequired: true,
      complianceReason: 'Financial regulations, Tax compliance',
    },
    {
      dataType: 'audit_logs',
      retentionPeriod: 1095, // 3 years
      deleteAfter: 1095,
      encryptionRequired: false,
      complianceReason: 'Security compliance, Regulatory requirements',
    },
    {
      dataType: 'session_data',
      retentionPeriod: 90, // 3 months
      deleteAfter: 90,
      encryptionRequired: false,
      complianceReason: 'Security monitoring',
    },
    {
      dataType: 'marketing_data',
      retentionPeriod: 730, // 2 years
      deleteAfter: 730,
      encryptionRequired: true,
      complianceReason: 'GDPR consent-based retention',
    },
  ];

  /**
   * Log audit event
   */
  async logAuditEvent(auditData: Omit<AuditLog, 'id' | 'timestamp'>): Promise<AuditLog> {
    try {
      const auditLog: AuditLog = {
        ...auditData,
        id: crypto.randomUUID(),
        timestamp: new Date(),
      };

      // Encrypt sensitive data in audit logs
      if (auditLog.oldValues) {
        auditLog.oldValues = encryptionUtils.maskSensitiveData(auditLog.oldValues);
      }
      if (auditLog.newValues) {
        auditLog.newValues = encryptionUtils.maskSensitiveData(auditLog.newValues);
      }

      // Store audit log (would need audit_logs table)
      logger.info('Audit event logged:', {
        auditId: auditLog.id,
        userId: auditLog.userId,
        action: auditLog.action,
        resource: auditLog.resource,
        category: auditLog.category,
        severity: auditLog.severity,
        timestamp: auditLog.timestamp,
      });

      // For critical events, send immediate alerts
      if (auditLog.severity === 'critical') {
        await this.sendCriticalAuditAlert(auditLog);
      }

      return auditLog;
    } catch (error) {
      logger.error('Error logging audit event:', error);
      throw error;
    }
  }

  /**
   * Log authentication events
   */
  async logAuthenticationEvent(data: {
    userId?: string;
    action: 'login' | 'logout' | 'login_failed' | 'password_reset' | 'account_locked';
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    metadata?: any;
  }): Promise<AuditLog> {
    return this.logAuditEvent({
      ...(data.userId && { userId: data.userId }),
      action: data.action,
      resource: 'authentication',
      ...(data.ipAddress && { ipAddress: data.ipAddress }),
      ...(data.userAgent && { userAgent: data.userAgent }),
      ...(data.sessionId && { sessionId: data.sessionId }),
      severity: data.action === 'login_failed' ? 'medium' : 'low',
      category: 'authentication',
      ...(data.metadata && { metadata: data.metadata }),
    });
  }

  /**
   * Log data access events
   */
  async logDataAccess(data: {
    userId: string;
    resource: string;
    resourceId?: string;
    action: 'read' | 'search' | 'export';
    ipAddress?: string;
    metadata?: any;
  }): Promise<AuditLog> {
    return this.logAuditEvent({
      userId: data.userId,
      action: data.action,
      resource: data.resource,
      ...(data.resourceId && { resourceId: data.resourceId }),
      ...(data.ipAddress && { ipAddress: data.ipAddress }),
      severity: data.action === 'export' ? 'medium' : 'low',
      category: 'data_access',
      ...(data.metadata && { metadata: data.metadata }),
    });
  }

  /**
   * Log data modification events
   */
  async logDataModification(data: {
    userId: string;
    resource: string;
    resourceId?: string;
    action: 'create' | 'update' | 'delete';
    oldValues?: any;
    newValues?: any;
    ipAddress?: string;
    metadata?: any;
  }): Promise<AuditLog> {
    return this.logAuditEvent({
      userId: data.userId,
      action: data.action,
      resource: data.resource,
      ...(data.resourceId && { resourceId: data.resourceId }),
      ...(data.oldValues && { oldValues: data.oldValues }),
      ...(data.newValues && { newValues: data.newValues }),
      ...(data.ipAddress && { ipAddress: data.ipAddress }),
      severity: data.action === 'delete' ? 'high' : 'medium',
      category: 'data_modification',
      ...(data.metadata && { metadata: data.metadata }),
    });
  }

  /**
   * Log financial transactions
   */
  async logFinancialTransaction(data: {
    userId: string;
    action: string;
    amount: number;
    currency: string;
    transactionId: string;
    paymentMethod?: string;
    ipAddress?: string;
    metadata?: any;
  }): Promise<AuditLog> {
    return this.logAuditEvent({
      userId: data.userId,
      action: data.action,
      resource: 'financial_transaction',
      resourceId: data.transactionId,
      newValues: {
        amount: data.amount,
        currency: data.currency,
        ...(data.paymentMethod && { paymentMethod: data.paymentMethod }),
      },
      ...(data.ipAddress && { ipAddress: data.ipAddress }),
      severity: data.amount > 100000 ? 'high' : 'medium',
      category: 'financial_transaction',
      ...(data.metadata && { metadata: data.metadata }),
    });
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(reportType: string, startDate: Date, endDate: Date, generatedBy: string): Promise<ComplianceReport> {
    try {
      const reportId = crypto.randomUUID();
      let reportData: any = {};

      switch (reportType) {
        case 'gdpr_data_processing':
          reportData = await this.generateGDPRReport(startDate, endDate);
          break;
        case 'financial_transactions':
          reportData = await this.generateFinancialReport(startDate, endDate);
          break;
        case 'security_incidents':
          reportData = await this.generateSecurityReport(startDate, endDate);
          break;
        case 'user_access_log':
          reportData = await this.generateAccessReport(startDate, endDate);
          break;
        default:
          throw new Error(`Unknown report type: ${reportType}`);
      }

      const report: ComplianceReport = {
        id: reportId,
        reportType,
        period: { startDate, endDate },
        data: reportData,
        generatedAt: new Date(),
        generatedBy,
        status: 'draft',
      };

      // Log report generation
      await this.logAuditEvent({
        userId: generatedBy,
        action: 'generate_compliance_report',
        resource: 'compliance_report',
        resourceId: reportId,
        newValues: { reportType, period: { startDate, endDate } },
        severity: 'medium',
        category: 'compliance_event',
      });

      return report;
    } catch (error) {
      logger.error('Error generating compliance report:', error);
      throw error;
    }
  }

  /**
   * Generate GDPR compliance report
   */
  private async generateGDPRReport(_startDate: Date, _endDate: Date): Promise<any> {
    // In a real implementation, this would query actual data
    return {
      summary: {
        totalUsers: 0,
        dataProcessingActivities: 0,
        consentRecords: 0,
        dataSubjectRequests: 0,
        dataBreaches: 0,
      },
      dataProcessingActivities: [],
      consentManagement: {
        consentGiven: 0,
        consentWithdrawn: 0,
        consentUpdated: 0,
      },
      dataSubjectRights: {
        accessRequests: 0,
        rectificationRequests: 0,
        erasureRequests: 0,
        portabilityRequests: 0,
      },
      dataBreaches: [],
      recommendations: [
        'Regular consent renewal campaigns',
        'Data minimization review',
        'Privacy impact assessments for new features',
      ],
    };
  }

  /**
   * Generate financial transactions report
   */
  private async generateFinancialReport(startDate: Date, endDate: Date): Promise<any> {
    // Query financial transactions from the database
    const transactions = await prisma.walletTransaction.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        wallet: {
          include: {
            user: {
              select: {
                id: true,
                businessName: true,
                gstin: true,
              },
            },
          },
        },
      },
    });

    const summary = {
      totalTransactions: transactions.length,
      totalVolume: transactions.reduce((sum, tx) => sum + Number(tx.amount), 0),
      averageTransactionSize: transactions.length > 0 
        ? transactions.reduce((sum, tx) => sum + Number(tx.amount), 0) / transactions.length 
        : 0,
      transactionsByType: {} as Record<string, number>,
      highValueTransactions: transactions.filter(tx => Number(tx.amount) > 100000).length,
    };

    // Group by transaction type
    transactions.forEach(tx => {
      summary.transactionsByType[tx.transactionType] = 
        (summary.transactionsByType[tx.transactionType] || 0) + 1;
    });

    return {
      summary,
      period: { startDate, endDate },
      transactions: transactions.map(tx => ({
        id: tx.id,
        amount: tx.amount,
        type: tx.transactionType,
        date: tx.createdAt,
        userId: tx.wallet.userId,
        businessName: tx.wallet.user?.businessName,
      })),
      compliance: {
        amlChecksPerformed: transactions.length,
        suspiciousTransactionsReported: 0,
        kycComplianceRate: 85, // Placeholder
      },
    };
  }

  /**
   * Generate security incidents report
   */
  private async generateSecurityReport(_startDate: Date, _endDate: Date): Promise<any> {
    // In a real implementation, this would query security incidents
    return {
      summary: {
        totalIncidents: 0,
        criticalIncidents: 0,
        resolvedIncidents: 0,
        averageResolutionTime: 0,
      },
      incidentsByCategory: {},
      securityMetrics: {
        failedLoginAttempts: 0,
        blockedIPs: 0,
        fraudAlertsTriggered: 0,
        accountsLocked: 0,
      },
      recommendations: [
        'Implement additional MFA methods',
        'Regular security awareness training',
        'Enhanced monitoring for suspicious activities',
      ],
    };
  }

  /**
   * Generate user access report
   */
  private async generateAccessReport(_startDate: Date, _endDate: Date): Promise<any> {
    // In a real implementation, this would query access logs
    return {
      summary: {
        totalAccessEvents: 0,
        uniqueUsers: 0,
        privilegedAccess: 0,
        dataExports: 0,
      },
      accessPatterns: {
        peakHours: [],
        frequentlyAccessedResources: [],
        unusualAccessPatterns: [],
      },
      privilegedOperations: [],
      dataExports: [],
    };
  }

  /**
   * Implement data retention policies
   */
  async enforceDataRetention(): Promise<void> {
    try {
      for (const policy of this.DATA_RETENTION_POLICIES) {
        await this.enforceRetentionPolicy(policy);
      }
    } catch (error) {
      logger.error('Error enforcing data retention:', error);
      throw error;
    }
  }

  /**
   * Enforce specific retention policy
   */
  private async enforceRetentionPolicy(policy: DataRetentionPolicy): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.deleteAfter);

    const archiveDate = policy.archiveAfter ? new Date() : null;
    if (archiveDate && policy.archiveAfter) {
      archiveDate.setDate(archiveDate.getDate() - policy.archiveAfter);
    }

    logger.info(`Enforcing retention policy for ${policy.dataType}`, {
      dataType: policy.dataType,
      cutoffDate,
      archiveDate,
      retentionPeriod: policy.retentionPeriod,
    });

    // In a real implementation, this would:
    // 1. Identify records older than cutoffDate
    // 2. Archive records older than archiveDate but newer than cutoffDate
    // 3. Delete records older than cutoffDate
    // 4. Log all retention actions

    await this.logAuditEvent({
      action: 'data_retention_enforcement',
      resource: policy.dataType,
      severity: 'medium',
      category: 'compliance_event',
      metadata: {
        policy: policy.dataType,
        cutoffDate,
        archiveDate,
      },
    });
  }

  /**
   * Handle data subject rights requests (GDPR)
   */
  async handleDataSubjectRequest(request: {
    userId: string;
    requestType: 'access' | 'rectification' | 'erasure' | 'portability' | 'restriction';
    requestedBy: string;
    details?: any;
  }): Promise<string> {
    try {
      const requestId = crypto.randomUUID();

      // Log the request
      await this.logAuditEvent({
        userId: request.userId,
        action: `data_subject_${request.requestType}`,
        resource: 'user_data',
        resourceId: request.userId,
        severity: 'high',
        category: 'compliance_event',
        metadata: {
          requestId,
          requestType: request.requestType,
          requestedBy: request.requestedBy,
          details: request.details,
        },
      });

      // Process the request based on type
      switch (request.requestType) {
        case 'access':
          await this.processDataAccessRequest(request.userId, requestId);
          break;
        case 'erasure':
          await this.processDataErasureRequest(request.userId, requestId);
          break;
        case 'portability':
          await this.processDataPortabilityRequest(request.userId, requestId);
          break;
        // Add other request types as needed
      }

      return requestId;
    } catch (error) {
      logger.error('Error handling data subject request:', error);
      throw error;
    }
  }

  /**
   * Process data access request
   */
  private async processDataAccessRequest(userId: string, requestId: string): Promise<void> {
    // Collect all user data from various tables
    await prisma.user.findUnique({
      where: { id: userId },
      // include all related data
    });

    // Log data access
    await this.logDataAccess({
      userId,
      resource: 'user_personal_data',
      action: 'export',
      metadata: { requestId, purpose: 'gdpr_access_request' },
    });
  }

  /**
   * Process data erasure request
   */
  private async processDataErasureRequest(userId: string, requestId: string): Promise<void> {
    // Implement right to be forgotten
    // This is complex and needs careful consideration of legal obligations
    
    await this.logDataModification({
      userId,
      resource: 'user_personal_data',
      action: 'delete',
      metadata: { requestId, purpose: 'gdpr_erasure_request' },
    });
  }

  /**
   * Process data portability request
   */
  private async processDataPortabilityRequest(userId: string, requestId: string): Promise<void> {
    // Export user data in a structured format
    
    await this.logDataAccess({
      userId,
      resource: 'user_personal_data',
      action: 'export',
      metadata: { requestId, purpose: 'gdpr_portability_request' },
    });
  }

  /**
   * Send critical audit alert
   */
  private async sendCriticalAuditAlert(auditLog: AuditLog): Promise<void> {
    logger.error('Critical audit event detected:', {
      auditId: auditLog.id,
      action: auditLog.action,
      resource: auditLog.resource,
      userId: auditLog.userId,
      severity: auditLog.severity,
    });

    // In a real implementation, this would:
    // 1. Send email/SMS to security team
    // 2. Create incident in monitoring system
    // 3. Potentially trigger automated responses
  }

  /**
   * Get audit logs with filtering
   */
  async getAuditLogs(_filters: {
    userId?: string;
    resource?: string;
    action?: string;
    category?: AuditCategory;
    severity?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<AuditLog[]> {
    try {
      // In a real implementation, this would query the audit_logs table
      // For now, return empty array
      return [];
    } catch (error) {
      logger.error('Error retrieving audit logs:', error);
      throw error;
    }
  }

  /**
   * Backup critical data
   */
  async performDataBackup(): Promise<void> {
    try {
      const backupId = crypto.randomUUID();
      const timestamp = new Date();

      // In a real implementation, this would:
      // 1. Create database backup
      // 2. Backup file storage
      // 3. Encrypt backups
      // 4. Store in secure location
      // 5. Verify backup integrity

      await this.logAuditEvent({
        action: 'data_backup',
        resource: 'system_data',
        severity: 'medium',
        category: 'system_configuration',
        metadata: {
          backupId,
          timestamp,
          type: 'automated_backup',
        },
      });

      logger.info('Data backup completed:', { backupId, timestamp });
    } catch (error) {
      logger.error('Error performing data backup:', error);
      throw error;
    }
  }
}

export const auditService = new AuditService();