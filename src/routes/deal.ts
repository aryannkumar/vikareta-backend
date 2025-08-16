import express, { Request, Response } from 'express';
import { dealService, CreateDealRequest, UpdateDealStatusRequest } from '../services/deal.service';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * POST /api/deals
 * Create a new deal
 */
router.post('/', async (req: Request, res: Response)=> {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const createRequest: CreateDealRequest = {
      buyerId: req.body.buyerId,
      sellerId: req.body.sellerId,
      rfqId: req.body.rfqId,
      quoteId: req.body.quoteId,
      orderId: req.body.orderId,
      dealValue: req.body.dealValue,
      milestone: req.body.milestone
    };

    // Validate required fields
    if (!createRequest.buyerId || !createRequest.sellerId || !createRequest.dealValue) {
      return res.status(400).json({
        success: false,
        message: 'buyerId, sellerId, and dealValue are required'
      });
    }

    // Ensure user is either buyer or seller
    if (createRequest.buyerId !== userId && createRequest.sellerId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only create deals where you are the buyer or seller'
      });
    }

    const result = await dealService.createDeal(createRequest);

    if (result.success) {
      return res.status(201).json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in POST /api/deals:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/deals
 * Get user's deals with filtering and pagination
 */
router.get('/', async (req: Request, res: Response)=> {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const options = {
      status: req.query.status as string,
      role: req.query.role as 'buyer' | 'seller' | 'both',
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      sortBy: req.query.sortBy as 'createdAt' | 'dealValue' | 'status',
      sortOrder: req.query.sortOrder as 'asc' | 'desc'
    };

    const result = await dealService.getUserDeals(userId, options);

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in GET /api/deals:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/deals/metrics
 * Get deal performance metrics
 */
router.get('/metrics', async (req: Request, res: Response)=> {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const role = req.query.role as 'buyer' | 'seller' | 'both' || 'both';
    const result = await dealService.getDealMetrics(userId, role);

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in GET /api/deals/metrics:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/deals/analytics
 * Get deal analytics and insights
 */
router.get('/analytics', async (req: Request, res: Response)=> {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const role = req.query.role as 'buyer' | 'seller' | 'both' || 'both';
    const result = await dealService.getDealAnalytics(userId, role);

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in GET /api/deals/analytics:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/deals/follow-up
 * Get deals that need follow-up
 */
router.get('/follow-up', async (req: Request, res: Response)=> {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const result = await dealService.getDealsNeedingFollowUp(userId);

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in GET /api/deals/follow-up:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/deals/archive
 * Archive completed or cancelled deals
 */
router.post('/archive', async (req: Request, res: Response)=> {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const dealIds = req.body.dealIds;
    if (!Array.isArray(dealIds) || dealIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'dealIds must be a non-empty array'
      });
    }

    const result = await dealService.archiveDeals(userId, dealIds);

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in POST /api/deals/archive:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/deals/process-follow-ups
 * Process automated follow-up reminders (admin/system endpoint)
 */
router.post('/process-follow-ups', async (req: Request, res: Response)=> {
  try {
    // This would typically be protected by admin authentication
    // For now, we'll allow any authenticated user to trigger it
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const result = await dealService.processFollowUpReminders();

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in POST /api/deals/process-follow-ups:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/deals/:id
 * Get deal by ID
 */
router.get('/:id', async (req: Request, res: Response)=> {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const dealId = req.params.id;
    const result = await dealService.getDealById(dealId, userId);

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(404).json(result);
    }
  } catch (error) {
    logger.error('Error in GET /api/deals/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * PUT /api/deals/:id/status
 * Update deal status
 */
router.put('/:id/status', async (req: Request, res: Response)=> {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const updateRequest: UpdateDealStatusRequest = {
      dealId: req.params.id,
      status: req.body.status,
      milestone: req.body.milestone,
      nextFollowUp: req.body.nextFollowUp ? new Date(req.body.nextFollowUp) : undefined
    };

    // Validate status
    const validStatuses = ['initiated', 'negotiating', 'confirmed', 'completed', 'cancelled'];
    if (!validStatuses.includes(updateRequest.status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
      });
    }

    const result = await dealService.updateDealStatus(updateRequest, userId);

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in PUT /api/deals/:id/status:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});



/**
 * POST /api/deals/:id/messages
 * Send a message in a deal thread
 */
router.post('/:id/messages', async (req: Request, res: Response)=> {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const dealId = req.params.id;
    const { message, messageType = 'text' } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      });
    }

    const result = await dealService.sendDealMessage(dealId, userId, message.trim(), messageType);

    if (result.success) {
      return res.status(201).json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in POST /api/deals/:id/messages:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/deals/:id/messages
 * Get messages for a deal
 */
router.get('/:id/messages', async (req: Request, res: Response)=> {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const dealId = req.params.id;
    const options = {
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      search: req.query.search as string
    };

    const result = await dealService.getDealMessages(dealId, userId, options);

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in GET /api/deals/:id/messages:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/deals/:id/follow-up
 * Schedule a follow-up reminder
 */
router.post('/:id/follow-up', async (req: Request, res: Response)=> {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const dealId = req.params.id;
    const { reminderDate, reminderMessage } = req.body;

    if (!reminderDate) {
      return res.status(400).json({
        success: false,
        message: 'reminderDate is required'
      });
    }

    const result = await dealService.scheduleFollowUpReminder(
      dealId, 
      userId, 
      new Date(reminderDate), 
      reminderMessage
    );

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in POST /api/deals/:id/follow-up:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/deals/:id/escalate
 * Escalate a deal for mediation
 */
router.post('/:id/escalate', async (req: Request, res: Response)=> {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const dealId = req.params.id;
    const { escalationReason, escalationType } = req.body;

    if (!escalationReason || !escalationType) {
      return res.status(400).json({
        success: false,
        message: 'escalationReason and escalationType are required'
      });
    }

    const validEscalationTypes = ['dispute', 'delay', 'quality', 'payment', 'other'];
    if (!validEscalationTypes.includes(escalationType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid escalationType. Must be one of: ' + validEscalationTypes.join(', ')
      });
    }

    const result = await dealService.escalateDeal(dealId, userId, escalationReason, escalationType);

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in POST /api/deals/:id/escalate:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/deals/:id/communication-history
 * Get communication history for a deal with advanced filtering
 */
router.get('/:id/communication-history', async (req: Request, res: Response)=> {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const dealId = req.params.id;
    const options = {
      messageType: req.query.messageType as string,
      dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
      dateTo: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined,
      senderId: req.query.senderId as string,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined
    };

    const result = await dealService.getDealCommunicationHistory(dealId, userId, options);

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in GET /api/deals/:id/communication-history:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/deals/process-follow-ups
 * Process automated follow-up reminders (admin/system endpoint)
 */
router.post('/process-follow-ups', async (req: Request, res: Response)=> {
  try {
    // This would typically be protected by admin authentication
    // For now, we'll allow any authenticated user to trigger it
    const userId = req.authUser?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const result = await dealService.processFollowUpReminders();

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in POST /api/deals/process-follow-ups:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

export default router;