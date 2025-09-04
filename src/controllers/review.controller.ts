import { Request, Response } from 'express';

export class ReviewController {
  async getReviews(req: Request, res: Response): Promise<void> {
    res.json({ success: true, data: { data: [], pagination: {} } });
  }

  async getReviewById(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    res.json({ success: true, data: { id, rating: 5 } });
  }

  async createReview(req: Request, res: Response): Promise<void> {
    res.json({ success: true, message: 'Review created successfully' });
  }

  async updateReview(req: Request, res: Response): Promise<void> {
    res.json({ success: true, message: 'Review updated successfully' });
  }

  async deleteReview(req: Request, res: Response): Promise<void> {
    res.json({ success: true, message: 'Review deleted successfully' });
  }
}