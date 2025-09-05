import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { RfqService } from '../services/rfq.service';
import { validationResult } from 'express-validator';

const rfqService = new RfqService();

export class QuoteController {
  async createQuote(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const sellerId = req.user?.id;
      if (!sellerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const quoteData = {
        ...req.body,
        sellerId,
      };

      const quote = await rfqService.createQuote(quoteData);
      res.status(201).json({
        success: true,
        message: 'Quote created successfully',
        data: quote,
      });
    } catch (err) {
      logger.error('Error creating quote:', err);
      const error = err as any;
      if (error && typeof error.message === 'string' && error.message.includes('already submitted')) {
        res.status(400).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getQuotes(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 20,
        rfqId,
        sellerId,
        status,
        validAfter,
        validBefore,
      } = req.query;

      const filters = {
        rfqId: rfqId as string,
        sellerId: sellerId as string,
        status: status as string,
        validAfter: validAfter ? new Date(validAfter as string) : undefined,
        validBefore: validBefore ? new Date(validBefore as string) : undefined,
      };

      const result = await rfqService.getQuotes(
        filters,
        parseInt(page as string),
        parseInt(limit as string)
      );

      res.status(200).json({
        success: true,
        message: 'Quotes retrieved successfully',
        data: result,
      });
    } catch (error) {
      logger.error('Error getting quotes:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getQuoteById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const quote = await rfqService.getQuoteById(id);

      if (!quote) {
        res.status(404).json({ error: 'Quote not found' });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Quote retrieved successfully',
        data: quote,
      });
    } catch (error) {
      logger.error('Error getting quote:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async updateQuote(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { id } = req.params;
      const sellerId = req.user?.id;

      if (!sellerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const quote = await rfqService.updateQuote(id, sellerId, req.body);
      res.status(200).json({
        success: true,
        message: 'Quote updated successfully',
        data: quote,
      });
    } catch (err) {
      logger.error('Error updating quote:', err);
      const error = err as any;
      if (error && error.code === 'P2025') {
        res.status(404).json({ error: 'Quote not found or unauthorized' });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async deleteQuote(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const sellerId = req.user?.id;

      if (!sellerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // For now, we'll just update the status to 'cancelled'
      const quote = await rfqService.updateQuote(id, sellerId, { status: 'cancelled' });
      res.status(200).json({
        success: true,
        message: 'Quote cancelled successfully',
        data: quote,
      });
    } catch (err) {
      logger.error('Error cancelling quote:', err);
      const error = err as any;
      if (error && error.code === 'P2025') {
        res.status(404).json({ error: 'Quote not found or unauthorized' });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async acceptQuote(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const buyerId = req.user?.id;

      if (!buyerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const quote = await rfqService.acceptQuote(id, buyerId);
      res.status(200).json({
        success: true,
        message: 'Quote accepted successfully',
        data: quote,
      });
    } catch (error) {
      logger.error('Error accepting quote:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async rejectQuote(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const buyerId = req.user?.id;
      const { reason } = req.body;

      if (!buyerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const quote = await rfqService.rejectQuote(id, buyerId, reason);
      res.status(200).json({
        success: true,
        message: 'Quote rejected successfully',
        data: quote,
      });
    } catch (error) {
      logger.error('Error rejecting quote:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getSellerQuotes(req: Request, res: Response): Promise<void> {
    try {
      const sellerId = req.user?.id;
      if (!sellerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const {
        page = 1,
        limit = 20,
        rfqId,
        status,
      } = req.query;

      const filters = {
        sellerId,
        rfqId: rfqId as string,
        status: status as string,
      };

      const result = await rfqService.getQuotes(
        filters,
        parseInt(page as string),
        parseInt(limit as string)
      );

      res.status(200).json({
        success: true,
        message: 'Seller quotes retrieved successfully',
        data: result,
      });
    } catch (error) {
      logger.error('Error getting seller quotes:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}