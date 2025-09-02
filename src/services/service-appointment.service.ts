import { PrismaClient, ServiceAppointment } from '@prisma/client';

export class ServiceAppointmentService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createAppointment(data: {
    serviceId: string;
    userId: string;
    providerId: string;
    scheduledDate: Date;
    duration?: number;
    location?: any;
    requirements?: string;
    notes?: string;
  }): Promise<ServiceAppointment> {
    return this.prisma.serviceAppointment.create({
      data: {
        serviceId: data.serviceId,
        userId: data.buyerId,
        providerId: data.providerId,
        scheduledDate: data.scheduledDate,
        duration: data.duration.toString(),
        location: data.location,
        requirements: data.requirements,
        notes: data.notes,
        status: 'scheduled',
      },
    });
  }

  async getAppointmentById(id: string): Promise<ServiceAppointment | null> {
    return this.prisma.serviceAppointment.findUnique({
      where: { id },
      include: {
        service: {
          select: {
            id: true,
            title: true,
            description: true,
            price: true,
            duration: true,
          },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        provider: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
            email: true,
            phone: true,
          },
        },
      },
    });
  }

  async getAppointmentsByProvider(providerId: string, filters?: {
    status?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<ServiceAppointment[]> {
    return this.prisma.serviceAppointment.findMany({
      where: {
        providerId,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.dateFrom && {
          scheduledDate: { gte: filters.dateFrom },
        }),
        ...(filters?.dateTo && {
          scheduledDate: { lte: filters.dateTo },
        }),
      },
      orderBy: { scheduledDate: 'asc' },
      include: {
        service: {
          select: {
            id: true,
            title: true,
            price: true,
            duration: true,
          },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });
  }

  async getAppointmentsByBuyer(userId: string, filters?: {
    status?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<ServiceAppointment[]> {
    return this.prisma.serviceAppointment.findMany({
      where: {
        buyerId,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.dateFrom && {
          scheduledDate: { gte: filters.dateFrom },
        }),
        ...(filters?.dateTo && {
          scheduledDate: { lte: filters.dateTo },
        }),
      },
      orderBy: { scheduledDate: 'asc' },
      include: {
        service: {
          select: {
            id: true,
            title: true,
            price: true,
            duration: true,
          },
        },
        provider: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessName: true,
            email: true,
            phone: true,
          },
        },
      },
    });
  }

  async updateAppointmentStatus(
    id: string,
    status: string,
    completedAt?: Date,
    feedback?: string
  ): Promise<ServiceAppointment> {
    return this.prisma.serviceAppointment.update({
      where: { id },
      data: {
        status,
        ...(completedAt && { completedAt }),
        ...(feedback && { feedback }),
      },
    });
  }

  async rescheduleAppointment(
    id: string,
    newScheduledDate: Date,
    reason?: string
  ): Promise<ServiceAppointment> {
    return this.prisma.serviceAppointment.update({
      where: { id },
      data: {
        scheduledDate: newScheduledDate,
        status: 'rescheduled',
        notes: reason,
      },
    });
  }

  async cancelAppointment(id: string, reason?: string): Promise<ServiceAppointment> {
    return this.prisma.serviceAppointment.update({
      where: { id },
      data: {
        status: 'cancelled',
        notes: reason,
      },
    });
  }

  async getProviderAvailability(
    providerId: string,
    dateFrom: Date,
    dateTo: Date
  ): Promise<{ date: Date; isAvailable: boolean }[]> {
    const appointments = await this.prisma.serviceAppointment.findMany({
      where: {
        service: { providerId },
        scheduledDate: {
          gte: dateFrom,
          lte: dateTo,
        },
        status: { in: ['scheduled', 'in_progress'] },
      },
      select: {
        scheduledDate: true,
        duration: true,
      },
    });

    // Simple availability check - can be enhanced with business hours logic
    const availability: { date: Date; isAvailable: boolean }[] = [];
    const currentDate = new Date(dateFrom);
    
    while (currentDate <= dateTo) {
      const dayAppointments = appointments.filter(
        apt => apt.scheduledDate.toDateString() === currentDate.toDateString()
      );
      
      availability.push({
        date: new Date(currentDate),
        isAvailable: dayAppointments.length < 8, // Max 8 appointments per day
      });
      
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return availability;
  }
}

export const serviceAppointmentService = new ServiceAppointmentService(new PrismaClient());