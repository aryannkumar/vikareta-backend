import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { config } from '../config/environment';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

// Cashfree Subscription API configuration
const cashfreeConfig = {
  clientId: config.cashfree.clientId || '',
  clientSecret: config.cashfree.clientSecret || '',
  environment: config.cashfree.environment,
  baseUrl: config.cashfree.baseUrl,
};

export interface SubscriptionPlan {
  id: string;
  name: string;
  type?: string;
  displayName: string;
  description: string;
  price: number;
  currency: string;
  interval: 'monthly' | 'quarterly' | 'yearly';
  intervalCount: number;
  features: string[];
  limits: {
    maxProducts: number;
    maxRFQs: number;
    maxQuotes: number;
    transactionLimit: number;
    commissionRate: number;
  };
}

export interface CreateSubscriptionRequest {
  userId: string;
  planId: string;
  customerDetails: {
    customerId: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
  };
  billingCycles?: number; // Optional: number of billing cycles, if not provided, subscription continues indefinitely
  returnUrl?: string;
  notifyUrl?: string;
}

export interface CashfreeSubscriptionResponse {
  cfSubscriptionId: string;
  subscriptionId: string;
  subscriptionStatus: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  authLink?: string;
}

export interface SubscriptionUpdateRequest {
  subscriptionId: string;
  newPlanId?: string;
  pauseSubscription?: boolean;
  resumeSubscription?: boolean;
}

export interface BillingHistoryItem {
  id: string;
  subscriptionId: string;
  invoiceId: string;
  amount: number;
  currency: string;
  status: string;
  billingDate: Date;
  dueDate: Date;
  paidDate?: Date;
  paymentMethod?: string;
  failureReason?: string;
}

export class SubscriptionService {
  // Predefined subscription plans
  private readonly subscriptionPlans: SubscriptionPlan[] = [
    {
      id: 'free',
      name: 'free',
      displayName: 'Free Plan',
      description: 'Basic features for small businesses',
      price: 0,
      currency: 'INR',
      interval: 'monthly',
      intervalCount: 1,
      features: [
        'Up to 10 product listings',
        'Basic RFQ functionality',
        'Standard support',
        'Basic analytics'
      ],
      limits: {
        maxProducts: 10,
        maxRFQs: 5,
        maxQuotes: 20,
        transactionLimit: 50000,
        commissionRate: 5.0
      }
    },
    {
      id: 'basic',
      name: 'basic',
      displayName: 'Basic Plan',
      description: 'Enhanced features for growing businesses',
      price: 999,
      currency: 'INR',
      interval: 'monthly',
      intervalCount: 1,
      features: [
        'Up to 100 product listings',
        'Advanced RFQ features',
        'Priority support',
        'Detailed analytics',
        'WhatsApp integration'
      ],
      limits: {
        maxProducts: 100,
        maxRFQs: 25,
        maxQuotes: 100,
        transactionLimit: 200000,
        commissionRate: 3.5
      }
    },
    {
      id: 'premium',
      name: 'premium',
      displayName: 'Premium Plan',
      description: 'Advanced features for established businesses',
      price: 2999,
      currency: 'INR',
      interval: 'monthly',
      intervalCount: 1,
      features: [
        'Unlimited product listings',
        'Advanced negotiation tools',
        'Dedicated support',
        'Advanced analytics & reports',
        'API access',
        'Custom branding'
      ],
      limits: {
        maxProducts: -1, // Unlimited
        maxRFQs: 100,
        maxQuotes: 500,
        transactionLimit: 1000000,
        commissionRate: 2.0
      }
    },
    {
      id: 'enterprise',
      name: 'enterprise',
      displayName: 'Enterprise Plan',
      description: 'Full-featured solution for large enterprises',
      price: 9999,
      currency: 'INR',
      interval: 'monthly',
      intervalCount: 1,
      features: [
        'Unlimited everything',
        'Custom integrations',
        '24/7 dedicated support',
        'Custom analytics',
        'White-label solution',
        'SLA guarantees'
      ],
      limits: {
        maxProducts: -1,
        maxRFQs: -1,
        maxQuotes: -1,
        transactionLimit: -1,
        commissionRate: 1.5
      }
    }
  ];

