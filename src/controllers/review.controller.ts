import { Request, Response } from 'express';
import { reviewService } from '@/services/review.service';
import { logger } from '@/utils/logger';

export class ReviewController {
  async getReviews(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt((req.query.page as string) || '1');
      const limit = parseInt((req.query.limit as string) || '20');

      const { data, total } = await reviewService.listReviews(page, limit);

      res.status(200).json({
        success: true,
        data: {
          data,
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        }
      });
    } catch (error) {
      logger.error('Error listing reviews:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async getReviewById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const review = await reviewService.getReviewById(id);
      if (!review) {
        res.status(404).json({ success: false, error: 'Review not found' });
        return;
      }
      res.status(200).json({ success: true, data: review });
    } catch (error) {
      logger.error('Error getting review by id:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async createReview(req: Request, res: Response): Promise<void> {
    try {
      const payload = req.body;
      const created = await reviewService.createReview(payload);
      res.status(201).json({ success: true, message: 'Review created successfully', data: created });
    } catch (error) {
      logger.error('Error creating review:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async updateReview(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const payload = req.body;
      const updated = await reviewService.updateReview(id, payload);
      res.status(200).json({ success: true, message: 'Review updated successfully', data: updated });
    } catch (error) {
      logger.error('Error updating review:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async deleteReview(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await reviewService.deleteReview(id);
      res.status(200).json({ success: true, message: 'Review deleted successfully' });
    } catch (error) {
      logger.error('Error deleting review:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}