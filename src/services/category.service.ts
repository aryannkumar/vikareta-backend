import type { Category, Subcategory } from '@prisma/client';
import { BaseService } from './base.service';
import { logger } from '../utils/logger';

export interface CreateCategoryData {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  parentId?: string;
  featured?: boolean;
  sortOrder?: number;
}

export interface UpdateCategoryData extends Partial<CreateCategoryData> {
  isActive?: boolean;
}

export interface CreateSubcategoryData {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  sortOrder?: number;
}

export class CategoryService extends BaseService {
  constructor() {
    super();
  }

  async createCategory(data: CreateCategoryData): Promise<Category> {
    try {
      const category = await this.prisma.category.create({
        data: {
          ...data,
          featured: data.featured || false,
          sortOrder: data.sortOrder || 0,
        },
        include: {
          parent: true,
          children: true,
          subcategories: true,
        },
      });

      logger.info(`Category created: ${category.id} - ${category.name}`);
      return category;
    } catch (error) {
      logger.error('Error creating category:', error);
      throw error;
    }
  }

  async updateCategory(categoryId: string, data: UpdateCategoryData): Promise<Category> {
    try {
      const category = await this.prisma.category.update({
        where: { id: categoryId },
        data,
        include: {
          parent: true,
          children: true,
          subcategories: true,
        },
      });

      logger.info(`Category updated: ${categoryId}`);
      return category;
    } catch (error) {
      logger.error('Error updating category:', error);
      throw error;
    }
  }