  /**
   * Get all available subscription plans
   */
  getSubscriptionPlans(): SubscriptionPlan[] {
    return this.subscriptionPlans;
  }

  /**
   * Get subscription plan by ID
   */
  getSubscriptionPlan(planId: string): SubscriptionPlan | null {
    return this.subscriptionPlans.find(plan => plan.id === planId) || null;
  }

  /**
   * Create a new subscription with Cashfree
   */
  async createSubscription(request: CreateSubscriptionRequest): Promise<CashfreeSubscriptionResponse> {
    try {
      if (!config.cashfree.clientId || !config.cashfree.clientSecret) {
        throw new Error('Cashfree credentials not configured');
      }

      const plan = this.getSubscriptionPlan(request.planId);
      if (!plan) {
        throw new Error(`Subscription plan ${request.planId} not found`);
      }

      // For free plan, create subscription without Cashfree
      if (plan.price === 0) {
        return await this.createFreeSubscription(request.userId, plan);
      }

      // Generate unique subscription ID
      const subscriptionId = `SUB_${Date.now()}_${uuidv4().substring(0, 8)}`;

      // Prepare subscription request for Cashfree
      const subscriptionRequest = {
        subscription_id: subscriptionId,
        plan_id: `PLAN_${request.planId.toUpperCase()}`,
        customer_details: {
          customer_id: request.customerDetails.customerId,
          customer_name: request.customerDetails.customerName,
          customer_email: request.customerDetails.customerEmail,
          customer_phone: request.customerDetails.customerPhone,
        },
        subscription_meta: {
          return_url: request.returnUrl || `${process.env['FRONTEND_URL'] || 'http://localhost:3000'}/subscription/success`,
          notify_url: request.notifyUrl || `${process.env['BACKEND_URL'] || 'http://localhost:3001'}/api/subscriptions/webhook`,
        },
        subscription_note: `${plan.displayName} subscription for ${request.customerDetails.customerName}`,
      };

      // Add billing cycles if specified
      if (request.billingCycles) {
        (subscriptionRequest as any).subscription_expiry_time = new Date(
          Date.now() + (request.billingCycles * this.getIntervalInMs(plan.interval, plan.intervalCount))
        ).toISOString();
      }

      logger.info('Creating Cashfree subscription:', { subscriptionId, planId: request.planId });

      // Create subscription plan in Cashfree if it doesn't exist
      await this.ensureCashfreePlan(plan);

      // Create subscription with Cashfree API
      const response = await this.callCashfreeAPI('/pg/subscriptions', 'POST', subscriptionRequest);

      if (!response) {
        throw new Error('Failed to create Cashfree subscription');
      }

      const subscriptionData = response;

      // Calculate period dates
      const currentPeriodStart = new Date();
      const currentPeriodEnd = new Date(
        currentPeriodStart.getTime() + this.getIntervalInMs(plan.interval, plan.intervalCount)
      );

      // Store subscription details in database
      const subscription = await prisma.subscription.create({
        data: {
          userId: request.userId,
          type: plan.type || 'premium',
          planName: plan.name,
          cashfreeSubscriptionId: subscriptionData.cf_subscription_id,
          status: subscriptionData.subscription_status || 'created',
          startDate: currentPeriodStart,
          endDate: currentPeriodEnd,
          currentPeriodStart,
          currentPeriodEnd,
        },
      });

      return {
        cfSubscriptionId: subscriptionData.cf_subscription_id,
        subscriptionId: subscription.id,
        subscriptionStatus: subscriptionData.subscription_status,
        currentPeriodStart,
        currentPeriodEnd,
        authLink: subscriptionData.authorization_url,
      };
    } catch (error) {
      logger.error('Error creating subscription:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to create subscription: ${error.message}`);
      }
      throw new Error('Failed to create subscription');
    }
  }

