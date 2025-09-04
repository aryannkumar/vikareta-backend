import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { ProductService } from '../services/product.service';
import { ServiceService } from '../services/service.service';
import { UserService } from '../services/user.service';
import { RfqService } from '../services/rfq.service';

const productService = new ProductService();
const serviceService = new ServiceService();
const userService = new UserService();
const rfqService = new RfqService();

export class SearchController {
  // Slimmed search endpoint that delegates to ProductService.searchProducts
  async searchProducts(req: Request, res: Response): Promise<void> {
    try {
      const { q, categoryId, subcategoryId, minPrice, maxPrice, page = 1, limit = 20 } = req.query;

      if (!q && !categoryId) {
        res.status(400).json({ success: false, error: 'Search query or category is required' });
        return;
      }

      const results = await productService.searchProducts(
        q as string,
        { categoryId: categoryId as string, subcategoryId: subcategoryId as string, priceMin: minPrice ? parseFloat(minPrice as string) : undefined, priceMax: maxPrice ? parseFloat(maxPrice as string) : undefined },
        parseInt(page as string),
        parseInt(limit as string)
      );

      res.status(200).json({ success: true, message: 'Products retrieved successfully', data: results });
    } catch (error) {
      logger.error('Error searching products:', error);
      res.status(500).json({ success: false, error: 'Internal server error', message: 'Failed to search products' });
    }
  }

  // Delegate to ServiceService.searchServices with proper filter names
  async searchServices(req: Request, res: Response): Promise<void> {
    try {
      const { q, categoryId, subcategoryId, minPrice, maxPrice, page = 1, limit = 20 } = req.query;

      if (!q && !categoryId) {
        res.status(400).json({ success: false, error: 'Search query or category is required' });
        return;
      }

      const results = await serviceService.searchServices(
        q as string,
        { categoryId: categoryId as string, subcategoryId: subcategoryId as string, priceMin: minPrice ? parseFloat(minPrice as string) : undefined, priceMax: maxPrice ? parseFloat(maxPrice as string) : undefined },
        parseInt(page as string),
        parseInt(limit as string)
      );

      res.status(200).json({ success: true, message: 'Services retrieved successfully', data: results });
    } catch (error) {
      logger.error('Error searching services:', error);
      res.status(500).json({ success: false, error: 'Internal server error', message: 'Failed to search services' });
    }
  }

