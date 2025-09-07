import { Request, Response } from 'express';
import { couponService } from '@/services/coupon.service';
import { logger } from '@/utils/logger';

export class CouponController {
  async create(req: Request, res: Response): Promise<void> {
    try {
      const coupon = await couponService.create(req.body);
      res.status(201).json({ success: true, message: 'Coupon created', data: coupon });
    } catch (error: any) {
      logger.error('CouponController.create error:', error);
      res.status(400).json({ success: false, error: error.message || 'Failed to create coupon' });
    }
  }

  async list(req: Request, res: Response): Promise<void> {
    try {
      const { page = '1', limit = '20', activeOnly, search, expired } = req.query;
      const result = await couponService.list({
        activeOnly: activeOnly === 'true',
        search: search as string,
        expired: expired === undefined ? undefined : expired === 'true',
      }, parseInt(page as string), parseInt(limit as string));
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('CouponController.list error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch coupons' });
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const coupon = await couponService.getById(id);
      if (!coupon) {
        res.status(404).json({ success: false, error: 'Coupon not found' });
        return;
      }
      res.json({ success: true, data: coupon });
    } catch (error) {
      logger.error('CouponController.getById error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch coupon' });
    }
  }

  async getByCode(req: Request, res: Response): Promise<void> {
    try {
      const { code } = req.params;
      const coupon = await couponService.getByCode(code);
      if (!coupon) {
        res.status(404).json({ success: false, error: 'Coupon not found' });
        return;
      }
      res.json({ success: true, data: coupon });
    } catch (error) {
      logger.error('CouponController.getByCode error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch coupon' });
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const coupon = await couponService.update(id, req.body);
      res.json({ success: true, message: 'Coupon updated', data: coupon });
    } catch (error: any) {
      logger.error('CouponController.update error:', error);
      res.status(400).json({ success: false, error: error.message || 'Failed to update coupon' });
    }
  }

  async softDelete(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const coupon = await couponService.softDelete(id);
      res.json({ success: true, message: 'Coupon deactivated', data: coupon });
    } catch (error) {
      logger.error('CouponController.softDelete error:', error);
      res.status(500).json({ success: false, error: 'Failed to deactivate coupon' });
    }
  }

  async validate(req: Request, res: Response): Promise<void> {
    try {
      const { code } = req.params;
      const { subtotal } = req.query;
      if (!subtotal) {
        res.status(400).json({ success: false, error: 'subtotal query param required' });
        return;
      }
      const result = await couponService.validateForOrder(code, parseFloat(subtotal as string));
      res.json({ success: true, data: result });
    } catch (error: any) {
      logger.error('CouponController.validate error:', error);
      res.status(400).json({ success: false, error: error.message || 'Coupon invalid' });
    }
  }
}

export const couponController = new CouponController();
