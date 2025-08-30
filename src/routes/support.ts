import { Router } from 'express';
import { Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

// Validation schemas
const createTicketSchema = z.object({
  subject: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  category: z.enum(['technical', 'billing', 'account', 'product', 'general']),
  priority: z.enum(['low', 'medium', 'high', 'urgent'])
});

const updateTicketSchema = z.object({
  subject: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(2000).optional(),
  status: z.enum(['open', 'in_progress', 'waiting_response', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional()
});

const addMessageSchema = z.object({
  content: z.string().min(1).max(2000)
});

// GET /api/support/tickets - Get support tickets
router.get('/tickets', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { page = 1, limit = 20, search, status, category, priority } = req.query;
    
    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 100);
    const skip = (pageNum - 1) * limitNum;
    
    // Build where clause
    const where: any = {
      userId // Only show user's tickets
    };
    
    // Add search filter
    if (search && typeof search === 'string') {
      const searchTerm = search.trim();
      where.OR = [
        { subject: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
        { ticketNumber: { contains: searchTerm, mode: 'insensitive' } }
      ];
    }
    
    // Add filters
    if (status && status !== 'all') {
      where.status = status;
    }
    
    if (category && category !== 'all') {
      where.category = category;
    }
    
    if (priority && priority !== 'all') {
      where.priority = priority;
    }
    
    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              content: true,
              createdAt: true,
              isFromSupport: true
            }
          },
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          }
        },
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.supportTicket.count({ where })
    ]);
    
    // Transform data for frontend
    const transformedTickets = tickets.map(ticket => ({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      description: ticket.description,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      assignedTo: ticket.assignedTo ? {
        id: ticket.assignedTo.id,
        name: `${ticket.assignedTo.firstName || ''} ${ticket.assignedTo.lastName || ''}`.trim()
      } : null,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      lastMessage: ticket.messages[0] || null,
      messageCount: ticket.messages.length
    }));
    
    res.json({
      success: true,
      data: {
        tickets: transformedTickets,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching support tickets:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch support tickets'
      }
    });
  }
});

// GET /api/support/stats - Get support statistics
router.get('/stats', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    
    const [
      totalTickets,
      openTickets,
      resolvedTickets,
      avgResponseTime,
      satisfactionScore
    ] = await Promise.all([
      prisma.supportTicket.count({
        where: { userId }
      }),
      prisma.supportTicket.count({
        where: { 
          userId,
          status: { in: ['open', 'in_progress', 'waiting_response'] }
        }
      }),
      prisma.supportTicket.count({
        where: { 
          userId,
          status: { in: ['resolved', 'closed'] }
        }
      }),
      // Simplified calculation - would need more complex query for real response time
      Promise.resolve(4.2),
      // Simplified calculation - would need satisfaction ratings
      Promise.resolve(4.6)
    ]);
    
    const stats = {
      totalTickets,
      openTickets,
      resolvedTickets,
      averageResponseTime: avgResponseTime,
      averageResolutionTime: 24.5, // Hours - simplified
      satisfactionScore: satisfactionScore
    };
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching support stats:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch support statistics'
      }
    });
  }
});

// GET /api/support/tickets/:id - Get ticket details
router.get('/tickets/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    
    const ticket = await prisma.supportTicket.findFirst({
      where: {
        id,
        userId
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true
              }
            }
          }
        },
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Support ticket not found'
        }
      });
    }
    
    // Transform data
    const transformedTicket = {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      description: ticket.description,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      assignedTo: ticket.assignedTo ? {
        id: ticket.assignedTo.id,
        name: `${ticket.assignedTo.firstName || ''} ${ticket.assignedTo.lastName || ''}`.trim()
      } : null,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      messages: ticket.messages.map(message => ({
        id: message.id,
        content: message.content,
        isFromSupport: message.isFromSupport,
        author: {
          name: message.isFromSupport ? 'Support Team' : 
                `${message.user?.firstName || ''} ${message.user?.lastName || ''}`.trim() || 'You'
        },
        createdAt: message.createdAt
      }))
    };
    
    res.json({
      success: true,
      data: transformedTicket
    });
  } catch (error) {
    console.error('Error fetching support ticket:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch support ticket'
      }
    });
  }
});