  async globalSearch(req: Request, res: Response): Promise<void> {
    try {
      const { q, type, page = 1, limit = 20 } = req.query;
      
      if (!q) {
        res.status(400).json({ 
          success: false,
          error: 'Search query is required' 
        });
        return;
      }

      const results: any = {
        products: [],
        services: [],
        businesses: [],
      };

      // Search products
      if (!type || type === 'products') {
        try {
          const productResults = await productService.searchProducts(
            q as string,
            {},
            parseInt(page as string),
            Math.floor(parseInt(limit as string) / 3)
          );
          results.products = productResults.products || [];
        } catch (error) {
          logger.error('Error searching products:', error);
        }
      }

      // Search services
      if (!type || type === 'services') {
        try {
          const serviceResults = await serviceService.searchServices(
            q as string,
            {},
            parseInt(page as string),
            Math.floor(parseInt(limit as string) / 3)
          );
          results.services = serviceResults.services || [];
        } catch (error) {
          logger.error('Error searching services:', error);
        }
      }

      res.status(200).json({
        success: true,
        message: 'Global search completed successfully',
        data: results,
      });
    } catch (error) {
      logger.error('Error in global search:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error',
        message: 'Failed to perform global search'
      });
    }
  }

  async searchSuggestions(req: Request, res: Response): Promise<void> {
    try {
      const { q } = req.query;
      
      if (!q || (q as string).length < 2) {
        res.status(400).json({ 
          success: false,
          error: 'Search query must be at least 2 characters long' 
        });
        return;
      }

      // Simple suggestions - in a real implementation, you'd use Elasticsearch
      const suggestions = [
        `${q} products`,
        `${q} services`,
        `${q} suppliers`,
      ];

      res.status(200).json({
        success: true,
        message: 'Search suggestions retrieved successfully',
        data: { suggestions },
      });
    } catch (error) {
      logger.error('Error getting search suggestions:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error',
        message: 'Failed to get search suggestions'
      });
    }
  }

  async getPopularSearches(req: Request, res: Response): Promise<void> {
    try {
      const { limit = 10 } = req.query;

      // Mock popular searches - in a real implementation, you'd get from analytics
      const popularSearches = [
        { query: 'electronics', count: 1250 },
        { query: 'machinery', count: 980 },
        { query: 'textiles', count: 750 },
        { query: 'chemicals', count: 650 },
        { query: 'automotive', count: 580 },
      ].slice(0, parseInt(limit as string));

      res.status(200).json({
        success: true,
        message: 'Popular searches retrieved successfully',
        data: { popularSearches },
      });
    } catch (error) {
      logger.error('Error getting popular searches:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error',
        message: 'Failed to get popular searches'
      });
    }
  }

  async search(req: Request, res: Response): Promise<void> {
    try {
      const { q: query, page = 1, limit = 20, type } = req.query;

      if (!query) {
        res.status(400).json({ error: 'Search query is required' });
        return;
      }

      const results: any = {
        query: query as string,
        results: {},
        total: 0,
      };

      // Search products
      if (!type || type === 'products') {
        try {
          const productResults = await productService.searchProducts(
            query as string,
            {},
            parseInt(page as string),
            parseInt(limit as string)
          );
          results.results.products = productResults;
          results.total += productResults.total;
        } catch (error) {
          logger.error('Error searching products:', error);
          results.results.products = { products: [], total: 0, page: 1, totalPages: 0 };
        }
      }

      // Search services
      if (!type || type === 'services') {
        try {
          const serviceResults = await serviceService.searchServices(
            query as string,
            {},
            parseInt(page as string),
            parseInt(limit as string)
          );
          results.results.services = serviceResults;
          results.total += serviceResults.total;
        } catch (error) {
          logger.error('Error searching services:', error);
          results.results.services = { services: [], total: 0, page: 1, totalPages: 0 };
        }
      }

      res.status(200).json({
        success: true,
        message: 'Search completed successfully',
        data: results,
      });
    } catch (error) {
      logger.error('Error performing search:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getSuggestions(req: Request, res: Response): Promise<void> {
    try {
      const { q: query, limit = 10 } = req.query;

      if (!query) {
        res.status(400).json({ error: 'Query parameter is required' });
        return;
      }

      // Simple suggestions based on product and service titles
      const suggestions = await Promise.all([
        // Product suggestions
        productService.getProducts(
          { search: query as string },
          1,
          parseInt(limit as string) / 2
        ),
        // Service suggestions
        serviceService.getServices(
          { search: query as string },
          1,
          parseInt(limit as string) / 2
        ),
      ]);

      const productSuggestions = (suggestions[0].products as any[]).map(p => ({
        type: 'product',
        id: p.id,
        title: p.title,
        category: (p as any).category?.name,
      }));

      const serviceSuggestions = (suggestions[1].services as any[]).map(s => ({
        type: 'service',
        id: s.id,
        title: s.title,
        category: (s as any).category?.name,
      }));

      const allSuggestions = [...productSuggestions, ...serviceSuggestions]
        .slice(0, parseInt(limit as string));

      res.status(200).json({
        success: true,
        message: 'Suggestions retrieved successfully',
        data: allSuggestions,
      });
    } catch (error) {
      logger.error('Error getting suggestions:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
  // Older duplicate search methods removed; newer consolidated methods are above.

  async searchUsers(req: Request, res: Response): Promise<void> {
    try {
      const { q: query, page = 1, limit = 20, userType } = req.query;

      if (!query) {
        res.status(400).json({ error: 'Search query is required' });
        return;
      }

      // Simple user search using Prisma
      const where: any = {
        isActive: true,
        OR: [
          { firstName: { contains: query as string, mode: 'insensitive' } },
          { lastName: { contains: query as string, mode: 'insensitive' } },
          { businessName: { contains: query as string, mode: 'insensitive' } },
          { email: { contains: query as string, mode: 'insensitive' } },
        ],
      };

      if (userType) {
        where.userType = userType;
      }

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);

      const usersResult = await userService.getUsers(
        { page: pageNum, limit: limitNum, skip: (pageNum - 1) * limitNum },
        { field: 'createdAt', order: 'desc' },
        { search: query as string, userType: userType as string }
      );

      res.status(200).json({
        success: true,
        message: 'User search completed successfully',
        data: {
          users: usersResult.data,
          total: usersResult.pagination.total,
          page: usersResult.pagination.page,
          totalPages: usersResult.pagination.totalPages,
        },
      });
    } catch (error) {
      logger.error('Error searching users:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async searchRfqs(req: Request, res: Response): Promise<void> {
    try {
      const {
        q: query,
        page = 1,
        limit = 20,
        categoryId,
        status = 'active',
      } = req.query;

      if (!query) {
        res.status(400).json({ error: 'Search query is required' });
        return;
      }

      const where: any = {
        status: status as string,
        OR: [
          { title: { contains: query as string, mode: 'insensitive' } },
          { description: { contains: query as string, mode: 'insensitive' } },
        ],
      };

      if (categoryId) {
        where.categoryId = categoryId;
      }

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      const [rfqs, total] = await Promise.all([
        rfqService.searchRfqs(where, skip, limitNum),
        rfqService.countRfqs(where),
      ]);

      res.status(200).json({
        success: true,
        message: 'RFQ search completed successfully',
        data: {
          rfqs,
          total,
          page: pageNum,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      logger.error('Error searching RFQs:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}