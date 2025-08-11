import { PrismaClient } from '@prisma/client';
import type { Category } from '@prisma/client';
import { logger } from '@/utils/logger';

const prisma = new PrismaClient();

export interface CreateCategoryData {
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export interface UpdateCategoryData {
  name?: string;
  slug?: string;
  description?: string;
  parentId?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export interface CategoryWithChildren extends Category {
  children: CategoryWithChildren[];
  parent?: Category | null;
  _count: {
    products: number;
    children: number;
  };
}

export interface CategoryWithSubcategories extends Category {
  subcategories: Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    icon: string | null;
    productCount: number;
    sortOrder: number;
  }>;
}

export class CategoryService {
  /**
   * Create a new category
   */
  async createCategory(data: CreateCategoryData): Promise<CategoryWithChildren> {
    try {
      // Validate parent category if provided
      if (data.parentId) {
        const parentCategory = await prisma.category.findUnique({
          where: { id: data.parentId }
        });

        if (!parentCategory) {
          throw new Error('Parent category not found');
        }
      }

      // Check if slug already exists
      const existingCategory = await prisma.category.findUnique({
        where: { slug: data.slug }
      });

      if (existingCategory) {
        throw new Error('Category slug already exists');
      }

      const category = await prisma.category.create({
        data: {
          name: data.name,
          slug: data.slug,
          description: data.description || null,
          parentId: data.parentId || null,
          isActive: data.isActive ?? true,
          sortOrder: data.sortOrder ?? 0,
        },
      });

      return await this.getCategoryById(category.id);
    } catch (error) {
      logger.error('Error creating category:', error);
      throw error;
    }
  }

  /**
   * Get category by ID with children and counts
   */
  async getCategoryById(categoryId: string): Promise<CategoryWithChildren> {
    try {
      const category = await prisma.category.findUnique({
        where: { id: categoryId },
        include: {
          children: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            include: {
              children: {
                where: { isActive: true },
                orderBy: { sortOrder: 'asc' },
              },
              _count: {
                select: {
                  products: true,
                  children: true,
                },
              },
            },
          },
          parent: true,
          _count: {
            select: {
              products: true,
              children: true,
            },
          },
        },
      });

      if (!category) {
        throw new Error('Category not found');
      }

      return category as CategoryWithChildren;
    } catch (error) {
      logger.error('Error fetching category:', error);
      throw error;
    }
  }

