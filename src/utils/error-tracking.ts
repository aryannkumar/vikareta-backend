
import { logger } from './logger';

export interface ErrorContext {
  userId?: string;
  requestId?: string;
  userAgent?: string;
  ip?: string;
  url?: string;
  method?: string;
  body?: any;
  query?: any;
  headers?: Record<string, string>;
}

export interface ErrorFingerprint {
  id: string;
  message: string;
  stack: string;
  type: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  resolved: boolean;
}

export class ErrorTracker {
  private static instance: ErrorTracker;
  private errors: Map<string, ErrorFingerprint> = new Map();
  private errorPatterns: Map<string, number> = new Map();

  static getInstance(): ErrorTracker {
    if (!ErrorTracker.instance) {
      ErrorTracker.instance = new ErrorTracker();
    }
    return ErrorTracker.instance;
  }

  captureError(error: Error, context?: ErrorContext): string {
    const fingerprint = this.generateFingerprint(error);
    const existing = this.errors.get(fingerprint);

    if (existing) {
      existing.count++;
      existing.lastSeen = new Date();
    } else {
      this.errors.set(fingerprint, {
        id: fingerprint,
        message: error.message,
        stack: error.stack || '',
        type: error.constructor.name,
        count: 1,
        firstSeen: new Date(),
        lastSeen: new Date(),
        resolved: false
      });
    }

    // Track error patterns
    const pattern = this.extractPattern(error);
    this.errorPatterns.set(pattern, (this.errorPatterns.get(pattern) || 0) + 1);

    // Log error with context
    logger.error('Error captured', {
      fingerprint,
      error: {
        message: error.message,
        stack: error.stack,
        type: error.constructor.name
      },
      context
    });

    // Check for error spikes
    this.checkErrorSpikes(pattern);

    return fingerprint;
  }

  private generateFingerprint(error: Error): string {
    const crypto = require('crypto');
    const content = `${error.constructor.name}:${error.message}${this.normalizeStack(error.stack || '')}`;
    return crypto.createHash('md5').update(content).digest('hex');
  }

  private normalizeStack(stack: string): string {
    return stack
      .split('\n')
      .slice(0, 5) // Take first 5 stack frames
      .map(line => line.replace(/:\d+:\d+/g, ':X:X')) // Remove line numbers
      .join('\n');
  }

  private extractPattern(error: Error): string {
    // Extract meaningful pattern from error
    const message = error.message.toLowerCase();
    
    if (message.includes('timeout')) return 'timeout';
    if (message.includes('connection')) return 'connection';
    if (message.includes('validation')) return 'validation';
    if (message.includes('permission')) return 'permission';
    if (message.includes('not found')) return 'not_found';
    
    return 'unknown';
  }

  private checkErrorSpikes(pattern: string): void {
    const count = this.errorPatterns.get(pattern) || 0;
    const threshold = 10; // 10 errors per minute
    
    if (count >= threshold) {
      logger.warn('Error spike detected', {
        pattern,
        count,
        threshold
      });
      
      // Trigger alert
      this.triggerAlert('error_spike', {
        pattern,
        count,
        threshold
      });
    }
  }

  private triggerAlert(type: string, data: any): void {
    // Implementation would integrate with alerting system
    logger.warn('Alert triggered', { type, data });
  }

  getErrorStats(): any {
    const totalErrors = Array.from(this.errors.values()).reduce((sum, error) => sum + error.count, 0);
    const unresolvedErrors = Array.from(this.errors.values()).filter(error => !error.resolved).length;
    
    return {
      totalErrors,
      uniqueErrors: this.errors.size,
      unresolvedErrors,
      errorPatterns: Object.fromEntries(this.errorPatterns),
      topErrors: Array.from(this.errors.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    };
  }

  resolveError(fingerprint: string): boolean {
    const error = this.errors.get(fingerprint);
    if (error) {
      error.resolved = true;
      return true;
    }
    return false;
  }
}
