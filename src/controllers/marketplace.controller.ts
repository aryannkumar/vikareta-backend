import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { marketplaceQuerySchema } from '../validation/schemas';

const prisma = new PrismaClient();

export class MarketplaceController {
  /**
   * Get marketplace statistics
   */
  async getStats(req: Request, res: Response) {
    try {
      const [
        totalBusinesses,
        totalProducts,
        totalServices
      ] = await Promise.all([
        // Total businesses with active subscriptions
        prisma.user.count({
          where: {
            userType: { in: ['seller', 'both'] },
            subscriptions: {
              some: {
                status: 'active',
                planName: { in: ['Free', 'Basic', 'Premium', 'Enterprise'] }
              }
            }
          }
        }),
        // Total products from businesses with active subscriptions
        prisma.product.count({
          where: {
            sellerId: {
              in: await prisma.user.findMany({
                where: {
                  userType: { in: ['seller', 'both'] },
                  subscriptions: {
                    some: {
                      status: 'active',
                      planName: { in: ['Free', 'Basic', 'Premium', 'Enterprise'] }
                    }
                  }
                },
                select: { id: true }
              }).then(users => users.map(u => u.id))
            }
          }
        }),
        // Total services from businesses with active subscriptions
        prisma.service.count({
          where: {
            providerId: {
              in: await prisma.user.findMany({
                where: {
                  userType: { in: ['seller', 'both'] },
                  subscriptions: {
                    some: {
                      status: 'active',
                      planName: { in: ['Free', 'Basic', 'Premium', 'Enterprise'] }
                    }
                  }
                },
                select: { id: true }
              }).then(users => users.map(u => u.id))
            }
          }
        })
      ]);

      res.json({
        success: true,
        data: {
          totalBusinesses,
          totalProducts,
          totalServices
        }
      });
    } catch (error) {
      console.error('Error fetching marketplace stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch marketplace statistics'
      });
    }
  }

  /**
   * Get businesses with subscription filtering
   * Only returns businesses with active subscriptions
   */
  async getBusinesses(req: Request, res: Response) {
    try {
      const query = marketplaceQuerySchema.parse(req.query);

      // Build where clause for subscription filtering
      const whereClause = {
        userType: { in: ['seller', 'both'] },
        subscriptions: {
          some: {
            status: 'active',
            planName: { in: ['Free', 'Basic', 'Premium', 'Enterprise'] } // Business plans
          }
        },
        // Additional filters
        ...(query.q && {
          OR: [
            { businessName: { contains: query.q, mode: 'insensitive' as any } },
            { firstName: { contains: query.q, mode: 'insensitive' as any } },
            { lastName: { contains: query.q, mode: 'insensitive' as any } },
            { businessProfile: { description: { contains: query.q, mode: 'insensitive' as any } } }
          ]
        }),
        ...(query.location && {
          OR: [
            { city: { contains: query.location, mode: 'insensitive' as any } },
            { state: { contains: query.location, mode: 'insensitive' as any } },
            { country: { contains: query.location, mode: 'insensitive' as any } }
          ]
        }),
        ...(query.category && {
          businessProfile: {
            industry: { contains: query.category, mode: 'insensitive' as any }
          }
        })
      };

      // Calculate pagination with defaults
      const page = query.page || 1;
      const limit = query.limit || 20;
      const skip = (page - 1) * limit;

      // Build order by clause
      let orderBy: any = { createdAt: 'desc' };
      if (query.sortBy) {
        switch (query.sortBy) {
          case 'trending':
            orderBy = { createdAt: 'desc' };
            break;
          case 'rating':
            // Rating sorting - could be added later if rating field exists
            orderBy = { createdAt: 'desc' };
            break;
          case 'distance':
            // Distance sorting would require location coordinates
            orderBy = { createdAt: 'desc' };
            break;
          case 'price':
            // Price sorting for businesses might not be directly applicable
            orderBy = { createdAt: 'desc' };
            break;
        }
      }

      const [businesses, total] = await Promise.all([
        prisma.user.findMany({
          where: whereClause,
          select: {
            id: true,
            businessName: true,
            firstName: true,
            lastName: true,
            city: true,
            state: true,
            country: true,
            avatar: true,
            businessProfile: {
              select: {
                description: true,
                industry: true,
                logo: true,
                website: true
              }
            },
            subscriptions: {
              where: {
                status: 'active',
                planName: { in: ['Free', 'Basic', 'Premium', 'Enterprise'] }
              },
              select: {
                id: true,
                planName: true,
                startDate: true,
                endDate: true
              },
              take: 1
            },
            _count: {
              select: {
                products: true,
                services: true
              }
            }
          },
          orderBy,
          skip,
          take: limit
        }),
        prisma.user.count({ where: whereClause })
      ]);

      res.json({
        success: true,
        data: {
          businesses,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error('Error fetching businesses:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch businesses'
      });
    }
  }

  /**
   * Get featured businesses (with premium subscriptions)
   */
  async getFeatured(req: Request, res: Response) {
    try {
      const query = marketplaceQuerySchema.parse(req.query);

      const whereClause = {
        userType: { in: ['seller', 'both'] },
        subscriptions: {
          some: {
            status: 'active',
            planName: { in: ['Premium', 'Enterprise'] } // Featured plans
          }
        },
        ...(query.location && {
          OR: [
            { city: { contains: query.location, mode: 'insensitive' as any } },
            { state: { contains: query.location, mode: 'insensitive' as any } },
            { country: { contains: query.location, mode: 'insensitive' as any } }
          ]
        })
      };

      const businesses = await prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          businessName: true,
          firstName: true,
          lastName: true,
          city: true,
          state: true,
          country: true,
          avatar: true,
          businessProfile: {
            select: {
              description: true,
              industry: true,
              logo: true,
              website: true
            }
          },
          subscriptions: {
            where: {
              status: 'active',
              planName: { in: ['Premium', 'Enterprise'] }
            },
            select: {
              planName: true
            },
            take: 1
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 10 // Limit featured businesses
      });

      res.json({
        success: true,
        data: { businesses }
      });
    } catch (error) {
      console.error('Error fetching featured businesses:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch featured businesses'
      });
    }
  }

  /**
   * Get popular businesses (based on engagement metrics)
   */
  async getPopular(req: Request, res: Response) {
    try {
      const query = marketplaceQuerySchema.parse(req.query);

      const whereClause = {
        userType: { in: ['seller', 'both'] },
        subscriptions: {
          some: {
            status: 'active',
            planName: { in: ['Free', 'Basic', 'Premium', 'Enterprise'] }
          }
        },
        ...(query.location && {
          OR: [
            { city: { contains: query.location, mode: 'insensitive' as any } },
            { state: { contains: query.location, mode: 'insensitive' as any } },
            { country: { contains: query.location, mode: 'insensitive' as any } }
          ]
        })
      };

      // Get businesses ordered by engagement (products + services count as popularity metric)
      const businesses = await prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          businessName: true,
          firstName: true,
          lastName: true,
          city: true,
          state: true,
          country: true,
          avatar: true,
          businessProfile: {
            select: {
              description: true,
              industry: true,
              logo: true,
              website: true
            }
          },
          _count: {
            select: {
              products: true,
              services: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }, // Simple ordering since ordersReceived doesn't exist
        take: 20
      });

      // Calculate popularity score based on available metrics
      const businessesWithScore = businesses.map(business => ({
        ...business,
        popularityScore: business._count.products + business._count.services
      }));

      res.json({
        success: true,
        data: { businesses: businessesWithScore }
      });
    } catch (error) {
      console.error('Error fetching popular businesses:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch popular businesses'
      });
    }
  }

  /**
   * Search businesses with subscription filtering
   */
  async search(req: Request, res: Response) {
    try {
      const query = marketplaceQuerySchema.parse(req.query);

      if (!query.q) {
        return res.status(400).json({
          success: false,
          message: 'Search query is required'
        });
      }

      const whereClause = {
        userType: { in: ['seller', 'both'] },
        subscriptions: {
          some: {
            status: 'active',
            planName: { in: ['Free', 'Basic', 'Premium', 'Enterprise'] }
          }
        },
        OR: [
          { businessName: { contains: query.q, mode: 'insensitive' as any } },
          { firstName: { contains: query.q, mode: 'insensitive' as any } },
          { lastName: { contains: query.q, mode: 'insensitive' as any } },
          { businessProfile: { description: { contains: query.q, mode: 'insensitive' as any } } },
          { businessProfile: { industry: { contains: query.q, mode: 'insensitive' as any } } },
          { city: { contains: query.q, mode: 'insensitive' as any } },
          { state: { contains: query.q, mode: 'insensitive' as any } }
        ],
        ...(query.location && {
          OR: [
            { city: { contains: query.location, mode: 'insensitive' as any } },
            { state: { contains: query.location, mode: 'insensitive' as any } },
            { country: { contains: query.location, mode: 'insensitive' as any } }
          ]
        }),
        ...(query.category && {
          businessProfile: {
            industry: { contains: query.category, mode: 'insensitive' as any }
          }
        })
      };

      const page = query.page || 1;
      const limit = query.limit || 20;
      const skip = (page - 1) * limit;

      const [businesses, total] = await Promise.all([
        prisma.user.findMany({
          where: whereClause,
          select: {
            id: true,
            businessName: true,
            firstName: true,
            lastName: true,
            city: true,
            state: true,
            country: true,
            avatar: true,
            businessProfile: {
              select: {
                description: true,
                industry: true,
                logo: true,
                website: true
              }
            },
            subscriptions: {
              where: {
                status: 'active',
                planName: { in: ['Free', 'Basic', 'Premium', 'Enterprise'] }
              },
              select: {
                planName: true
              },
              take: 1
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit
        }),
        prisma.user.count({ where: whereClause })
      ]);

      res.json({
        success: true,
        data: {
          businesses,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error('Error searching businesses:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search businesses'
      });
    }
  }
}