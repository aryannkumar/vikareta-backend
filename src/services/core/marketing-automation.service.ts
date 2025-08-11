import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';

export interface MarketingCampaign {
  id: string;
  name: string;
  type: 'email' | 'sms' | 'push' | 'in_app';
  status: 'draft' | 'scheduled' | 'active' | 'paused' | 'completed';
  targetSegment: string;
  content: {
    subject?: string;
    body: string;
    template?: string;
    variables?: Record<string, any>;
  };
  schedule: {
    startDate: Date;
    endDate?: Date;
    frequency?: 'once' | 'daily' | 'weekly' | 'monthly';
    timezone: string;
  };
  targeting: {
    criteria: any;
    estimatedReach: number;
    actualReach?: number;
  };
  performance: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    converted: number;
    unsubscribed: number;
    bounced: number;
  };
  budget?: {
    allocated: number;
    spent: number;
  };
}

export interface AutomationWorkflow {
  id: string;
  name: string;
  description: string;
  trigger: {
    type: 'event' | 'date' | 'behavior' | 'segment_entry';
    conditions: any;
  };
  steps: Array<{
    id: string;
    type: 'email' | 'sms' | 'wait' | 'condition' | 'tag' | 'webhook';
    config: any;
    delay?: number; // in hours
  }>;
  isActive: boolean;
  performance: {
    triggered: number;
    completed: number;
    conversionRate: number;
  };
}

export interface CustomerJourney {
  customerId: string;
  touchpoints: Array<{
    timestamp: Date;
    channel: string;
    action: string;
    content?: string;
    outcome?: 'opened' | 'clicked' | 'converted' | 'ignored';
  }>;
  currentStage: string;
  nextBestAction: string;
  score: number;
}