  /**
   * Get all root categories (categories without parent)
   */
  async getRootCategories(): Promise<CategoryWithChildren[]> {
    try {
      const categories = await prisma.category.findMany({
        where: {
          parentId: null,
          isActive: true,
        },
        include: {
          children: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            include: {
              children: {
                where: { isActive: true },
                orderBy: { sortOrder: 'asc' },
              },
              _count: {
                select: {
                  products: true,
                  children: true,
                },
              },
            },
          },
          _count: {
            select: {
              products: true,
              children: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      });

      return categories as CategoryWithChildren[];
    } catch (error) {
      logger.error('Error fetching root categories:', error);
      throw error;
    }
  }

  /**
   * Get all categories in a flat structure
   */
  async getAllCategories(includeInactive: boolean = false): Promise<CategoryWithChildren[]> {
    try {
      const where = includeInactive ? {} : { isActive: true };

      const categories = await prisma.category.findMany({
        where,
        include: {
          children: {
            where: includeInactive ? {} : { isActive: true },
            orderBy: { sortOrder: 'asc' },
          },
          parent: true,
          _count: {
            select: {
              products: true,
              children: true,
            },
          },
        },
        orderBy: [
          { parentId: 'asc' },
          { sortOrder: 'asc' },
        ],
      });

      return categories as CategoryWithChildren[];
    } catch (error) {
      logger.error('Error fetching all categories:', error);
      throw error;
    }
  }

  /**
   * Get child categories for a parent category
   */
  async getChildCategories(parentId: string): Promise<CategoryWithChildren[]> {
    try {
      const subcategories = await prisma.category.findMany({
        where: {
          parentId,
          isActive: true,
        },
        include: {
          children: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
          },
          parent: true,
          _count: {
            select: {
              products: true,
              children: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      });

      return subcategories as CategoryWithChildren[];
    } catch (error) {
      logger.error('Error fetching subcategories:', error);
      throw error;
    }
  }

  /**
   * Update category
   */
  async updateCategory(categoryId: string, data: UpdateCategoryData): Promise<CategoryWithChildren> {
    try {
      // Check if category exists
      const existingCategory = await prisma.category.findUnique({
        where: { id: categoryId }
      });

      if (!existingCategory) {
        throw new Error('Category not found');
      }

      // Validate parent category if being updated
      if (data.parentId) {
        // Prevent setting self as parent
        if (data.parentId === categoryId) {
          throw new Error('Category cannot be its own parent');
        }

        const parentCategory = await prisma.category.findUnique({
          where: { id: data.parentId }
        });

        if (!parentCategory) {
          throw new Error('Parent category not found');
        }

        // Prevent circular references by checking if the new parent is a descendant
        const isDescendant = await this.isDescendant(categoryId, data.parentId);
        if (isDescendant) {
          throw new Error('Cannot set a descendant category as parent');
        }
      }

      // Check if slug already exists (if being updated)
      if (data.slug && data.slug !== existingCategory.slug) {
        const slugExists = await prisma.category.findUnique({
          where: { slug: data.slug }
        });

        if (slugExists) {
          throw new Error('Category slug already exists');
        }
      }

      await prisma.category.update({
        where: { id: categoryId },
        data,
      });

      return await this.getCategoryById(categoryId);
    } catch (error) {
      logger.error('Error updating category:', error);
      throw error;
    }
  }

  /**
   * Delete category (soft delete by setting isActive to false)
   */
  async deleteCategory(categoryId: string): Promise<void> {
    try {
      const category = await prisma.category.findUnique({
        where: { id: categoryId },
        include: {
          children: true,
          _count: {
            select: {
              products: true,
            },
          },
        },
      });

      if (!category) {
        throw new Error('Category not found');
      }

      // Check if category has products
      if (category._count.products > 0) {
        throw new Error('Cannot delete category with existing products');
      }

      // Check if category has active children
      const activeChildren = category.children.filter(child => child.isActive);
      if (activeChildren.length > 0) {
        throw new Error('Cannot delete category with active subcategories');
      }

      // Soft delete by setting isActive to false
      await prisma.category.update({
        where: { id: categoryId },
        data: { isActive: false },
      });

      logger.info(`Category ${categoryId} deleted (soft delete)`);
    } catch (error) {
      logger.error('Error deleting category:', error);
      throw error;
    }
  }

  /**
   * Search categories by name
   */
  async searchCategories(query: string, limit: number = 20): Promise<CategoryWithChildren[]> {
    try {
      const categories = await prisma.category.findMany({
        where: {
          isActive: true,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        include: {
          children: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
          },
          parent: true,
          _count: {
            select: {
              products: true,
              children: true,
            },
          },
        },
        orderBy: { name: 'asc' },
        take: limit,
      });

      return categories as CategoryWithChildren[];
    } catch (error) {
      logger.error('Error searching categories:', error);
      throw error;
    }
  }

  /**
   * Get category hierarchy path (breadcrumb)
   */
  async getCategoryPath(categoryId: string): Promise<Category[]> {
    try {
      const path: Category[] = [];
      let currentCategory = await prisma.category.findUnique({
        where: { id: categoryId },
        include: { parent: true },
      });

      while (currentCategory) {
        path.unshift(currentCategory);
        if (currentCategory.parent) {
          currentCategory = await prisma.category.findUnique({
            where: { id: currentCategory.parent.id },
            include: { parent: true },
          });
        } else {
          currentCategory = null;
        }
      }

      return path;
    } catch (error) {
      logger.error('Error getting category path:', error);
      throw error;
    }
  }

  /**
   * Reorder categories within the same parent
   */
  async reorderCategories(categoryIds: string[], parentId?: string): Promise<void> {
    try {
      // Verify all categories belong to the same parent
      const categories = await prisma.category.findMany({
        where: {
          id: { in: categoryIds },
          parentId: parentId || null,
        },
      });

      if (categories.length !== categoryIds.length) {
        throw new Error('Some categories not found or do not belong to the specified parent');
      }

      // Update sort order for each category
      const updatePromises = categoryIds.map((categoryId, index) =>
        prisma.category.update({
          where: { id: categoryId },
          data: { sortOrder: index },
        })
      );

      await Promise.all(updatePromises);

      logger.info(`Reordered ${categoryIds.length} categories`);
    } catch (error) {
      logger.error('Error reordering categories:', error);
      throw error;
    }
  }

  /**
   * Check if a category is a descendant of another category
   */
  private async isDescendant(ancestorId: string, descendantId: string): Promise<boolean> {
    try {
      let currentCategory = await prisma.category.findUnique({
        where: { id: descendantId },
        include: { parent: true },
      });

      while (currentCategory?.parent) {
        if (currentCategory.parent.id === ancestorId) {
          return true;
        }
        currentCategory = await prisma.category.findUnique({
          where: { id: currentCategory.parent.id },
          include: { parent: true },
        });
      }

      return false;
    } catch (error) {
      logger.error('Error checking descendant relationship:', error);
      return false;
    }
  }

  /**
   * Get popular categories based on product count
   */
  async getPopularCategories(limit: number = 10): Promise<CategoryWithChildren[]> {
    try {
      const categories = await prisma.category.findMany({
        where: { isActive: true },
        include: {
          children: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
          },
          parent: true,
          _count: {
            select: {
              products: true,
              children: true,
            },
          },
        },
        orderBy: {
          products: {
            _count: 'desc',
          },
        },
        take: limit,
      });

      return categories as CategoryWithChildren[];
    } catch (error) {
      logger.error('Error fetching popular categories:', error);
      throw error;
    }
  }

  /**
   * Get all categories with their subcategories
   */
  async getCategoriesWithSubcategories(): Promise<CategoryWithSubcategories[]> {
    try {
      const categories = await prisma.category.findMany({
        where: {
          isActive: true,
        },
        include: {
          subcategories: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              slug: true,
              description: true,
              icon: true,
              _count: { select: { products: true } },
              sortOrder: true,
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { sortOrder: 'asc' },
      });

      return categories.map(category => ({
        ...category,
        subcategories: category.subcategories.map(sub => ({
          id: sub.id,
          name: sub.name,
          slug: sub.slug,
          description: sub.description,
          icon: sub.icon,
          productCount: sub._count.products,
          sortOrder: sub.sortOrder,
        })),
      })) as CategoryWithSubcategories[];
    } catch (error) {
      logger.error('Error fetching categories with subcategories:', error);
      throw new Error('Failed to fetch categories with subcategories');
    }
  }

  /**
   * Get category by ID with subcategories
   */
  async getCategoryWithSubcategories(categoryId: string): Promise<CategoryWithSubcategories | null> {
    try {
      const category = await prisma.category.findUnique({
        where: {
          id: categoryId,
          isActive: true,
        },
        include: {
          subcategories: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              slug: true,
              description: true,
              icon: true,
              _count: { select: { products: true } },
              sortOrder: true,
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      return category as CategoryWithSubcategories | null;
    } catch (error) {
      logger.error('Error fetching category with subcategories:', error);
      throw new Error('Failed to fetch category with subcategories');
    }
  }

  /**
   * Get subcategories for a category
   */
  async getSubcategories(categoryId: string) {
    try {
      const subcategories = await prisma.subcategory.findMany({
        where: {
          categoryId,
          isActive: true,
        },
        orderBy: { sortOrder: 'asc' },
      });

      return subcategories;
    } catch (error) {
      logger.error('Error fetching subcategories:', error);
      throw new Error('Failed to fetch subcategories');
    }
  }
}

export const categoryService = new CategoryService();