// POST /api/support/tickets - Create new support ticket
router.post('/tickets', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const validatedData = createTicketSchema.parse(req.body);
    
    // Generate ticket number
    const ticketNumber = `TKT-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    
    const newTicket = await prisma.supportTicket.create({
      data: {
        ticketNumber,
        subject: validatedData.subject,
        description: validatedData.description,
        category: validatedData.category,
        priority: validatedData.priority,
        status: 'open',
        userId
      },
      include: {
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });
    
    res.status(201).json({
      success: true,
      data: {
        id: newTicket.id,
        ticketNumber: newTicket.ticketNumber,
        subject: newTicket.subject,
        description: newTicket.description,
        category: newTicket.category,
        priority: newTicket.priority,
        status: newTicket.status,
        createdAt: newTicket.createdAt
      },
      message: 'Support ticket created successfully'
    });
  } catch (error) {
    console.error('Error creating support ticket:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: 'Failed to create support ticket'
      }
    });
  }
});

// PUT /api/support/tickets/:id - Update support ticket
router.put('/tickets/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const validatedData = updateTicketSchema.parse(req.body);
    
    // Verify ticket belongs to user
    const existingTicket = await prisma.supportTicket.findFirst({
      where: { id, userId }
    });
    
    if (!existingTicket) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Support ticket not found'
        }
      });
    }
    
    const updatedTicket = await prisma.supportTicket.update({
      where: { id },
      data: validatedData
    });
    
    res.json({
      success: true,
      data: updatedTicket,
      message: 'Support ticket updated successfully'
    });
  } catch (error) {
    console.error('Error updating support ticket:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to update support ticket'
      }
    });
  }
});

// POST /api/support/tickets/:id/messages - Add message to ticket
router.post('/tickets/:id/messages', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const validatedData = addMessageSchema.parse(req.body);
    
    // Verify ticket belongs to user
    const ticket = await prisma.supportTicket.findFirst({
      where: { id, userId }
    });
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Support ticket not found'
        }
      });
    }
    
    const newMessage = await prisma.supportMessage.create({
      data: {
        content: validatedData.content,
        ticketId: id,
        userId,
        isFromSupport: false
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      }
    });
    
    // Update ticket status if it was resolved/closed
    if (ticket.status === 'resolved' || ticket.status === 'closed') {
      await prisma.supportTicket.update({
        where: { id },
        data: { status: 'waiting_response' }
      });
    }
    
    res.status(201).json({
      success: true,
      data: {
        id: newMessage.id,
        content: newMessage.content,
        isFromSupport: newMessage.isFromSupport,
        author: {
          name: `${newMessage.user?.firstName || ''} ${newMessage.user?.lastName || ''}`.trim() || 'You'
        },
        createdAt: newMessage.createdAt
      },
      message: 'Message added successfully'
    });
  } catch (error) {
    console.error('Error adding message to ticket:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: 'Failed to add message to ticket'
      }
    });
  }
});

// GET /api/support/knowledge-base - Get knowledge base articles
router.get('/knowledge-base', async (req: Request, res: Response) => {
  try {
    // For now, return static knowledge base articles
    // In a real implementation, this would come from a database
    const articles = [
      {
        id: '1',
        title: 'Getting Started with Vikareta',
        summary: 'Learn the basics of using the Vikareta platform for B2B commerce',
        category: 'Getting Started',
        views: 1250,
        helpful: 45,
        notHelpful: 3,
        lastUpdated: '2024-01-15',
        url: '/help/getting-started'
      },
      {
        id: '2',
        title: 'How to Create Your First Product Listing',
        summary: 'Step-by-step guide to listing your products on the marketplace',
        category: 'Products',
        views: 890,
        helpful: 38,
        notHelpful: 2,
        lastUpdated: '2024-01-12',
        url: '/help/create-product'
      },
      {
        id: '3',
        title: 'Managing Orders and Fulfillment',
        summary: 'Complete guide to processing and fulfilling customer orders',
        category: 'Orders',
        views: 756,
        helpful: 42,
        notHelpful: 1,
        lastUpdated: '2024-01-10',
        url: '/help/order-management'
      },
      {
        id: '4',
        title: 'Payment and Billing FAQ',
        summary: 'Common questions about payments, billing, and financial management',
        category: 'Billing',
        views: 634,
        helpful: 29,
        notHelpful: 4,
        lastUpdated: '2024-01-08',
        url: '/help/billing-faq'
      },
      {
        id: '5',
        title: 'RFQ and Quotation System',
        summary: 'How to use the Request for Quotation system effectively',
        category: 'RFQs',
        views: 523,
        helpful: 31,
        notHelpful: 2,
        lastUpdated: '2024-01-05',
        url: '/help/rfq-system'
      },
      {
        id: '6',
        title: 'Inventory Management Best Practices',
        summary: 'Tips and strategies for effective inventory management',
        category: 'Inventory',
        views: 445,
        helpful: 26,
        notHelpful: 1,
        lastUpdated: '2024-01-03',
        url: '/help/inventory-management'
      }
    ];
    
    res.json({
      success: true,
      data: articles
    });
  } catch (error) {
    console.error('Error fetching knowledge base:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch knowledge base articles'
      }
    });
  }
});

export default router;