import { Router } from 'express';
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { z } from 'zod';
import crypto from 'crypto';

const router = Router();
const prisma = new PrismaClient();

// Validation schemas
const createWebhookSchema = z.object({
  name: z.string().min(1).max(255),
  url: z.string().url(),
  events: z.array(z.string()).min(1)
});

const createApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  permissions: z.array(z.string()).min(1)
});

const updateIntegrationSchema = z.object({
  isEnabled: z.boolean().optional(),
  config: z.record(z.string(), z.any()).optional()
});

// GET /api/integrations - List available integrations
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    // Get user's integrations
    const userIntegrations = await prisma.integration.findMany({
      where: { userId }
    });

    // Define available integrations
    const availableIntegrations = [
      {
        id: 'stripe',
        name: 'Stripe',
        description: 'Accept payments online with Stripe',
        category: 'payment',
        provider: 'Stripe Inc.',
        logo: '/integrations/stripe.png',
        features: ['Credit Cards', 'Bank Transfers', 'Subscriptions', 'Invoicing']
      },
      {
        id: 'paypal',
        name: 'PayPal',
        description: 'PayPal payment processing',
        category: 'payment',
        provider: 'PayPal Holdings',
        logo: '/integrations/paypal.png',
        features: ['PayPal Payments', 'Express Checkout', 'Recurring Payments']
      },
      {
        id: 'fedex',
        name: 'FedEx',
        description: 'FedEx shipping integration',
        category: 'shipping',
        provider: 'FedEx Corporation',
        logo: '/integrations/fedex.png',
        features: ['Rate Calculation', 'Label Printing', 'Tracking', 'Pickup Scheduling']
      },
      {
        id: 'google-analytics',
        name: 'Google Analytics',
        description: 'Web analytics and reporting',
        category: 'analytics',
        provider: 'Google LLC',
        logo: '/integrations/google-analytics.png',
        features: ['Traffic Analytics', 'E-commerce Tracking', 'Custom Reports']
      },
      {
        id: 'mailchimp',
        name: 'Mailchimp',
        description: 'Email marketing automation',
        category: 'marketing',
        provider: 'Intuit Mailchimp',
        logo: '/integrations/mailchimp.png',
        features: ['Email Campaigns', 'Audience Management', 'Automation', 'Analytics']
      },
      {
        id: 'slack',
        name: 'Slack',
        description: 'Team communication and notifications',
        category: 'communication',
        provider: 'Slack Technologies',
        logo: '/integrations/slack.png',
        features: ['Notifications', 'Order Alerts', 'Team Updates']
      },
      {
        id: 'quickbooks',
        name: 'QuickBooks',
        description: 'Accounting and financial management',
        category: 'accounting',
        provider: 'Intuit Inc.',
        logo: '/integrations/quickbooks.png',
        features: ['Invoice Sync', 'Expense Tracking', 'Financial Reports', 'Tax Preparation']
      },
      {
        id: 'shopify',
        name: 'Shopify',
        description: 'E-commerce platform integration',
        category: 'inventory',
        provider: 'Shopify Inc.',
        logo: '/integrations/shopify.png',
        features: ['Product Sync', 'Inventory Management', 'Order Import', 'Customer Data']
      }
    ];

    // Merge with user's integration status
    const integrations = availableIntegrations.map(integration => {
      const userIntegration = userIntegrations.find(ui => ui.provider === integration.id);
      
      return {
        ...integration,
        status: userIntegration?.status || 'disconnected',
        isEnabled: userIntegration?.isEnabled || false,
        connectedAt: userIntegration?.connectedAt,
        lastSync: userIntegration?.lastSync,
        config: userIntegration?.config || {}
      };
    });

    res.json({
      success: true,
      data: integrations
    });
  } catch (error) {
    console.error('Error fetching integrations:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch integrations'
      }
    });
  }
});

// POST /api/integrations/:id/connect - Connect integration
router.post('/:id/connect', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;
    const { config = {} } = req.body;

    // Create or update integration
    const integration = await prisma.integration.upsert({
      where: {
        userId_provider: {
          userId,
          provider: id
        }
      },
      update: {
        status: 'connected',
        isEnabled: true,
        config,
        connectedAt: new Date(),
        lastSync: new Date()
      },
      create: {
        userId,
        provider: id,
        status: 'connected',
        isEnabled: true,
        config,
        connectedAt: new Date(),
        lastSync: new Date()
      }
    });

    res.json({
      success: true,
      data: integration,
      message: 'Integration connected successfully'
    });
  } catch (error) {
    console.error('Error connecting integration:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CONNECT_ERROR',
        message: 'Failed to connect integration'
      }
    });
  }
});

// POST /api/integrations/:id/disconnect - Disconnect integration
router.post('/:id/disconnect', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    await prisma.integration.updateMany({
      where: {
        userId,
        provider: id
      },
      data: {
        status: 'disconnected',
        isEnabled: false,
        config: {},
        connectedAt: null,
        lastSync: null
      }
    });

    res.json({
      success: true,
      message: 'Integration disconnected successfully'
    });
  } catch (error) {
    console.error('Error disconnecting integration:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DISCONNECT_ERROR',
        message: 'Failed to disconnect integration'
      }
    });
  }
});

