import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';

export interface CustomerProfile {
  id: string;
  personalInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    businessName?: string;
  };
  demographics: {
    age?: number;
    gender?: string;
    location: {
      city: string;
      state: string;
      country: string;
    };
  };
  preferences: {
    categories: string[];
    priceRange: { min: number; max: number };
    communicationChannels: string[];
    language: string;
  };
  behavior: {
    totalOrders: number;
    totalSpent: number;
    averageOrderValue: number;
    lastOrderDate?: Date;
    favoriteCategories: string[];
    purchaseFrequency: 'low' | 'medium' | 'high';
  };
  engagement: {
    registrationDate: Date;
    lastActiveDate: Date;
    emailEngagement: number; // 0-100 score
    loyaltyScore: number; // 0-100 score
    riskScore: number; // 0-100 score (churn risk)
  };
  lifecycle: {
    stage: 'prospect' | 'new' | 'active' | 'loyal' | 'at_risk' | 'churned';
    value: 'low' | 'medium' | 'high' | 'vip';
    segment: string;
  };
}

export interface CustomerInteraction {
  id: string;
  customerId: string;
  type: 'email' | 'phone' | 'chat' | 'support_ticket' | 'order' | 'review';
  channel: string;
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo?: string;
  createdAt: Date;
  resolvedAt?: Date;
  tags: string[];
  metadata: any;
}

export interface CustomerSegment {
  id: string;
  name: string;
  description: string;
  criteria: {
    totalSpent?: { min?: number; max?: number };
    orderCount?: { min?: number; max?: number };
    lastOrderDays?: number;
    categories?: string[];
    location?: string[];
    registrationDays?: { min?: number; max?: number };
  };
  customerCount: number;
  averageValue: number;
}

