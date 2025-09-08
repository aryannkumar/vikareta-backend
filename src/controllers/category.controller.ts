import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { CategoryService } from '../services/category.service';

const categoryService = new CategoryService();

// Icon mapping for categories (slug -> Lucide icon name) consumed by frontend DynamicIcon
const CATEGORY_ICON_MAP: Record<string, string> = {
  'kirana-general-store': 'Store',
  'stationery-books': 'BookOpen',
  'mobile-accessories': 'Smartphone',
  'beauty-personal-care': 'Brush',
  'home-kitchen': 'CookingPot',
  'pharmacy-medical': 'Pill',
  'ayurvedic-herbal': 'Leaf',
  'fashion-clothing': 'Shirt',
  'jewelry-accessories': 'Gem',
  'footwear-bags': 'Briefcase',
  'food-groceries': 'UtensilsCrossed',
  'snacks-sweets': 'Candy',
  'beverages-drinks': 'CupSoda',
  'electronics-gadgets': 'Monitor',
  'home-appliances': 'Plug',
  'hardware-tools': 'Wrench',
  'building-materials': 'Hammer',
  'paints-hardware': 'PaintBucket',
  'automotive-parts': 'Car',
  'two-wheeler-accessories': 'Bike',
  'agriculture-seeds': 'Sprout',
  'fertilizers-pesticides': 'FlaskConical',
  'office-supplies': 'FolderKanban',
  'packaging-materials': 'Package',
  'business-services': 'Building2',
  'sports-fitness': 'Dumbbell',
  'toys-games': 'Gamepad2',
  'pet-supplies': 'PawPrint',
  'religious-pooja-items': 'Sparkles',
  'party-event-supplies': 'PartyPopper'
};
const DEFAULT_CATEGORY_ICON = 'Package';

function attachIconName(cat: any): any {
  if (!cat) return cat;
  const enriched: any = { ...cat, iconName: CATEGORY_ICON_MAP[cat.slug] || DEFAULT_CATEGORY_ICON };
  if (Array.isArray(enriched.subcategories)) {
    enriched.subcategories = enriched.subcategories.map((s: any) => ({ ...s, iconName: CATEGORY_ICON_MAP[s.slug] || 'Folder' }));
  }
  if (Array.isArray(enriched.children)) {
    enriched.children = enriched.children.map((c: any) => attachIconName(c));
  }
  return enriched;
}

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
        data: categories.map(c => attachIconName(c)),
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
        data: categories.map(c => attachIconName(c)),
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
        data: categories.map(c => attachIconName(c)),
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
        data: attachIconName(category),
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
        data: attachIconName(category),
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
        data: hierarchy.map(c => attachIconName(c)),
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
      // Support both legacy param name `id` (as defined in route) and `categoryId`
      const categoryId = (req.params as any).categoryId || (req.params as any).id;
      const { includeInactive = false } = req.query;

      const subcategories = await categoryService.getSubcategoriesByCategory(
        categoryId,
        includeInactive === 'true'
      );

      res.status(200).json({
        success: true,
        message: 'Subcategories retrieved successfully',
        data: subcategories.map(s => ({ ...s, iconName: CATEGORY_ICON_MAP[s.slug] || 'Folder' })),
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
        data: { ...subcategory, iconName: CATEGORY_ICON_MAP[subcategory.slug] || 'Folder' },
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

  // New: get subcategories by category slug
  async getSubcategoriesByCategorySlug(req: Request, res: Response): Promise<void> {
    try {
      const { slug } = req.params;
      const { includeInactive = false } = req.query;
      const category = await categoryService.getCategoryBySlug(slug);
      if (!category) {
        res.status(404).json({ error: 'Category not found' });
        return;
      }
      const subs = await categoryService.getSubcategoriesByCategory(
        category.id,
        includeInactive === 'true'
      );
      res.status(200).json({
        success: true,
        message: 'Subcategories retrieved successfully',
        data: subs.map(s => ({ ...s, iconName: CATEGORY_ICON_MAP[s.slug] || 'Folder' })),
        category: attachIconName(category)
      });
    } catch (error) {
      logger.error('Error getting subcategories by category slug:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // New: get a single subcategory by slug
  async getSubcategoryBySlug(req: Request, res: Response): Promise<void> {
    try {
      const { slug } = req.params;
      const { page = 1, limit = 20, sortBy = 'relevance', search, userId } = req.query;
      
      const sub = await categoryService.getSubcategoryBySlug(slug);
      if (!sub) {
        res.status(404).json({ error: 'Subcategory not found' });
        return;
      }

      // Get products and services for this subcategory
      const [productsData, servicesData] = await Promise.all([
        categoryService.getProductsBySubcategory(sub.id, userId as string, {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          sortBy: sortBy as string,
          search: search as string,
        }),
        categoryService.getServicesBySubcategory(sub.id, userId as string, {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          sortBy: sortBy as string,
          search: search as string,
        }),
      ]);

      res.status(200).json({
        success: true,
        message: 'Subcategory retrieved successfully',
        data: {
          ...sub,
          iconName: CATEGORY_ICON_MAP[sub.slug] || 'Folder',
          products: productsData,
          services: servicesData,
        },
      });
    } catch (error) {
      logger.error('Error getting subcategory by slug:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // New: get products by subcategory
  async getSubcategoryProducts(req: Request, res: Response): Promise<void> {
    try {
      const { slug } = req.params;
      const { page = 1, limit = 20, sortBy = 'relevance', search, userId } = req.query;
      
      const sub = await categoryService.getSubcategoryBySlug(slug);
      if (!sub) {
        res.status(404).json({ error: 'Subcategory not found' });
        return;
      }

      const productsData = await categoryService.getProductsBySubcategory(sub.id, userId as string, {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        sortBy: sortBy as string,
        search: search as string,
      });

      res.status(200).json({
        success: true,
        message: 'Products retrieved successfully',
        data: productsData,
        subcategory: { ...sub, iconName: CATEGORY_ICON_MAP[sub.slug] || 'Folder' },
      });
    } catch (error) {
      logger.error('Error getting subcategory products:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // New: get services by subcategory
  async getSubcategoryServices(req: Request, res: Response): Promise<void> {
    try {
      const { slug } = req.params;
      const { page = 1, limit = 20, sortBy = 'relevance', search, userId } = req.query;
      
      const sub = await categoryService.getSubcategoryBySlug(slug);
      if (!sub) {
        res.status(404).json({ error: 'Subcategory not found' });
        return;
      }

      const servicesData = await categoryService.getServicesBySubcategory(sub.id, userId as string, {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        sortBy: sortBy as string,
        search: search as string,
      });

      res.status(200).json({
        success: true,
        message: 'Services retrieved successfully',
        data: servicesData,
        subcategory: { ...sub, iconName: CATEGORY_ICON_MAP[sub.slug] || 'Folder' },
      });
    } catch (error) {
      logger.error('Error getting subcategory services:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}