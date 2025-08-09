import { Router } from 'express';
import { z } from 'zod';
import { subscriptionService } from '../services/subscription.service';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

// Validation schemas
const createSubscriptionSchema = z.object({
  planId: z.enum(['free', 'basic', 'premium', 'enterprise']),
  customerDetails: z.object({
    customerId: z.string().min(1),
    customerName: z.string().min(1),
    customerEmail: z.string().email(),
    customerPhone: z.string().min(10),
  }),
  billingCycles: z.number().positive().optional(),
  returnUrl: z.string().url().optional(),
  notifyUrl: z.string().url().optional(),
});

const updateSubscriptionSchema = z.object({
  newPlanId: z.enum(['free', 'basic', 'premium', 'enterprise']).optional(),
  pauseSubscription: z.boolean().optional(),
  resumeSubscription: z.boolean().optional(),
}).refine(
  (data) => {
    const actions = [data.newPlanId, data.pauseSubscription, data.resumeSubscription].filter(Boolean);
    return actions.length === 1;
  },
  {
    message: "Exactly one action must be specified: newPlanId, pauseSubscription, or resumeSubscription",
  }
);

const prorationCalculationSchema = z.object({
  newPlanId: z.enum(['free', 'basic', 'premium', 'enterprise']),
});

/**
 * GET /api/subscriptions/plans
 * Get all available subscription plans
 */
router.get('/plans', async (req, res) => {
  try {
    const plans = subscriptionService.getSubscriptionPlans();
    
    return res.json({
      success: true,
      data: plans,
    });
  } catch (error) {
    logger.error('Error getting subscription plans:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'PLANS_FETCH_ERROR',
        message: 'Failed to get subscription plans',
      },
    });
  }
});

/**
 * GET /api/subscriptions/plans/:planId
 * Get specific subscription plan details
 */
router.get('/plans/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    const plan = subscriptionService.getSubscriptionPlan(planId);
    
    if (!plan) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PLAN_NOT_FOUND',
          message: 'Subscription plan not found',
        },
      });
    }

    return res.json({
      success: true,
      data: plan,
    });
  } catch (error) {
    logger.error('Error getting subscription plan:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'PLAN_FETCH_ERROR',
        message: 'Failed to get subscription plan',
      },
    });
  }
});

/**
 * POST /api/subscriptions
 * Create a new subscription
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const validatedData = createSubscriptionSchema.parse(req.body);
    const userId = req.authUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated',
        },
      });
    }

    // Check if user already has an active subscription
    const existingSubscription = await subscriptionService.getUserSubscription(userId);
    if (existingSubscription && !existingSubscription.isFreePlan && existingSubscription.status === 'active') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'SUBSCRIPTION_EXISTS',
          message: 'User already has an active subscription',
        },
      });
    }

    const subscription = await subscriptionService.createSubscription({
      userId,
      ...validatedData,
    });

    return res.status(201).json({
      success: true,
      data: subscription,
    });
  } catch (error) {
    logger.error('Error creating subscription:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.issues,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'SUBSCRIPTION_CREATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create subscription',
      },
    });
  }
});

/**
 * GET /api/subscriptions/current
 * Get current user's subscription
 */
router.get('/current', authenticate, async (req, res) => {
  try {
    const userId = req.authUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated',
        },
      });
    }

    const subscription = await subscriptionService.getUserSubscription(userId);

    return res.json({
      success: true,
      data: subscription,
    });
  } catch (error) {
    logger.error('Error getting user subscription:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'SUBSCRIPTION_FETCH_ERROR',
        message: 'Failed to get subscription',
      },
    });
  }
});

/**
 * PUT /api/subscriptions/:subscriptionId
 * Update subscription (upgrade/downgrade/pause/resume)
 */
router.put('/:subscriptionId', authenticate, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const validatedData = updateSubscriptionSchema.parse(req.body);
    const userId = req.authUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated',
        },
      });
    }

    // Verify subscription belongs to user
    const currentSubscription = await subscriptionService.getUserSubscription(userId);
    if (!currentSubscription || currentSubscription.id !== subscriptionId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Subscription does not belong to user',
        },
      });
    }

    const updatedSubscription = await subscriptionService.updateSubscription({
      subscriptionId,
      ...validatedData,
    });

    return res.json({
      success: true,
      data: updatedSubscription,
    });
  } catch (error) {
    logger.error('Error updating subscription:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.issues,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'SUBSCRIPTION_UPDATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to update subscription',
      },
    });
  }
});

/**
 * DELETE /api/subscriptions/:subscriptionId
 * Cancel subscription
 */
router.delete('/:subscriptionId', authenticate, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const userId = req.authUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated',
        },
      });
    }

    // Verify subscription belongs to user
    const currentSubscription = await subscriptionService.getUserSubscription(userId);
    if (!currentSubscription || currentSubscription.id !== subscriptionId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Subscription does not belong to user',
        },
      });
    }

    await subscriptionService.cancelSubscription(subscriptionId);

    return res.json({
      success: true,
      message: 'Subscription cancelled successfully',
    });
  } catch (error) {
    logger.error('Error cancelling subscription:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'SUBSCRIPTION_CANCEL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to cancel subscription',
      },
    });
  }
});

/**
 * GET /api/subscriptions/:subscriptionId/billing-history
 * Get billing history for subscription
 */
