import { Request, Response, NextFunction } from 'express';
import { auditService } from '@/services/audit.service';
import { logger } from '@/utils/logger';

// Extend Request interface to include audit context
declare global {
  namespace Express {
    interface Request {
      auditContext?: {
        startTime: number;
        originalBody?: any;
        originalQuery?: any;
      };
    }
  }
}

/**
 * Middleware to automatically log audit events
 */
export const auditLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const userId = (req as any).user?.id;
  const originalSend = res.send;

  // Store original request data for comparison
  req.auditContext = {
    startTime,
    originalBody: req.body ? JSON.parse(JSON.stringify(req.body)) : undefined,
    originalQuery: req.query ? JSON.parse(JSON.stringify(req.query)) : undefined,
  };

  // Override res.send to capture response
  res.send = function(data) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Log audit event based on request type and response
    setImmediate(async () => {
      try {
        await logRequestAudit(req, res, statusCode, duration, userId);
      } catch (error) {
        logger.error('Error logging audit event:', error);
      }
    });

    return originalSend.call(this, data);
  };

  next();
};

/**
 * Log request audit based on the endpoint and method
 */
async function logRequestAudit(
  req: Request, 
  res: Response, 
  statusCode: number, 
  duration: number, 
  userId?: string
): Promise<void> {
  const { method, path, ip } = req;
  const userAgent = req.get('User-Agent');

  // Skip logging for health checks and static assets
  if (path.includes('/health') || path.includes('/static')) {
    return;
  }

  // Determine audit category and action based on endpoint
  const auditInfo = determineAuditInfo(method, path, statusCode);
  
  if (!auditInfo) {
    return; // Skip non-auditable requests
  }

  // Log authentication events
  if (auditInfo.category === 'authentication') {
    await auditService.logAuthenticationEvent({
      userId,
      action: auditInfo.action as any,
      ipAddress: ip,
      userAgent,
      metadata: {
        path,
        statusCode,
        duration,
        body: req.auditContext?.originalBody,
      },
    });
    return;
  }

  // Log data access events
  if (auditInfo.category === 'data_access' && method === 'GET') {
    await auditService.logDataAccess({
      userId: userId || 'anonymous',
      resource: auditInfo.resource,
      resourceId: req.params.id,
      action: 'read',
      ipAddress: ip,
      metadata: {
        path,
        statusCode,
        duration,
        query: req.auditContext?.originalQuery,
      },
    });
    return;
  }

  // Log data modification events
  if (auditInfo.category === 'data_modification' && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    let action: 'create' | 'update' | 'delete';
    if (method === 'POST') action = 'create';
    else if (method === 'DELETE') action = 'delete';
    else action = 'update';

    await auditService.logDataModification({
      userId: userId || 'anonymous',
      resource: auditInfo.resource,
      resourceId: req.params.id,
      action,
      oldValues: method !== 'POST' ? req.auditContext?.originalBody : undefined,
      newValues: method !== 'DELETE' ? req.auditContext?.originalBody : undefined,
      ipAddress: ip,
      metadata: {
        path,
        statusCode,
        duration,
      },
    });
    return;
  }

  // Log financial transactions
  if (auditInfo.category === 'financial_transaction') {
    const amount = req.body?.amount || req.auditContext?.originalBody?.amount || 0;
    const currency = req.body?.currency || 'INR';
    const transactionId = req.body?.transactionId || req.params.id || 'unknown';

    await auditService.logFinancialTransaction({
      userId: userId || 'anonymous',
      action: auditInfo.action,
      amount,
      currency,
      transactionId,
      paymentMethod: req.body?.paymentMethod,
      ipAddress: ip,
      metadata: {
        path,
        statusCode,
        duration,
      },
    });
    return;
  }
}

/**
 * Determine audit information based on request path and method
 */
