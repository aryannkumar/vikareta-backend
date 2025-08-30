import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';

const prisma = new PrismaClient();

interface ServiceFilters {
  categoryId?: string;
  subcategoryId?: string;
  providerId?: string;
  minPrice?: number;
  maxPrice?: number;
  location?: string;
  serviceType?: string;
  search?: string;
  serviceArea?: string;
  page: number;
  limit: number;
  sortBy: 'price' | 'createdAt' | 'title' | 'rating';
  sortOrder: 'asc' | 'desc';
}

interface CreateServiceData {
  title: string;
  description: string;
  categoryId: string;
  subcategoryId?: string;
  price: number;
  currency?: string;
  serviceType: 'one_time' | 'recurring' | 'subscription';
  duration?: number;
  location: 'online' | 'on_site' | 'both';
  serviceArea?: string[];
  availability?: any;
}

interface BookingData {
  scheduledDate: string;
  scheduledTime: string;
  duration?: number;
  location?: string;
  notes?: string;
}

class ServiceService {
  async getServices(filters: ServiceFilters) {
    try {
      const {
        categoryId,
        subcategoryId,
        providerId,
        minPrice,
        maxPrice,
        search,
        page,
        limit,
        sortBy,
        sortOrder,
      } = filters;

      const skip = (page - 1) * limit;

      // First check if any services exist at all
      const [serviceCount, totalProducts] = await Promise.all([
        prisma.product.count({ where: { isService: true } }),
        prisma.product.count()
      ]);

      logger.info(`Total products in database: ${totalProducts}`);
      logger.info(`Total services in database: ${serviceCount}`);

      // Build where clause
      const where: any = {
        isService: true,
        status: 'active',
      };

      if (categoryId) where.categoryId = categoryId;
      if (subcategoryId) where.subcategoryId = subcategoryId;
      if (providerId) where.sellerId = providerId;
      if (minPrice !== undefined || maxPrice !== undefined) {
        where.price = {};
        if (minPrice !== undefined) where.price.gte = minPrice;
        if (maxPrice !== undefined) where.price.lte = maxPrice;
      }

      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Build orderBy clause
      let orderBy: any = {};
      if (sortBy === 'rating') {
        // For rating, we'll need to calculate average rating
        orderBy = { createdAt: sortOrder };
      } else {
        orderBy[sortBy] = sortOrder;
      }

      const [services, total] = await Promise.all([
        prisma.product.findMany({
          where,
          include: {
            seller: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                businessName: true,
                verificationTier: true,
                isVerified: true,
              },
            },
            category: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
            subcategory: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
            media: {
              orderBy: { sortOrder: 'asc' },
              take: 5,
            },
          },
          orderBy,
          skip,
          take: limit,
        }).catch(error => {
          logger.error('Error querying products:', error);
          throw error;
        }),
        prisma.product.count({ where }).catch(error => {
          logger.error('Error counting products:', error);
          throw error;
        }),
      ]);

      // Transform services to match frontend Service interface
      const transformedServices = services.map(service => ({
        id: service.id,
        name: service.title,
        description: service.description || '',
        basePrice: Number(service.price),
        originalPrice: undefined, // No originalPrice field in Product model
        images: service.media?.map(m => m.url) || [],
        rating: 4.5, // TODO: Calculate from actual reviews
        reviewCount: 0, // TODO: Calculate from actual reviews
        provider: {
          id: service.seller.id,
          name: service.seller.businessName || `${service.seller.firstName || ''} ${service.seller.lastName || ''}`.trim() || 'Unknown Provider',
          location: 'India', // TODO: Get from seller profile
          verified: service.seller.isVerified || false,
          experience: '2+ years', // TODO: Calculate from seller data
          avatar: '',
          responseTime: '2 hours', // TODO: Calculate from seller data
          completedProjects: 0, // TODO: Calculate from order history
        },
        category: service.category?.name || 'General',
        subcategory: service.subcategory?.name,
        available: service.status === 'active',
        deliveryTime: '3-5 days', // TODO: Get from service metadata
        serviceType: 'one-time' as const, // TODO: Store in service metadata
        tags: [], // TODO: Implement tags system
        features: [], // TODO: Implement features system
        packages: [], // TODO: Implement packages system
        reviews: [], // TODO: Load actual reviews
        faqs: [], // TODO: Implement FAQs system
        specifications: {}, // TODO: Store in service metadata
        createdAt: service.createdAt.toISOString(),
        updatedAt: service.updatedAt.toISOString(),
      }));

