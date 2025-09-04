import { Request, Response } from 'express';
import { logger } from '@/utils/logger';
import { prisma } from '@/config/database';

export class ShippingController {
  /**
   * @openapi
   * /shipping/providers:
   *   get:
   *     tags:
   *       - Shipping
   *     summary: Get active logistics providers
   *     responses:
   *       200:
   *         description: List of providers
   */
  async getProviders(req: Request, res: Response): Promise<void> {
    try {
      const providers = await prisma.logisticsProvider.findMany({ where: { isActive: true }, orderBy: { priority: 'asc' } });
      res.json({ success: true, data: providers });
    } catch (error) {
      logger.error('Error fetching shipping providers:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async calculateShipping(req: Request, res: Response): Promise<void> {
  /**
   * @openapi
   * /shipping/calculate:
   *   post:
   *     tags:
   *       - Shipping
   *     summary: Calculate shipping cost
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               weight:
   *                 type: number
   *               distance:
   *                 type: number
   *               service:
   *                 type: string
   *     responses:
   *       200:
   *         description: Shipping cost
   */
    try {
      const { weight = 0, distance = 0, service = 'standard' } = req.body;

      // Simple pricing model
      const base = 30;
      const ratePerKg = service === 'express' ? 40 : 20;
      const distanceRate = 0.5; // per km

      const cost = base + (weight * ratePerKg) + (distance * distanceRate);

      res.json({ success: true, data: { cost: Number(cost.toFixed(2)) } });
    } catch (error) {
      logger.error('Error calculating shipping:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async createShipment(req: Request, res: Response): Promise<void> {
  /**
   * @openapi
   * /shipping/create-shipment:
   *   post:
   *     tags:
   *       - Shipping
   *     summary: Create shipment for an order
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               orderId:
   *                 type: string
   *               providerId:
   *                 type: string
   *               trackingNumber:
   *                 type: string
   *     responses:
   *       201:
   *         description: Shipment created
   */
    try {
      const { orderId, providerId, trackingNumber, carrier, shippingCost, packageDetails } = req.body;

      if (!orderId) {
        res.status(400).json({ error: 'orderId is required' });
        return;
      }

      const shipment = await prisma.shipment.create({
        data: {
          orderId,
          providerId: providerId || null,
          trackingNumber: trackingNumber || undefined,
          carrier: carrier || undefined,
          shippingCost: shippingCost ? Number(shippingCost) : undefined,
          packageDetails: packageDetails || undefined,
          status: 'shipped',
        },
      });

  await prisma.order.update({ where: { id: orderId }, data: { trackingNumber: shipment.trackingNumber, shippingProvider: carrier || undefined, shippingAmount: shipment.shippingCost ?? undefined } });

      res.status(201).json({ success: true, message: 'Shipment created successfully', data: shipment });
    } catch (error) {
      logger.error('Error creating shipment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async trackShipment(req: Request, res: Response): Promise<void> {
  /**
   * @openapi
   * /shipping/track/{trackingNumber}:
   *   get:
   *     tags:
   *       - Shipping
   *     summary: Track a shipment by tracking number
   *     parameters:
   *       - in: path
   *         name: trackingNumber
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Shipment status
   */
    try {
      const { trackingNumber } = req.params;
      if (!trackingNumber) {
        res.status(400).json({ error: 'trackingNumber is required' });
        return;
      }

      const shipment = await prisma.shipment.findUnique({ where: { trackingNumber }, include: { order: true, logisticsProvider: true } });
      if (!shipment) {
        res.status(404).json({ error: 'Shipment not found' });
        return;
      }

      res.json({ success: true, data: { status: shipment.status, estimatedDelivery: shipment.estimatedDelivery, trackingUrl: shipment.labelUrl || shipment.trackingNumber, shipment } });
    } catch (error) {
      logger.error('Error tracking shipment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}