/**
 * Admin Action Service for Vikareta B2B Platform
 * Handles administrative actions and audit logging
 */

import { PrismaClient, AdminAction } from '@prisma/client';

export interface CreateAdminActionData {
  adminId: string;
  actionType: AdminActionType;
  targetType: string;
  targetId: string;
  description: string;
  metadata?: any;
}

export class AdminActionService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async createAdminAction(data: CreateAdminActionData): Promise<AdminAction> {
    return await this.prisma.adminAction.create({
      data: {
        ...data,
        createdAt: new Date(),
      },
      include: {
        admin: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  async getAdminActions(filters: {
    adminId?: string;
    actionType?: AdminActionType;
    targetType?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 20, ...whereFilters } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    
    if (whereFilters.adminId) where.adminId = whereFilters.adminId;
    if (whereFilters.actionType) where.actionType = whereFilters.actionType;
    if (whereFilters.targetType) where.targetType = whereFilters.targetType;
    
    if (whereFilters.startDate || whereFilters.endDate) {
      where.timestamp = {};
      if (whereFilters.startDate) where.timestamp.gte = whereFilters.startDate;
      if (whereFilters.endDate) where.timestamp.lte = whereFilters.endDate;
    }

    const [actions, total] = await Promise.all([
      this.prisma.adminAction.findMany({
        where,
        include: {
          admin: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.adminAction.count({ where }),
    ]);

    return {
      actions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getAdminActionById(id: string): Promise<AdminAction | null> {
    return await this.prisma.adminAction.findUnique({
      where: { id },
      include: {
        admin: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  async getAdminActionsByTarget(targetType: string, targetId: string): Promise<AdminAction[]> {
    return await this.prisma.adminAction.findMany({
      where: {
        targetType,
        targetId,
      },
      include: {
        admin: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.adminAction.count();
      return true;
    } catch (error) {
      console.error('AdminActionService health check failed:', error);
      return false;
    }
  }

  async cleanup(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

export const adminActionService = new AdminActionService();