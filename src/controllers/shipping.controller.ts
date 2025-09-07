import { Request, Response } from 'express';
import { logger } from '@/utils/logger';
import { shippingService } from '@/services/shipping.service';
import { redisClient } from '@/config/redis';
import crypto from 'crypto';

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
  const providers = await shippingService.getProviders();
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
  const result = shippingService.calculateShipping(req.body);
  res.json({ success: true, data: result });
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
      const shipment = await shippingService.createShipment(req.body);
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

      const tracked = await shippingService.trackShipment(trackingNumber);
      res.json({ success: true, data: tracked });
    } catch (error) {
      logger.error('Error tracking shipment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // =============================
  // Shipping Address Management
  // =============================
  async listAddresses(req: Request, res: Response): Promise<void> {
    try {
  const userId = req.user?.id || (req.query.userId as string);
  const addresses = await shippingService.listAddresses(userId);
      res.json({ success: true, data: addresses });
    } catch (error) {
      logger.error('Error listing shipping addresses:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
  async createAddress(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || req.body.userId;
      const { name, phone, addressLine1, addressLine2, city, state, postalCode, country, isDefault } = req.body;
      const address = await shippingService.createAddress(userId, { name, phone, addressLine1, addressLine2, city, state, postalCode, country, isDefault });
      res.status(201).json({ success: true, message: 'Address created', data: address });
    } catch (error) {
      logger.error('Error creating shipping address:', error);
      res.status(400).json({ error: 'Failed to create address' });
    }
  }
  async updateAddress(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params; const userId = req.user?.id || req.body.userId;
      const data = req.body;
      const address = await shippingService.updateAddress(id, userId, data);
      res.json({ success: true, message: 'Address updated', data: address });
    } catch (error) {
      logger.error('Error updating shipping address:', error);
      res.status(400).json({ error: 'Failed to update address' });
    }
  }
  async deleteAddress(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
  await shippingService.deleteAddress(id);
      res.json({ success: true, message: 'Address deleted' });
    } catch (error) {
      res.status(400).json({ error: 'Failed to delete address' });
    }
  }
  async setDefaultAddress(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params; const userId = req.user?.id || req.body.userId;
  const address = await shippingService.setDefaultAddress(id, userId);
      res.json({ success: true, message: 'Default address set', data: address });
    } catch (error) {
      res.status(400).json({ error: 'Failed to set default address' });
    }
  }

  // =============================
  // Delivery Tracking
  // =============================
  async addTrackingEvent(req: Request, res: Response): Promise<void> {
    try {
      const { orderId, trackingNumber, carrier, status, trackingUrl, notes } = req.body;
      if (!orderId) { res.status(400).json({ error: 'orderId required' }); return; }
  const tracking = await shippingService.addTrackingEvent({ orderId, trackingNumber, carrier, status, trackingUrl, notes });
      res.status(201).json({ success: true, data: tracking });
    } catch (error) {
      logger.error('Error adding tracking event:', error);
      res.status(400).json({ error: 'Failed to add tracking event' });
    }
  }
  async listTracking(req: Request, res: Response): Promise<void> {
    try {
      const { orderId } = req.query;
  const events = await shippingService.listTrackingEvents(orderId as string | undefined);
      res.json({ success: true, data: events });
    } catch (error) {
      res.status(500).json({ error: 'Failed to list tracking events' });
    }
  }

  // =============================
  // Webhook Test & Retry Utilities (Shipping Domain)
  // =============================
  async triggerTestShippingWebhook(req: Request, res: Response): Promise<void> {
    try {
      const sample = {
        orderId: req.body.orderId || crypto.randomUUID(),
        trackingNumber: req.body.trackingNumber || 'TEST-' + Date.now(),
        carrier: req.body.carrier || 'TEST_CARRIER',
        status: req.body.status || 'in_transit',
      };
      // Push to same processing queue pattern for transparency
      await redisClient.lpush('shipping_webhook_tests', JSON.stringify(sample));
      res.json({ success: true, message: 'Test shipping webhook queued', data: sample });
    } catch (error) {
      res.status(500).json({ error: 'Failed to queue test webhook' });
    }
  }
}