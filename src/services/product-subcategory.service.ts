/**
 * Product Subcategory Service
 * Manages product subcategories with proper schema alignment
 */

import { PrismaClient, ProductSubcategory } from '@prisma/client';

export interface ProductSubcategoryWithCategory extends ProductSubcategory {
  productCategory: {
    id: string;
    name: string;
    slug: string;
  };
}

export class ProductSubcategoryService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Get all subcategories with category information
   */
  async getAllSubcategories(): Promise<ProductSubcategoryWithCategory[]> {
    try {
      const subcategories = await this.prisma.productSubcategory.findMany({
        where: {
          isActive: true,
        },
        include: {
          productCategory: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: [
          { productCategory: { sortOrder: 'asc' } },
          { sortOrder: 'asc' },
          { name: 'asc' },
        ],
      });

      return subcategories;
    } catch (error) {
      console.error('Error fetching all subcategories:', error);
      throw new Error('Failed to fetch subcategories');
    }
  }

  /**
   * Get subcategory by ID with category information
   */
  async getSubcategoryById(id: string): Promise<ProductSubcategoryWithCategory | null> {
    try {
      const subcategory = await this.prisma.productSubcategory.findUnique({
        where: {
          id,
        },
        include: {
          productCategory: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      return subcategory;
    } catch (error) {
      console.error('Error fetching subcategory by ID:', error);
      throw new Error('Failed to fetch subcategory');
    }
  }

  /**
   * Get subcategories by category ID
   */
  async getSubcategoriesByCategoryId(productCategoryId: string): Promise<ProductSubcategory[]> {
    try {
      const subcategories = await this.prisma.productSubcategory.findMany({
        where: {
          productCategoryId,
          isActive: true,
        },
        orderBy: [
          { sortOrder: 'asc' },
          { name: 'asc' },
        ],
      });

      return subcategories;
    } catch (error) {
      console.error('Error fetching subcategories by category ID:', error);
      throw new Error('Failed to fetch subcategories');
    }
  }

  /**
   * Get subcategory by category and subcategory ID
   */
  async getSubcategoryByCategoryAndId(productCategoryId: string, productSubcategoryId: string): Promise<ProductSubcategoryWithCategory | null> {
    try {
      const subcategory = await this.prisma.productSubcategory.findFirst({
        where: {
          id: productSubcategoryId,
          productCategoryId,
          isActive: true,
        },
        include: {
          productCategory: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      return subcategory;
    } catch (error) {
      console.error('Error fetching subcategory by category and ID:', error);
      throw new Error('Failed to fetch subcategory');
    }
  }

  /**
   * Create new product subcategory
   */
  async createSubcategory(data: {
    productCategoryId: string;
    name: string;
    slug: string;
    description?: string;
    icon?: string;
    sortOrder?: number;
  }): Promise<ProductSubcategory> {
    try {
      const subcategory = await this.prisma.productSubcategory.create({
        data: {
          productCategoryId: data.productCategoryId,
          name: data.name,
          slug: data.slug,
          description: data.description,
          icon: data.icon,
          sortOrder: data.sortOrder || 0,
        },
      });

      return subcategory;
    } catch (error) {
      console.error('Error creating subcategory:', error);
      throw new Error('Failed to create subcategory');
    }
  }

  /**
   * Update product subcategory
   */
  async updateSubcategory(id: string, data: {
    name?: string;
    slug?: string;
    description?: string;
    icon?: string;
    sortOrder?: number;
    isActive?: boolean;
  }): Promise<ProductSubcategory> {
    try {
      const subcategory = await this.prisma.productSubcategory.update({
        where: { id },
        data,
      });

      return subcategory;
    } catch (error) {
      console.error('Error updating subcategory:', error);
      throw new Error('Failed to update subcategory');
    }
  }

  /**
   * Delete product subcategory (soft delete)
   */
  async deleteSubcategory(id: string): Promise<void> {
    try {
      await this.prisma.productSubcategory.update({
        where: { id },
        data: { isActive: false },
      });
    } catch (error) {
      console.error('Error deleting subcategory:', error);
      throw new Error('Failed to delete subcategory');
    }
  }
}

export const productSubcategoryService = new ProductSubcategoryService();