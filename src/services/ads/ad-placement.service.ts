import { PrismaClient } from '@prisma/client';
import type { AdPlacement } from '@prisma/client';
import { logger } from '../../utils/logger';

const prisma = new PrismaClient();

export interface CreatePlacementRequest {
  name: string;
  location: string;
  placementType?: string;
  description?: string;
  priority?: number;
  platform?: 'web' | 'mobile' | 'dashboard';
  dimensions: {
    width: number;
    height: number;
    responsive?: {
      mobile?: { width: number; height: number };
      tablet?: { width: number; height: number };
      desktop?: { width: number; height: number };
    };
  };
  maxAdsPerPage?: number;
  refreshInterval?: number;
  isActive?: boolean;
}

export interface UpdatePlacementRequest {
  name?: string;
  location?: string;
  platform?: 'web' | 'mobile' | 'dashboard';
  dimensions?: CreatePlacementRequest['dimensions'];
  maxAdsPerPage?: number;
  refreshInterval?: number;
  isActive?: boolean;
}

export interface PlacementWithStats extends AdPlacement {
  _count?: {
    advertisements: number;
    impressions: number;
  };
}

export class AdPlacementService {
  /**
   * Create a new ad placement
   */
  async createPlacement(request: CreatePlacementRequest): Promise<AdPlacement> {
    try {
      // Validate placement data
      this.validatePlacementRequest(request);

      // Check if placement with same name already exists
      const existingPlacement = await prisma.adPlacement.findFirst({
        where: {
          name: request.name,
        },
      });

      if (existingPlacement) {
        throw new Error(`Placement with name '${request.name}' already exists`);
      }

      const placement = await prisma.adPlacement.create({
        data: {
          name: request.name,
          location: request.location,
          placementType: request.placementType || 'inline',
          dimensions: request.dimensions,
          description: request.description,
          priority: request.priority || 0,
          isActive: request.isActive !== undefined ? request.isActive : true,
        },
      });

      logger.info('Ad placement created successfully:', {
        placementId: placement.id,
        name: placement.name,

        location: placement.location,
      });

      return placement;
    } catch (error) {
      logger.error('Error creating ad placement:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to create ad placement: ${error.message}`);
      }
      throw new Error('Failed to create ad placement');
    }
  }

  /**
   * Update an existing ad placement
   */
  async updatePlacement(placementId: string, request: UpdatePlacementRequest): Promise<AdPlacement> {
    try {
      const existingPlacement = await prisma.adPlacement.findUnique({
        where: { id: placementId },
      });

      if (!existingPlacement) {
        throw new Error('Ad placement not found');
      }

      // Validate update data
      if (request.name || request.dimensions) {
        this.validatePlacementRequest({
          name: request.name || existingPlacement.name,
          location: request.location || existingPlacement.location,
          dimensions: request.dimensions || (existingPlacement.dimensions as any),
          maxAdsPerPage: request.maxAdsPerPage,
          refreshInterval: request.refreshInterval,
          isActive: request.isActive,
        });
      }

      // Check for name conflicts if name is being changed
      if (request.name && request.name !== existingPlacement.name) {
        const conflictingPlacement = await prisma.adPlacement.findFirst({
          where: {
            name: request.name,
            id: { not: placementId },
          },
        });

        if (conflictingPlacement) {
          throw new Error(`Placement with name '${request.name}' already exists for this platform`);
        }
      }

      const updatedPlacement = await prisma.adPlacement.update({
        where: { id: placementId },
        data: request,
      });

      logger.info('Ad placement updated successfully:', {
        placementId,
        updates: Object.keys(request),
      });

      return updatedPlacement;
    } catch (error) {
      logger.error('Error updating ad placement:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to update ad placement: ${error.message}`);
      }
      throw new Error('Failed to update ad placement');
    }
  }

  /**
   * Get ad placement by ID
   */
  async getPlacement(placementId: string): Promise<PlacementWithStats | null> {
    try {
      const placement = await prisma.adPlacement.findUnique({
        where: { id: placementId },
        include: {
          _count: {
            select: {
              assignments: true,

            },
          },
        },
      });

      return placement as any;
    } catch (error) {
      logger.error('Error getting ad placement:', error);
      throw new Error('Failed to get ad placement');
    }
  }

