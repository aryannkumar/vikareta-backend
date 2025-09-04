import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export class DealController {
  async getDeals(req: Request, res: Response): Promise<void> {
    try {
      const { page = 1, limit = 20, status, buyerId, sellerId } = req.query;
      const userId = req.user?.id;
      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      const where: any = {};

      // Filter by user role
      if (req.user?.userType === 'buyer') {
        where.buyerId = userId;
      } else if (req.user?.userType === 'seller') {
        where.sellerId = userId;
      } else {
        // For admin or both types, allow filtering
        if (buyerId) where.buyerId = buyerId;
        if (sellerId) where.sellerId = sellerId;
      }

      if (status) where.status = status;

      const [deals, total] = await Promise.all([
        prisma.deal.findMany({
          where,
          include: {
            buyer: {
              select: {
                id: true,
                businessName: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            seller: {
              select: {
                id: true,
                businessName: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            rfq: {
              select: {
                id: true,
                title: true,
                description: true,
              },
            },
            quote: {
              select: {
                id: true,
                totalPrice: true,
              },
            },
            order: {
              select: {
                id: true,
                orderNumber: true,
                totalAmount: true,
                status: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit as string),
        }),
        prisma.deal.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        message: 'Deals retrieved successfully',
        data: {
          deals,
          total,
          page: parseInt(page as string),
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      });
    } catch (error) {
      logger.error('Error getting deals:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  async getDealById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const deal = await prisma.deal.findUnique({
        where: { id },
        include: {
          buyer: {
            select: {
              id: true,
              businessName: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
            },
          },
          seller: {
            select: {
              id: true,
              businessName: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
            },
          },
          rfq: {
            include: {
              category: true,
              subcategory: true,
            },
          },
          quote: {
            include: {
              items: {
                include: {
                  product: {
                    select: {
                      id: true,
                      title: true,
                      price: true,
                    },
                  },
                },
              },
            },
          },
          order: {
            select: {
              id: true,
              orderNumber: true,
              totalAmount: true,
              status: true,
              createdAt: true,
            },
          },
          messages: {
            include: {
              sender: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  businessName: true,
                  avatar: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!deal) {
        res.status(404).json({ 
          success: false,
          error: 'Deal not found' 
        });
        return;
      }

      // Check if user has access to this deal
      if (deal.buyerId !== userId && deal.sellerId !== userId && req.user?.role !== 'admin') {
        res.status(403).json({ 
          success: false,
          error: 'Access denied' 
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Deal retrieved successfully',
        data: deal,
      });
    } catch (error) {
      logger.error('Error getting deal:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  async createDeal(req: Request, res: Response): Promise<void> {
    try {
      const {
        title,
        description,
        milestone,
        discountType,
        discountValue,
        dealValue,
        buyerId,
        sellerId,
        rfqId,
        quoteId,
        orderId,
        startDate,
        endDate,
        nextFollowUp,
      } = req.body;

      const userId = req.user?.id;

      // Validate that user is involved in the deal
      if (userId !== buyerId && userId !== sellerId && req.user?.role !== 'admin') {
        res.status(403).json({ 
          success: false,
          error: 'You can only create deals you are involved in' 
        });
        return;
      }

      const deal = await prisma.deal.create({
        data: {
          title,
          description,
          milestone,
          discountType,
          discountValue,
          dealValue,
          buyerId,
          sellerId,
          rfqId,
          quoteId,
          orderId,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          nextFollowUp: nextFollowUp ? new Date(nextFollowUp) : null,
          status: 'active',
        },
        include: {
          buyer: {
            select: {
              id: true,
              businessName: true,
              firstName: true,
              lastName: true,
            },
          },
          seller: {
            select: {
              id: true,
              businessName: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      res.status(201).json({
        success: true,
        message: 'Deal created successfully',
        data: deal,
      });
    } catch (error) {
      logger.error('Error creating deal:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  async updateDeal(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updateData = { ...req.body };
      const userId = req.user?.id;

      // Get existing deal to check permissions
      const existingDeal = await prisma.deal.findUnique({
        where: { id },
        select: { buyerId: true, sellerId: true },
      });

      if (!existingDeal) {
        res.status(404).json({ 
          success: false,
          error: 'Deal not found' 
        });
        return;
      }

      // Check permissions
      if (existingDeal.buyerId !== userId && existingDeal.sellerId !== userId && req.user?.role !== 'admin') {
        res.status(403).json({ 
          success: false,
          error: 'Access denied' 
        });
        return;
      }

      // Convert date strings to Date objects
      if (updateData.startDate) {
        updateData.startDate = new Date(updateData.startDate);
      }
      if (updateData.endDate) {
        updateData.endDate = new Date(updateData.endDate);
      }
      if (updateData.nextFollowUp) {
        updateData.nextFollowUp = new Date(updateData.nextFollowUp);
      }

      const deal = await prisma.deal.update({
        where: { id },
        data: updateData,
        include: {
          buyer: {
            select: {
              id: true,
              businessName: true,
              firstName: true,
              lastName: true,
            },
          },
          seller: {
            select: {
              id: true,
              businessName: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      res.status(200).json({
        success: true,
        message: 'Deal updated successfully',
        data: deal,
      });
    } catch (error) {
      logger.error('Error updating deal:', error);
      if (error.code === 'P2025') {
        res.status(404).json({ 
          success: false,
          error: 'Deal not found' 
        });
        return;
      }
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { message, messageType = 'text' } = req.body;
      const userId = req.user?.id;

      // Verify deal exists and user has access
      const deal = await prisma.deal.findUnique({
        where: { id },
        select: { buyerId: true, sellerId: true },
      });

      if (!deal) {
        res.status(404).json({ 
          success: false,
          error: 'Deal not found' 
        });
        return;
      }

      if (deal.buyerId !== userId && deal.sellerId !== userId) {
        res.status(403).json({ 
          success: false,
          error: 'Access denied' 
        });
        return;
      }

      const dealMessage = await prisma.dealMessage.create({
        data: {
          dealId: id,
          senderId: userId,
          message,
          messageType,
        },
        include: {
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              avatar: true,
            },
          },
        },
      });

      res.status(201).json({
        success: true,
        message: 'Message sent successfully',
        data: dealMessage,
      });
    } catch (error) {
      logger.error('Error sending deal message:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }
}