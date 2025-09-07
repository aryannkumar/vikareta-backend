import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { CategoryService } from '../services/category.service';

const categoryService = new CategoryService();

export class CategoryController {
  async createCategory(req: Request, res: Response): Promise<void> {
    try {

      const category = await categoryService.createCategory(req.body);
      res.status(201).json({
        success: true,
        message: 'Category created successfully',
        data: category,
      });
    } catch (error) {
      logger.error('Error creating category:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getCategories(req: Request, res: Response): Promise<void> {
    try {
      const { includeInactive = false } = req.query;
      const categories = await categoryService.getCategories(includeInactive === 'true');

      res.status(200).json({
        success: true,
        message: 'Categories retrieved successfully',
        data: categories,
      });
    } catch (error) {
      logger.error('Error getting categories:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getRootCategories(req: Request, res: Response): Promise<void> {
    try {
      const { includeInactive = false } = req.query;
      const categories = await categoryService.getRootCategories(includeInactive === 'true');

      res.status(200).json({
        success: true,
        message: 'Root categories retrieved successfully',
        data: categories,
      });
    } catch (error) {
      logger.error('Error getting root categories:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getFeaturedCategories(req: Request, res: Response): Promise<void> {
    try {
      const categories = await categoryService.getFeaturedCategories();

      res.status(200).json({
        success: true,
        message: 'Featured categories retrieved successfully',
        data: categories,
      });
    } catch (error) {
      logger.error('Error getting featured categories:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getCategoryById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const category = await categoryService.getCategoryById(id);

      if (!category) {
        res.status(404).json({ error: 'Category not found' });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Category retrieved successfully',
        data: category,
      });
    } catch (error) {
      logger.error('Error getting category:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getCategoryBySlug(req: Request, res: Response): Promise<void> {
    try {
      const { slug } = req.params;
      const category = await categoryService.getCategoryBySlug(slug);

      if (!category) {
        res.status(404).json({ error: 'Category not found' });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Category retrieved successfully',
        data: category,
      });
    } catch (error) {
      logger.error('Error getting category by slug:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async updateCategory(req: Request, res: Response): Promise<void> {
    try {

      const { id } = req.params;
      const category = await categoryService.updateCategory(id, req.body);

      res.status(200).json({
        success: true,
        message: 'Category updated successfully',
        data: category,
      });
    } catch (error) {
      logger.error('Error updating category:', error);
      const e: any = error;
      if (e && e.code === 'P2025') {
        res.status(404).json({ error: 'Category not found' });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async deleteCategory(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await categoryService.deleteCategory(id);

      res.status(200).json({
        success: true,
        message: 'Category deleted successfully',
      });
    } catch (error) {
      logger.error('Error deleting category:', error);
      const e: any = error;
      if (e && typeof e.message === 'string' && e.message.includes('associated products')) {
        res.status(400).json({ error: e.message });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getCategoryHierarchy(req: Request, res: Response): Promise<void> {
    try {
      const hierarchy = await categoryService.getCategoryHierarchy();

      res.status(200).json({
        success: true,
        message: 'Category hierarchy retrieved successfully',
        data: hierarchy,
      });
    } catch (error) {
      logger.error('Error getting category hierarchy:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Subcategory methods
  async createSubcategory(req: Request, res: Response): Promise<void> {
    try {

      const { categoryId } = req.params;
      const subcategory = await categoryService.createSubcategory(categoryId, req.body);

      res.status(201).json({
        success: true,
        message: 'Subcategory created successfully',
        data: subcategory,
      });
    } catch (error) {
      logger.error('Error creating subcategory:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getSubcategories(req: Request, res: Response): Promise<void> {
    try {
      const { categoryId } = req.params;
      const { includeInactive = false } = req.query;

      const subcategories = await categoryService.getSubcategoriesByCategory(
        categoryId,
        includeInactive === 'true'
      );

      res.status(200).json({
        success: true,
        message: 'Subcategories retrieved successfully',
        data: subcategories,
      });
    } catch (error) {
      logger.error('Error getting subcategories:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getSubcategoryById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const subcategory = await categoryService.getSubcategoryById(id);

      if (!subcategory) {
        res.status(404).json({ error: 'Subcategory not found' });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Subcategory retrieved successfully',
        data: subcategory,
      });
    } catch (error) {
      logger.error('Error getting subcategory:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async updateSubcategory(req: Request, res: Response): Promise<void> {
    try {

      const { id } = req.params;
      const subcategory = await categoryService.updateSubcategory(id, req.body);

      res.status(200).json({
        success: true,
        message: 'Subcategory updated successfully',
        data: subcategory,
      });
    } catch (error) {
      logger.error('Error updating subcategory:', error);
      const e: any = error;
      if (e && e.code === 'P2025') {
        res.status(404).json({ error: 'Subcategory not found' });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async deleteSubcategory(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await categoryService.deleteSubcategory(id);

      res.status(200).json({
        success: true,
        message: 'Subcategory deleted successfully',
      });
    } catch (error) {
      logger.error('Error deleting subcategory:', error);
      const e: any = error;
      if (e && typeof e.message === 'string' && e.message.includes('associated products')) {
        res.status(400).json({ error: e.message });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}