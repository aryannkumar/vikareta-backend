/**
 * Credit Line Service for Vikareta B2B Platform
 * Handles credit line management for B2B buyers
 */

import { PrismaClient, CreditLine, CreditLineStatus } from '@prisma/client';

export interface CreateCreditLineData {
  buyerId: string;
  creditLimit: number;
  interestRate: number;
  termDays: number;
  approvedBy: string;
  metadata?: any;
}

export interface UpdateCreditLineData {
  creditLimit?: number;
  interestRate?: number;
  termDays?: number;
  status?: CreditLineStatus;
  metadata?: any;
}

export class CreditLineService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async createCreditLine(data: CreateCreditLineData): Promise<CreditLine> {
    return await this.prisma.creditLine.create({
      data: {
        ...data,
        status: 'ACTIVE',
        availableCredit: data.creditLimit,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      include: {
        buyer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
            email: true,
          },
        },
      },
    });
  }

  async updateCreditLine(id: string, data: UpdateCreditLineData): Promise<CreditLine> {
    return await this.prisma.creditLine.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
      include: {
        buyer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
            email: true,
          },
        },
      },
    });
  }

  async getCreditLines(filters: {
    buyerId?: string;
    status?: CreditLineStatus;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 20, ...whereFilters } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (whereFilters.buyerId) where.buyerId = whereFilters.buyerId;
    if (whereFilters.status) where.status = whereFilters.status;

    const [creditLines, total] = await Promise.all([
      this.prisma.creditLine.findMany({
        where,
        include: {
          buyer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.creditLine.count({ where }),
    ]);

    return {
      creditLines,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getCreditLineById(id: string): Promise<CreditLine | null> {
    return await this.prisma.creditLine.findUnique({
      where: { id },
      include: {
        buyer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
            email: true,
          },
        },
      },
    });
  }

  async getCreditLineByBuyer(buyerId: string): Promise<CreditLine | null> {
    return await this.prisma.creditLine.findUnique({
      where: { buyerId },
      include: {
        buyer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
            email: true,
          },
        },
      },
    });
  }

  async utilizeCreditLine(buyerId: string, amount: number): Promise<CreditLine> {
    const creditLine = await this.getCreditLineByBuyer(buyerId);
    
    if (!creditLine) {
      throw new Error('Credit line not found for buyer');
    }

    if (creditLine.status !== 'ACTIVE') {
      throw new Error('Credit line is not active');
    }

    if (creditLine.availableCredit < amount) {
      throw new Error('Insufficient credit available');
    }

    return await this.prisma.creditLine.update({
      where: { id: creditLine.id },
      data: {
        availableCredit: creditLine.availableCredit - amount,
        usedCredit: creditLine.usedCredit + amount,
        updatedAt: new Date(),
      },
    });
  }

  async repayCredit(buyerId: string, amount: number): Promise<CreditLine> {
    const creditLine = await this.getCreditLineByBuyer(buyerId);
    
    if (!creditLine) {
      throw new Error('Credit line not found for buyer');
    }

    const newUsedCredit = Math.max(0, creditLine.usedCredit - amount);
    const newAvailableCredit = creditLine.creditLimit - newUsedCredit;

    return await this.prisma.creditLine.update({
      where: { id: creditLine.id },
      data: {
        usedCredit: newUsedCredit,
        availableCredit: newAvailableCredit,
        updatedAt: new Date(),
      },
    });
  }

  async suspendCreditLine(id: string): Promise<CreditLine> {
    return await this.updateCreditLine(id, { status: 'SUSPENDED' });
  }

  async activateCreditLine(id: string): Promise<CreditLine> {
    return await this.updateCreditLine(id, { status: 'ACTIVE' });
  }

  async closeCreditLine(id: string): Promise<CreditLine> {
    return await this.updateCreditLine(id, { status: 'CLOSED' });
  }

  async getCreditUtilization(buyerId: string): Promise<{
    creditLimit: number;
    usedCredit: number;
    availableCredit: number;
    utilizationPercentage: number;
  }> {
    const creditLine = await this.getCreditLineByBuyer(buyerId);
    
    if (!creditLine) {
      throw new Error('Credit line not found for buyer');
    }

    return {
      creditLimit: creditLine.creditLimit,
      usedCredit: creditLine.usedCredit,
      availableCredit: creditLine.availableCredit,
      utilizationPercentage: (creditLine.usedCredit / creditLine.creditLimit) * 100,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.creditLine.count();
      return true;
    } catch (error) {
      console.error('CreditLineService health check failed:', error);
      return false;
    }
  }

  async cleanup(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

export const creditLineService = new CreditLineService();