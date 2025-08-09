import * as cron from 'node-cron';
import { logger } from '../utils/logger';

export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  schedule: string;
  task: () => Promise<void>;
  enabled: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
  timeout: number; // in milliseconds
  retryCount: number;
  maxRetries: number;
  lastRun?: Date;
  nextRun?: Date;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'timeout';
  executionHistory: TaskExecution[];
}

export interface TaskExecution {
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  error?: string;
  duration?: number;
}

export class TaskSchedulerService {
  private tasks: Map<string, ScheduledTask> = new Map();
  private cronJobs: Map<string, cron.ScheduledTask> = new Map();
  private runningTasks: Set<string> = new Set();
  private isStarted = false;

  constructor() {
    this.initializeDefaultTasks();
  }

  private initializeDefaultTasks(): void {
    // Database maintenance tasks
    this.addTask({
      id: 'db-vacuum',
      name: 'Database Vacuum',
      description: 'Perform database vacuum and analyze operations',
      schedule: '0 2 * * 0', // Weekly on Sunday at 2 AM
      task: this.performDatabaseMaintenance.bind(this),
      enabled: true,
      priority: 'medium',
      timeout: 3600000, // 1 hour
      retryCount: 0,
      maxRetries: 2,
      status: 'idle',
      executionHistory: [],
    });

    this.addTask({
      id: 'index-optimization',
      name: 'Database Index Optimization',
      description: 'Optimize database indexes for better performance',
      schedule: '0 3 * * 0', // Weekly on Sunday at 3 AM
      task: this.optimizeDatabaseIndexes.bind(this),
      enabled: true,
      priority: 'medium',
      timeout: 1800000, // 30 minutes
      retryCount: 0,
      maxRetries: 2,
      status: 'idle',
      executionHistory: [],
    });

    // Cache management tasks
    this.addTask({
      id: 'cache-warmup',
      name: 'Cache Warmup',
      description: 'Warm up frequently accessed cache entries',
      schedule: '0 */6 * * *', // Every 6 hours
      task: this.warmupCache.bind(this),
      enabled: true,
      priority: 'low',
      timeout: 600000, // 10 minutes
      retryCount: 0,
      maxRetries: 3,
      status: 'idle',
      executionHistory: [],
    });

    // Security tasks
    this.addTask({
      id: 'security-scan',
      name: 'Security Vulnerability Scan',
      description: 'Scan for security vulnerabilities and threats',
      schedule: '0 1 * * *', // Daily at 1 AM
      task: this.performSecurityScan.bind(this),
      enabled: true,
      priority: 'high',
      timeout: 1800000, // 30 minutes
      retryCount: 0,
      maxRetries: 2,
      status: 'idle',
      executionHistory: [],
    });

    // Backup tasks
    this.addTask({
      id: 'backup-verification',
      name: 'Backup Verification',
      description: 'Verify integrity of backup files',
      schedule: '0 4 * * *', // Daily at 4 AM
      task: this.verifyBackups.bind(this),
      enabled: true,
      priority: 'critical',
      timeout: 1800000, // 30 minutes
      retryCount: 0,
      maxRetries: 3,
      status: 'idle',
      executionHistory: [],
    });

    // Monitoring tasks
    this.addTask({
      id: 'system-monitoring',
      name: 'System Health Monitoring',
      description: 'Monitor system health and send alerts',
      schedule: '*/10 * * * *', // Every 10 minutes
      task: this.monitorSystemHealth.bind(this),
      enabled: true,
      priority: 'high',
      timeout: 300000, // 5 minutes
      retryCount: 0,
      maxRetries: 2,
      status: 'idle',
      executionHistory: [],
    });

    // Business logic tasks
    this.addTask({
      id: 'order-status-sync',
      name: 'Order Status Synchronization',
      description: 'Synchronize order statuses with external systems',
      schedule: '*/30 * * * *', // Every 30 minutes
      task: this.synchronizeOrderStatuses.bind(this),
      enabled: true,
      priority: 'medium',
      timeout: 600000, // 10 minutes
      retryCount: 0,
      maxRetries: 3,
      status: 'idle',
      executionHistory: [],
    });

    this.addTask({
      id: 'payment-reconciliation',
      name: 'Payment Reconciliation',
      description: 'Reconcile payments with payment gateway',
      schedule: '0 */4 * * *', // Every 4 hours
      task: this.reconcilePayments.bind(this),
      enabled: true,
      priority: 'high',
      timeout: 1200000, // 20 minutes
      retryCount: 0,
      maxRetries: 3,
      status: 'idle',
      executionHistory: [],
    });

    logger.info(`Task scheduler initialized with ${this.tasks.size} tasks`);
  }

