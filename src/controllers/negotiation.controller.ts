import { Request, Response } from 'express';
import { negotiationService } from '../services/negotiation.service';

export class NegotiationController {
  async list(req: Request, res: Response) {
    const { quoteId } = req.params;
    const items = await negotiationService.listForQuote(quoteId);
    res.json({ success: true, data: items });
  }
  async create(req: Request, res: Response) {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const body = req.body;
    const item = await negotiationService.create({
      quoteId: body.quoteId,
      buyerId: body.buyerId,
      sellerId: body.sellerId,
      fromUserId: userId,
      toUserId: userId === body.buyerId ? body.sellerId : body.buyerId,
      offerPrice: body.offerPrice,
      price: body.price || body.offerPrice,
      offerType: body.offerType,
      message: body.message,
      terms: body.terms,
      validUntil: body.validUntil,
    });
    res.status(201).json({ success: true, data: item });
  }
  async counter(req: Request, res: Response) {
    const userId = req.user?.id; if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const { id } = req.params; const { price, message } = req.body;
    const item = await negotiationService.counter(id, userId, price, message);
    res.status(201).json({ success: true, data: item });
  }
  async accept(req: Request, res: Response) {
    const userId = req.user?.id; if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const { id } = req.params;
    const item = await negotiationService.accept(id, userId);
    res.json({ success: true, data: item });
  }
  async reject(req: Request, res: Response) {
    const userId = req.user?.id; if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const { id } = req.params;
    const item = await negotiationService.reject(id, userId);
    res.json({ success: true, data: item });
  }
  async markFinal(req: Request, res: Response) {
    const userId = req.user?.id; if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const { id } = req.params;
    const item = await negotiationService.markFinal(id, userId);
    res.json({ success: true, data: item });
  }
}

export const negotiationController = new NegotiationController();
