/**
 * Service Execution Service
 * Manages service execution lifecycle with proper schema alignment
 */

import { PrismaClient, ServiceAppointment } from '@prisma/client';

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
    scheduledDate: Date;
    duration?: string;
    status?: string;
    notes?: string;
  }): Promise<ServiceAppointment> {
    try {
      return await this.prisma.serviceAppointment.create({
        data: {
          serviceId: data.serviceId,
          orderId: data.orderId,
          scheduledDate: data.scheduledDate,
          duration: data.duration,
          status: data.status || 'scheduled',
          notes: data.notes,
        },
        include: {
          service: true,
          order: true,
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
  async getExecutionById(id: string): Promise<ServiceAppointment | null> {
    try {
      return await this.prisma.serviceAppointment.findUnique({
        where: { id },
        include: {
          service: true,
          order: true,
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
    status: string,
    notes?: string
  ): Promise<ServiceAppointment> {
    try {
      const updateData: any = {
        status,
        updatedAt: new Date(),
      };

      if (notes) updateData.notes = notes;

      return await this.prisma.serviceAppointment.update({
        where: { id },
        data: updateData,
        include: {
          service: true,
          order: true,
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
  async getExecutionsByService(serviceId: string): Promise<ServiceAppointment[]> {
    try {
      return await this.prisma.serviceAppointment.findMany({
        where: { serviceId },
        include: {
          service: true,
          order: true,
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
  async getExecutionsByStatus(status: string): Promise<ServiceAppointment[]> {
    try {
      return await this.prisma.serviceAppointment.findMany({
        where: { status },
        include: {
          service: true,
          order: true,
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
      await this.prisma.serviceAppointment.delete({
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
    scheduled: number;
    inProgress: number;
    completed: number;
    cancelled: number;
  }> {
    try {
      const where = serviceId ? { serviceId } : {};

      const [total, scheduled, inProgress, completed, cancelled] = await Promise.all([
        this.prisma.serviceAppointment.count({ where }),
        this.prisma.serviceAppointment.count({ where: { ...where, status: 'scheduled' } }),
        this.prisma.serviceAppointment.count({ where: { ...where, status: 'in_progress' } }),
        this.prisma.serviceAppointment.count({ where: { ...where, status: 'completed' } }),
        this.prisma.serviceAppointment.count({ where: { ...where, status: 'cancelled' } }),
      ]);

      return { total, scheduled, inProgress, completed, cancelled };
    } catch (error) {
      console.error('Error fetching execution stats:', error);
      throw new Error('Failed to fetch execution stats');
    }
  }

  /**
   * Update appointment notes
   */
  async updateNotes(id: string, notes: string): Promise<ServiceAppointment> {
    try {
      return await this.prisma.serviceAppointment.update({
        where: { id },
        data: { notes },
      });
    } catch (error) {
      console.error('Error updating notes:', error);
      throw new Error('Failed to update notes');
    }
  }
}

export const serviceExecutionService = new ServiceExecutionService();