  public addTask(task: ScheduledTask): void {
    this.tasks.set(task.id, task);
    
    if (task.enabled) {
      this.scheduleTask(task);
    }
    
    logger.info(`Added scheduled task: ${task.name} (${task.id})`);
  }

  private scheduleTask(task: ScheduledTask): void {
    const cronJob = cron.schedule(task.schedule, async () => {
      await this.executeTask(task.id);
    }, {
      timezone: 'UTC'
    } as any);

    this.cronJobs.set(task.id, cronJob);
    
    if (this.isStarted) {
      cronJob.start();
    }
  }

  private async executeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      logger.error(`Task not found: ${taskId}`);
      return;
    }

    if (this.runningTasks.has(taskId)) {
      logger.warn(`Task ${task.name} is already running, skipping execution`);
      return;
    }

    this.runningTasks.add(taskId);
    task.status = 'running';
    
    const execution: TaskExecution = {
      startTime: new Date(),
      status: 'running',
    };

    task.executionHistory.push(execution);
    task.lastRun = execution.startTime;

    logger.info(`Starting scheduled task: ${task.name} (${taskId})`);

    const timeoutId = setTimeout(() => {
      execution.status = 'timeout';
      execution.endTime = new Date();
      execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
      task.status = 'timeout';
      this.runningTasks.delete(taskId);
      
      logger.error(`Task ${task.name} timed out after ${task.timeout}ms`);
    }, task.timeout);

    try {
      await task.task();
      
      clearTimeout(timeoutId);
      execution.status = 'completed';
      execution.endTime = new Date();
      execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
      task.status = 'completed';
      task.retryCount = 0; // Reset retry count on success
      
      logger.info(`Completed scheduled task: ${task.name} in ${execution.duration}ms`);
    } catch (error) {
      clearTimeout(timeoutId);
      execution.status = 'failed';
      execution.endTime = new Date();
      execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
      execution.error = error instanceof Error ? error.message : String(error);
      task.status = 'failed';
      task.retryCount++;
      
      logger.error(`Failed to execute task ${task.name} (attempt ${task.retryCount}/${task.maxRetries}):`, error);
      
      if (task.retryCount >= task.maxRetries) {
        logger.error(`Task ${task.name} has exceeded maximum retries, disabling`);
        this.disableTask(taskId);
      }
    } finally {
      this.runningTasks.delete(taskId);
      
      // Keep only last 10 executions
      if (task.executionHistory.length > 10) {
        task.executionHistory = task.executionHistory.slice(-10);
      }
    }
  }

  // Task implementations
  private async performDatabaseMaintenance(): Promise<void> {
    logger.info('Performing database maintenance...');
    // Implement database vacuum and analyze operations
    await new Promise(resolve => setTimeout(resolve, 5000)); // Simulate work
    logger.info('Database maintenance completed');
  }

  private async optimizeDatabaseIndexes(): Promise<void> {
    logger.info('Optimizing database indexes...');
    // Implement index optimization logic
    await new Promise(resolve => setTimeout(resolve, 3000)); // Simulate work
    logger.info('Database index optimization completed');
  }

  private async warmupCache(): Promise<void> {
    logger.info('Warming up cache...');
    // Implement cache warmup logic
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate work
    logger.info('Cache warmup completed');
  }

  private async performSecurityScan(): Promise<void> {
    logger.info('Performing security scan...');
    // Implement security scanning logic
    await new Promise(resolve => setTimeout(resolve, 10000)); // Simulate work
    logger.info('Security scan completed');
  }

  private async verifyBackups(): Promise<void> {
    logger.info('Verifying backups...');
    // Implement backup verification logic
    await new Promise(resolve => setTimeout(resolve, 8000)); // Simulate work
    logger.info('Backup verification completed');
  }

  private async monitorSystemHealth(): Promise<void> {
    logger.debug('Monitoring system health...');
    // Implement system health monitoring logic
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate work
    logger.debug('System health monitoring completed');
  }

  private async synchronizeOrderStatuses(): Promise<void> {
    logger.info('Synchronizing order statuses...');
    // Implement order status synchronization logic
    await new Promise(resolve => setTimeout(resolve, 3000)); // Simulate work
    logger.info('Order status synchronization completed');
  }

  private async reconcilePayments(): Promise<void> {
    logger.info('Reconciling payments...');
    // Implement payment reconciliation logic
    await new Promise(resolve => setTimeout(resolve, 5000)); // Simulate work
    logger.info('Payment reconciliation completed');
  }

  // Public methods
  public start(): void {
    if (this.isStarted) {
      logger.warn('Task scheduler is already started');
      return;
    }

    this.cronJobs.forEach((job, taskId) => {
      const task = this.tasks.get(taskId);
      if (task?.enabled) {
        job.start();
        logger.info(`Started scheduled task: ${task.name}`);
      }
    });

    this.isStarted = true;
    logger.info('Task scheduler started');
  }

  public stop(): void {
    if (!this.isStarted) {
      logger.warn('Task scheduler is not started');
      return;
    }

    this.cronJobs.forEach((job, taskId) => {
      job.stop();
      const task = this.tasks.get(taskId);
      if (task) {
        logger.info(`Stopped scheduled task: ${task.name}`);
      }
    });

    this.isStarted = false;
    logger.info('Task scheduler stopped');
  }

  public enableTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      logger.error(`Task not found: ${taskId}`);
      return false;
    }

    task.enabled = true;
    task.retryCount = 0;
    task.status = 'idle';
    
    if (!this.cronJobs.has(taskId)) {
      this.scheduleTask(task);
    }
    
    if (this.isStarted) {
      const job = this.cronJobs.get(taskId);
      job?.start();
    }
    
    logger.info(`Enabled task: ${task.name}`);
    return true;
  }

  public disableTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    const job = this.cronJobs.get(taskId);
    
    if (!task) {
      logger.error(`Task not found: ${taskId}`);
      return false;
    }

    task.enabled = false;
    job?.stop();
    
    logger.info(`Disabled task: ${task.name}`);
    return true;
  }

  public async triggerTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) {
      logger.error(`Task not found: ${taskId}`);
      return false;
    }

    try {
      await this.executeTask(taskId);
      return true;
    } catch (error) {
      logger.error(`Failed to trigger task ${task.name}:`, error);
      return false;
    }
  }

  public getTaskStatus(taskId?: string): Record<string, any> | any {
    if (taskId) {
      const task = this.tasks.get(taskId);
      return task ? this.formatTaskStatus(task) : null;
    }

    const status: Record<string, any> = {};
    this.tasks.forEach((task, id) => {
      status[id] = this.formatTaskStatus(task);
    });
    
    return status;
  }

  private formatTaskStatus(task: ScheduledTask): any {
    return {
      id: task.id,
      name: task.name,
      description: task.description,
      enabled: task.enabled,
      status: task.status,
      priority: task.priority,
      schedule: task.schedule,
      lastRun: task.lastRun,
      retryCount: task.retryCount,
      maxRetries: task.maxRetries,
      executionHistory: task.executionHistory.slice(-5), // Last 5 executions
    };
  }

  public getServiceStatus(): {
    isStarted: boolean;
    totalTasks: number;
    enabledTasks: number;
    runningTasks: number;
    failedTasks: number;
  } {
    const tasks = Array.from(this.tasks.values());
    
    return {
      isStarted: this.isStarted,
      totalTasks: tasks.length,
      enabledTasks: tasks.filter(t => t.enabled).length,
      runningTasks: this.runningTasks.size,
      failedTasks: tasks.filter(t => t.status === 'failed').length,
    };
  }
}

// Export singleton instance
export const taskSchedulerService = new TaskSchedulerService();