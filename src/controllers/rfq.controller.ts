import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { RfqService } from '../services/rfq.service';
import { validationResult } from 'express-validator';

const rfqService = new RfqService();

export class RfqController {
  async createRfq(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const buyerId = req.user?.id;
      if (!buyerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const rfq = await rfqService.createRfq(buyerId, req.body);
      res.status(201).json({
        success: true,
        message: 'RFQ created successfully',
        data: rfq,
      });
    } catch (error) {
      logger.error('Error creating RFQ:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getRfqs(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 20,
        buyerId,
        categoryId,
        subcategoryId,
        status,
        budgetMin,
        budgetMax,
        expiresAfter,
        expiresBefore,
      } = req.query;

      const filters = {
        buyerId: buyerId as string,
        categoryId: categoryId as string,
        subcategoryId: subcategoryId as string,
        status: status as string,
        budgetMin: budgetMin ? parseFloat(budgetMin as string) : undefined,
        budgetMax: budgetMax ? parseFloat(budgetMax as string) : undefined,
        expiresAfter: expiresAfter ? new Date(expiresAfter as string) : undefined,
        expiresBefore: expiresBefore ? new Date(expiresBefore as string) : undefined,
      };

      const result = await rfqService.getRfqs(
        filters,
        parseInt(page as string),
        parseInt(limit as string)
      );

      res.status(200).json({
        success: true,
        message: 'RFQs retrieved successfully',
        data: result,
      });
    } catch (error) {
      logger.error('Error getting RFQs:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getRfqById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const rfq = await rfqService.getRfqById(id);

      if (!rfq) {
        res.status(404).json({ error: 'RFQ not found' });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'RFQ retrieved successfully',
        data: rfq,
      });
    } catch (error) {
      logger.error('Error getting RFQ:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async updateRfq(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { id } = req.params;
      const buyerId = req.user?.id;

      if (!buyerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const rfq = await rfqService.updateRfq(id, buyerId, req.body);
      res.status(200).json({
        success: true,
        message: 'RFQ updated successfully',
        data: rfq,
      });
    } catch (error) {
      logger.error('Error updating RFQ:', error);
      if (error.code === 'P2025') {
        res.status(404).json({ error: 'RFQ not found or unauthorized' });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async deleteRfq(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const buyerId = req.user?.id;

      if (!buyerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const rfq = await rfqService.closeRfq(id, buyerId);
      res.status(200).json({
        success: true,
        message: 'RFQ closed successfully',
        data: rfq,
      });
    } catch (error) {
      logger.error('Error closing RFQ:', error);
      const e: any = error;
      if (e && e.code === 'P2025') {
        res.status(404).json({ error: 'RFQ not found or unauthorized' });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async closeRfq(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const buyerId = req.user?.id;

      if (!buyerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const rfq = await rfqService.closeRfq(id, buyerId);
      res.status(200).json({
        success: true,
        message: 'RFQ closed successfully',
        data: rfq,
      });
    } catch (error) {
      logger.error('Error closing RFQ:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getBuyerRfqs(req: Request, res: Response): Promise<void> {
    try {
      const buyerId = req.user?.id;
      if (!buyerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const {
        page = 1,
        limit = 20,
        categoryId,
        subcategoryId,
        status,
      } = req.query;

      const filters = {
        buyerId,
        categoryId: categoryId as string,
        subcategoryId: subcategoryId as string,
        status: status as string,
      };

      const result = await rfqService.getRfqs(
        filters,
        parseInt(page as string),
        parseInt(limit as string)
      );

      res.status(200).json({
        success: true,
        message: 'Buyer RFQs retrieved successfully',
        data: result,
      });
    } catch (error) {
      logger.error('Error getting buyer RFQs:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}