router.get('/:subscriptionId/billing-history', authenticate, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const userId = req.authUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated',
        },
      });
    }

    // Verify subscription belongs to user
    const currentSubscription = await subscriptionService.getUserSubscription(userId);
    if (!currentSubscription || currentSubscription.id !== subscriptionId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Subscription does not belong to user',
        },
      });
    }

    const billingHistory = await subscriptionService.getBillingHistory(subscriptionId);

    return res.json({
      success: true,
      data: billingHistory,
    });
  } catch (error) {
    logger.error('Error getting billing history:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'BILLING_HISTORY_ERROR',
        message: 'Failed to get billing history',
      },
    });
  }
});

/**
 * POST /api/subscriptions/:subscriptionId/calculate-proration
 * Calculate proration amount for plan change
 */
router.post('/:subscriptionId/calculate-proration', authenticate, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const validatedData = prorationCalculationSchema.parse(req.body);
    const userId = req.authUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated',
        },
      });
    }

    // Verify subscription belongs to user
    const currentSubscription = await subscriptionService.getUserSubscription(userId);
    if (!currentSubscription || currentSubscription.id !== subscriptionId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Subscription does not belong to user',
        },
      });
    }

    const prorationAmount = await subscriptionService.processProration(
      subscriptionId,
      validatedData.newPlanId
    );

    return res.json({
      success: true,
      data: {
        prorationAmount,
        isUpgrade: prorationAmount > 0,
        isDowngrade: prorationAmount < 0,
        description: prorationAmount > 0 
          ? `You will be charged ₹${Math.abs(prorationAmount)} for the upgrade`
          : prorationAmount < 0
          ? `You will receive ₹${Math.abs(prorationAmount)} credit for the downgrade`
          : 'No additional charge for this change',
      },
    });
  } catch (error) {
    logger.error('Error calculating proration:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.issues,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'PRORATION_CALCULATION_ERROR',
        message: error instanceof Error ? error.message : 'Failed to calculate proration',
      },
    });
  }
});

/**
 * POST /api/subscriptions/:subscriptionId/upgrade
 * Upgrade subscription with prorated billing
 */
router.post('/:subscriptionId/upgrade', authenticate, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const { newPlanId } = req.body;
    const userId = req.authUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated',
        },
      });
    }

    if (!newPlanId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'New plan ID is required',
        },
      });
    }

    // Verify subscription belongs to user
    const currentSubscription = await subscriptionService.getUserSubscription(userId);
    if (!currentSubscription || currentSubscription.id !== subscriptionId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Subscription does not belong to user',
        },
      });
    }

    const result = await subscriptionService.processUpgrade(subscriptionId, newPlanId);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error processing subscription upgrade:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'SUBSCRIPTION_UPGRADE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to process upgrade',
      },
    });
  }
});

/**
 * GET /api/subscriptions/:subscriptionId/invoice/:invoiceId
 * Get invoice details
 */
router.get('/:subscriptionId/invoice/:invoiceId', authenticate, async (req, res) => {
  try {
    const { subscriptionId, invoiceId } = req.params;
    const userId = req.authUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated',
        },
      });
    }

    // Verify subscription belongs to user
    const currentSubscription = await subscriptionService.getUserSubscription(userId);
    if (!currentSubscription || currentSubscription.id !== subscriptionId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Subscription does not belong to user',
        },
      });
    }

    // Generate invoice (in a real implementation, you'd fetch from database)
    const invoice = await subscriptionService.generateInvoice(subscriptionId, {
      invoiceId,
      status: 'paid',
    });

    return res.json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    logger.error('Error getting invoice:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INVOICE_FETCH_ERROR',
        message: 'Failed to get invoice',
      },
    });
  }
});

/**
 * POST /api/subscriptions/process-recurring-billing
 * Process recurring billing (admin endpoint)
 */
router.post('/process-recurring-billing', async (req, res) => {
  try {
    // In production, this would be protected with admin authentication
    // and likely called by a cron job or scheduled task
    
    await subscriptionService.processRecurringBilling();

    return res.json({
      success: true,
      message: 'Recurring billing processed successfully',
    });
  } catch (error) {
    logger.error('Error processing recurring billing:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'RECURRING_BILLING_ERROR',
        message: 'Failed to process recurring billing',
      },
    });
  }
});

/**
 * POST /api/subscriptions/:subscriptionId/handle-payment-failure
 * Handle payment failure (webhook endpoint)
 */
router.post('/:subscriptionId/handle-payment-failure', async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const failureData = req.body;

    await subscriptionService.handlePaymentFailure(subscriptionId, failureData);

    return res.json({
      success: true,
      message: 'Payment failure handled successfully',
    });
  } catch (error) {
    logger.error('Error handling payment failure:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'PAYMENT_FAILURE_HANDLING_ERROR',
        message: 'Failed to handle payment failure',
      },
    });
  }
});

/**
 * POST /api/subscriptions/webhook
 * Handle Cashfree subscription webhooks
 */
router.post('/webhook', async (req, res) => {
  try {
    const webhookData = req.body;
    
    logger.info('Received subscription webhook:', webhookData);

    await subscriptionService.handleWebhook(webhookData);

    return res.json({
      success: true,
      message: 'Webhook processed successfully',
    });
  } catch (error) {
    logger.error('Error processing subscription webhook:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'WEBHOOK_PROCESSING_ERROR',
        message: 'Failed to process webhook',
      },
    });
  }
});

export default router;