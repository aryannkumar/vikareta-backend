import { BaseService } from './base.service';
import { logger } from '@/utils/logger';

export class AdPlacementService extends BaseService {
  async create(data: {
    name: string;
    description?: string;
    placementType: string;
    dimensions?: any;
    location: string;
    priority?: number;
    isActive?: boolean;
  }) {
    const placement = await this.prisma.adPlacement.create({
      data: {
        name: data.name,
        description: data.description,
        placementType: data.placementType,
        dimensions: data.dimensions,
        location: data.location,
        priority: data.priority || 0,
        isActive: data.isActive !== undefined ? data.isActive : true,
      },
      include: {
        assignments: {
          include: {
            advertisement: true,
          },
        },
      },
    });

    logger.info(`Ad placement created: ${placement.id} - ${data.name}`);
    return placement;
  }

  async findById(id: string) {
    return this.prisma.adPlacement.findUnique({
      where: { id },
      include: {
        assignments: {
          include: {
            advertisement: {
              include: {
                campaign: true,
              },
            },
          },
          orderBy: { priority: 'desc' },
        },
      },
    });
  }

  async findByType(placementType: string, activeOnly: boolean = true) {
    const where: any = { placementType };
    if (activeOnly) where.isActive = true;

    return this.prisma.adPlacement.findMany({
      where,
      include: {
        assignments: {
          where: { isActive: true },
          include: {
            advertisement: {
              include: {
                campaign: true,
              },
            },
          },
          orderBy: { priority: 'desc' },
        },
      },
      orderBy: { priority: 'desc' },
    });
  }

  async findByLocation(location: string, activeOnly: boolean = true) {
    const where: any = { location };
    if (activeOnly) where.isActive = true;

    return this.prisma.adPlacement.findMany({
      where,
      include: {
        assignments: {
          where: { isActive: true },
          include: {
            advertisement: {
              include: {
                campaign: true,
              },
            },
          },
          orderBy: { priority: 'desc' },
        },
      },
      orderBy: { priority: 'desc' },
    });
  }

  async update(id: string, data: Partial<{
    name: string;
    description: string;
    placementType: string;
    dimensions: any;
    location: string;
    priority: number;
    isActive: boolean;
  }>) {
    const placement = await this.prisma.adPlacement.update({
      where: { id },
      data,
      include: {
        assignments: {
          include: {
            advertisement: true,
          },
        },
      },
    });

    logger.info(`Ad placement updated: ${id}`);
    return placement;
  }

  async delete(id: string) {
    // First delete all assignments
    await this.prisma.adPlacementAssignment.deleteMany({
      where: { placementId: id },
    });

    const placement = await this.prisma.adPlacement.delete({
      where: { id },
    });

    logger.info(`Ad placement deleted: ${id}`);
    return placement;
  }

  async getActivePlacements() {
    return this.prisma.adPlacement.findMany({
      where: { isActive: true },
      include: {
        assignments: {
          where: { isActive: true },
          include: {
            advertisement: {
              include: {
                campaign: true,
              },
            },
          },
          orderBy: { priority: 'desc' },
        },
      },
      orderBy: { priority: 'desc' },
    });
  }

  async assignAdvertisement(data: {
    advertisementId: string;
    placementId: string;
    priority?: number;
    weight?: number;
    startDate: Date;
    endDate?: Date;
    isActive?: boolean;
  }) {
    const assignment = await this.prisma.adPlacementAssignment.create({
      data: {
        advertisementId: data.advertisementId,
        placementId: data.placementId,
        priority: data.priority || 0,
        weight: data.weight || 1,
        startDate: data.startDate,
        endDate: data.endDate,
        isActive: data.isActive !== undefined ? data.isActive : true,
      },
      include: {
        advertisement: {
          include: {
            campaign: true,
          },
        },
        placement: true,
      },
    });

    logger.info(`Advertisement ${data.advertisementId} assigned to placement ${data.placementId}`);
    return assignment;
  }

  async removeAssignment(advertisementId: string, placementId: string) {
    const assignment = await this.prisma.adPlacementAssignment.deleteMany({
      where: {
        advertisementId,
        placementId,
      },
    });

    logger.info(`Advertisement ${advertisementId} removed from placement ${placementId}`);
    return assignment;
  }

  async getAssignmentsForPlacement(placementId: string, activeOnly: boolean = true) {
    const where: any = { placementId };
    if (activeOnly) where.isActive = true;

    return this.prisma.adPlacementAssignment.findMany({
      where,
      include: {
        advertisement: {
          include: {
            campaign: true,
          },
        },
      },
      orderBy: { priority: 'desc' },
    });
  }

  async getAssignmentsForAdvertisement(advertisementId: string, activeOnly: boolean = true) {
    const where: any = { advertisementId };
    if (activeOnly) where.isActive = true;

    return this.prisma.adPlacementAssignment.findMany({
      where,
      include: {
        placement: true,
      },
      orderBy: { priority: 'desc' },
    });
  }
}

export const adPlacementService = new AdPlacementService();