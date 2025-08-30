import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { messageService } from '../services/message.service';
import { logger } from '../utils/logger';
import { authenticate } from '../middleware/auth';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * GET /api/messages
 * Get messages with pagination and filtering
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
    }

    // Validate query parameters
    const querySchema = z.object({
      search: z.string().optional(),
      status: z.enum(['all', 'unread', 'read', 'replied', 'archived']).optional().default('all'),
      type: z.enum(['all', 'email', 'sms', 'notification', 'system']).optional().default('all'),
      priority: z.enum(['all', 'low', 'normal', 'high', 'urgent']).optional().default('all'),
      page: z.string().optional().default('1').transform(val => parseInt(val) || 1),
      limit: z.string().optional().default('20').transform(val => Math.min(parseInt(val) || 20, 100))
    });

    const validatedQuery = querySchema.parse(req.query);
    
    const result = await messageService.getMessages(userId, {
      search: validatedQuery.search,
      status: validatedQuery.status === 'all' ? undefined : validatedQuery.status,
      type: validatedQuery.type === 'all' ? undefined : validatedQuery.type,
      priority: validatedQuery.priority === 'all' ? undefined : validatedQuery.priority,
      page: parseInt(validatedQuery.page.toString()),
      limit: parseInt(validatedQuery.limit.toString())
    });

    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    logger.error('Error in GET /api/messages:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      }
    });
  }
});

/**
 * GET /api/messages/stats
 * Get communication statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
    }

    const result = await messageService.getCommunicationStats(userId);

    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    logger.error('Error in GET /api/messages/stats:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      }
    });
  }
});

/**
 * POST /api/messages
 * Send a new message
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
    }

    // Validate request body
    const messageSchema = z.object({
      to: z.string().min(1, 'Recipient is required'),
      subject: z.string().min(1, 'Subject is required').max(255, 'Subject too long'),
      content: z.string().min(1, 'Content is required'),
      type: z.enum(['email', 'sms', 'notification', 'system']).optional().default('email'),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal'),
      relatedType: z.string().optional(),
      relatedId: z.string().optional()
    });

    const validatedData = messageSchema.parse(req.body);
    
    const result = await messageService.sendMessage(userId, validatedData);

    if (result.success) {
      res.status(201).json({
        success: true,
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.issues
        }
      });
    }

    logger.error('Error in POST /api/messages:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      }
    });
  }
});

/**
 * PUT /api/messages/:id/read
 * Mark message as read
 */
router.put('/:id/read', async (req: Request, res: Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
    }

    const messageId = req.params.id;
    if (!messageId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Message ID is required'
        }
      });
    }

    const result = await messageService.markAsRead(messageId, userId);

    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    logger.error('Error in PUT /api/messages/:id/read:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      }
    });
  }
});

/**
 * PUT /api/messages/:id/archive
 * Archive message
 */
router.put('/:id/archive', async (req: Request, res: Response) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
    }

    const messageId = req.params.id;
    if (!messageId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Message ID is required'
        }
      });
    }

    const result = await messageService.archiveMessage(messageId, userId);

    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    logger.error('Error in PUT /api/messages/:id/archive:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      }
    });
  }
});

export default router;