import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { OrderService } from '../services/order.service';

const orderService = new OrderService();

export class OrderController {
  async createOrder(req: Request, res: Response): Promise<void> {
    try {

      const buyerId = req.user?.id;
      if (!buyerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const orderData = {
        ...req.body,
        buyerId,
      };

      const order = await orderService.createOrder(orderData);
      res.status(201).json({
        success: true,
        message: 'Order created successfully',
        data: order,
      });
    } catch (error) {
      logger.error('Error creating order:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getOrders(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 20,
        buyerId,
        sellerId,
        status,
        paymentStatus,
        orderType,
        dateFrom,
        dateTo,
      } = req.query;

      const filters = {
        buyerId: buyerId as string,
        sellerId: sellerId as string,
        status: status as string,
        paymentStatus: paymentStatus as string,
        orderType: orderType as string,
        dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo: dateTo ? new Date(dateTo as string) : undefined,
      };

      const result = await orderService.getOrders(
        filters,
        parseInt(page as string),
        parseInt(limit as string)
      );

      res.status(200).json({
        success: true,
        message: 'Orders retrieved successfully',
        data: result,
      });
    } catch (error) {
      logger.error('Error getting orders:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getOrderById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const order = await orderService.getOrderById(id);

      if (!order) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Order retrieved successfully',
        data: order,
      });
    } catch (error) {
      logger.error('Error getting order:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async updateOrder(req: Request, res: Response): Promise<void> {
    try {

      const { id } = req.params;
      const { status, notes } = req.body;
      const updatedBy = req.user?.id;

      const order = await orderService.updateOrderStatus(id, status, notes, updatedBy);
      res.status(200).json({
        success: true,
        message: 'Order updated successfully',
        data: order,
      });
    } catch (error) {
      logger.error('Error updating order:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async updateOrderStatus(req: Request, res: Response): Promise<void> {
    try {

      const { id } = req.params;
      const { status, notes } = req.body;
      const updatedBy = req.user?.id;

      const order = await orderService.updateOrderStatus(id, status, notes, updatedBy);
      res.status(200).json({
        success: true,
        message: 'Order status updated successfully',
        data: order,
      });
    } catch (error) {
      logger.error('Error updating order status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getOrderTracking(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const order = await orderService.getOrderById(id);

      if (!order) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Order tracking retrieved successfully',
        data: (() => {
          const o: any = order as any;
          return {
            orderId: o.id,
            orderNumber: o.orderNumber,
            status: o.status,
            paymentStatus: o.paymentStatus,
            trackingNumber: o.trackingNumber,
            shippingProvider: o.shippingProvider,
            estimatedDelivery: o.estimatedDelivery,
            actualDelivery: o.actualDelivery,
            statusHistory: o.statusHistory || [],
            deliveryTracking: o.deliveryTracking || [],
            trackingHistory: o.trackingHistory || [],
          };
        })(),
      });
    } catch (error) {
      logger.error('Error getting order tracking:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async addTrackingEvent(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const { status, location, description, provider, providerTrackingId, metadata } = req.body;
      if (!status) return void res.status(400).json({ error: 'status required' });
      await orderService.addTrackingEvent(id, { status, location, description, provider, providerTrackingId, metadata, userId });
      res.status(201).json({ success: true });
    } catch (error) {
      logger.error('Error adding tracking event:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async cancelOrder(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const cancelledBy = req.user?.id;

      const order = await orderService.cancelOrder(id, reason, cancelledBy);
      res.status(200).json({
        success: true,
        message: 'Order cancelled successfully',
        data: order,
      });
    } catch (error) {
      logger.error('Error cancelling order:', error);
      const e: any = error;
      if (e && typeof e.message === 'string' && e.message.includes('cannot be cancelled')) {
        res.status(400).json({ error: e.message });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getBuyerOrders(req: Request, res: Response): Promise<void> {
    try {
      const buyerId = req.user?.id;
      if (!buyerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const {
        page = 1,
        limit = 20,
        status,
        paymentStatus,
        orderType,
        dateFrom,
        dateTo,
      } = req.query;

      const filters = {
        buyerId,
        status: status as string,
        paymentStatus: paymentStatus as string,
        orderType: orderType as string,
        dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo: dateTo ? new Date(dateTo as string) : undefined,
      };

      const result = await orderService.getOrders(
        filters,
        parseInt(page as string),
        parseInt(limit as string)
      );

      res.status(200).json({
        success: true,
        message: 'Buyer orders retrieved successfully',
        data: result,
      });
    } catch (error) {
      logger.error('Error getting buyer orders:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getSellerOrders(req: Request, res: Response): Promise<void> {
    try {
      const sellerId = req.user?.id;
      if (!sellerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const {
        page = 1,
        limit = 20,
        status,
        paymentStatus,
        orderType,
        dateFrom,
        dateTo,
      } = req.query;

      const filters = {
        sellerId,
        status: status as string,
        paymentStatus: paymentStatus as string,
        orderType: orderType as string,
        dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo: dateTo ? new Date(dateTo as string) : undefined,
      };

      const result = await orderService.getOrders(
        filters,
        parseInt(page as string),
        parseInt(limit as string)
      );

      res.status(200).json({
        success: true,
        message: 'Seller orders retrieved successfully',
        data: result,
      });
    } catch (error) {
      logger.error('Error getting seller orders:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getPendingOrderStats(req: Request, res: Response): Promise<void> {
    try {
      const sellerId = req.user?.id;
      if (!sellerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const stats = await orderService.getPendingOrderStats(sellerId);
      res.status(200).json({
        success: true,
        message: 'Pending order stats retrieved successfully',
        data: stats,
      });
    } catch (error) {
      logger.error('Error getting pending order stats:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getCompletedOrderStats(req: Request, res: Response): Promise<void> {
    try {
      const sellerId = req.user?.id;
      if (!sellerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { dateFrom, dateTo } = req.query;
      const stats = await orderService.getCompletedOrderStats(
        sellerId,
        dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo ? new Date(dateTo as string) : undefined
      );
      res.status(200).json({
        success: true,
        message: 'Completed order stats retrieved successfully',
        data: stats,
      });
    } catch (error) {
      logger.error('Error getting completed order stats:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getReadyToShipOrders(req: Request, res: Response): Promise<void> {
    try {
      const sellerId = req.user?.id;
      if (!sellerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { limit = 20 } = req.query;
      const result = await orderService.getReadyToShipOrders(
        sellerId,
        parseInt(limit as string)
      );
      res.status(200).json({
        success: true,
        message: 'Ready-to-ship orders retrieved successfully',
        data: result,
      });
    } catch (error) {
      logger.error('Error getting ready-to-ship orders:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}