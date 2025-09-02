/**
 * Product Category Service
 * Manages product categories with proper schema alignment
 */

import { PrismaClient } from '@prisma/client';

export interface ProductCategoryWithChildren {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  icon: string | null;
  parentId: string | null;
  featured: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  type: string;
  productSubcategories?: Array<{
    id: string;
    name: string;
    description: string;
    slug: string;
    icon: string | null;
    sortOrder: number;
    productCount: number;
  }>;
}

export class ProductCategoryService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Get all product categories
   */
  async getAllCategories(): Promise<ProductCategoryWithChildren[]> {
    try {
      const categories = await this.prisma.productCategory.findMany({
        where: { isActive: true },
        include: {
          productSubcategories: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              description: true,
              slug: true,
              icon: true,
              sortOrder: true,
              _count: {
                select: { products: true }
              }
            },
            orderBy: { sortOrder: 'asc' }
          }
        },
        orderBy: { sortOrder: 'asc' }
      });

      return categories.map(category => ({
        ...category,
        productSubcategories: category.productSubcategories.map(sub => ({
          ...sub,
          productCount: sub._count.products
        }))
      }));
    } catch (error) {
      console.error('Error fetching product categories:', error);
      throw new Error('Failed to fetch product categories');
    }
  }

  /**
   * Get category by ID
   */
  async getCategoryById(categoryId: string): Promise<ProductCategoryWithChildren | null> {
    try {
      const category = await this.prisma.productCategory.findUnique({
        where: { id: categoryId },
        include: {
          productSubcategories: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              description: true,
              slug: true,
              icon: true,
              sortOrder: true,
              _count: {
                select: { products: true }
              }
            },
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      if (!category) return null;

      return {
        ...category,
        productSubcategories: category.productSubcategories.map(sub => ({
          ...sub,
          productCount: sub._count.products
        }))
      };
    } catch (error) {
      console.error('Error fetching product category:', error);
      throw new Error('Failed to fetch product category');
    }
  }

  /**
   * Create new product category
   */
  async createCategory(data: {
    name: string;
    description?: string;
    slug: string;
    icon?: string;
    parentId?: string;
    featured?: boolean;
    sortOrder?: number;
    type?: string;
  }): Promise<ProductCategoryWithChildren> {
    try {
      const category = await this.prisma.productCategory.create({
        data: {
          name: data.name,
          description: data.description,
          slug: data.slug,
          icon: data.icon,
          parentId: data.parentId,
          featured: data.featured || false,
          sortOrder: data.sortOrder || 0,
          type: data.type || 'product',
        },
        include: {
          productSubcategories: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              description: true,
              slug: true,
              icon: true,
              sortOrder: true,
              _count: {
                select: { products: true }
              }
            }
          }
        }
      });

      return {
        ...category,
        productSubcategories: category.productSubcategories.map(sub => ({
          ...sub,
          productCount: sub._count.products
        }))
      };
    } catch (error) {
      console.error('Error creating product category:', error);
      throw new Error('Failed to create product category');
    }
  }

  /**
   * Update product category
   */
  async updateCategory(categoryId: string, data: {
    name?: string;
    description?: string;
    slug?: string;
    icon?: string;
    parentId?: string;
    featured?: boolean;
    sortOrder?: number;
    isActive?: boolean;
  }): Promise<ProductCategoryWithChildren> {
    try {
      const category = await this.prisma.productCategory.update({
        where: { id: categoryId },
        data,
        include: {
          productSubcategories: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              description: true,
              slug: true,
              icon: true,
              sortOrder: true,
              _count: {
                select: { products: true }
              }
            }
          }
        }
      });

      return {
        ...category,
        productSubcategories: category.productSubcategories.map(sub => ({
          ...sub,
          productCount: sub._count.products
        }))
      };
    } catch (error) {
      console.error('Error updating product category:', error);
      throw new Error('Failed to update product category');
    }
  }

  /**
   * Delete product category
   */
  async deleteCategory(categoryId: string): Promise<void> {
    try {
      await this.prisma.productCategory.update({
        where: { id: categoryId },
        data: { isActive: false }
      });
    } catch (error) {
      console.error('Error deleting product category:', error);
      throw new Error('Failed to delete product category');
    }
  }
}

export const productCategoryService = new ProductCategoryService();