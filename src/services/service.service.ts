import { PrismaClient, Service, ServiceMedia } from '@prisma/client';
import { BaseService } from './base.service';
import { logger } from '../utils/logger';
import { elasticsearchService } from './elasticsearch.service.simple';
import { elasticsearchClient } from '@/config/elasticsearch';

export interface CreateServiceData {
  title: string;
  description?: string;
  categoryId: string;
  subcategoryId?: string;
  price: number;
  currency?: string;
  duration?: string;
  serviceType?: string;
  images?: string[];
  availability?: any;
  location?: any;
}

export interface UpdateServiceData extends Partial<CreateServiceData> {
  isActive?: boolean;
  status?: string;
}

export interface ServiceFilters {
  categoryId?: string;
  subcategoryId?: string;
  providerId?: string;
  priceMin?: number;
  priceMax?: number;
  serviceType?: string;
  isActive?: boolean;
  status?: string;
  search?: string;
}

export class ServiceService extends BaseService {
  constructor() {
    super();
  }

  async createService(providerId: string, data: CreateServiceData): Promise<Service> {
    try {
      const service = await this.prisma.service.create({
        data: {
          ...data,
          providerId,
          currency: data.currency || 'INR',
          serviceType: data.serviceType || 'one-time',
          status: 'active',
        },
        include: {
          provider: true,
          category: true,
          subcategory: true,
          media: true,
        },
      });

      // Index in Elasticsearch
      await this.indexServiceInElasticsearch(service);

      logger.info(`Service created: ${service.id} by provider: ${providerId}`);
      return service;
    } catch (error) {
      logger.error('Error creating service:', error);
      throw error;
    }
  }

  async updateService(serviceId: string, providerId: string, data: UpdateServiceData): Promise<Service> {
    try {
      const service = await this.prisma.service.update({
        where: {
          id: serviceId,
          providerId, // Ensure provider can only update their own services
        },
        data,
        include: {
          provider: true,
          category: true,
          subcategory: true,
          media: true,
        },
      });

      // Update in Elasticsearch
      await this.indexServiceInElasticsearch(service);

      logger.info(`Service updated: ${serviceId} by provider: ${providerId}`);
      return service;
    } catch (error) {
      logger.error('Error updating service:', error);
      throw error;
    }
  }

