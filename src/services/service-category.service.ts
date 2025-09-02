/**
 * Service Category Service
 * Manages service categories with proper schema alignment
 */

import { PrismaClient } from '@prisma/client';

export interface ServiceCategoryWithChildren {
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
  serviceSubcategories?: Array<{
    id: string;
    name: string;
    description: string;
    slug: string;
    icon: string | null;
    sortOrder: number;
    serviceCount: number;
  }>;
}

export class ServiceCategoryService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Get all service categories
   */
  async getAllCategories(): Promise<ServiceCategoryWithChildren[]> {
    try {
      const categories = await this.prisma.serviceCategory.findMany({
        where: { isActive: true },
        include: {
          serviceSubcategories: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              description: true,
              slug: true,
              icon: true,
              sortOrder: true,
              _count: {
                select: { services: true }
              }
            },
            orderBy: { sortOrder: 'asc' }
          }
        },
        orderBy: { sortOrder: 'asc' }
      });

      return categories.map(category => ({
        ...category,
        serviceSubcategories: category.serviceSubcategories.map(sub => ({
          ...sub,
          serviceCount: sub._count.services
        }))
      }));
    } catch (error) {
      console.error('Error fetching service categories:', error);
      throw new Error('Failed to fetch service categories');
    }
  }

  /**
   * Get category by ID
   */
  async getCategoryById(categoryId: string): Promise<ServiceCategoryWithChildren | null> {
    try {
      const category = await this.prisma.serviceCategory.findUnique({
        where: { id: categoryId },
        include: {
          serviceSubcategories: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              description: true,
              slug: true,
              icon: true,
              sortOrder: true,
              _count: {
                select: { services: true }
              }
            },
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      if (!category) return null;

      return {
        ...category,
        serviceSubcategories: category.serviceSubcategories.map(sub => ({
          ...sub,
          serviceCount: sub._count.services
        }))
      };
    } catch (error) {
      console.error('Error fetching service category:', error);
      throw new Error('Failed to fetch service category');
    }
  }

  /**
   * Create new service category
   */
  async createCategory(data: {
    name: string;
    description?: string;
    slug: string;
    icon?: string;
    parentId?: string;
    featured?: boolean;
    sortOrder?: number;
  }): Promise<ServiceCategoryWithChildren> {
    try {
      const category = await this.prisma.serviceCategory.create({
        data: {
          name: data.name,
          description: data.description,
          slug: data.slug,
          icon: data.icon,
          parentId: data.parentId,
          featured: data.featured || false,
          sortOrder: data.sortOrder || 0,
        },
        include: {
          serviceSubcategories: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              description: true,
              slug: true,
              icon: true,
              sortOrder: true,
              _count: {
                select: { services: true }
              }
            }
          }
        }
      });

      return {
        ...category,
        serviceSubcategories: category.serviceSubcategories.map(sub => ({
          ...sub,
          serviceCount: sub._count.services
        }))
      };
    } catch (error) {
      console.error('Error creating service category:', error);
      throw new Error('Failed to create service category');
    }
  }

  /**
   * Update service category
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
  }): Promise<ServiceCategoryWithChildren> {
    try {
      const category = await this.prisma.serviceCategory.update({
        where: { id: categoryId },
        data,
        include: {
          serviceSubcategories: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              description: true,
              slug: true,
              icon: true,
              sortOrder: true,
              _count: {
                select: { services: true }
              }
            }
          }
        }
      });

      return {
        ...category,
        serviceSubcategories: category.serviceSubcategories.map(sub => ({
          ...sub,
          serviceCount: sub._count.services
        }))
      };
    } catch (error) {
      console.error('Error updating service category:', error);
      throw new Error('Failed to update service category');
    }
  }

  /**
   * Delete service category
   */
  async deleteCategory(categoryId: string): Promise<void> {
    try {
      await this.prisma.serviceCategory.update({
        where: { id: categoryId },
        data: { isActive: false }
      });
    } catch (error) {
      console.error('Error deleting service category:', error);
      throw new Error('Failed to delete service category');
    }
  }
}

export const serviceCategoryService = new ServiceCategoryService();