export class CRMService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Get comprehensive customer profile
   */
  async getCustomerProfile(customerId: string): Promise<CustomerProfile> {
    try {
      const customer = await this.prisma.user.findUnique({
        where: { id: customerId },
        include: {
          buyerOrders: {
            include: {
              items: {
                include: {
                  product: {
                    include: {
                      category: true,
                    },
                  },
                },
              },
            },
          },
          shippingAddresses: true,
          reviews: true,
          notifications: {
            where: {
              createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
            },
          },
        },
      });

      if (!customer) {
        throw new Error('Customer not found');
      }

      // Calculate behavior metrics
      const totalOrders = customer.buyerOrders.length;
      const totalSpent = customer.buyerOrders.reduce((sum, order) => 
        sum + Number(order.totalAmount), 0
      );
      const averageOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;
      const lastOrderDate = customer.buyerOrders.length > 0 
        ? customer.buyerOrders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0].createdAt
        : undefined;

      // Calculate favorite categories
      const categoryCount = new Map<string, number>();
      customer.buyerOrders.forEach(order => {
        order.items.forEach(item => {
          const categoryName = item.product.category.name;
          categoryCount.set(categoryName, (categoryCount.get(categoryName) || 0) + item.quantity);
        });
      });

      const favoriteCategories = Array.from(categoryCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([category]) => category);

      // Calculate purchase frequency
      const daysSinceRegistration = Math.floor(
        (Date.now() - customer.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      const ordersPerMonth = daysSinceRegistration > 0 
        ? (totalOrders / daysSinceRegistration) * 30 
        : 0;

      let purchaseFrequency: 'low' | 'medium' | 'high' = 'low';
      if (ordersPerMonth > 2) purchaseFrequency = 'high';
      else if (ordersPerMonth > 0.5) purchaseFrequency = 'medium';

      // Calculate engagement scores
      const emailEngagement = this.calculateEmailEngagement(customer.notifications);
      const loyaltyScore = this.calculateLoyaltyScore(customer);
      const riskScore = this.calculateChurnRisk(customer);

      // Determine lifecycle stage and value
      const lifecycle = this.determineCustomerLifecycle(customer, totalOrders, totalSpent, lastOrderDate);

      // Get primary address for location
      const primaryAddress = customer.shippingAddresses.find(addr => addr.isDefault) 
        || customer.shippingAddresses[0];

      return {
        id: customer.id,
        personalInfo: {
          firstName: customer.firstName || '',
          lastName: customer.lastName || '',
          email: customer.email || '',
          phone: customer.phone || '',
          businessName: customer.businessName || undefined,
        },
        demographics: {
          location: {
            city: primaryAddress?.city || '',
            state: primaryAddress?.state || '',
            country: primaryAddress?.country || 'India',
          },
        },
        preferences: {
          categories: favoriteCategories,
          priceRange: this.calculatePriceRange(customer.buyerOrders),
          communicationChannels: ['email', 'sms'], // Default preferences
          language: 'en',
        },
        behavior: {
          totalOrders,
          totalSpent,
          averageOrderValue,
          lastOrderDate,
          favoriteCategories,
          purchaseFrequency,
        },
        engagement: {
          registrationDate: customer.createdAt,
          lastActiveDate: customer.updatedAt,
          emailEngagement,
          loyaltyScore,
          riskScore,
        },
        lifecycle,
      };
    } catch (error) {
      logger.error('Error getting customer profile:', error);
      throw error;
    }
  }

  /**
   * Create customer interaction
   */
  async createInteraction(interaction: Omit<CustomerInteraction, 'id' | 'createdAt'>): Promise<string> {
    try {
      // In a real implementation, you would have a CustomerInteraction model
      const interactionId = `INT_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      // For now, create a notification as a proxy for interaction
      await this.prisma.notification.create({
        data: {
          userId: interaction.customerId,
          type: `interaction_${interaction.type}`,
          title: interaction.subject,
          message: interaction.description,
          data: {
            interactionId,
            channel: interaction.channel,
            status: interaction.status,
            priority: interaction.priority,
            assignedTo: interaction.assignedTo,
            tags: interaction.tags,
            metadata: interaction.metadata,
          },
        },
      });

      logger.info('Customer interaction created', {
        interactionId,
        customerId: interaction.customerId,
        type: interaction.type,
      });

      return interactionId;
    } catch (error) {
      logger.error('Error creating customer interaction:', error);
      throw error;
    }
  }

  /**
   * Get customer interactions
   */
  async getCustomerInteractions(
    customerId: string,
    filters: {
      type?: string;
      status?: string;
      dateFrom?: Date;
      dateTo?: Date;
    } = {},
    page = 1,
    limit = 20
  ): Promise<{
    interactions: CustomerInteraction[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const where: any = {
        userId: customerId,
        type: { startsWith: 'interaction_' },
      };

      if (filters.type) {
        where.type = `interaction_${filters.type}`;
      }

      if (filters.dateFrom || filters.dateTo) {
        where.createdAt = {};
        if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
        if (filters.dateTo) where.createdAt.lte = filters.dateTo;
      }

      const skip = (page - 1) * limit;

      const [notifications, total] = await Promise.all([
        this.prisma.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.notification.count({ where }),
      ]);

      const interactions: CustomerInteraction[] = notifications.map(notification => ({
        id: (notification.data as any)?.interactionId || notification.id,
        customerId: notification.userId,
        type: notification.type.replace('interaction_', '') as any,
        channel: (notification.data as any)?.channel || 'system',
        subject: notification.title,
        description: notification.message,
        status: (notification.data as any)?.status || 'open',
        priority: (notification.data as any)?.priority || 'medium',
        assignedTo: (notification.data as any)?.assignedTo,
        createdAt: notification.createdAt,
        resolvedAt: (notification.data as any)?.resolvedAt 
          ? new Date((notification.data as any).resolvedAt) 
          : undefined,
        tags: (notification.data as any)?.tags || [],
        metadata: (notification.data as any)?.metadata || {},
      }));

      return {
        interactions,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error('Error getting customer interactions:', error);
      throw error;
    }
  }

  /**
   * Create customer segment
   */
  async createCustomerSegment(segment: Omit<CustomerSegment, 'id' | 'customerCount' | 'averageValue'>): Promise<string> {
    try {
      const segmentId = `SEG_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      // Calculate customers matching criteria
      const customers = await this.getCustomersMatchingCriteria(segment.criteria);
      const customerCount = customers.length;
      const averageValue = customerCount > 0 
        ? customers.reduce((sum, c) => sum + c.totalSpent, 0) / customerCount 
        : 0;

      // Store segment (in a real implementation, you would have a CustomerSegment model)
      logger.info('Customer segment created', {
        segmentId,
        name: segment.name,
        customerCount,
        averageValue,
      });

      return segmentId;
    } catch (error) {
      logger.error('Error creating customer segment:', error);
      throw error;
    }
  }

  /**
   * Get customer segments
   */
  async getCustomerSegments(): Promise<CustomerSegment[]> {
    try {
      // Predefined segments for demo
      const segments: CustomerSegment[] = [
        {
          id: 'high_value',
          name: 'High Value Customers',
          description: 'Customers who have spent more than ₹50,000',
          criteria: { totalSpent: { min: 50000 } },
          customerCount: 0,
          averageValue: 0,
        },
        {
          id: 'frequent_buyers',
          name: 'Frequent Buyers',
          description: 'Customers with more than 10 orders',
          criteria: { orderCount: { min: 10 } },
          customerCount: 0,
          averageValue: 0,
        },
        {
          id: 'at_risk',
          name: 'At Risk Customers',
          description: 'Customers who haven\'t ordered in 90 days',
          criteria: { lastOrderDays: 90 },
          customerCount: 0,
          averageValue: 0,
        },
        {
          id: 'new_customers',
          name: 'New Customers',
          description: 'Customers registered in the last 30 days',
          criteria: { registrationDays: { max: 30 } },
          customerCount: 0,
          averageValue: 0,
        },
      ];

      // Calculate actual counts and values
      for (const segment of segments) {
        const customers = await this.getCustomersMatchingCriteria(segment.criteria);
        segment.customerCount = customers.length;
        segment.averageValue = customers.length > 0 
          ? customers.reduce((sum, c) => sum + c.totalSpent, 0) / customers.length 
          : 0;
      }

      return segments;
    } catch (error) {
      logger.error('Error getting customer segments:', error);
      throw error;
    }
  }

  /**
   * Get customer analytics
   */
  async getCustomerAnalytics(dateRange?: { from: Date; to: Date }): Promise<{
    overview: {
      totalCustomers: number;
      activeCustomers: number;
      newCustomers: number;
      churnedCustomers: number;
      averageLifetimeValue: number;
      customerAcquisitionCost: number;
    };
    segmentDistribution: Record<string, number>;
    cohortAnalysis: Array<{
      cohort: string;
      customers: number;
      retention: number[];
    }>;
    topCustomers: Array<{
      customerId: string;
      name: string;
      totalSpent: number;
      orderCount: number;
      lastOrderDate: Date;
    }>;
  }> {
    try {
      const where: any = {};
      if (dateRange) {
        where.createdAt = {
          gte: dateRange.from,
          lte: dateRange.to,
        };
      }

      const [allCustomers, newCustomers] = await Promise.all([
        this.prisma.user.findMany({
          include: {
            buyerOrders: {
              where: {
                status: { in: ['completed', 'delivered'] },
              },
            },
          },
        }),
        this.prisma.user.findMany({
          where: {
            ...where,
            createdAt: {
              gte: dateRange?.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
          },
        }),
      ]);

      // Calculate overview metrics
      const totalCustomers = allCustomers.length;
      const activeCustomers = allCustomers.filter(c => 
        c.buyerOrders.some(o => 
          o.createdAt > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        )
      ).length;

      const customersWithOrders = allCustomers.filter(c => c.buyerOrders.length > 0);
      const totalLifetimeValue = customersWithOrders.reduce((sum, customer) => 
        sum + customer.buyerOrders.reduce((orderSum, order) => 
          orderSum + Number(order.totalAmount), 0
        ), 0
      );
      const averageLifetimeValue = customersWithOrders.length > 0 
        ? totalLifetimeValue / customersWithOrders.length 
        : 0;

      // Calculate segment distribution
      const segments = await this.getCustomerSegments();
      const segmentDistribution: Record<string, number> = {};
      segments.forEach(segment => {
        segmentDistribution[segment.name] = segment.customerCount;
      });

      // Generate cohort analysis (simplified)
      const cohortAnalysis = this.generateCohortAnalysis(allCustomers);

      // Get top customers
      const topCustomers = customersWithOrders
        .map(customer => {
          const totalSpent = customer.buyerOrders.reduce((sum, order) => 
            sum + Number(order.totalAmount), 0
          );
          const lastOrder = customer.buyerOrders.sort((a, b) => 
            b.createdAt.getTime() - a.createdAt.getTime()
          )[0];

          return {
            customerId: customer.id,
            name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 
                  customer.businessName || 
                  customer.email || 
                  'Unknown',
            totalSpent,
            orderCount: customer.buyerOrders.length,
            lastOrderDate: lastOrder.createdAt,
          };
        })
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 10);

      return {
        overview: {
          totalCustomers,
          activeCustomers,
          newCustomers: newCustomers.length,
          churnedCustomers: totalCustomers - activeCustomers,
          averageLifetimeValue,
          customerAcquisitionCost: 500, // Mock value
        },
        segmentDistribution,
        cohortAnalysis,
        topCustomers,
      };
    } catch (error) {
      logger.error('Error getting customer analytics:', error);
      throw error;
    }
  }

  /**
   * Predict customer churn
   */
  async predictCustomerChurn(customerId: string): Promise<{
    churnProbability: number;
    riskLevel: 'low' | 'medium' | 'high';
    factors: Array<{
      factor: string;
      impact: number;
      description: string;
    }>;
    recommendations: string[];
  }> {
    try {
      const profile = await this.getCustomerProfile(customerId);
      const factors = [];
      let churnScore = 0;

      // Factor 1: Days since last order
      const daysSinceLastOrder = profile.behavior.lastOrderDate 
        ? Math.floor((Date.now() - profile.behavior.lastOrderDate.getTime()) / (1000 * 60 * 60 * 24))
        : 365;

      if (daysSinceLastOrder > 90) {
        const impact = Math.min(40, daysSinceLastOrder / 3);
        churnScore += impact;
        factors.push({
          factor: 'Inactivity',
          impact,
          description: `${daysSinceLastOrder} days since last order`,
        });
      }

      // Factor 2: Order frequency decline
      if (profile.behavior.purchaseFrequency === 'low') {
        const impact = 25;
        churnScore += impact;
        factors.push({
          factor: 'Low Purchase Frequency',
          impact,
          description: 'Customer has low purchase frequency',
        });
      }

      // Factor 3: Engagement score
      if (profile.engagement.emailEngagement < 30) {
        const impact = 20;
        churnScore += impact;
        factors.push({
          factor: 'Low Engagement',
          impact,
          description: 'Low email engagement score',
        });
      }

      // Factor 4: Support issues
      const recentInteractions = await this.getCustomerInteractions(customerId, {
        type: 'support_ticket',
        dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      });

      if (recentInteractions.total > 3) {
        const impact = 15;
        churnScore += impact;
        factors.push({
          factor: 'Support Issues',
          impact,
          description: `${recentInteractions.total} support tickets in last 30 days`,
        });
      }

      const churnProbability = Math.min(100, churnScore);
      let riskLevel: 'low' | 'medium' | 'high' = 'low';
      if (churnProbability > 70) riskLevel = 'high';
      else if (churnProbability > 40) riskLevel = 'medium';

      // Generate recommendations
      const recommendations = this.generateChurnPreventionRecommendations(factors, profile);

      return {
        churnProbability,
        riskLevel,
        factors,
        recommendations,
      };
    } catch (error) {
      logger.error('Error predicting customer churn:', error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private calculateEmailEngagement(notifications: any[]): number {
    // Mock email engagement calculation
    const emailNotifications = notifications.filter(n => n.channel === 'email');
    const readNotifications = emailNotifications.filter(n => n.isRead);
    
    return emailNotifications.length > 0 
      ? (readNotifications.length / emailNotifications.length) * 100 
      : 50;
  }

  private calculateLoyaltyScore(customer: any): number {
    const daysSinceRegistration = Math.floor(
      (Date.now() - customer.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    const orderCount = customer.buyerOrders.length;
    const totalSpent = customer.buyerOrders.reduce((sum: number, order: any) => 
      sum + Number(order.totalAmount), 0
    );

    // Simple loyalty score calculation
    let score = 0;
    if (daysSinceRegistration > 365) score += 20; // Long-term customer
    if (orderCount > 10) score += 30; // Frequent buyer
    if (totalSpent > 50000) score += 30; // High value
    if (customer.reviews?.length > 5) score += 20; // Engaged reviewer

    return Math.min(100, score);
  }

  private calculateChurnRisk(customer: any): number {
    const daysSinceLastOrder = customer.buyerOrders.length > 0
      ? Math.floor((Date.now() - Math.max(...customer.buyerOrders.map((o: any) => o.createdAt.getTime()))) / (1000 * 60 * 60 * 24))
      : 365;

    let risk = 0;
    if (daysSinceLastOrder > 90) risk += 40;
    if (daysSinceLastOrder > 180) risk += 30;
    if (customer.buyerOrders.length === 1) risk += 20; // One-time buyer
    if (!customer.isVerified) risk += 10;

    return Math.min(100, risk);
  }

  private determineCustomerLifecycle(
    customer: any, 
    totalOrders: number, 
    totalSpent: number, 
    lastOrderDate?: Date
  ): CustomerProfile['lifecycle'] {
    const daysSinceRegistration = Math.floor(
      (Date.now() - customer.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    const daysSinceLastOrder = lastOrderDate 
      ? Math.floor((Date.now() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24))
      : 365;

    let stage: CustomerProfile['lifecycle']['stage'] = 'prospect';
    let value: CustomerProfile['lifecycle']['value'] = 'low';

    // Determine stage
    if (totalOrders === 0) {
      stage = 'prospect';
    } else if (daysSinceRegistration <= 30 || totalOrders <= 2) {
      stage = 'new';
    } else if (daysSinceLastOrder > 180) {
      stage = 'churned';
    } else if (daysSinceLastOrder > 90) {
      stage = 'at_risk';
    } else if (totalOrders >= 10 && totalSpent >= 25000) {
      stage = 'loyal';
    } else {
      stage = 'active';
    }

    // Determine value
    if (totalSpent >= 100000) {
      value = 'vip';
    } else if (totalSpent >= 25000) {
      value = 'high';
    } else if (totalSpent >= 5000) {
      value = 'medium';
    }

    return {
      stage,
      value,
      segment: `${stage}_${value}`,
    };
  }

  private calculatePriceRange(orders: any[]): { min: number; max: number } {
    if (orders.length === 0) return { min: 0, max: 10000 };

    const orderValues = orders.map(order => Number(order.totalAmount));
    return {
      min: Math.min(...orderValues),
      max: Math.max(...orderValues),
    };
  }

  private async getCustomersMatchingCriteria(criteria: CustomerSegment['criteria']): Promise<Array<{
    id: string;
    totalSpent: number;
    orderCount: number;
  }>> {
    try {
      const customers = await this.prisma.user.findMany({
        include: {
          buyerOrders: {
            where: {
              status: { in: ['completed', 'delivered'] },
            },
          },
        },
      });

      return customers
        .map(customer => ({
          id: customer.id,
          totalSpent: customer.buyerOrders.reduce((sum, order) => 
            sum + Number(order.totalAmount), 0
          ),
          orderCount: customer.buyerOrders.length,
          registrationDays: Math.floor(
            (Date.now() - customer.createdAt.getTime()) / (1000 * 60 * 60 * 24)
          ),
          lastOrderDays: customer.buyerOrders.length > 0
            ? Math.floor((Date.now() - Math.max(...customer.buyerOrders.map(o => o.createdAt.getTime()))) / (1000 * 60 * 60 * 24))
            : 365,
        }))
        .filter(customer => {
          if (criteria.totalSpent?.min && customer.totalSpent < criteria.totalSpent.min) return false;
          if (criteria.totalSpent?.max && customer.totalSpent > criteria.totalSpent.max) return false;
          if (criteria.orderCount?.min && customer.orderCount < criteria.orderCount.min) return false;
          if (criteria.orderCount?.max && customer.orderCount > criteria.orderCount.max) return false;
          if (criteria.lastOrderDays && customer.lastOrderDays < criteria.lastOrderDays) return false;
          if (criteria.registrationDays?.min && customer.registrationDays < criteria.registrationDays.min) return false;
          if (criteria.registrationDays?.max && customer.registrationDays > criteria.registrationDays.max) return false;
          return true;
        });
    } catch (error) {
      logger.error('Error getting customers matching criteria:', error);
      return [];
    }
  }

  private generateCohortAnalysis(customers: any[]): Array<{
    cohort: string;
    customers: number;
    retention: number[];
  }> {
    // Simplified cohort analysis
    const cohorts = new Map();
    
    customers.forEach(customer => {
      const cohortMonth = customer.createdAt.toISOString().substring(0, 7);
      if (!cohorts.has(cohortMonth)) {
        cohorts.set(cohortMonth, []);
      }
      cohorts.get(cohortMonth).push(customer);
    });

    return Array.from(cohorts.entries())
      .map(([cohort, cohortCustomers]) => ({
        cohort,
        customers: cohortCustomers.length,
        retention: [100, 80, 65, 50, 40, 35], // Mock retention rates
      }))
      .sort((a, b) => b.cohort.localeCompare(a.cohort))
      .slice(0, 6);
  }

  private generateChurnPreventionRecommendations(
    factors: any[], 
    profile: CustomerProfile
  ): string[] {
    const recommendations = [];

    if (factors.some(f => f.factor === 'Inactivity')) {
      recommendations.push('Send personalized re-engagement email with special offer');
      recommendations.push('Recommend products based on previous purchases');
    }

    if (factors.some(f => f.factor === 'Low Purchase Frequency')) {
      recommendations.push('Offer subscription or bulk purchase discounts');
      recommendations.push('Send targeted promotions for favorite categories');
    }

    if (factors.some(f => f.factor === 'Low Engagement')) {
      recommendations.push('Improve email content relevance and frequency');
      recommendations.push('Send SMS or push notifications as alternative channels');
    }

    if (factors.some(f => f.factor === 'Support Issues')) {
      recommendations.push('Proactive customer service outreach');
      recommendations.push('Offer compensation or goodwill gesture');
    }

    if (profile.lifecycle.value === 'high' || profile.lifecycle.value === 'vip') {
      recommendations.push('Assign dedicated account manager');
      recommendations.push('Provide VIP customer support priority');
    }

    return recommendations;
  }
}

export default CRMService;