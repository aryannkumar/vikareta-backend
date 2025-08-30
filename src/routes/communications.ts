import { Router } from 'express';
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

// Validation schemas
const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  type: z.enum(['info', 'warning', 'success', 'urgent']),
  targetAudience: z.enum(['all', 'buyers', 'sellers', 'premium']),
  scheduledAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional()
});

const updateAnnouncementSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().min(1).optional(),
  type: z.enum(['info', 'warning', 'success', 'urgent']).optional(),
  targetAudience: z.enum(['all', 'buyers', 'sellers', 'premium']).optional(),
  status: z.enum(['draft', 'published', 'scheduled', 'archived']).optional(),
  scheduledAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional()
});

// GET /api/communications/announcements - List announcements
router.get('/announcements', authenticate, async (req: Request, res: Response) => {
  try {
    const {
      page = '1',
      limit = '10',
      search,
      type,
      status,
      targetAudience
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    // Build where clause
    const where: any = {};
    
    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { content: { contains: search as string, mode: 'insensitive' } }
      ];
    }
    
    if (type && type !== 'all') {
      where.type = type;
    }
    
    if (status && status !== 'all') {
      where.status = status;
    }
    
    if (targetAudience && targetAudience !== 'all') {
      where.targetAudience = targetAudience;
    }

    // Get announcements with pagination
    const [announcements, total] = await Promise.all([
      prisma.announcement.findMany({
        where,
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limitNum
      }),
      prisma.announcement.count({ where })
    ]);

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      success: true,
      data: {
        announcements,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages
        }
      }
    });
  } catch (error) {
    console.error('Error fetching announcements:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch announcements'
      }
    });
  }
});

// GET /api/communications/announcements/stats - Get announcement statistics
router.get('/announcements/stats', authenticate, async (req: Request, res: Response) => {
  try {
    const [
      total,
      published,
      draft,
      scheduled,
      viewStats,
      clickStats
    ] = await Promise.all([
      prisma.announcement.count(),
      prisma.announcement.count({ where: { status: 'published' } }),
      prisma.announcement.count({ where: { status: 'draft' } }),
      prisma.announcement.count({ where: { status: 'scheduled' } }),
      prisma.announcement.aggregate({
        _sum: { viewCount: true }
      }),
      prisma.announcement.aggregate({
        _sum: { clickCount: true }
      })
    ]);

    const totalViews = viewStats._sum.viewCount || 0;
    const totalClicks = clickStats._sum.clickCount || 0;
    const engagementRate = totalViews > 0 ? (totalClicks / totalViews) * 100 : 0;

    res.json({
      success: true,
      data: {
        total,
        published,
        draft,
        scheduled,
        totalViews,
        totalClicks,
        engagementRate
      }
    });
  } catch (error) {
    console.error('Error fetching announcement stats:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'STATS_ERROR',
        message: 'Failed to fetch announcement statistics'
      }
    });
  }
});

// POST /api/communications/announcements - Create announcement
router.post('/announcements', 
  authenticate, 
  validateRequest(createAnnouncementSchema), 
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const announcementData = req.body;

      const announcement = await prisma.announcement.create({
        data: {
          ...announcementData,
          authorId: userId,
          status: 'draft',
          viewCount: 0,
          clickCount: 0
        },
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true
            }
          }
        }
      });

      res.status(201).json({
        success: true,
        data: announcement,
        message: 'Announcement created successfully'
      });
    } catch (error) {
      console.error('Error creating announcement:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CREATE_ERROR',
          message: 'Failed to create announcement'
        }
      });
    }
  }
);

// PUT /api/communications/announcements/:id - Update announcement
router.put('/announcements/:id', 
  authenticate, 
  validateRequest(updateAnnouncementSchema), 
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = (req as any).user.id;
      const updateData = req.body;

      // Check if announcement exists and user has permission
      const existingAnnouncement = await prisma.announcement.findFirst({
        where: {
          id,
          authorId: userId
        }
      });

      if (!existingAnnouncement) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Announcement not found or access denied'
          }
        });
      }

      const announcement = await prisma.announcement.update({
        where: { id },
        data: updateData,
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true
            }
          }
        }
      });

      res.json({
        success: true,
        data: announcement,
        message: 'Announcement updated successfully'
      });
    } catch (error) {
      console.error('Error updating announcement:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'UPDATE_ERROR',
          message: 'Failed to update announcement'
        }
      });
    }
  }
);

// POST /api/communications/announcements/:id/publish - Publish announcement
router.post('/announcements/:id/publish', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    // Check if announcement exists and user has permission
    const existingAnnouncement = await prisma.announcement.findFirst({
      where: {
        id,
        authorId: userId
      }
    });

    if (!existingAnnouncement) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Announcement not found or access denied'
        }
      });
    }

    const announcement = await prisma.announcement.update({
      where: { id },
      data: {
        status: 'published',
        publishedAt: new Date()
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: announcement,
      message: 'Announcement published successfully'
    });
  } catch (error) {
    console.error('Error publishing announcement:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PUBLISH_ERROR',
        message: 'Failed to publish announcement'
      }
    });
  }
});

// DELETE /api/communications/announcements/:id - Delete announcement
router.delete('/announcements/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    // Check if announcement exists and user has permission
    const existingAnnouncement = await prisma.announcement.findFirst({
      where: {
        id,
        authorId: userId
      }
    });

    if (!existingAnnouncement) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Announcement not found or access denied'
        }
      });
    }

    await prisma.announcement.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'Announcement deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting announcement:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_ERROR',
        message: 'Failed to delete announcement'
      }
    });
  }
});

// GET /api/communications/announcements/:id - Get single announcement
router.get('/announcements/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const announcement = await prisma.announcement.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true
          }
        }
      }
    });

    if (!announcement) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Announcement not found'
        }
      });
    }

    // Increment view count
    await prisma.announcement.update({
      where: { id },
      data: {
        viewCount: {
          increment: 1
        }
      }
    });

    res.json({
      success: true,
      data: announcement
    });
  } catch (error) {
    console.error('Error fetching announcement:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch announcement'
      }
    });
  }
});

export default router;