  async getCategoryById(categoryId: string): Promise<Category | null> {
    try {
      return await this.prisma.category.findUnique({
        where: { id: categoryId },
        include: {
          parent: true,
          children: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
          },
          subcategories: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
          },
          _count: {
            select: {
              products: { where: { isActive: true } },
              services: { where: { isActive: true } },
            },
          },
        },
      });
    } catch (error) {
      logger.error('Error fetching category:', error);
      throw error;
    }
  }

  async getCategoryBySlug(slug: string): Promise<Category | null> {
    try {
      return await this.prisma.category.findUnique({
        where: { slug },
        include: {
          parent: true,
          children: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
          },
          subcategories: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
          },
          _count: {
            select: {
              products: { where: { isActive: true } },
              services: { where: { isActive: true } },
            },
          },
        },
      });
    } catch (error) {
      logger.error('Error fetching category by slug:', error);
      throw error;
    }
  }

  async getCategories(includeInactive = false): Promise<Category[]> {
    try {
      const where = includeInactive ? {} : { isActive: true };
      
      return await this.prisma.category.findMany({
        where,
        include: {
          parent: true,
          children: {
            where: includeInactive ? {} : { isActive: true },
            orderBy: { sortOrder: 'asc' },
          },
          subcategories: {
            where: includeInactive ? {} : { isActive: true },
            orderBy: { sortOrder: 'asc' },
          },
          _count: {
            select: {
              products: { where: { isActive: true } },
              services: { where: { isActive: true } },
            },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
    } catch (error) {
      logger.error('Error fetching categories:', error);
      throw error;
    }
  }

  async getRootCategories(includeInactive = false): Promise<Category[]> {
    try {
      const where: any = { parentId: null };
      if (!includeInactive) where.isActive = true;

      return await this.prisma.category.findMany({
        where,
        include: {
          children: {
            where: includeInactive ? {} : { isActive: true },
            orderBy: { sortOrder: 'asc' },
          },
          subcategories: {
            where: includeInactive ? {} : { isActive: true },
            orderBy: { sortOrder: 'asc' },
          },
          _count: {
            select: {
              products: { where: { isActive: true } },
              services: { where: { isActive: true } },
            },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
    } catch (error) {
      logger.error('Error fetching root categories:', error);
      throw error;
    }
  }

  async getFeaturedCategories(): Promise<Category[]> {
    try {
      return await this.prisma.category.findMany({
        where: {
          featured: true,
          isActive: true,
        },
        include: {
          subcategories: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            take: 5,
          },
          _count: {
            select: {
              products: { where: { isActive: true } },
              services: { where: { isActive: true } },
            },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
    } catch (error) {
      logger.error('Error fetching featured categories:', error);
      throw error;
    }
  }

  async deleteCategory(categoryId: string): Promise<void> {
    try {
      // Check if category has products or services
      const category = await this.prisma.category.findUnique({
        where: { id: categoryId },
        include: {
          _count: {
            select: {
              products: true,
              services: true,
              children: true,
            },
          },
        },
      });

      if (!category) {
        throw new Error('Category not found');
      }

      if (category._count.products > 0 || category._count.services > 0 || category._count.children > 0) {
        throw new Error('Cannot delete category with associated products, services, or subcategories');
      }

      await this.prisma.category.delete({
        where: { id: categoryId },
      });

      logger.info(`Category deleted: ${categoryId}`);
    } catch (error) {
      logger.error('Error deleting category:', error);
      throw error;
    }
  }

  // Subcategory methods
  async createSubcategory(categoryId: string, data: CreateSubcategoryData): Promise<Subcategory> {
    try {
      const subcategory = await this.prisma.subcategory.create({
        data: {
          ...data,
          categoryId,
          sortOrder: data.sortOrder || 0,
        },
        include: {
          category: true,
        },
      });

      logger.info(`Subcategory created: ${subcategory.id} - ${subcategory.name}`);
      return subcategory;
    } catch (error) {
      logger.error('Error creating subcategory:', error);
      throw error;
    }
  }

  async updateSubcategory(subcategoryId: string, data: Partial<CreateSubcategoryData> & { isActive?: boolean }): Promise<Subcategory> {
    try {
      const subcategory = await this.prisma.subcategory.update({
        where: { id: subcategoryId },
        data,
        include: {
          category: true,
        },
      });

      logger.info(`Subcategory updated: ${subcategoryId}`);
      return subcategory;
    } catch (error) {
      logger.error('Error updating subcategory:', error);
      throw error;
    }
  }

  async getSubcategoryById(subcategoryId: string): Promise<Subcategory | null> {
    try {
      return await this.prisma.subcategory.findUnique({
        where: { id: subcategoryId },
        include: {
          category: true,
          _count: {
            select: {
              products: { where: { isActive: true } },
              services: { where: { isActive: true } },
            },
          },
        },
      });
    } catch (error) {
      logger.error('Error fetching subcategory:', error);
      throw error;
    }
  }

  async getSubcategoryBySlug(slug: string): Promise<Subcategory | null> {
    try {
      return await this.prisma.subcategory.findUnique({
        where: { slug },
        include: {
          category: true,
          _count: {
            select: {
              products: { where: { isActive: true } },
              services: { where: { isActive: true } },
            },
          },
        },
      });
    } catch (error) {
      logger.error('Error fetching subcategory by slug:', error);
      throw error;
    }
  }

  async getSubcategoriesByCategory(categoryId: string, includeInactive = false): Promise<Subcategory[]> {
    try {
      const where: any = { categoryId };
      if (!includeInactive) where.isActive = true;

      return await this.prisma.subcategory.findMany({
        where,
        include: {
          category: true,
          _count: {
            select: {
              products: { where: { isActive: true } },
              services: { where: { isActive: true } },
            },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
    } catch (error) {
      logger.error('Error fetching subcategories by category:', error);
      throw error;
    }
  }

  async getProductsBySubcategory(
    subcategoryId: string,
    userId?: string,
    options: {
      page?: number;
      limit?: number;
      sortBy?: string;
      search?: string;
    } = {}
  ): Promise<{ products: any[]; total: number; page: number; limit: number }> {
    try {
      const { page = 1, limit = 20, sortBy = 'relevance', search } = options;
      const skip = (page - 1) * limit;

      const where: any = {
        subcategoryId,
        isActive: true,
      };

      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }

      let orderBy: any = { createdAt: 'desc' };
      if (sortBy === 'price-low') orderBy = { price: 'asc' };
      else if (sortBy === 'price-high') orderBy = { price: 'desc' };
      else if (sortBy === 'name') orderBy = { title: 'asc' };

      const [products, total] = await Promise.all([
        this.prisma.product.findMany({
          where,
          include: {
            seller: {
              select: {
                id: true,
                businessName: true,
                city: true,
                state: true,
                isVerified: true,
              },
            },
            category: true,
            subcategory: true,
            reviews: {
              select: {
                rating: true,
              },
            },
            _count: {
              select: {
                reviews: true,
              },
            },
          },
          orderBy,
          skip,
          take: limit,
        }),
        this.prisma.product.count({ where }),
      ]);

      // Calculate average rating for each product
      const enrichedProducts = products.map(product => ({
        ...product,
        reviews: {
          average: product.reviews.length > 0 
            ? product.reviews.reduce((sum, r) => sum + r.rating, 0) / product.reviews.length 
            : 0,
          total: product._count.reviews,
        },
        supplier: {
          id: product.seller.id,
          name: product.seller.businessName || 'Unknown Supplier',
          location: `${product.seller.city || ''}, ${product.seller.state || ''}`.trim().replace(/^,|,$/, '') || 'Unknown Location',
          verified: product.seller.isVerified,
        },
      }));

      return {
        products: enrichedProducts,
        total,
        page,
        limit,
      };
    } catch (error) {
      logger.error('Error fetching products by subcategory:', error);
      throw error;
    }
  }

  async getServicesBySubcategory(
    subcategoryId: string,
    userId?: string,
    options: {
      page?: number;
      limit?: number;
      sortBy?: string;
      search?: string;
    } = {}
  ): Promise<{ services: any[]; total: number; page: number; limit: number }> {
    try {
      const { page = 1, limit = 20, sortBy = 'relevance', search } = options;
      const skip = (page - 1) * limit;

      const where: any = {
        subcategoryId,
        isActive: true,
      };

      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }

      let orderBy: any = { createdAt: 'desc' };
      if (sortBy === 'price-low') orderBy = { price: 'asc' };
      else if (sortBy === 'price-high') orderBy = { price: 'desc' };
      else if (sortBy === 'name') orderBy = { title: 'asc' };

      const [services, total] = await Promise.all([
        this.prisma.service.findMany({
          where,
          include: {
            provider: {
              select: {
                id: true,
                businessName: true,
                city: true,
                state: true,
                isVerified: true,
              },
            },
            category: true,
            subcategory: true,
            reviews: {
              select: {
                rating: true,
              },
            },
            _count: {
              select: {
                reviews: true,
              },
            },
          },
          orderBy,
          skip,
          take: limit,
        }),
        this.prisma.service.count({ where }),
      ]);

      // Calculate average rating for each service
      const enrichedServices = services.map(service => ({
        ...service,
        reviews: {
          average: service.reviews.length > 0 
            ? service.reviews.reduce((sum, r) => sum + r.rating, 0) / service.reviews.length 
            : 0,
          total: service._count.reviews,
        },
        provider: {
          id: service.provider.id,
          name: service.provider.businessName || 'Unknown Provider',
          location: `${service.provider.city || ''}, ${service.provider.state || ''}`.trim().replace(/^,|,$/, '') || 'Unknown Location',
          verified: service.provider.isVerified,
        },
      }));

      return {
        services: enrichedServices,
        total,
        page,
        limit,
      };
    } catch (error) {
      logger.error('Error fetching services by subcategory:', error);
      throw error;
    }
  }

  async deleteSubcategory(subcategoryId: string): Promise<void> {
    try {
      // Check if subcategory has products or services
      const subcategory = await this.prisma.subcategory.findUnique({
        where: { id: subcategoryId },
        include: {
          _count: {
            select: {
              products: true,
              services: true,
            },
          },
        },
      });

      if (!subcategory) {
        throw new Error('Subcategory not found');
      }

      if (subcategory._count.products > 0 || subcategory._count.services > 0) {
        throw new Error('Cannot delete subcategory with associated products or services');
      }

      await this.prisma.subcategory.delete({
        where: { id: subcategoryId },
      });

      logger.info(`Subcategory deleted: ${subcategoryId}`);
    } catch (error) {
      logger.error('Error deleting subcategory:', error);
      throw error;
    }
  }

  async getCategoryHierarchy(): Promise<Category[]> {
    try {
      return await this.prisma.category.findMany({
        where: {
          isActive: true,
          parentId: null,
        },
        include: {
          children: {
            where: { isActive: true },
            include: {
              children: {
                where: { isActive: true },
                orderBy: { sortOrder: 'asc' },
              },
              subcategories: {
                where: { isActive: true },
                orderBy: { sortOrder: 'asc' },
              },
            },
            orderBy: { sortOrder: 'asc' },
          },
          subcategories: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { sortOrder: 'asc' },
      });
    } catch (error) {
      logger.error('Error fetching category hierarchy:', error);
      throw error;
    }
  }
}