  async getServiceById(serviceId: string): Promise<Service | null> {
    try {
      return await this.prisma.service.findUnique({
        where: { id: serviceId },
        include: {
          provider: {
            select: {
              id: true,
              businessName: true,
              firstName: true,
              lastName: true,
              avatar: true,
              verificationTier: true,
              isVerified: true,
            },
          },
          category: true,
          subcategory: true,
          media: {
            orderBy: { sortOrder: 'asc' },
          },
          reviews: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      });
    } catch (error) {
      logger.error('Error fetching service:', error);
      throw error;
    }
  }

  async getServices(filters: ServiceFilters = {}, page = 1, limit = 20): Promise<{
    services: Service[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const where: any = {
        isActive: filters.isActive !== undefined ? filters.isActive : true,
      };

      if (filters.categoryId) where.categoryId = filters.categoryId;
      if (filters.subcategoryId) where.subcategoryId = filters.subcategoryId;
      if (filters.providerId) where.providerId = filters.providerId;
      if (filters.serviceType) where.serviceType = filters.serviceType;
      if (filters.status) where.status = filters.status;
      
      if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
        where.price = {};
        if (filters.priceMin !== undefined) where.price.gte = filters.priceMin;
        if (filters.priceMax !== undefined) where.price.lte = filters.priceMax;
      }

      if (filters.search) {
        where.OR = [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ];
      }

      const [services, total] = await Promise.all([
        this.prisma.service.findMany({
          where,
          include: {
            provider: {
              select: {
                id: true,
                businessName: true,
                firstName: true,
                lastName: true,
                avatar: true,
                verificationTier: true,
                isVerified: true,
              },
            },
            category: true,
            subcategory: true,
            media: {
              orderBy: { sortOrder: 'asc' },
              take: 1,
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.service.count({ where }),
      ]);

      return {
        services,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error('Error fetching services:', error);
      throw error;
    }
  }

  async deleteService(serviceId: string, providerId: string): Promise<void> {
    try {
      await this.prisma.service.delete({
        where: {
          id: serviceId,
          providerId, // Ensure provider can only delete their own services
        },
      });

      // Remove from Elasticsearch
      await this.removeServiceFromElasticsearch(serviceId);

      logger.info(`Service deleted: ${serviceId} by provider: ${providerId}`);
    } catch (error) {
      logger.error('Error deleting service:', error);
      throw error;
    }
  }

  async addServiceMedia(serviceId: string, mediaData: {
    mediaType: string;
    url: string;
    altText?: string;
    sortOrder?: number;
  }): Promise<ServiceMedia> {
    try {
      return await this.prisma.serviceMedia.create({
        data: {
          ...mediaData,
          serviceId,
          sortOrder: mediaData.sortOrder || 0,
        },
      });
    } catch (error) {
      logger.error('Error adding service media:', error);
      throw error;
    }
  }

  async searchServices(query: string, filters: ServiceFilters = {}, page = 1, limit = 20): Promise<{
    services: Service[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      // Use Elasticsearch for advanced search
      const searchBody = {
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query,
                  fields: ['title^2', 'description'],
                  type: 'best_fields',
                  fuzziness: 'AUTO',
                },
              },
            ],
            filter: [],
          },
        },
        from: (page - 1) * limit,
        size: limit,
        sort: [{ _score: { order: 'desc' } }, { createdAt: { order: 'desc' } }],
      };

      // Add filters
      if (filters.categoryId) {
        searchBody.query.bool.filter.push({ term: { categoryId: filters.categoryId } });
      }
      if (filters.providerId) {
        searchBody.query.bool.filter.push({ term: { providerId: filters.providerId } });
      }
      if (filters.serviceType) {
        searchBody.query.bool.filter.push({ term: { serviceType: filters.serviceType } });
      }
      if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
        const priceRange: any = {};
        if (filters.priceMin !== undefined) priceRange.gte = filters.priceMin;
        if (filters.priceMax !== undefined) priceRange.lte = filters.priceMax;
        searchBody.query.bool.filter.push({ range: { price: priceRange } });
      }

      const response = await elasticsearchService.search(query, 'services');

      const serviceIds = response.hits.map((hit: any) => hit.id);
      
      if (serviceIds.length === 0) {
        return { services: [], total: 0, page, totalPages: 0 };
      }

      const services = await this.prisma.service.findMany({
        where: { id: { in: serviceIds } },
        include: {
          provider: {
            select: {
              id: true,
              businessName: true,
              firstName: true,
              lastName: true,
              avatar: true,
              verificationTier: true,
              isVerified: true,
            },
          },
          category: true,
          subcategory: true,
          media: {
            orderBy: { sortOrder: 'asc' },
            take: 1,
          },
        },
      });

      // Maintain Elasticsearch order
      const orderedServices = serviceIds.map((id: string) => 
        services.find(s => s.id === id)
      ).filter(Boolean);

      return {
        services: orderedServices,
        total: response.total,
        page,
        totalPages: Math.ceil(response.total / limit),
      };
    } catch (error) {
      logger.error('Error searching services:', error);
      // Fallback to database search
      return this.getServices({ ...filters, search: query }, page, limit);
    }
  }

  async getFeaturedServices(limit = 10): Promise<Service[]> {
    try {
      const featuredServices = await this.prisma.featuredService.findMany({
        where: { isActive: true },
        include: {
          service: {
            include: {
              provider: {
                select: {
                  id: true,
                  businessName: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  verificationTier: true,
                  isVerified: true,
                },
              },
              category: true,
              media: {
                orderBy: { sortOrder: 'asc' },
                take: 1,
              },
            },
          },
        },
        orderBy: { position: 'asc' },
        take: limit,
      });

      return featuredServices.map(fs => fs.service);
    } catch (error) {
      logger.error('Error fetching featured services:', error);
      throw error;
    }
  }

  async bookService(serviceId: string, customerId: string, bookingData: {
    scheduledDate?: Date;
    duration?: string;
    location?: any;
    requirements?: string;
    customerNotes?: string;
  }): Promise<any> {
    try {
      // This would typically create a service order or booking
      // For now, we'll create a placeholder implementation
      const service = await this.getServiceById(serviceId);
      if (!service) {
        throw new Error('Service not found');
      }

      // Create service appointment
      const appointment = await this.prisma.serviceAppointment.create({
        data: {
          serviceId,
          orderId: '', // This would be set when creating an actual order
          scheduledDate: bookingData.scheduledDate || new Date(),
          duration: bookingData.duration,
          notes: bookingData.requirements,
          status: 'scheduled',
        },
      });

      logger.info(`Service booked: ${serviceId} by customer: ${customerId}`);
      return appointment;
    } catch (error) {
      logger.error('Error booking service:', error);
      throw error;
    }
  }

  private async indexServiceInElasticsearch(service: any): Promise<void> {
    try {
      await elasticsearchClient.index({
        index: 'services',
        id: service.id,
        document: {
          id: service.id,
          title: service.title,
          description: service.description,
          categoryId: service.categoryId,
          subcategoryId: service.subcategoryId,
          providerId: service.providerId,
          price: service.price,
          currency: service.currency,
          duration: service.duration,
          serviceType: service.serviceType,
          isActive: service.isActive,
          status: service.status,
          createdAt: service.createdAt,
          updatedAt: service.updatedAt,
        },
      });
    } catch (error) {
      logger.error('Error indexing service in Elasticsearch:', error);
    }
  }

  private async removeServiceFromElasticsearch(serviceId: string): Promise<void> {
    try {
      await elasticsearchClient.delete({
        index: 'services',
        id: serviceId,
      });
    } catch (error) {
      logger.error('Error removing service from Elasticsearch:', error);
    }
  }
}