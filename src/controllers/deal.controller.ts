import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { dealService } from '@/services/deal.service';

export class DealController {
  async getDeals(req: Request, res: Response): Promise<void> {
    try {
      const pageNum = parseInt((req.query.page as string) || '1');
      const limitNum = parseInt((req.query.limit as string) || '20');
      const filters: any = {};
      if (req.query.status) filters.status = req.query.status;
      if (req.query.buyerId) filters.buyerId = req.query.buyerId;
      if (req.query.sellerId) filters.sellerId = req.query.sellerId;

      const { deals, total } = await dealService.listDeals(req.user, pageNum, limitNum, filters);

      res.status(200).json({ success: true, message: 'Deals retrieved successfully', data: { deals, total, page: pageNum, totalPages: Math.ceil(total / limitNum) } });
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

  const deal = await dealService.getDealById(id);
      if (!deal) {
        res.status(404).json({ success: false, error: 'Deal not found' });
        return;
      }
      res.status(200).json({ success: true, message: 'Deal retrieved successfully', data: deal });
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

  const deal = await dealService.createDeal({ title, description, milestone, discountType, discountValue, dealValue, buyerId, sellerId, rfqId, quoteId, orderId, startDate, endDate, nextFollowUp });
      res.status(201).json({ success: true, message: 'Deal created successfully', data: deal });
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
  // Get existing deal to check permissions
  const deal = await dealService.updateDeal(id, updateData);
      res.status(200).json({ success: true, message: 'Deal updated successfully', data: deal });
    } catch (err) {
      const error: any = err;
      logger.error('Error updating deal:', error);
      if (error?.code === 'P2025') {
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
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const dealMessage = await dealService.sendMessage(id, userId, { message, messageType });
      res.status(201).json({ success: true, message: 'Message sent successfully', data: dealMessage });
    } catch (error) {
      logger.error('Error sending deal message:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }
}