  /**
   * Get all ad placements with optional filtering
   */
  async getPlacements(options: {
    platform?: 'web' | 'mobile' | 'dashboard';
    location?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    placements: PlacementWithStats[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const page = options.page || 1;
      const limit = Math.min(options.limit || 20, 100);
      const skip = (page - 1) * limit;

      const where: any = {};

      if (options.platform) {
        where.platform = options.platform;
      }

      if (options.location) {
        where.location = { contains: options.location, mode: 'insensitive' };
      }

      if (options.isActive !== undefined) {
        where.isActive = options.isActive;
      }

      const [placements, total] = await Promise.all([
        prisma.adPlacement.findMany({
          where,
          include: {
            _count: {
              select: {
                assignments: true,

              },
            },
          },
          orderBy: [
            { location: 'asc' },
            { name: 'asc' },
          ],
          skip,
          take: limit,
        }),
        prisma.adPlacement.count({ where }),
      ]);

      return {
        placements: placements as any[],
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error('Error getting ad placements:', error);
      throw new Error('Failed to get ad placements');
    }
  }

  /**
   * Get active placements for a specific platform and location
   */
  async getActivePlacementsForLocation(
    platform: 'web' | 'mobile' | 'dashboard',
    location: string
  ): Promise<AdPlacement[]> {
    try {
      const placements = await prisma.adPlacement.findMany({
        where: {
          location,
          isActive: true,
        },
        orderBy: { name: 'asc' },
      });

      return placements;
    } catch (error) {
      logger.error('Error getting active placements for location:', error);
      throw new Error('Failed to get active placements for location');
    }
  }

  /**
   * Delete an ad placement
   */
  async deletePlacement(placementId: string): Promise<void> {
    try {
      const placement = await prisma.adPlacement.findUnique({
        where: { id: placementId },
        include: {
          _count: {
            select: {
              assignments: true,

            },
          },
        },
      });

      if (!placement) {
        throw new Error('Ad placement not found');
      }

      // Check if placement has active advertisements
      if (placement._count.assignments > 0) {
        throw new Error('Cannot delete placement with active advertisements. Remove advertisements first.');
      }

      await prisma.adPlacement.delete({
        where: { id: placementId },
      });

      logger.info('Ad placement deleted:', { placementId, name: placement.name });
    } catch (error) {
      logger.error('Error deleting ad placement:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to delete ad placement: ${error.message}`);
      }
      throw new Error('Failed to delete ad placement');
    }
  }

  /**
   * Toggle placement active status
   */
  async togglePlacementStatus(placementId: string): Promise<AdPlacement> {
    try {
      const placement = await prisma.adPlacement.findUnique({
        where: { id: placementId },
      });

      if (!placement) {
        throw new Error('Ad placement not found');
      }

      const updatedPlacement = await prisma.adPlacement.update({
        where: { id: placementId },
        data: { isActive: !placement.isActive },
      });

      logger.info('Ad placement status toggled:', {
        placementId,
        name: placement.name,
        newStatus: updatedPlacement.isActive ? 'active' : 'inactive',
      });

      return updatedPlacement;
    } catch (error) {
      logger.error('Error toggling placement status:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to toggle placement status: ${error.message}`);
      }
      throw new Error('Failed to toggle placement status');
    }
  }

  /**
   * Validate placement dimensions for different platforms
   */
  validateDimensions(platform: string, dimensions: CreatePlacementRequest['dimensions']): boolean {
    const { width, height } = dimensions;

    // Basic dimension validation
    if (width <= 0 || height <= 0) {
      return false;
    }

    // Platform-specific dimension constraints
    switch (platform) {
      case 'web':
        // Web platform supports larger dimensions
        return width <= 1920 && height <= 1080;

      case 'mobile':
        // Mobile platform has smaller dimension constraints
        return width <= 414 && height <= 896; // iPhone 11 Pro Max dimensions

      case 'dashboard':
        // Dashboard can have medium-sized ads
        return width <= 800 && height <= 600;

      default:
        return true;
    }
  }

  /**
   * Get standard placement configurations for different platforms
   */
  getStandardPlacements(): CreatePlacementRequest[] {
    return [
      // Web platform placements
      {
        name: 'Homepage Banner',
        location: 'homepage_banner',
        platform: 'web',
        dimensions: {
          width: 728,
          height: 90,
          responsive: {
            mobile: { width: 320, height: 50 },
            tablet: { width: 468, height: 60 },
            desktop: { width: 728, height: 90 },
          },
        },
        maxAdsPerPage: 1,
        refreshInterval: 30,
      },
      {
        name: 'Product Sidebar',
        location: 'product_sidebar',
        platform: 'web',
        dimensions: {
          width: 300,
          height: 250,
        },
        maxAdsPerPage: 2,
        refreshInterval: 60,
      },
      {
        name: 'Search Results',
        location: 'search_results',
        platform: 'web',
        dimensions: {
          width: 320,
          height: 100,
        },
        maxAdsPerPage: 3,
      },

      // Mobile platform placements
      {
        name: 'Mobile Banner',
        location: 'mobile_banner',
        platform: 'mobile',
        dimensions: {
          width: 320,
          height: 50,
        },
        maxAdsPerPage: 1,
        refreshInterval: 45,
      },
      {
        name: 'Mobile Interstitial',
        location: 'mobile_interstitial',
        platform: 'mobile',
        dimensions: {
          width: 320,
          height: 480,
        },
        maxAdsPerPage: 1,
      },
      {
        name: 'Mobile Native',
        location: 'mobile_native',
        platform: 'mobile',
        dimensions: {
          width: 300,
          height: 150,
        },
        maxAdsPerPage: 2,
      },

      // Dashboard platform placements
      {
        name: 'Dashboard Header',
        location: 'dashboard_header',
        platform: 'dashboard',
        dimensions: {
          width: 468,
          height: 60,
        },
        maxAdsPerPage: 1,
        refreshInterval: 120,
      },
      {
        name: 'Dashboard Sidebar',
        location: 'dashboard_sidebar',
        platform: 'dashboard',
        dimensions: {
          width: 250,
          height: 200,
        },
        maxAdsPerPage: 2,
        refreshInterval: 90,
      },
    ];
  }

  /**
   * Initialize standard placements (useful for setup)
   */
  async initializeStandardPlacements(): Promise<AdPlacement[]> {
    try {
      const standardPlacements = this.getStandardPlacements();
      const createdPlacements: AdPlacement[] = [];

      for (const placementData of standardPlacements) {
        try {
          // Check if placement already exists
          const existing = await prisma.adPlacement.findFirst({
            where: {
              name: placementData.name,
            },
          });

          if (!existing) {
            const placement = await this.createPlacement(placementData);
            createdPlacements.push(placement);
          }
        } catch (error) {
          logger.warn(`Failed to create standard placement ${placementData.name}:`, error);
        }
      }

      logger.info(`Initialized ${createdPlacements.length} standard placements`);
      return createdPlacements;
    } catch (error) {
      logger.error('Error initializing standard placements:', error);
      throw new Error('Failed to initialize standard placements');
    }
  }

  /**
   * Validate placement request data
   */
  private validatePlacementRequest(request: CreatePlacementRequest): void {
    if (!request.name || request.name.trim().length === 0) {
      throw new Error('Placement name is required');
    }

    if (request.name.length > 100) {
      throw new Error('Placement name must be less than 100 characters');
    }

    if (!request.location || request.location.trim().length === 0) {
      throw new Error('Placement location is required');
    }

    if (request.location.length > 100) {
      throw new Error('Placement location must be less than 100 characters');
    }

    if (request.platform && !['web', 'mobile', 'dashboard'].includes(request.platform)) {
      throw new Error('Platform must be one of: web, mobile, dashboard');
    }

    if (!request.dimensions || !request.dimensions.width || !request.dimensions.height) {
      throw new Error('Placement dimensions (width and height) are required');
    }

    if (request.platform && !this.validateDimensions(request.platform, request.dimensions)) {
      throw new Error(`Invalid dimensions for platform ${request.platform}`);
    }

    if (request.maxAdsPerPage && (request.maxAdsPerPage < 1 || request.maxAdsPerPage > 10)) {
      throw new Error('Max ads per page must be between 1 and 10');
    }

    if (request.refreshInterval && (request.refreshInterval < 10 || request.refreshInterval > 3600)) {
      throw new Error('Refresh interval must be between 10 and 3600 seconds');
    }

    // Validate responsive dimensions if provided
    if (request.dimensions.responsive) {
      const responsive = request.dimensions.responsive;

      if (responsive.mobile && !this.validateDimensions('mobile', responsive.mobile)) {
        throw new Error('Invalid mobile responsive dimensions');
      }

      if (responsive.tablet && !this.validateDimensions('web', responsive.tablet)) {
        throw new Error('Invalid tablet responsive dimensions');
      }

      if (responsive.desktop && !this.validateDimensions('web', responsive.desktop)) {
        throw new Error('Invalid desktop responsive dimensions');
      }
    }
  }
}

export const adPlacementService = new AdPlacementService();