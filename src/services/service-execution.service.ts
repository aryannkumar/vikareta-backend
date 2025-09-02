/**
 * Service Execution Service
 * Manages service execution lifecycle with proper schema alignment
 */

import { PrismaClient, ServiceExecution, ServiceOrderStatus } from '@prisma/client';

export class ServiceExecutionService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Create a new service execution
   */
  async createExecution(data: {
    serviceId: string;
    orderId: string;
    assigneeId?: string;
    scheduledDate?: Date;
    estimatedDuration?: string;
    requirements?: string;
    executionStatus?: ServiceOrderStatus;
  }): Promise<ServiceExecution> {
    try {
      return await this.prisma.ServiceExecution.create({
        data: {
          serviceId: data.serviceId,
          orderId: data.orderId,
          assigneeId: data.assigneeId,
          scheduledDate: data.scheduledDate,
          estimatedDuration: data.estimatedDuration,
          requirements: data.requirements,
          executionStatus: data.executionStatus || 'PENDING',
        },
        include: {
          service: true,
          order: true,
          assignee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
            },
          },
        },
      });
    } catch (error) {
      console.error('Error creating service execution:', error);
      throw new Error('Failed to create service execution');
    }
  }

  /**
   * Get execution by ID
   */
  async getExecutionById(id: string): Promise<ServiceExecution | null> {
    try {
      return await this.prisma.ServiceExecution.findUnique({
        where: { id },
        include: {
          service: true,
          order: true,
          assignee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
            },
          },
        },
      });
    } catch (error) {
      console.error('Error fetching service execution:', error);
      throw new Error('Failed to fetch service execution');
    }
  }

  /**
   * Update execution status
   */
  async updateExecutionStatus(
    id: string,
    executionStatus: ServiceOrderStatus,
    customerFeedback?: string,
    providerNotes?: string,
    qualityScore?: number
  ): Promise<ServiceExecution> {
    try {
      const updateData: any = {
        executionStatus,
        updatedAt: new Date(),
      };

      if (customerFeedback) updateData.customerFeedback = customerFeedback;
      if (providerNotes) updateData.providerNotes = providerNotes;
      if (qualityScore) updateData.qualityScore = qualityScore;

      if (executionStatus === 'IN_PROGRESS') {
        updateData.startedAt = new Date();
      } else if (executionStatus === 'COMPLETED') {
        updateData.completedAt = new Date();
      }

      return await this.prisma.ServiceExecution.update({
        where: { id },
        data: updateData,
        include: {
          service: true,
          order: true,
          assignee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
            },
          },
        },
      });
    } catch (error) {
      console.error('Error updating service execution status:', error);
      throw new Error('Failed to update service execution status');
    }
  }

  /**
   * Get executions by service
   */
  async getExecutionsByService(serviceId: string): Promise<ServiceExecution[]> {
    try {
      return await this.prisma.ServiceExecution.findMany({
        where: { serviceId },
        include: {
          service: true,
          order: true,
          assignee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      console.error('Error fetching executions by service:', error);
      throw new Error('Failed to fetch executions by service');
    }
  }

  /**
   * Get executions by status
   */
  async getExecutionsByStatus(executionStatus: ServiceOrderStatus): Promise<ServiceExecution[]> {
    try {
      return await this.prisma.ServiceExecution.findMany({
        where: { executionStatus },
        include: {
          service: true,
          order: true,
          assignee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      console.error('Error fetching executions by status:', error);
      throw new Error('Failed to fetch executions by status');
    }
  }

  /**
   * Delete execution
   */
  async deleteExecution(id: string): Promise<void> {
    try {
      await this.prisma.ServiceExecution.delete({
        where: { id },
      });
    } catch (error) {
      console.error('Error deleting service execution:', error);
      throw new Error('Failed to delete service execution');
    }
  }

  /**
   * Get execution statistics
   */
  async getExecutionStats(serviceId?: string): Promise<{
    total: number;
    pending: number;
    confirmed: number;
    scheduled: number;
    inProgress: number;
    completed: number;
    cancelled: number;
  }> {
    try {
      const where = serviceId ? { serviceId } : {};

      const [total, pending, confirmed, scheduled, inProgress, completed, cancelled] = await Promise.all([
        this.prisma.ServiceExecution.count({ where }),
        this.prisma.ServiceExecution.count({ where: { ...where, executionStatus: 'PENDING' } }),
        this.prisma.ServiceExecution.count({ where: { ...where, executionStatus: 'CONFIRMED' } }),
        this.prisma.ServiceExecution.count({ where: { ...where, executionStatus: 'SCHEDULED' } }),
        this.prisma.ServiceExecution.count({ where: { ...where, executionStatus: 'IN_PROGRESS' } }),
        this.prisma.ServiceExecution.count({ where: { ...where, executionStatus: 'COMPLETED' } }),
        this.prisma.ServiceExecution.count({ where: { ...where, executionStatus: 'CANCELLED' } }),
      ]);

      return { total, pending, confirmed, scheduled, inProgress, completed, cancelled };
    } catch (error) {
      console.error('Error fetching execution stats:', error);
      throw new Error('Failed to fetch execution stats');
    }
  }

  /**
   * Pause execution
   */
  async pauseExecution(id: string): Promise<ServiceExecution> {
    try {
      return await this.prisma.ServiceExecution.update({
        where: { id },
        data: {
          executionStatus: 'PENDING',
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      console.error('Error pausing execution:', error);
      throw new Error('Failed to pause execution');
    }
  }

  /**
   * Resume execution
   */
  async resumeExecution(id: string): Promise<ServiceExecution> {
    try {
      return await this.prisma.ServiceExecution.update({
        where: { id },
        data: {
          executionStatus: 'IN_PROGRESS',
          startedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      console.error('Error resuming execution:', error);
      throw new Error('Failed to resume execution');
    }
  }

  /**
   * Update work log
   */
  async updateWorkLog(id: string, workLog: any): Promise<ServiceExecution> {
    try {
      return await this.prisma.ServiceExecution.update({
        where: { id },
        data: { workLog },
      });
    } catch (error) {
      console.error('Error updating work log:', error);
      throw new Error('Failed to update work log');
    }
  }
}

export const serviceExecutionService = new ServiceExecutionService();