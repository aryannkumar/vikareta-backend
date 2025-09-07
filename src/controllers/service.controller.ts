import { Request, Response } from 'express';
// PrismaClient import removed (not used in this controller)
import { logger } from '../utils/logger';
import { ServiceService } from '../services/service.service';
import { minioService } from '@/services/minio.service';

const serviceService = new ServiceService();

export class ServiceController {
  async createService(req: Request, res: Response): Promise<void> {
    try {

      const providerId = req.user?.id;
      if (!providerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const service = await serviceService.createService(providerId, req.body);
      // Handle uploaded images (if any)
      const files = (req.files as any[]) || [];
      for (const file of files) {
        try {
          const uploadRes = await minioService.uploadFile(file.buffer, file.originalname || 'image.jpg', 'services', { 'content-type': file.mimetype });
          await serviceService.addServiceMedia(service.id, {
            mediaType: file.mimetype?.split('/')[0] || 'image',
            url: uploadRes.url,
            altText: file.originalname,
            sortOrder: 0,
          });
        } catch (err) {
          logger.warn('Failed to upload service image:', err);
        }
      }
      res.status(201).json({
        success: true,
        message: 'Service created successfully',
        data: service,
      });
    } catch (error) {
      logger.error('Error creating service:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getServices(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 20,
        categoryId,
        subcategoryId,
        providerId,
        priceMin,
        priceMax,
        serviceType,
        search,
        isActive,
        status,
      } = req.query;

      const filters = {
        categoryId: categoryId as string,
        subcategoryId: subcategoryId as string,
        providerId: providerId as string,
        priceMin: priceMin ? parseFloat(priceMin as string) : undefined,
        priceMax: priceMax ? parseFloat(priceMax as string) : undefined,
        serviceType: serviceType as string,
        search: search as string,
        isActive: isActive ? isActive === 'true' : undefined,
        status: status as string,
      };

      const result = await serviceService.getServices(
        filters,
        parseInt(page as string),
        parseInt(limit as string)
      );

      res.status(200).json({
        success: true,
        message: 'Services retrieved successfully',
        data: result,
      });
    } catch (error) {
      logger.error('Error getting services:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getFeaturedServices(req: Request, res: Response): Promise<void> {
    try {
      const { limit = 10 } = req.query;
      const services = await serviceService.getFeaturedServices(parseInt(limit as string));

      res.status(200).json({
        success: true,
        message: 'Featured services retrieved successfully',
        data: services,
      });
    } catch (error) {
      logger.error('Error getting featured services:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getServiceById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const service = await serviceService.getServiceById(id);

      if (!service) {
        res.status(404).json({ error: 'Service not found' });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Service retrieved successfully',
        data: service,
      });
    } catch (error) {
      logger.error('Error getting service:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async updateService(req: Request, res: Response): Promise<void> {
    try {

      const { id } = req.params;
      const providerId = req.user?.id;

      if (!providerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const service = await serviceService.updateService(id, providerId, req.body);
        // Handle uploaded images (if any)
        const files = (req.files as any[]) || [];
        for (const file of files) {
          try {
            const uploadRes = await minioService.uploadFile(file.buffer, file.originalname || 'image.jpg', 'services', { 'content-type': file.mimetype });
            await serviceService.addServiceMedia(service.id, {
              mediaType: file.mimetype?.split('/')[0] || 'image',
              url: uploadRes.url,
              altText: file.originalname,
              sortOrder: 0,
            });
          } catch (err) {
            logger.warn('Failed to upload service image:', err);
          }
        }
      res.status(200).json({
        success: true,
        message: 'Service updated successfully',
        data: service,
      });
    } catch (error) {
      logger.error('Error updating service:', error);
      const e: any = error;
      if (e && e.code === 'P2025') {
        res.status(404).json({ error: 'Service not found or unauthorized' });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async deleteService(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const providerId = req.user?.id;

      if (!providerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      await serviceService.deleteService(id, providerId);
      res.status(200).json({
        success: true,
        message: 'Service deleted successfully',
      });
    } catch (error) {
      logger.error('Error deleting service:', error);
      const e: any = error;
      if (e && e.code === 'P2025') {
        res.status(404).json({ error: 'Service not found or unauthorized' });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async searchServices(req: Request, res: Response): Promise<void> {
    try {
      const {
        q: query,
        page = 1,
        limit = 20,
        categoryId,
        subcategoryId,
        providerId,
        priceMin,
        priceMax,
        serviceType,
      } = req.query;

      if (!query) {
        res.status(400).json({ error: 'Search query is required' });
        return;
      }

      const filters = {
        categoryId: categoryId as string,
        subcategoryId: subcategoryId as string,
        providerId: providerId as string,
        priceMin: priceMin ? parseFloat(priceMin as string) : undefined,
        priceMax: priceMax ? parseFloat(priceMax as string) : undefined,
        serviceType: serviceType as string,
      };

      const result = await serviceService.searchServices(
        query as string,
        filters,
        parseInt(page as string),
        parseInt(limit as string)
      );

      res.status(200).json({
        success: true,
        message: 'Services search completed',
        data: result,
      });
    } catch (error) {
      logger.error('Error searching services:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async addServiceMedia(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { mediaType, url, altText, sortOrder } = req.body;

      const media = await serviceService.addServiceMedia(id, {
        mediaType,
        url,
        altText,
        sortOrder,
      });

      res.status(201).json({
        success: true,
        message: 'Service media added successfully',
        data: media,
      });
    } catch (error) {
      logger.error('Error adding service media:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async bookService(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const customerId = req.user?.id;

      if (!customerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const booking = await serviceService.bookService(id, customerId, req.body);
      res.status(201).json({
        success: true,
        message: 'Service booked successfully',
        data: booking,
      });
    } catch (error) {
      logger.error('Error booking service:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getProviderServices(req: Request, res: Response): Promise<void> {
    try {
      const providerId = req.user?.id;
      if (!providerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const {
        page = 1,
        limit = 20,
        categoryId,
        subcategoryId,
        search,
        status,
      } = req.query;

      const filters = {
        providerId,
        categoryId: categoryId as string,
        subcategoryId: subcategoryId as string,
        search: search as string,
        status: status as string,
      };

      const result = await serviceService.getServices(
        filters,
        parseInt(page as string),
        parseInt(limit as string)
      );

      res.status(200).json({
        success: true,
        message: 'Provider services retrieved successfully',
        data: result,
      });
    } catch (error) {
      logger.error('Error getting provider services:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}