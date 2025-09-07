import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { ProductService } from '../services/product.service';
import { minioService } from '@/services/minio.service';

const productService = new ProductService();

export class ProductController {
  async createProduct(req: Request, res: Response): Promise<void> {
    try {

      const sellerId = req.user?.id;
      if (!sellerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const product = await productService.createProduct(sellerId, req.body);

      // Handle uploaded images (if any)
      const files = (req.files as any[]) || [];
      for (const file of files) {
        try {
          const uploadRes = await minioService.uploadFile(file.buffer, file.originalname || 'image.jpg', 'products', { 'content-type': file.mimetype });
          await productService.addProductMedia(product.id, {
            mediaType: file.mimetype?.split('/')[0] || 'image',
            url: uploadRes.url,
            altText: file.originalname,
            sortOrder: 0,
          });
        } catch (err) {
          logger.warn('Failed to upload product image:', err);
        }
      }
      res.status(201).json({
        success: true,
        message: 'Product created successfully',
        data: product,
      });
    } catch (error) {
      logger.error('Error creating product:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getProducts(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 20,
        categoryId,
        subcategoryId,
        sellerId,
        priceMin,
        priceMax,
        search,
        isActive,
        status,
      } = req.query;

      const filters = {
        categoryId: categoryId as string,
        subcategoryId: subcategoryId as string,
        sellerId: sellerId as string,
        priceMin: priceMin ? parseFloat(priceMin as string) : undefined,
        priceMax: priceMax ? parseFloat(priceMax as string) : undefined,
        search: search as string,
        isActive: isActive ? isActive === 'true' : undefined,
        status: status as string,
      };

      const result = await productService.getProducts(
        filters,
        parseInt(page as string),
        parseInt(limit as string)
      );

      res.status(200).json({
        success: true,
        message: 'Products retrieved successfully',
        data: result,
      });
    } catch (error) {
      logger.error('Error getting products:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getFeaturedProducts(req: Request, res: Response): Promise<void> {
    try {
      const { limit = 10 } = req.query;
      const products = await productService.getFeaturedProducts(parseInt(limit as string));

      res.status(200).json({
        success: true,
        message: 'Featured products retrieved successfully',
        data: products,
      });
    } catch (error) {
      logger.error('Error getting featured products:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getProductById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const product = await productService.getProductById(id);

      if (!product) {
        res.status(404).json({ error: 'Product not found' });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Product retrieved successfully',
        data: product,
      });
    } catch (error) {
      logger.error('Error getting product:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async updateProduct(req: Request, res: Response): Promise<void> {
    try {

      const { id } = req.params;
      const sellerId = req.user?.id;

      if (!sellerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const product = await productService.updateProduct(id, sellerId, req.body);

      // Handle uploaded images (if any)
      const files = (req.files as any[]) || [];
      for (const file of files) {
        try {
          const uploadRes = await minioService.uploadFile(file.buffer, file.originalname || 'image.jpg', 'products', { 'content-type': file.mimetype });
          await productService.addProductMedia(product.id, {
            mediaType: file.mimetype?.split('/')[0] || 'image',
            url: uploadRes.url,
            altText: file.originalname,
            sortOrder: 0,
          });
        } catch (err) {
          logger.warn('Failed to upload product image:', err);
        }
      }
      res.status(200).json({
        success: true,
        message: 'Product updated successfully',
        data: product,
      });
    } catch (err) {
      const error: any = err;
      logger.error('Error updating product:', error);
      if (error?.code === 'P2025') {
        res.status(404).json({ error: 'Product not found or unauthorized' });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async deleteProduct(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const sellerId = req.user?.id;

      if (!sellerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      await productService.deleteProduct(id, sellerId);
      res.status(200).json({
        success: true,
        message: 'Product deleted successfully',
      });
    } catch (err) {
      const error: any = err;
      logger.error('Error deleting product:', error);
      if (error?.code === 'P2025') {
        res.status(404).json({ error: 'Product not found or unauthorized' });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async searchProducts(req: Request, res: Response): Promise<void> {
    try {
      const {
        q: query,
        page = 1,
        limit = 20,
        categoryId,
        subcategoryId,
        sellerId,
        priceMin,
        priceMax,
      } = req.query;

      if (!query) {
        res.status(400).json({ error: 'Search query is required' });
        return;
      }

      const filters = {
        categoryId: categoryId as string,
        subcategoryId: subcategoryId as string,
        sellerId: sellerId as string,
        priceMin: priceMin ? parseFloat(priceMin as string) : undefined,
        priceMax: priceMax ? parseFloat(priceMax as string) : undefined,
      };

      const result = await productService.searchProducts(
        query as string,
        filters,
        parseInt(page as string),
        parseInt(limit as string)
      );

      res.status(200).json({
        success: true,
        message: 'Products search completed',
        data: result,
      });
    } catch (error) {
      logger.error('Error searching products:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async addProductMedia(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { mediaType, url, altText, sortOrder } = req.body;

      const media = await productService.addProductMedia(id, {
        mediaType,
        url,
        altText,
        sortOrder,
      });

      res.status(201).json({
        success: true,
        message: 'Product media added successfully',
        data: media,
      });
    } catch (error) {
      logger.error('Error adding product media:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async createProductVariant(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const variant = await productService.createProductVariant(id, req.body);

      res.status(201).json({
        success: true,
        message: 'Product variant created successfully',
        data: variant,
      });
    } catch (error) {
      logger.error('Error creating product variant:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getSellerProducts(req: Request, res: Response): Promise<void> {
    try {
      const sellerId = req.user?.id;
      if (!sellerId) {
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
        sellerId,
        categoryId: categoryId as string,
        subcategoryId: subcategoryId as string,
        search: search as string,
        status: status as string,
      };

      const result = await productService.getProducts(
        filters,
        parseInt(page as string),
        parseInt(limit as string)
      );

      res.status(200).json({
        success: true,
        message: 'Seller products retrieved successfully',
        data: result,
      });
    } catch (error) {
      logger.error('Error getting seller products:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}