import { Request, Response } from 'express';
import { CustomerService } from '@/services/customer.service';
import { logger } from '@/utils/logger';

const customerService = new CustomerService();

export class CustomerController {
  async getCustomers(req: Request, res: Response): Promise<void> {
    try {
      const {
        search,
        status,
        verificationTier,
        userType,
        dateFrom,
        dateTo,
        page = 1,
        limit = 20,
      } = req.query;

      const filters = {
        search: search as string,
        status: status as 'active' | 'inactive' | 'suspended',
        verificationTier: verificationTier as string,
        userType: userType as string,
        dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo: dateTo ? new Date(dateTo as string) : undefined,
        limit: parseInt(limit as string),
        offset: (parseInt(page as string) - 1) * parseInt(limit as string),
      };

      const result = await customerService.getCustomers(filters);

      res.status(200).json({
        success: true,
        message: 'Customers retrieved successfully',
        data: result,
      });
    } catch (error) {
      logger.error('Error getting customers:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async getCustomer(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const customer = await customerService.getCustomerById(id);

      if (!customer) {
        res.status(404).json({ success: false, error: 'Customer not found' });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Customer retrieved successfully',
        data: customer,
      });
    } catch (error) {
      logger.error('Error getting customer:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async getCustomerStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await customerService.getCustomerStats();

      res.status(200).json({
        success: true,
        message: 'Customer stats retrieved successfully',
        data: stats,
      });
    } catch (error) {
      logger.error('Error getting customer stats:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async getCustomerOrderHistory(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const orderHistory = await customerService.getCustomerOrderHistory(id);

      res.status(200).json({
        success: true,
        message: 'Customer order history retrieved successfully',
        data: orderHistory,
      });
    } catch (error) {
      logger.error('Error getting customer order history:', error);
      const e: any = error;
      if (e && typeof e.message === 'string' && e.message.includes('Customer not found')) {
        res.status(404).json({ success: false, error: e.message });
        return;
      }
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async updateCustomerStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      if (typeof isActive !== 'boolean') {
        res.status(400).json({ success: false, error: 'isActive must be a boolean' });
        return;
      }

      const customer = await customerService.updateCustomerStatus(id, isActive);

      res.status(200).json({
        success: true,
        message: 'Customer status updated successfully',
        data: customer,
      });
    } catch (error) {
      logger.error('Error updating customer status:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async updateCustomerVerification(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { verificationTier, isVerified } = req.body;

      if (!verificationTier || typeof isVerified !== 'boolean') {
        res.status(400).json({ success: false, error: 'verificationTier and isVerified are required' });
        return;
      }

      const customer = await customerService.updateCustomerVerification(id, verificationTier, isVerified);

      res.status(200).json({
        success: true,
        message: 'Customer verification updated successfully',
        data: customer,
      });
    } catch (error) {
      logger.error('Error updating customer verification:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}