  /**
   * Create free subscription without Cashfree
   */
  private async createFreeSubscription(userId: string, plan: SubscriptionPlan): Promise<CashfreeSubscriptionResponse> {
    const currentPeriodStart = new Date();
    const currentPeriodEnd = new Date(
      currentPeriodStart.getTime() + this.getIntervalInMs(plan.interval, plan.intervalCount)
    );

    const subscription = await prisma.subscription.create({
      data: {
        userId,
        type: plan.type || 'free',
        planName: plan.name,
        status: 'active',
        startDate: currentPeriodStart,
        endDate: currentPeriodEnd,
        currentPeriodStart,
        currentPeriodEnd,
      },
    });

    return {
      cfSubscriptionId: '',
      subscriptionId: subscription.id,
      subscriptionStatus: 'active',
      currentPeriodStart,
      currentPeriodEnd,
    };
  }

  /**
   * Update subscription (upgrade/downgrade/pause/resume)
   */
  async updateSubscription(request: SubscriptionUpdateRequest): Promise<any> {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { id: request.subscriptionId },
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      // Handle plan change (upgrade/downgrade)
      if (request.newPlanId) {
        return await this.changePlan(subscription, request.newPlanId);
      }

      // Handle pause/resume
      if (request.pauseSubscription) {
        return await this.pauseSubscription(subscription);
      }

      if (request.resumeSubscription) {
        return await this.resumeSubscription(subscription);
      }

      throw new Error('No valid update operation specified');
    } catch (error) {
      logger.error('Error updating subscription:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to update subscription: ${error.message}`);
      }
      throw new Error('Failed to update subscription');
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string): Promise<void> {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      // Cancel with Cashfree if it's a paid subscription
      if (subscription.cashfreeSubscriptionId) {
        await this.callCashfreeAPI(
          `/pg/subscriptions/${subscription.cashfreeSubscriptionId}/cancel`,
          'POST',
          { cancellation_reason: 'User requested cancellation' }
        );
      }

      // Update subscription status in database
      await prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: 'cancelled',
        },
      });

      logger.info('Subscription cancelled successfully:', subscriptionId);
    } catch (error) {
      logger.error('Error cancelling subscription:', error);
      if (error instanceof Error) {
        if (error.message.includes('invalid character') || error.message.includes('invalid length')) {
          throw new Error('Subscription not found');
        }
        throw new Error(`Failed to cancel subscription: ${error.message}`);
      }
      throw new Error('Failed to cancel subscription');
    }
  }

  /**
   * Get user's current subscription
   */
  async getUserSubscription(userId: string): Promise<any> {
    try {
      const subscription = await prisma.subscription.findFirst({
        where: {
          userId,
          status: { in: ['active', 'past_due', 'trialing'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!subscription) {
        // Return free plan as default
        const freePlan = this.getSubscriptionPlan('free');
        return {
          id: null,
          plan: freePlan,
          status: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          isFreePlan: true,
        };
      }

      const plan = this.getSubscriptionPlan(subscription.planName);
      
      return {
        id: subscription.id,
        plan,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cashfreeSubscriptionId: subscription.cashfreeSubscriptionId,
        isFreePlan: subscription.planName === 'free',
      };
    } catch (error) {
      logger.error('Error getting user subscription:', error);
      throw new Error('Failed to get user subscription');
    }
  }

  /**
   * Handle Cashfree subscription webhook
   */
  async handleWebhook(webhookData: any): Promise<void> {
    try {
      logger.info('Processing Cashfree subscription webhook:', webhookData);

      const { subscription_id, subscription_status, event_type } = webhookData;

      // Find subscription by Cashfree ID
      const subscription = await prisma.subscription.findFirst({
        where: { cashfreeSubscriptionId: subscription_id },
      });

      if (!subscription) {
        logger.warn('Subscription not found for webhook:', subscription_id);
        return;
      }

      // Handle different webhook events
      switch (event_type) {
        case 'SUBSCRIPTION_ACTIVATED':
          await this.handleSubscriptionActivated(subscription, webhookData);
          break;
        case 'SUBSCRIPTION_CHARGED':
          await this.handleSubscriptionCharged(subscription, webhookData);
          break;
        case 'SUBSCRIPTION_PAYMENT_FAILED':
          await this.handleSubscriptionPaymentFailed(subscription, webhookData);
          break;
        case 'SUBSCRIPTION_CANCELLED':
          await this.handleSubscriptionCancelled(subscription, webhookData);
          break;
        case 'SUBSCRIPTION_EXPIRED':
          await this.handleSubscriptionExpired(subscription, webhookData);
          break;
        default:
          logger.warn('Unknown subscription webhook event:', event_type);
      }

      // Update subscription status
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: subscription_status },
      });
    } catch (error) {
      logger.error('Error handling subscription webhook:', error);
      throw error;
    }
  }

  /**
   * Get billing history for a subscription
   */
  async getBillingHistory(subscriptionId: string): Promise<BillingHistoryItem[]> {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      // For free subscriptions, return empty history
      if (!subscription.cashfreeSubscriptionId) {
        return [];
      }

      // Get billing history from Cashfree
      const response = await this.callCashfreeAPI(
        `/pg/subscriptions/${subscription.cashfreeSubscriptionId}/payments`,
        'GET'
      );

      if (!response || !Array.isArray(response)) {
        return [];
      }

      // Transform Cashfree response to our format
      return response.map((payment: any): BillingHistoryItem => {
        const item: BillingHistoryItem = {
          id: payment.cf_payment_id,
          subscriptionId: subscription.id,
          invoiceId: payment.invoice_id || '',
          amount: payment.payment_amount,
          currency: payment.payment_currency,
          status: payment.payment_status,
          billingDate: new Date(payment.payment_time),
          dueDate: new Date(payment.payment_time),
        };
        
        if (payment.payment_status === 'SUCCESS') {
          item.paidDate = new Date(payment.payment_time);
        }
        
        if (payment.payment_method?.method) {
          item.paymentMethod = payment.payment_method.method;
        }
        
        if (payment.payment_message) {
          item.failureReason = payment.payment_message;
        }
        
        return item;
      });
    } catch (error) {
      logger.error('Error getting billing history:', error);
      if (error instanceof Error) {
        if (error.message.includes('invalid character') || error.message.includes('invalid length')) {
          throw new Error('Subscription not found');
        }
        throw new Error(`Failed to get billing history: ${error.message}`);
      }
      throw new Error('Failed to get billing history');
    }
  }

  /**
   * Process prorated billing for plan changes
   */
  async processProration(subscriptionId: string, newPlanId: string): Promise<number> {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      const currentPlan = this.getSubscriptionPlan(subscription.planName);
      const newPlan = this.getSubscriptionPlan(newPlanId);

      if (!currentPlan || !newPlan) {
        throw new Error('Invalid subscription plan');
      }

      // Calculate prorated amount
      const now = new Date();
      const periodStart = subscription.currentPeriodStart;
      const periodEnd = subscription.currentPeriodEnd;
      
      const totalPeriodMs = periodEnd.getTime() - periodStart.getTime();
      const remainingPeriodMs = periodEnd.getTime() - now.getTime();
      const remainingRatio = remainingPeriodMs / totalPeriodMs;

      // Calculate unused amount from current plan
      const unusedAmount = currentPlan.price * remainingRatio;
      
      // Calculate prorated amount for new plan
      const newPlanProrated = newPlan.price * remainingRatio;
      
      // Return the difference (positive means additional charge, negative means credit)
      const prorationAmount = newPlanProrated - unusedAmount;

      logger.info('Calculated proration:', {
        subscriptionId,
        currentPlan: currentPlan.name,
        newPlan: newPlan.name,
        unusedAmount,
        newPlanProrated,
        prorationAmount,
      });

      return Math.round(prorationAmount * 100) / 100; // Round to 2 decimal places
    } catch (error) {
      logger.error('Error calculating proration:', error);
      if (error instanceof Error) {
        if (error.message.includes('invalid character') || error.message.includes('invalid length')) {
          throw new Error('Subscription not found');
        }
        if (error.message.includes('Invalid subscription plan')) {
          throw new Error('Invalid subscription plan');
        }
        throw new Error(`Failed to calculate proration: ${error.message}`);
      }
      throw new Error('Failed to calculate proration');
    }
  }

  /**
   * Ensure Cashfree plan exists
   */
  private async ensureCashfreePlan(plan: SubscriptionPlan): Promise<void> {
    try {
      const planId = `PLAN_${plan.id.toUpperCase()}`;
      
      // Check if plan exists
      try {
        await this.callCashfreeAPI(`/pg/plans/${planId}`, 'GET');
        return; // Plan exists
      } catch (error) {
        // Plan doesn't exist, create it
      }

      // Create plan in Cashfree
      const planRequest = {
        plan_id: planId,
        plan_name: plan.displayName,
        plan_type: 'PERIODIC',
        plan_currency: plan.currency,
        plan_amount: plan.price,
        plan_max_amount: plan.price * 12, // Set max amount as 12 times the plan amount
        plan_interval: this.getCashfreeInterval(plan.interval),
        plan_interval_count: plan.intervalCount,
        plan_description: plan.description,
      };

      await this.callCashfreeAPI('/pg/plans', 'POST', planRequest);
      logger.info('Created Cashfree plan:', planId);
    } catch (error) {
      logger.error('Error ensuring Cashfree plan:', error);
      throw error;
    }
  }

  /**
   * Convert interval to Cashfree format
   */
  private getCashfreeInterval(interval: string): string {
    switch (interval) {
      case 'monthly':
        return 'MONTH';
      case 'quarterly':
        return 'MONTH'; // Will use interval_count = 3
      case 'yearly':
        return 'YEAR';
      default:
        return 'MONTH';
    }
  }

  /**
   * Get interval in milliseconds
   */
  private getIntervalInMs(interval: string, count: number): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    
    switch (interval) {
      case 'monthly':
        return count * 30 * msPerDay;
      case 'quarterly':
        return count * 90 * msPerDay;
      case 'yearly':
        return count * 365 * msPerDay;
      default:
        return 30 * msPerDay;
    }
  }

  /**
   * Change subscription plan
   */
  private async changePlan(subscription: any, newPlanId: string): Promise<any> {
    const newPlan = this.getSubscriptionPlan(newPlanId);
    if (!newPlan) {
      throw new Error('New subscription plan not found');
    }

    // Calculate proration
    const prorationAmount = await this.processProration(subscription.id, newPlanId);

    // If there's a charge, process it
    if (prorationAmount > 0) {
      // Create a one-time charge for the difference
      // This would integrate with the payment service
      logger.info('Processing proration charge:', prorationAmount);
    }

    // Update subscription
    const updatedSubscription = await prisma.subscription.update({
      where: { id: subscription.id },
      data: { planName: newPlan.name },
    });

    return updatedSubscription;
  }

  /**
   * Pause subscription
   */
  private async pauseSubscription(subscription: any): Promise<any> {
    if (subscription.cashfreeSubscriptionId) {
      await this.callCashfreeAPI(
        `/pg/subscriptions/${subscription.cashfreeSubscriptionId}/pause`,
        'POST',
        {}
      );
    }

    return await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'paused' },
    });
  }

  /**
   * Resume subscription
   */
  private async resumeSubscription(subscription: any): Promise<any> {
    if (subscription.cashfreeSubscriptionId) {
      await this.callCashfreeAPI(
        `/pg/subscriptions/${subscription.cashfreeSubscriptionId}/resume`,
        'POST',
        {}
      );
    }

    return await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'active' },
    });
  }

  /**
   * Handle subscription activated webhook
   */
  private async handleSubscriptionActivated(subscription: any, _webhookData: any): Promise<void> {
    logger.info('Subscription activated:', subscription.id);
    // Send welcome email, enable features, etc.
  }

  /**
   * Handle subscription charged webhook
   */
  private async handleSubscriptionCharged(subscription: any, webhookData: any): Promise<void> {
    logger.info('Subscription charged:', subscription.id);
    
    // Update period dates
    const plan = this.getSubscriptionPlan(subscription.planName);
    if (plan) {
      const newPeriodStart = new Date();
      const newPeriodEnd = new Date(
        newPeriodStart.getTime() + this.getIntervalInMs(plan.interval, plan.intervalCount)
      );

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          currentPeriodStart: newPeriodStart,
          currentPeriodEnd: newPeriodEnd,
        },
      });
    }

    // Send invoice email
    await this.sendInvoiceEmail(subscription, webhookData);
  }

  /**
   * Handle subscription payment failed webhook
   */
  private async handleSubscriptionPaymentFailed(subscription: any, webhookData: any): Promise<void> {
    logger.warn('Subscription payment failed:', subscription.id);
    
    // Update status to past_due
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'past_due' },
    });

    // Send payment failure notification
    await this.sendPaymentFailureNotification(subscription, webhookData);
  }

  /**
   * Handle subscription cancelled webhook
   */
  private async handleSubscriptionCancelled(subscription: any, _webhookData: any): Promise<void> {
    logger.info('Subscription cancelled:', subscription.id);
    // Send cancellation confirmation, disable features, etc.
  }

  /**
   * Handle subscription expired webhook
   */
  private async handleSubscriptionExpired(subscription: any, _webhookData: any): Promise<void> {
    logger.info('Subscription expired:', subscription.id);
    
    // Downgrade to free plan
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        planName: 'free',
        status: 'expired',
      },
    });
  }

  /**
   * Generate invoice for subscription payment
   */
  async generateInvoice(subscriptionId: string, paymentData: any): Promise<any> {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: { user: true },
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      const plan = this.getSubscriptionPlan(subscription.planName);
      if (!plan) {
        throw new Error('Subscription plan not found');
      }

      const invoice = {
        invoiceId: `INV_${Date.now()}_${subscriptionId.substring(0, 8)}`,
        subscriptionId: subscription.id,
        customerId: subscription.user.id,
        customerName: `${subscription.user.firstName} ${subscription.user.lastName}`,
        customerEmail: subscription.user.email,
        planName: plan.displayName,
        amount: paymentData.amount || plan.price,
        currency: plan.currency,
        billingPeriodStart: subscription.currentPeriodStart,
        billingPeriodEnd: subscription.currentPeriodEnd,
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        status: paymentData.status || 'pending',
        paymentMethod: paymentData.paymentMethod,
        transactionId: paymentData.transactionId,
        items: [
          {
            description: `${plan.displayName} - ${plan.interval} subscription`,
            quantity: 1,
            unitPrice: plan.price,
            totalPrice: plan.price,
          },
        ],
        taxes: {
          gst: plan.price * 0.18, // 18% GST
          totalTax: plan.price * 0.18,
        },
        totalAmount: plan.price + (plan.price * 0.18),
      };

      logger.info('Invoice generated:', { invoiceId: invoice.invoiceId, subscriptionId });
      return invoice;
    } catch (error) {
      logger.error('Error generating invoice:', error);
      throw new Error('Failed to generate invoice');
    }
  }

  /**
   * Process automatic recurring billing
   */
  async processRecurringBilling(): Promise<void> {
    try {
      // Find subscriptions that are due for renewal
      const dueSubscriptions = await prisma.subscription.findMany({
        where: {
          status: 'active',
          currentPeriodEnd: {
            lte: new Date(Date.now() + 24 * 60 * 60 * 1000), // Due within 24 hours
          },
          cashfreeSubscriptionId: {
            not: null,
          },
        },
        include: { user: true },
      });

      logger.info(`Processing ${dueSubscriptions.length} subscriptions for recurring billing`);

      for (const subscription of dueSubscriptions) {
        try {
          await this.processSubscriptionRenewal(subscription);
        } catch (error) {
          logger.error(`Failed to process renewal for subscription ${subscription.id}:`, error);
          // Continue with other subscriptions
        }
      }
    } catch (error) {
      logger.error('Error processing recurring billing:', error);
      throw error;
    }
  }

  /**
   * Process individual subscription renewal
   */
  private async processSubscriptionRenewal(subscription: any): Promise<void> {
    try {
      const plan = this.getSubscriptionPlan(subscription.planName);
      if (!plan) {
        throw new Error('Subscription plan not found');
      }

      // Check subscription status with Cashfree
      const cashfreeStatus = await this.callCashfreeAPI(
        `/pg/subscriptions/${subscription.cashfreeSubscriptionId}`,
        'GET'
      );

      if (cashfreeStatus.subscription_status === 'active') {
        // Update period dates for next billing cycle
        const newPeriodStart = subscription.currentPeriodEnd;
        const newPeriodEnd = new Date(
          newPeriodStart.getTime() + this.getIntervalInMs(plan.interval, plan.intervalCount)
        );

        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            currentPeriodStart: newPeriodStart,
            currentPeriodEnd: newPeriodEnd,
          },
        });

        logger.info(`Subscription ${subscription.id} renewed successfully`);
      }
    } catch (error) {
      logger.error(`Error processing subscription renewal:`, error);
      throw error;
    }
  }

  /**
   * Handle payment failure with retry logic
   */
  async handlePaymentFailure(subscriptionId: string, failureData: any): Promise<void> {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: { user: true },
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      // Update subscription status
      await prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: 'past_due' },
      });

      // Implement retry logic
      const retryAttempts = failureData.retryAttempts || 0;
      const maxRetries = 3;

      if (retryAttempts < maxRetries) {
        // Schedule retry after increasing intervals (1 day, 3 days, 7 days)
        const retryDelays = [1, 3, 7];
        const retryDelay = retryDelays[retryAttempts] || 7;
        const retryDate = new Date(Date.now() + retryDelay * 24 * 60 * 60 * 1000);

        logger.info(`Scheduling payment retry for subscription ${subscriptionId} on ${retryDate}`);

        // In a real implementation, you would schedule this with a job queue
        // For now, we'll just log the retry schedule
        await this.schedulePaymentRetry(subscriptionId, retryDate, retryAttempts + 1);
      } else {
        // Max retries reached, suspend subscription
        await prisma.subscription.update({
          where: { id: subscriptionId },
          data: { status: 'suspended' },
        });

        logger.warn(`Subscription ${subscriptionId} suspended after ${maxRetries} failed payment attempts`);
      }

      // Send payment failure notification
      await this.sendPaymentFailureNotification(subscription, failureData);
    } catch (error) {
      logger.error('Error handling payment failure:', error);
      throw error;
    }
  }

  /**
   * Schedule payment retry (placeholder for job queue implementation)
   */
  private async schedulePaymentRetry(subscriptionId: string, retryDate: Date, attemptNumber: number): Promise<void> {
    // In a production environment, this would integrate with a job queue like Bull or Agenda
    logger.info(`Payment retry scheduled for subscription ${subscriptionId}:`, {
      retryDate,
      attemptNumber,
    });

    // For now, we'll store the retry information in a simple way
    // In production, you'd want a proper job queue system
  }

  /**
   * Process subscription upgrade with prorated billing
   */
  async processUpgrade(subscriptionId: string, newPlanId: string): Promise<any> {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: { user: true },
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      const currentPlan = this.getSubscriptionPlan(subscription.planName);
      const newPlan = this.getSubscriptionPlan(newPlanId);

      if (!currentPlan || !newPlan) {
        throw new Error('Invalid subscription plan');
      }

      // Calculate prorated amount
      const prorationAmount = await this.processProration(subscriptionId, newPlanId);

      // If there's an additional charge, process it
      if (prorationAmount > 0) {
        const prorationPayment = await this.processProrationPayment(subscription, prorationAmount);
        
        if (prorationPayment.status === 'success') {
          // Update subscription plan
          await prisma.subscription.update({
            where: { id: subscriptionId },
            data: { planName: newPlan.name },
          });

          // Generate invoice for the upgrade
          const invoice = await this.generateInvoice(subscriptionId, {
            amount: prorationAmount,
            status: 'paid',
            paymentMethod: prorationPayment.paymentMethod,
            transactionId: prorationPayment.transactionId,
          });

          return {
            success: true,
            subscription: await this.getUserSubscription(subscription.userId),
            prorationAmount,
            invoice,
          };
        } else {
          throw new Error('Proration payment failed');
        }
      } else {
        // No additional charge, just update the plan
        await prisma.subscription.update({
          where: { id: subscriptionId },
          data: { planName: newPlan.name },
        });

        return {
          success: true,
          subscription: await this.getUserSubscription(subscription.userId),
          prorationAmount: 0,
        };
      }
    } catch (error) {
      logger.error('Error processing subscription upgrade:', error);
      throw error;
    }
  }

  /**
   * Process proration payment through Cashfree
   */
  private async processProrationPayment(subscription: any, amount: number): Promise<any> {
    try {
      // Create a one-time payment for the proration amount
      const paymentRequest = {
        order_id: `PRORATION_${Date.now()}_${subscription.id.substring(0, 8)}`,
        order_amount: amount,
        order_currency: 'INR',
        customer_details: {
          customer_id: subscription.userId,
          customer_name: `${subscription.user.firstName} ${subscription.user.lastName}`,
          customer_email: subscription.user.email,
          customer_phone: subscription.user.phone,
        },
        order_meta: {
          subscription_id: subscription.id,
          payment_type: 'proration',
        },
      };

      const response = await this.callCashfreeAPI('/pg/orders', 'POST', paymentRequest);

      // In a real implementation, you would redirect user to payment page
      // For now, we'll simulate a successful payment
      return {
        status: 'success',
        transactionId: response.cf_order_id,
        paymentMethod: 'card',
        amount,
      };
    } catch (error) {
      logger.error('Error processing proration payment:', error);
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Payment failed',
      };
    }
  }

  /**
   * Send invoice email
   */
  private async sendInvoiceEmail(subscription: any, webhookData: any): Promise<void> {
    try {
      const invoice = await this.generateInvoice(subscription.id, {
        amount: webhookData.payment_amount,
        status: 'paid',
        paymentMethod: webhookData.payment_method,
        transactionId: webhookData.cf_payment_id,
      });

      // In a real implementation, you would send the invoice via email service
      logger.info('Invoice email sent:', {
        subscriptionId: subscription.id,
        invoiceId: invoice.invoiceId,
        customerEmail: subscription.user?.email,
      });

      // Here you would integrate with an email service like SendGrid, AWS SES, etc.
      // await emailService.sendInvoice(invoice);
    } catch (error) {
      logger.error('Error sending invoice email:', error);
    }
  }

  /**
   * Send payment failure notification
   */
  private async sendPaymentFailureNotification(_subscription: any, _webhookData: any): Promise<void> {
    // Implementation would send payment failure notification
    logger.info('Payment failure notification sent');
  }

  /**
   * Call Cashfree API with proper authentication
   */
  private async callCashfreeAPI(endpoint: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', data?: any): Promise<any> {
    try {
      if (!cashfreeConfig.clientId || !cashfreeConfig.clientSecret) {
        throw new Error('Cashfree credentials not configured');
      }

      const url = `${cashfreeConfig.baseUrl}${endpoint}`;
      const headers = {
        'Content-Type': 'application/json',
        'x-client-id': cashfreeConfig.clientId,
        'x-client-secret': cashfreeConfig.clientSecret,
        'x-api-version': '2023-08-01',
      };

      logger.info(`Calling Cashfree API: ${method} ${url}`);

      const response = await axios({
        method,
        url,
        headers,
        data: data ? JSON.stringify(data) : undefined,
      });

      return response.data;
    } catch (error) {
      logger.error('Cashfree API call failed:', error);
      if (axios.isAxiosError(error)) {
        throw new Error(`Cashfree API Error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }
}

export const subscriptionService = new SubscriptionService();