function determineAuditInfo(method: string, path: string, statusCode: number): {
  category: string;
  action: string;
  resource: string;
} | null {
  // Authentication endpoints
  if (path.includes('/auth/login')) {
    return {
      category: 'authentication',
      action: statusCode === 200 ? 'login' : 'login_failed',
      resource: 'authentication',
    };
  }
  
  if (path.includes('/auth/logout')) {
    return {
      category: 'authentication',
      action: 'logout',
      resource: 'authentication',
    };
  }

  if (path.includes('/auth/reset-password')) {
    return {
      category: 'authentication',
      action: 'password_reset',
      resource: 'authentication',
    };
  }

  // User management
  if (path.includes('/users') || path.includes('/profile')) {
    return {
      category: method === 'GET' ? 'data_access' : 'data_modification',
      action: method.toLowerCase(),
      resource: 'user_data',
    };
  }

  // Financial endpoints
  if (path.includes('/payments') || path.includes('/wallet') || path.includes('/transactions')) {
    return {
      category: 'financial_transaction',
      action: `${method.toLowerCase()}_financial_operation`,
      resource: 'financial_data',
    };
  }

  // Product management
  if (path.includes('/products')) {
    return {
      category: method === 'GET' ? 'data_access' : 'data_modification',
      action: method.toLowerCase(),
      resource: 'product_data',
    };
  }

  // Order management
  if (path.includes('/orders')) {
    return {
      category: method === 'GET' ? 'data_access' : 'data_modification',
      action: method.toLowerCase(),
      resource: 'order_data',
    };
  }

  // RFQ and quotes
  if (path.includes('/rfqs') || path.includes('/quotes')) {
    return {
      category: method === 'GET' ? 'data_access' : 'data_modification',
      action: method.toLowerCase(),
      resource: 'business_data',
    };
  }

  // Admin endpoints
  if (path.includes('/admin')) {
    return {
      category: 'system_configuration',
      action: `admin_${method.toLowerCase()}`,
      resource: 'admin_data',
    };
  }

  return null; // Don't audit this request
}

/**
 * Middleware for sensitive operations that require enhanced auditing
 */
export const enhancedAuditLogger = (resource: string, action: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.id;
    const startTime = Date.now();

    // Log the attempt
    await auditService.logAuditEvent({
      userId,
      action: `${action}_attempt`,
      resource,
      resourceId: req.params.id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      severity: 'high',
      category: 'security_event',
      metadata: {
        originalUrl: req.originalUrl,
        method: req.method,
        body: req.body,
        query: req.query,
      },
    });

    // Override res.send to log the result
    const originalSend = res.send;
    res.send = function(data) {
      const duration = Date.now() - startTime;
      const success = res.statusCode >= 200 && res.statusCode < 300;

      setImmediate(async () => {
        await auditService.logAuditEvent({
          userId,
          action: `${action}_${success ? 'success' : 'failure'}`,
          resource,
          resourceId: req.params.id,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          severity: success ? 'medium' : 'high',
          category: 'security_event',
          metadata: {
            statusCode: res.statusCode,
            duration,
            success,
          },
        });
      });

      return originalSend.call(this, data);
    };

    next();
  };
};

/**
 * Middleware to log data export events
 */
export const dataExportAudit = (req: Request, res: Response, next: NextFunction) => {
  const userId = (req as any).user?.id;
  const originalSend = res.send;

  res.send = function(data) {
    // Check if this is a data export (CSV, Excel, PDF download)
    const contentType = res.get('Content-Type');
    const contentDisposition = res.get('Content-Disposition');
    
    if (contentDisposition && contentDisposition.includes('attachment')) {
      setImmediate(async () => {
        await auditService.logDataAccess({
          userId: userId || 'anonymous',
          resource: 'exported_data',
          action: 'export',
          ipAddress: req.ip,
          metadata: {
            path: req.path,
            contentType,
            contentDisposition,
            exportSize: data ? data.length : 0,
          },
        });
      });
    }

    return originalSend.call(this, data);
  };

  next();
};

/**
 * Middleware to log privileged operations
 */
export const privilegedOperationAudit = (operation: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.id;
    
    await auditService.logAuditEvent({
      userId,
      action: operation,
      resource: 'privileged_operation',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      severity: 'critical',
      category: 'security_event',
      metadata: {
        operation,
        path: req.path,
        method: req.method,
        timestamp: new Date(),
      },
    });

    next();
  };
};

export const auditMiddleware = {
  auditLogger,
  enhancedAuditLogger,
  dataExportAudit,
  privilegedOperationAudit,
};