export class MarketingAutomationService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Create marketing campaign
   */
  async createCampaign(campaign: Omit<MarketingCampaign, 'id' | 'performance'>): Promise<string> {
    try {
      const campaignId = `CAMP_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      // Calculate estimated reach
      const estimatedReach = await this.calculateEstimatedReach(campaign.targeting.criteria);

      // Store campaign (in a real implementation, you would have a MarketingCampaign model)
      logger.info('Marketing campaign created', {
        campaignId,
        name: campaign.name,
        type: campaign.type,
        estimatedReach,
      });

      // Schedule campaign if needed
      if (campaign.status === 'scheduled') {
        await this.scheduleCampaign(campaignId, campaign.schedule.startDate);
      }

      return campaignId;
    } catch (error) {
      logger.error('Error creating marketing campaign:', error);
      throw error;
    }
  }

  /**
   * Execute marketing campaign
   */
  async executeCampaign(campaignId: string): Promise<{
    success: boolean;
    sent: number;
    errors: string[];
  }> {
    try {
      // Get campaign details (mock implementation)
      const campaign = await this.getCampaignById(campaignId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Get target audience
      const targetCustomers = await this.getTargetAudience(campaign.targeting.criteria);

      let sent = 0;
      const errors: string[] = [];

      // Send to each customer
      for (const customer of targetCustomers) {
        try {
          await this.sendCampaignMessage(campaign, customer);
          sent++;
        } catch (error) {
          errors.push(`Failed to send to ${customer.id}: ${(error as Error).message}`);
        }
      }

      // Update campaign performance
      await this.updateCampaignPerformance(campaignId, {
        sent,
        delivered: sent, // Assume all sent are delivered for now
      });

      logger.info('Marketing campaign executed', {
        campaignId,
        sent,
        errors: errors.length,
      });

      return {
        success: errors.length === 0,
        sent,
        errors,
      };
    } catch (error) {
      logger.error('Error executing marketing campaign:', error);
      throw error;
    }
  }

  /**
   * Create automation workflow
   */
  async createWorkflow(workflow: Omit<AutomationWorkflow, 'id' | 'performance'>): Promise<string> {
    try {
      const workflowId = `WF_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      // Store workflow (in a real implementation, you would have an AutomationWorkflow model)
      logger.info('Automation workflow created', {
        workflowId,
        name: workflow.name,
        trigger: workflow.trigger.type,
        steps: workflow.steps.length,
      });

      // Activate workflow if needed
      if (workflow.isActive) {
        await this.activateWorkflow(workflowId);
      }

      return workflowId;
    } catch (error) {
      logger.error('Error creating automation workflow:', error);
      throw error;
    }
  }

  /**
   * Trigger automation workflow
   */
  async triggerWorkflow(
    workflowId: string,
    customerId: string,
    triggerData: any
  ): Promise<{
    success: boolean;
    executionId: string;
  }> {
    try {
      const workflow = await this.getWorkflowById(workflowId);
      if (!workflow || !workflow.isActive) {
        throw new Error('Workflow not found or inactive');
      }

      const executionId = `EXEC_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      // Execute workflow steps
      await this.executeWorkflowSteps(workflow, customerId, triggerData, executionId);

      logger.info('Automation workflow triggered', {
        workflowId,
        customerId,
        executionId,
      });

      return {
        success: true,
        executionId,
      };
    } catch (error) {
      logger.error('Error triggering automation workflow:', error);
      throw error;
    }
  }

  /**
   * Get customer journey
   */
  async getCustomerJourney(customerId: string): Promise<CustomerJourney> {
    try {
      // Get customer touchpoints from notifications and interactions
      const notifications = await this.prisma.notification.findMany({
        where: {
          userId: customerId,
          type: { in: ['marketing_email', 'marketing_sms', 'campaign_message'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      const touchpoints = notifications.map(notification => ({
        timestamp: notification.createdAt,
        channel: notification.channel || 'email',
        action: notification.type,
        content: notification.title || undefined,
        outcome: (notification.isRead ? 'opened' : 'ignored') as 'opened' | 'clicked' | 'converted' | 'ignored' | undefined,
      }));

      // Determine current stage
      const currentStage = await this.determineCustomerStage(customerId);

      // Calculate next best action
      const nextBestAction = await this.calculateNextBestAction(customerId, touchpoints);

      // Calculate engagement score
      const score = await this.calculateEngagementScore(customerId, touchpoints);

      return {
        customerId,
        touchpoints,
        currentStage,
        nextBestAction,
        score,
      };
    } catch (error) {
      logger.error('Error getting customer journey:', error);
      throw error;
    }
  }

  /**
   * Personalize content for customer
   */
  async personalizeContent(
    customerId: string,
    template: string,
    variables: Record<string, any> = {}
  ): Promise<string> {
    try {
      // Get customer profile
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
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      });

      if (!customer) {
        throw new Error('Customer not found');
      }

      // Build personalization variables
      const personalizedVars = {
        ...variables,
        firstName: customer.firstName || 'Valued Customer',
        lastName: customer.lastName || '',
        businessName: customer.businessName || '',
        totalOrders: customer.buyerOrders.length,
        lastOrderDate: customer.buyerOrders[0]?.createdAt.toDateString() || 'Never',
        favoriteCategory: this.getFavoriteCategory(customer.buyerOrders),
        recommendedProducts: await this.getRecommendedProducts(customerId),
      };

      // Replace template variables
      let personalizedContent = template;
      Object.entries(personalizedVars).forEach(([key, value]) => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        personalizedContent = personalizedContent.replace(regex, String(value));
      });

      return personalizedContent;
    } catch (error) {
      logger.error('Error personalizing content:', error);
      return template; // Return original template on error
    }
  }

  /**
   * A/B test campaigns
   */
  async createABTest(
    campaignA: Omit<MarketingCampaign, 'id' | 'performance'>,
    campaignB: Omit<MarketingCampaign, 'id' | 'performance'>,
    splitRatio = 0.5,
    testDuration = 24 // hours
  ): Promise<{
    testId: string;
    campaignAId: string;
    campaignBId: string;
  }> {
    try {
      const testId = `AB_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      // Create both campaigns
      const campaignAId = await this.createCampaign(campaignA);
      const campaignBId = await this.createCampaign(campaignB);

      // Split target audience
      const targetAudience = await this.getTargetAudience(campaignA.targeting.criteria);
      const splitIndex = Math.floor(targetAudience.length * splitRatio);
      
      const audienceA = targetAudience.slice(0, splitIndex);
      const audienceB = targetAudience.slice(splitIndex);

      // Schedule test execution
      setTimeout(async () => {
        await this.executeABTest(testId, campaignAId, campaignBId, audienceA, audienceB);
      }, 1000); // Execute immediately for demo

      logger.info('A/B test created', {
        testId,
        campaignAId,
        campaignBId,
        audienceASize: audienceA.length,
        audienceBSize: audienceB.length,
      });

      return {
        testId,
        campaignAId,
        campaignBId,
      };
    } catch (error) {
      logger.error('Error creating A/B test:', error);
      throw error;
    }
  }

  /**
   * Get marketing analytics
   */
  async getMarketingAnalytics(dateRange?: { from: Date; to: Date }): Promise<{
    overview: {
      totalCampaigns: number;
      activeCampaigns: number;
      totalSent: number;
      averageOpenRate: number;
      averageClickRate: number;
      averageConversionRate: number;
      roi: number;
    };
    channelPerformance: Record<string, {
      sent: number;
      openRate: number;
      clickRate: number;
      conversionRate: number;
    }>;
    topCampaigns: Array<{
      campaignId: string;
      name: string;
      type: string;
      sent: number;
      openRate: number;
      conversionRate: number;
      roi: number;
    }>;
    customerSegmentPerformance: Record<string, {
      customers: number;
      engagement: number;
      conversion: number;
    }>;
  }> {
    try {
      // Mock analytics data - in real implementation, aggregate from actual campaigns
      const overview = {
        totalCampaigns: 25,
        activeCampaigns: 8,
        totalSent: 15000,
        averageOpenRate: 22.5,
        averageClickRate: 3.2,
        averageConversionRate: 1.8,
        roi: 4.2,
      };

      const channelPerformance = {
        email: {
          sent: 10000,
          openRate: 25.0,
          clickRate: 4.0,
          conversionRate: 2.1,
        },
        sms: {
          sent: 3000,
          openRate: 95.0,
          clickRate: 8.0,
          conversionRate: 3.5,
        },
        push: {
          sent: 2000,
          openRate: 45.0,
          clickRate: 6.0,
          conversionRate: 2.8,
        },
      };

      const topCampaigns = [
        {
          campaignId: 'CAMP_001',
          name: 'Welcome Series',
          type: 'email',
          sent: 2500,
          openRate: 35.0,
          conversionRate: 5.2,
          roi: 8.5,
        },
        {
          campaignId: 'CAMP_002',
          name: 'Flash Sale Alert',
          type: 'sms',
          sent: 1200,
          openRate: 98.0,
          conversionRate: 12.0,
          roi: 15.2,
        },
        {
          campaignId: 'CAMP_003',
          name: 'Product Recommendations',
          type: 'email',
          sent: 3000,
          openRate: 28.0,
          conversionRate: 3.8,
          roi: 6.1,
        },
      ];

      const customerSegmentPerformance = {
        'High Value': {
          customers: 500,
          engagement: 45.0,
          conversion: 8.2,
        },
        'Frequent Buyers': {
          customers: 1200,
          engagement: 38.0,
          conversion: 6.5,
        },
        'New Customers': {
          customers: 800,
          engagement: 25.0,
          conversion: 3.1,
        },
        'At Risk': {
          customers: 600,
          engagement: 15.0,
          conversion: 1.8,
        },
      };

      return {
        overview,
        channelPerformance,
        topCampaigns,
        customerSegmentPerformance,
      };
    } catch (error) {
      logger.error('Error getting marketing analytics:', error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private async calculateEstimatedReach(criteria: any): Promise<number> {
    // Mock calculation - in real implementation, query database with criteria
    return Math.floor(Math.random() * 5000) + 1000;
  }

  private async scheduleCampaign(campaignId: string, startDate: Date): Promise<void> {
    const delay = startDate.getTime() - Date.now();
    if (delay > 0) {
      setTimeout(async () => {
        await this.executeCampaign(campaignId);
      }, delay);
    }
  }

  private async getCampaignById(campaignId: string): Promise<MarketingCampaign | null> {
    // Mock campaign retrieval
    return {
      id: campaignId,
      name: 'Sample Campaign',
      type: 'email',
      status: 'active',
      targetSegment: 'all',
      content: {
        subject: 'Special Offer Just for You!',
        body: 'Hello {{firstName}}, check out our latest products!',
      },
      schedule: {
        startDate: new Date(),
        timezone: 'Asia/Kolkata',
      },
      targeting: {
        criteria: {},
        estimatedReach: 1000,
      },
      performance: {
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        converted: 0,
        unsubscribed: 0,
        bounced: 0,
      },
    };
  }

  private async getTargetAudience(criteria: any): Promise<Array<{ id: string; email: string; phone?: string }>> {
    // Get customers based on criteria
    const customers = await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        phone: true,
      },
      take: 100, // Limit for demo
    });

    return customers.filter(c => c.email).map(c => ({
      id: c.id,
      email: c.email!,
      phone: c.phone || undefined,
    })); // Only customers with email
  }

  private async sendCampaignMessage(campaign: MarketingCampaign, customer: any): Promise<void> {
    // Personalize content
    const personalizedContent = await this.personalizeContent(
      customer.id,
      campaign.content.body,
      campaign.content.variables
    );

    // Create notification as campaign message
    await this.prisma.notification.create({
      data: {
        userId: customer.id,
        type: `marketing_${campaign.type}`,
        title: campaign.content.subject || 'Marketing Message',
        message: personalizedContent,
        channel: campaign.type,
        data: {
          campaignId: campaign.id,
          campaignName: campaign.name,
        },
      },
    });
  }

  private async updateCampaignPerformance(campaignId: string, performance: Partial<MarketingCampaign['performance']>): Promise<void> {
    // Update campaign performance metrics
    logger.info('Campaign performance updated', {
      campaignId,
      performance,
    });
  }

  private async getWorkflowById(workflowId: string): Promise<AutomationWorkflow | null> {
    // Mock workflow retrieval
    return {
      id: workflowId,
      name: 'Welcome Workflow',
      description: 'Onboard new customers',
      trigger: {
        type: 'event',
        conditions: { event: 'user_registered' },
      },
      steps: [
        {
          id: 'step1',
          type: 'email',
          config: {
            template: 'welcome_email',
            subject: 'Welcome to our platform!',
          },
        },
        {
          id: 'step2',
          type: 'wait',
          config: {},
          delay: 24, // 24 hours
        },
        {
          id: 'step3',
          type: 'email',
          config: {
            template: 'getting_started',
            subject: 'Getting started guide',
          },
        },
      ],
      isActive: true,
      performance: {
        triggered: 0,
        completed: 0,
        conversionRate: 0,
      },
    };
  }

  private async activateWorkflow(workflowId: string): Promise<void> {
    logger.info('Workflow activated', { workflowId });
  }

  private async executeWorkflowSteps(
    workflow: AutomationWorkflow,
    customerId: string,
    triggerData: any,
    executionId: string
  ): Promise<void> {
    for (const step of workflow.steps) {
      try {
        await this.executeWorkflowStep(step, customerId, triggerData, executionId);
        
        // Wait if delay is specified
        if (step.delay) {
          // In real implementation, schedule the next step
          logger.info('Workflow step scheduled', {
            executionId,
            stepId: step.id,
            delayHours: step.delay,
          });
        }
      } catch (error) {
        logger.error('Error executing workflow step:', error);
        break; // Stop execution on error
      }
    }
  }

  private async executeWorkflowStep(
    step: AutomationWorkflow['steps'][0],
    customerId: string,
    triggerData: any,
    executionId: string
  ): Promise<void> {
    switch (step.type) {
      case 'email':
        await this.sendWorkflowEmail(step, customerId, executionId);
        break;
      case 'sms':
        await this.sendWorkflowSMS(step, customerId, executionId);
        break;
      case 'wait':
        // Handled in executeWorkflowSteps
        break;
      case 'condition':
        // Evaluate condition and branch
        break;
      case 'tag':
        // Add tag to customer
        break;
      case 'webhook':
        // Send webhook
        break;
    }
  }

  private async sendWorkflowEmail(step: any, customerId: string, executionId: string): Promise<void> {
    const personalizedContent = await this.personalizeContent(
      customerId,
      step.config.body || 'Workflow email content',
      step.config.variables
    );

    await this.prisma.notification.create({
      data: {
        userId: customerId,
        type: 'workflow_email',
        title: step.config.subject || 'Workflow Email',
        message: personalizedContent,
        channel: 'email',
        data: {
          executionId,
          stepId: step.id,
        },
      },
    });
  }

  private async sendWorkflowSMS(step: any, customerId: string, executionId: string): Promise<void> {
    const personalizedContent = await this.personalizeContent(
      customerId,
      step.config.message || 'Workflow SMS content',
      step.config.variables
    );

    await this.prisma.notification.create({
      data: {
        userId: customerId,
        type: 'workflow_sms',
        title: 'SMS Message',
        message: personalizedContent,
        channel: 'sms',
        data: {
          executionId,
          stepId: step.id,
        },
      },
    });
  }

  private async determineCustomerStage(customerId: string): Promise<string> {
    const customer = await this.prisma.user.findUnique({
      where: { id: customerId },
      include: {
        buyerOrders: true,
      },
    });

    if (!customer) return 'unknown';

    const daysSinceRegistration = Math.floor(
      (Date.now() - customer.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    const orderCount = customer.buyerOrders.length;

    if (orderCount === 0) {
      return daysSinceRegistration <= 7 ? 'new_prospect' : 'cold_prospect';
    } else if (orderCount === 1) {
      return 'first_time_buyer';
    } else if (orderCount < 5) {
      return 'occasional_buyer';
    } else {
      return 'loyal_customer';
    }
  }

  private async calculateNextBestAction(customerId: string, touchpoints: any[]): Promise<string> {
    const recentTouchpoints = touchpoints.slice(0, 5);
    const hasRecentEmail = recentTouchpoints.some(t => t.channel === 'email');
    const hasRecentSMS = recentTouchpoints.some(t => t.channel === 'sms');

    if (!hasRecentEmail) {
      return 'Send personalized email with product recommendations';
    } else if (!hasRecentSMS) {
      return 'Send SMS with special offer';
    } else {
      return 'Wait for customer engagement before next touchpoint';
    }
  }

  private async calculateEngagementScore(customerId: string, touchpoints: any[]): Promise<number> {
    if (touchpoints.length === 0) return 0;

    const openedCount = touchpoints.filter(t => t.outcome === 'opened').length;
    const clickedCount = touchpoints.filter(t => t.outcome === 'clicked').length;

    const openRate = (openedCount / touchpoints.length) * 100;
    const clickRate = touchpoints.length > 0 ? (clickedCount / touchpoints.length) * 100 : 0;

    return Math.round((openRate * 0.6) + (clickRate * 0.4));
  }

  private getFavoriteCategory(orders: any[]): string {
    const categoryCount = new Map<string, number>();
    
    orders.forEach(order => {
      order.items?.forEach((item: any) => {
        const categoryName = item.product?.category?.name || 'Unknown';
        categoryCount.set(categoryName, (categoryCount.get(categoryName) || 0) + 1);
      });
    });

    if (categoryCount.size === 0) return 'General';

    return Array.from(categoryCount.entries())
      .sort((a, b) => b[1] - a[1])[0][0];
  }

  private async getRecommendedProducts(customerId: string): Promise<string[]> {
    // Mock product recommendations
    return ['Product A', 'Product B', 'Product C'];
  }

  private async executeABTest(
    testId: string,
    campaignAId: string,
    campaignBId: string,
    audienceA: any[],
    audienceB: any[]
  ): Promise<void> {
    // Execute both campaigns with their respective audiences
    logger.info('A/B test executed', {
      testId,
      campaignAId,
      campaignBId,
      audienceASize: audienceA.length,
      audienceBSize: audienceB.length,
    });
  }
}

export default MarketingAutomationService;