      logger.info(`Found ${services.length} services out of ${total} total`);

      return {
        services: transformedServices,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error: any) {
      logger.error('Error in getServices:', error);
      logger.error('Error details:', {
        message: error.message,
        stack: error.stack,
        code: error.code
      });
      throw new Error(`Failed to fetch services: ${error.message}`);
    }
  }

  async getFeaturedServices(limit: number, categoryId?: string) {
    const where: any = {
      isService: true,
      status: 'active',
    };

    if (categoryId) {
      where.categoryId = categoryId;
    }

    const services = await prisma.product.findMany({
      where,
      include: {
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
            verificationTier: true,
            isVerified: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        media: {
          orderBy: { sortOrder: 'asc' },
          take: 3,
        },
      },
      orderBy: [
        { createdAt: 'desc' },
      ],
      take: limit,
    });

    return services.map(service => ({
      ...service,
      provider: service.seller,
      serviceType: 'one_time',
      location: 'both',
      rating: 4.5,
      reviewCount: 0,
    }));
  }

  async getNearbyServices(_latitude: number, _longitude: number, radius: number, limit: number) {
    // For now, return all services since we don't have location data in the schema
    // In a real implementation, you'd use PostGIS or similar for geospatial queries
    const services = await prisma.product.findMany({
      where: {
        isService: true,
        status: 'active',
      },
      include: {
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
            verificationTier: true,
            isVerified: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        media: {
          orderBy: { sortOrder: 'asc' },
          take: 3,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return services.map(service => ({
      ...service,
      provider: service.seller,
      serviceType: 'one_time',
      location: 'both',
      rating: 4.5,
      reviewCount: 0,
      distance: Math.random() * radius, // Placeholder distance
    }));
  }

  async getServiceById(serviceId: string) {
    const service = await prisma.product.findFirst({
      where: {
        id: serviceId,
        isService: true,
      },
      include: {
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
            verificationTier: true,
            isVerified: true,
            createdAt: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        subcategory: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        media: {
          orderBy: { sortOrder: 'asc' },
        },
        variants: true,
      },
    });

    if (!service) {
      throw new Error('Service not found');
    }

    // Get service statistics
    const [orderCount, avgRating] = await Promise.all([
      prisma.order.count({
        where: {
          sellerId: service.sellerId,
          orderType: 'service',
          status: 'delivered',
        },
      }),
      // Placeholder for average rating calculation
      Promise.resolve(4.5),
    ]);

    return {
      ...service,
      provider: service.seller,
      serviceType: 'one_time',
      location: 'both',
      rating: avgRating,
      reviewCount: orderCount,
      completedOrders: orderCount,
    };
  }

  async createService(providerId: string, data: CreateServiceData) {
    // Resolve category ID (could be UUID/CUID or slug)
    let categoryId = data.categoryId;
    const { isValidId } = require('../utils/validation');
    if (!isValidId(data.categoryId)) {
      // It's a slug, resolve to ID
      const categoryBySlug = await prisma.category.findUnique({
        where: { slug: data.categoryId },
        select: { id: true }
      });
      if (!categoryBySlug) {
        throw new Error('Category not found');
      }
      categoryId = categoryBySlug.id;
    }

    // Verify category exists or use default
    let category = await prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      // Try to get or create a default category
      const { getOrCreateDefaultCategory } = await import('../utils/seed-categories');
      category = await getOrCreateDefaultCategory();
      categoryId = category.id;
      logger.warn(`Category not found, using default category: ${category.name}`);
    }

    // Resolve subcategory ID (could be UUID/CUID or slug)
    let subcategoryId = data.subcategoryId;
    if (data.subcategoryId && !isValidId(data.subcategoryId)) {
      // It's a slug, resolve to ID
      const subcategoryBySlug = await prisma.subcategory.findUnique({
        where: { slug: data.subcategoryId },
        select: { id: true }
      });
      if (!subcategoryBySlug) {
        throw new Error('Subcategory not found');
      }
      subcategoryId = subcategoryBySlug.id;
    }

    // Verify subcategory if provided (optional and non-blocking)
    if (subcategoryId) {
      const subcategory = await prisma.subcategory.findUnique({
        where: { id: subcategoryId },
      });

      if (!subcategory) {
        // Log warning but don't fail - create without subcategory
        logger.warn(`Subcategory ${subcategoryId} not found`);
        subcategoryId = undefined; // Reset to undefined if not found
      }
    }

    const service = await prisma.product.create({
      data: {
        sellerId: providerId,
        title: data.title,
        description: data.description,
        categoryId: categoryId,
        subcategoryId: subcategoryId,
        price: data.price,
        currency: data.currency || 'INR',
        stockQuantity: 0, // Services don't have stock
        minOrderQuantity: 1,
        isService: true,
        status: 'active',
      },
      include: {
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
            verificationTier: true,
            isVerified: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        subcategory: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    logger.info(`Service created: ${service.id} by provider ${providerId}`);

    return {
      ...service,
      provider: service.seller,
      serviceType: data.serviceType,
      location: data.location,
      duration: data.duration,
      serviceArea: data.serviceArea,
      availability: data.availability,
    };
  }

  async updateService(serviceId: string, providerId: string, data: Partial<CreateServiceData>) {
    // Verify service exists and belongs to provider
    const existingService = await prisma.product.findFirst({
      where: {
        id: serviceId,
        sellerId: providerId,
        isService: true,
      },
    });

    if (!existingService) {
      throw new Error('Service not found or access denied');
    }

    const updateData: any = {};
    if (data.title) updateData.title = data.title;
    if (data.description) updateData.description = data.description;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.categoryId) updateData.categoryId = data.categoryId;
    if (data.subcategoryId) updateData.subcategoryId = data.subcategoryId;

    const service = await prisma.product.update({
      where: { id: serviceId },
      data: updateData,
      include: {
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
            verificationTier: true,
            isVerified: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        subcategory: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    logger.info(`Service updated: ${serviceId} by provider ${providerId}`);

    return {
      ...service,
      provider: service.seller,
    };
  }

  async deleteService(serviceId: string, providerId: string) {
    // Verify service exists and belongs to provider
    const existingService = await prisma.product.findFirst({
      where: {
        id: serviceId,
        sellerId: providerId,
        isService: true,
      },
    });

    if (!existingService) {
      throw new Error('Service not found or access denied');
    }

    // Check if service has active orders
    const activeOrders = await prisma.order.count({
      where: {
        sellerId: providerId,
        orderType: 'service',
        status: {
          in: ['pending', 'confirmed', 'processing'],
        },
        items: {
          some: {
            productId: serviceId,
          },
        },
      },
    });

    if (activeOrders > 0) {
      throw new Error('Cannot delete service with active orders');
    }

    await prisma.product.delete({
      where: { id: serviceId },
    });

    logger.info(`Service deleted: ${serviceId} by provider ${providerId}`);
  }

  async getServiceAvailability(serviceId: string, date?: string, duration?: number) {
    // Verify service exists
    const service = await prisma.product.findFirst({
      where: {
        id: serviceId,
        isService: true,
        status: 'active',
      },
    });

    if (!service) {
      throw new Error('Service not found');
    }

    // For now, return mock availability
    // In a real implementation, you'd check against service appointments
    const targetDate = date ? new Date(date) : new Date();
    const timeSlots = [];

    // Generate time slots from 9 AM to 6 PM
    for (let hour = 9; hour < 18; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        timeSlots.push({
          time,
          available: Math.random() > 0.3, // 70% availability
          duration: duration || 60,
        });
      }
    }

    return {
      date: targetDate.toISOString().split('T')[0],
      timeSlots,
    };
  }

  async bookService(serviceId: string, userId: string, bookingData: BookingData) {
    // Verify service exists and is active
    const service = await prisma.product.findFirst({
      where: {
        id: serviceId,
        isService: true,
        status: 'active',
      },
    });

    if (!service) {
      throw new Error('Service not found');
    }

    // Create order for the service
    const orderNumber = `SRV-${Date.now()}-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;

    const order = await prisma.order.create({
      data: {
        buyerId: userId,
        sellerId: service.sellerId,
        orderNumber,
        orderType: 'service',
        subtotal: service.price,
        taxAmount: Number(service.price) * 0.18, // 18% GST
        shippingAmount: 0,
        discountAmount: 0,
        totalAmount: Number(service.price) * 1.18,
        status: 'pending',
        paymentStatus: 'pending',
        items: {
          create: {
            productId: serviceId,
            quantity: 1,
            unitPrice: service.price,
            totalPrice: service.price,
          },
        },
      },
      include: {
        items: true,
      },
    });

    // Create service order
    await prisma.serviceOrder.create({
      data: {
        orderId: order.id,
        serviceId: serviceId,
        quantity: 1,
        unitPrice: service.price,
        totalPrice: service.price,
        scheduledDate: new Date(bookingData.scheduledDate),
        duration: `${bookingData.duration || 60} minutes`,
        location: bookingData.location ? JSON.parse(JSON.stringify(bookingData.location)) : null,
        status: 'pending',
      },
    });

    // Create service appointment
    const appointment = await prisma.serviceAppointment.create({
      data: {
        // serviceOrderId: serviceOrder.id, // This field doesn't exist in the schema
        orderId: order.id,
        serviceId: serviceId, // Required field
        scheduledDate: new Date(bookingData.scheduledDate),
        // appointmentDate field doesn't exist, using scheduledDate
        duration: `${bookingData.duration || 60} minutes`,
        status: 'scheduled',
      },
    });

    logger.info(`Service booked: ${serviceId} by user ${userId}, order ${order.id}`);

    return {
      order,
      appointment,
      message: 'Service booked successfully',
    };
  }

  async getServiceReviews(serviceId: string, page: number, limit: number) {
    // Verify service exists
    const service = await prisma.product.findFirst({
      where: {
        id: serviceId,
        isService: true,
      },
    });

    if (!service) {
      throw new Error('Service not found');
    }

    // For now, return mock reviews
    // In a real implementation, you'd have a reviews table
    const mockReviews = [
      {
        id: '1',
        userId: 'user1',
        userName: 'John Doe',
        rating: 5,
        review: 'Excellent service! Very professional and timely.',
        serviceQuality: 5,
        timeliness: 5,
        professionalism: 5,
        createdAt: new Date('2024-01-15'),
      },
      {
        id: '2',
        userId: 'user2',
        userName: 'Jane Smith',
        rating: 4,
        review: 'Good service overall, minor delays but quality work.',
        serviceQuality: 4,
        timeliness: 3,
        professionalism: 4,
        createdAt: new Date('2024-01-10'),
      },
    ];

    const skip = (page - 1) * limit;
    const reviews = mockReviews.slice(skip, skip + limit);

    return {
      reviews,
      pagination: {
        page,
        limit,
        total: mockReviews.length,
        pages: Math.ceil(mockReviews.length / limit),
      },
      summary: {
        averageRating: 4.5,
        totalReviews: mockReviews.length,
        ratingDistribution: {
          5: 1,
          4: 1,
          3: 0,
          2: 0,
          1: 0,
        },
      },
    };
  }
}

export const serviceService = new ServiceService();