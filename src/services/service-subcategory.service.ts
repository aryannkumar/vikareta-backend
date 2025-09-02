/**
 * Service Subcategory Service
 * Manages service subcategories with proper schema alignment
 */

import { PrismaClient, ServiceSubcategory } from '@prisma/client';

export class ServiceSubcategoryService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Create new service subcategory
   */
  async createServiceSubcategory(data: {
    serviceCategoryId: string;
    name: string;
    slug: string;
    description?: string;
    icon?: string;
    isActive?: boolean;
    sortOrder?: number;
  }): Promise<ServiceSubcategory> {
    try {
      return await this.prisma.serviceSubcategory.create({
        data: {
          serviceCategoryId: data.serviceCategoryId,
          name: data.name,
          slug: data.slug,
          description: data.description,
          icon: data.icon,
          isActive: data.isActive ?? true,
          sortOrder: data.sortOrder ?? 0,
        },
      });
    } catch (error) {
      console.error('Error creating service subcategory:', error);
      throw new Error('Failed to create service subcategory');
    }
  }

  /**
   * Get service subcategory by ID
   */
  async getServiceSubcategoryById(id: string): Promise<ServiceSubcategory | null> {
    try {
      return await this.prisma.serviceSubcategory.findUnique({
        where: { id },
        include: {
          serviceCategory: true,
          _count: {
            select: {
              services: { where: { isActive: true } },
            },
          },
        },
      });
    } catch (error) {
      console.error('Error fetching service subcategory by ID:', error);
      throw new Error('Failed to fetch service subcategory');
    }
  }

  /**
   * Get service subcategories by category
   */
  async getServiceSubcategoriesByCategory(serviceCategoryId: string): Promise<ServiceSubcategory[]> {
    try {
      return await this.prisma.serviceSubcategory.findMany({
        where: {
          serviceCategoryId,
          isActive: true,
        },
        orderBy: { sortOrder: 'asc' },
        include: {
          _count: {
            select: {
              services: { where: { isActive: true } },
            },
          },
        },
      });
    } catch (error) {
      console.error('Error fetching service subcategories by category:', error);
      throw new Error('Failed to fetch service subcategories');
    }
  }

  /**
   * Update service subcategory
   */
  async updateServiceSubcategory(
    id: string,
    data: Partial<{
      serviceCategoryId: string;
      name: string;
      slug: string;
      description: string;
      icon: string;
      isActive: boolean;
      sortOrder: number;
    }>
  ): Promise<ServiceSubcategory> {
    try {
      return await this.prisma.serviceSubcategory.update({
        where: { id },
        data,
      });
    } catch (error) {
      console.error('Error updating service subcategory:', error);
      throw new Error('Failed to update service subcategory');
    }
  }

  /**
   * Delete service subcategory (soft delete)
   */
  async deleteServiceSubcategory(id: string): Promise<ServiceSubcategory> {
    try {
      return await this.prisma.serviceSubcategory.update({
        where: { id },
        data: { isActive: false },
      });
    } catch (error) {
      console.error('Error deleting service subcategory:', error);
      throw new Error('Failed to delete service subcategory');
    }
  }
}

export const serviceSubcategoryService = new ServiceSubcategoryService();