// PUT /api/integrations/:id - Update integration
router.put('/:id', 
  authenticate, 
  validateRequest(updateIntegrationSchema), 
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = (req as any).user.id;
      const updateData = req.body;

      const integration = await prisma.integration.updateMany({
        where: {
          userId,
          provider: id
        },
        data: updateData
      });

      if (integration.count === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Integration not found'
          }
        });
      }

      res.json({
        success: true,
        message: 'Integration updated successfully'
      });
    } catch (error) {
      console.error('Error updating integration:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'UPDATE_ERROR',
          message: 'Failed to update integration'
        }
      });
    }
  }
);

// Webhook Routes

// GET /api/integrations/webhooks - List webhooks
router.get('/webhooks', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const webhooks = await prisma.webhook.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: webhooks
    });
  } catch (error) {
    console.error('Error fetching webhooks:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch webhooks'
      }
    });
  }
});

// POST /api/integrations/webhooks - Create webhook
router.post('/webhooks', 
  authenticate, 
  validateRequest(createWebhookSchema), 
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { name, url, events } = req.body;

      // Generate secret for webhook
      const secret = crypto.randomBytes(32).toString('hex');

      const webhook = await prisma.webhook.create({
        data: {
          userId,
          name,
          url,
          events,
          secret,
          isActive: true,
          successCount: 0,
          failureCount: 0
        }
      });

      res.status(201).json({
        success: true,
        data: webhook,
        message: 'Webhook created successfully'
      });
    } catch (error) {
      console.error('Error creating webhook:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CREATE_ERROR',
          message: 'Failed to create webhook'
        }
      });
    }
  }
);

// DELETE /api/integrations/webhooks/:id - Delete webhook
router.delete('/webhooks/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const webhook = await prisma.webhook.findFirst({
      where: {
        id,
        userId
      }
    });

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Webhook not found'
        }
      });
    }

    await prisma.webhook.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'Webhook deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting webhook:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_ERROR',
        message: 'Failed to delete webhook'
      }
    });
  }
});

// API Key Routes

// GET /api/integrations/api-keys - List API keys
router.get('/api-keys', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const apiKeys = await prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        key: true,
        permissions: true,
        createdAt: true,
        lastUsed: true,
        expiresAt: true,
        isActive: true
      }
    });

    res.json({
      success: true,
      data: apiKeys
    });
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch API keys'
      }
    });
  }
});

// POST /api/integrations/api-keys - Create API key
router.post('/api-keys', 
  authenticate, 
  validateRequest(createApiKeySchema), 
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { name, permissions } = req.body;

      // Generate API key
      const key = `vk_${crypto.randomBytes(32).toString('hex')}`;

      const apiKey = await prisma.apiKey.create({
        data: {
          userId,
          name,
          key,
          permissions,
          isActive: true
        }
      });

      res.status(201).json({
        success: true,
        data: apiKey,
        message: 'API key created successfully'
      });
    } catch (error) {
      console.error('Error creating API key:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CREATE_ERROR',
          message: 'Failed to create API key'
        }
      });
    }
  }
);

// DELETE /api/integrations/api-keys/:id - Delete API key
router.delete('/api-keys/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const apiKey = await prisma.apiKey.findFirst({
      where: {
        id,
        userId
      }
    });

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'API key not found'
        }
      });
    }

    await prisma.apiKey.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'API key deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting API key:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_ERROR',
        message: 'Failed to delete API key'
      }
    });
  }
});

// Test notification endpoint
router.post('/test-notification', authenticate, async (req: Request, res: Response) => {
  try {
    const { type, message } = req.body;
    const userId = (req as any).user.id;

    // Get user's notification settings
    const notificationSettings = await prisma.notificationSettings.findUnique({
      where: { userId }
    });

    // Simulate sending test notification based on type
    let result = { sent: false, channel: type };

    switch (type) {
      case 'email':
        const emailSettings = notificationSettings?.email as any;
        if (emailSettings?.enabled) {
          // Here you would integrate with your email service
          console.log(`Sending test email to ${emailSettings.address}: ${message}`);
          result.sent = true;
        }
        break;
      case 'sms':
        const smsSettings = notificationSettings?.sms as any;
        if (smsSettings?.enabled) {
          // Here you would integrate with your SMS service
          console.log(`Sending test SMS to ${smsSettings.phoneNumber}: ${message}`);
          result.sent = true;
        }
        break;
      case 'push':
        const pushSettings = notificationSettings?.push as any;
        if (pushSettings?.enabled) {
          // Here you would integrate with your push notification service
          console.log(`Sending test push notification: ${message}`);
          result.sent = true;
        }
        break;
      case 'inApp':
        const inAppSettings = notificationSettings?.inApp as any;
        if (inAppSettings?.enabled) {
          // Here you would send in-app notification
          console.log(`Sending test in-app notification: ${message}`);
          result.sent = true;
        }
        break;
    }

    res.json({
      success: true,
      data: result,
      message: result.sent ? 'Test notification sent successfully' : 'Notification channel not enabled'
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'TEST_ERROR',
        message: 'Failed to send test notification'
      }
    });
  }
});

export default router;