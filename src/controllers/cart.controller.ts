import { Request, Response } from 'express';
import { cartService } from '@/services/cart.service';
import { logger } from '@/utils/logger';

class CartController {
  async getCart(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const cart = await cartService.getCart(userId);
      res.json({ success: true, data: cart });
    } catch (e) {
      logger.error('getCart error', e);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async addItem(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const { productId, variantId, quantity } = req.body;
      const item = await cartService.addItem(userId, { productId, variantId, quantity });
      res.status(201).json({ success: true, data: item });
    } catch (e: any) {
      logger.error('addItem error', e);
      res.status(400).json({ error: e.message || 'Unable to add item' });
    }
  }

  async updateItem(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const { itemId } = req.params;
      const { quantity } = req.body;
      const updated = await cartService.updateItem(userId, itemId, { quantity });
      res.json({ success: true, data: updated });
    } catch (e: any) {
      logger.error('updateItem error', e);
      res.status(400).json({ error: e.message || 'Unable to update item' });
    }
  }

  async removeItem(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const { itemId } = req.params;
      await cartService.removeItem(userId, itemId);
      res.json({ success: true });
    } catch (e) {
      logger.error('removeItem error', e);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async clearCart(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      await cartService.clearCart(userId);
      res.json({ success: true });
    } catch (e) {
      logger.error('clearCart error', e);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export const cartController = new CartController();