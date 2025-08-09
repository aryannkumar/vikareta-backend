import express, { Request, Response } from 'express';
import { followService } from '../services/follow.service';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * POST /api/follow/:userId
 * Follow a user
 */
router.post('/:userId', async (req: Request, res: Response)=> {
  try {
    const followerId = req.authUser?.userId;
    const followingId = req.params.userId;

    if (!followerId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const result = await followService.followUser(followerId, followingId);

    if (result.success) {
      return res.status(201).json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in POST /api/follow/:userId:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * DELETE /api/follow/:userId
 * Unfollow a user
 */
router.delete('/:userId', async (req: Request, res: Response)=> {
  try {
    const followerId = req.authUser?.userId;
    const followingId = req.params.userId;

    if (!followerId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const result = await followService.unfollowUser(followerId, followingId);

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in DELETE /api/follow/:userId:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/follow/:userId/status
 * Check if current user is following another user
 */
router.get('/:userId/status', async (req: Request, res: Response)=> {
  try {
    const followerId = req.authUser?.userId;
    const followingId = req.params.userId;

    if (!followerId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const result = await followService.isFollowing(followerId, followingId);

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in GET /api/follow/:userId/status:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/follow/followers
 * Get current user's followers
 */
router.get('/followers', async (req: Request, res: Response)=> {
  try {
    const userId = req.authUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const options = {
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      sortBy: req.query.sortBy as 'createdAt' | 'name',
      sortOrder: req.query.sortOrder as 'asc' | 'desc'
    };

    const result = await followService.getFollowers(userId, options);

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in GET /api/follow/followers:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/follow/following
 * Get users that current user is following
 */
router.get('/following', async (req: Request, res: Response)=> {
  try {
    const userId = req.authUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const options = {
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      sortBy: req.query.sortBy as 'createdAt' | 'name',
      sortOrder: req.query.sortOrder as 'asc' | 'desc'
    };

    const result = await followService.getFollowing(userId, options);

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in GET /api/follow/following:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/follow/:userId/followers
 * Get followers of a specific user
 */
router.get('/:userId/followers', async (req: Request, res: Response)=> {
  try {
    const userId = req.params.userId;

    const options = {
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      sortBy: req.query.sortBy as 'createdAt' | 'name',
      sortOrder: req.query.sortOrder as 'asc' | 'desc'
    };

    const result = await followService.getFollowers(userId, options);

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in GET /api/follow/:userId/followers:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/follow/:userId/following
 * Get users that a specific user is following
 */
router.get('/:userId/following', async (req: Request, res: Response)=> {
  try {
    const userId = req.params.userId;

    const options = {
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      sortBy: req.query.sortBy as 'createdAt' | 'name',
      sortOrder: req.query.sortOrder as 'asc' | 'desc'
    };

    const result = await followService.getFollowing(userId, options);

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in GET /api/follow/:userId/following:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/follow/stats
 * Get follow statistics for current user
 */
router.get('/stats', async (req: Request, res: Response)=> {
  try {
    const userId = req.authUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const result = await followService.getFollowStats(userId);

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in GET /api/follow/stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/follow/:userId/stats
 * Get follow statistics for a specific user
 */
router.get('/:userId/stats', async (req: Request, res: Response)=> {
  try {
    const userId = req.params.userId;

    const result = await followService.getFollowStats(userId);

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in GET /api/follow/:userId/stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/follow/mutual/:userId
 * Get mutual follows between current user and another user
 */
router.get('/mutual/:userId', async (req: Request, res: Response)=> {
  try {
    const userId1 = req.authUser?.userId;
    const userId2 = req.params.userId;

    if (!userId1) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const result = await followService.getMutualFollows(userId1, userId2);

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in GET /api/follow/mutual/:userId:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/follow/analytics
 * Get follow analytics for current user
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

    const result = await followService.getFollowAnalytics(userId);

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in GET /api/follow/analytics:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/follow/suggestions
 * Get suggested users to follow
 */
router.get('/suggestions', async (req: Request, res: Response)=> {
  try {
    const userId = req.authUser?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const result = await followService.getSuggestedFollows(userId, limit);

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in GET /api/follow/suggestions:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

export default router;