import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';

export interface ShippingRate {
  providerId: string;
  providerName: string;
  serviceName: string;
  cost: number;
  estimatedDays: number;
  features: string[];
}

export interface ShipmentTracking {
  trackingNumber: string;
  status: string;
  location: string;
  timestamp: Date;
  description: string;
  estimatedDelivery?: Date;
}

export interface DeliveryAddress {
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export interface PackageDetails {
  weight: number;
  dimensions: {
    length: number;
    width: number;
    height: number;
  };
  value: number;
  fragile: boolean;
  hazardous: boolean;
  description: string;
}

export class LogisticsManagementService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Get shipping rates from multiple providers
   */
  async getShippingRates(
    fromAddress: DeliveryAddress,
    toAddress: DeliveryAddress,
    packageDetails: PackageDetails
  ): Promise<ShippingRate[]> {
    try {
      const providers = await this.prisma.logisticsProvider.findMany({
        where: { isActive: true },
      });

      const rates: ShippingRate[] = [];

      for (const provider of providers) {
        const providerRates = await this.calculateProviderRates(
          provider,
          fromAddress,
          toAddress,
          packageDetails
        );
        rates.push(...providerRates);
      }

      // Sort by cost
      return rates.sort((a, b) => a.cost - b.cost);
    } catch (error) {
      logger.error('Error getting shipping rates:', error);
      throw error;
    }
  }

  /**
   * Create shipment
   */
  async createShipment(
    orderId: string,
    providerId: string,
    fromAddress: DeliveryAddress,
    toAddress: DeliveryAddress,
    packageDetails: PackageDetails,
    serviceType: string
  ): Promise<{
    orderId: string;
    trackingNumber: string;
    labelUrl?: string;
    estimatedDelivery: Date;
  }> {
    try {
      const provider = await this.prisma.logisticsProvider.findUnique({
        where: { id: providerId },
      });

      if (!provider) {
        throw new Error('Logistics provider not found');
      }

      // Calculate estimated delivery
      const estimatedDelivery = new Date();
      estimatedDelivery.setDate(estimatedDelivery.getDate() + this.getEstimatedDays(serviceType));

      // Generate tracking number
      const trackingNumber = this.generateTrackingNumber(provider.code);

      // Update order with shipping information
      const order = await this.prisma.order.update({
        where: { id: orderId },
        data: {
          trackingNumber,
          shippingProvider: provider.name,
          estimatedDelivery,
          shippingNotes: packageDetails.description,
        },
      });

      // Create initial tracking history (if model exists)
      try {
        await this.prisma.orderTrackingHistory.create({
          data: {
            orderId,
            status: 'shipment_created',
            description: 'Shipment created and ready for pickup',
            timestamp: new Date(),
          },
        });
      } catch (error) {
        // OrderTrackingHistory model might not exist, continue without it
        logger.warn('OrderTrackingHistory model not found, skipping tracking history creation');
      }

      // Generate shipping label (mock implementation)
      const labelUrl = await this.generateShippingLabel(order.id, provider, fromAddress, toAddress);

      logger.info('Shipment created successfully', {
        orderId: order.id,
        trackingNumber,
      });

      return {
        orderId: order.id,
        trackingNumber,
        labelUrl: `https://shipping-labels.example.com/${trackingNumber}.pdf`,
        estimatedDelivery,
      };
    } catch (error) {
      logger.error('Error creating shipment:', error);
      throw error;
    }
  }

  /**
   * Track shipment
   */
  async trackShipment(trackingNumber: string): Promise<{
    order: any;
    trackingHistory: ShipmentTracking[];
    currentStatus: string;
    estimatedDelivery?: Date;
  }> {
    try {
      const order = await this.prisma.order.findFirst({
        where: { trackingNumber },
        include: {
          trackingHistory: {
            orderBy: { timestamp: 'desc' },
          },
        },
      });

      if (!order) {
        throw new Error('Order with tracking number not found');
      }

      // Get real-time tracking from provider (mock implementation)
      const providerTracking = await this.getProviderTracking(order.shippingProvider || 'default', trackingNumber);

      const trackingHistory: ShipmentTracking[] = order.trackingHistory?.map(history => ({
        trackingNumber,
        status: history.status,
        location: history.location || 'Unknown',
        timestamp: history.timestamp,
        description: history.description || '',
        estimatedDelivery: order.estimatedDelivery || undefined,
      })) || [];

      return {
        order,
        trackingHistory,
        currentStatus: order.status,
        estimatedDelivery: order.estimatedDelivery || undefined,
      };
    } catch (error) {
      logger.error('Error tracking shipment:', error);
      throw error;
    }
  }

  /**
   * Update shipment status
   */
  async updateShipmentStatus(
    trackingNumber: string,
    status: string,
    location?: string,
    description?: string
  ): Promise<void> {
    try {
      const order = await this.prisma.order.findFirst({
        where: { trackingNumber },
      });

      if (!order) {
        throw new Error('Order with tracking number not found');
      }

      // Update order status
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          status,
          actualDelivery: status === 'delivered' ? new Date() : undefined,
        },
      });

      // Add tracking history (if model exists)
      try {
        await this.prisma.orderTrackingHistory.create({
          data: {
            orderId: order.id,
            status,
            location,
            description,
            timestamp: new Date(),
          },
        });
      } catch (error) {
        logger.warn('OrderTrackingHistory model not found, skipping tracking history creation');
      }

      logger.info('Shipment status updated', {
        trackingNumber,
        status,
        location,
      });
    } catch (error) {
      logger.error('Error updating shipment status:', error);
      throw error;
    }
  }

  /**
   * Schedule pickup
   */
  async schedulePickup(
    orderId: string,
    pickupDate: Date,
    timeSlot: string,
    specialInstructions?: string
  ): Promise<{
    pickupId: string;
    confirmationNumber: string;
  }> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      // Schedule pickup with provider (mock implementation)
      const pickupId = `PU${Date.now()}`;
      const confirmationNumber = `CONF${Math.random().toString(36).substr(2, 8).toUpperCase()}`;

      // Update order with pickup details
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'pickup_scheduled',
          shippingNotes: `${order.shippingNotes || ''}\nPickup scheduled for ${pickupDate.toISOString()} (${timeSlot})`,
        },
      });

      // Add tracking history (if model exists)
      try {
        await this.prisma.orderTrackingHistory.create({
          data: {
            orderId: order.id,
            status: 'pickup_scheduled',
            description: `Pickup scheduled for ${pickupDate.toDateString()} ${timeSlot}`,
            timestamp: new Date(),
          },
        });
      } catch (error) {
        logger.warn('OrderTrackingHistory model not found, skipping tracking history creation');
      }

      logger.info('Pickup scheduled successfully', {
        orderId,
        pickupDate,
        confirmationNumber,
      });

      return {
        pickupId,
        confirmationNumber,
      };
    } catch (error) {
      logger.error('Error scheduling pickup:', error);
      throw error;
    }
  }

  /**
   * Calculate delivery zones and coverage
   */
  async getDeliveryCoverage(
    fromPostalCode: string,
    providerId?: string
  ): Promise<{
    zones: Array<{
      zone: string;
      postalCodes: string[];
      estimatedDays: number;
      additionalCost: number;
    }>;
    uncoveredAreas: string[];
  }> {
    try {
      const where: any = { isActive: true };
      if (providerId) where.id = providerId;

      const providers = await this.prisma.logisticsProvider.findMany({
        where,
      });

      // Mock delivery zones calculation
      const zones = [
        {
          zone: 'Local',
          postalCodes: this.getLocalPostalCodes(fromPostalCode),
          estimatedDays: 1,
          additionalCost: 0,
        },
        {
          zone: 'Regional',
          postalCodes: this.getRegionalPostalCodes(fromPostalCode),
          estimatedDays: 2,
          additionalCost: 50,
        },
        {
          zone: 'National',
          postalCodes: this.getNationalPostalCodes(fromPostalCode),
          estimatedDays: 5,
          additionalCost: 100,
        },
      ];

      return {
        zones,
        uncoveredAreas: [], // Would be calculated based on provider coverage
      };
    } catch (error) {
      logger.error('Error getting delivery coverage:', error);
      throw error;
    }
  }

  /**
   * Get logistics analytics
   */
  async getLogisticsAnalytics(sellerId?: string, dateRange?: { from: Date; to: Date }): Promise<{
    totalShipments: number;
    deliveredShipments: number;
    averageDeliveryTime: number;
    onTimeDeliveryRate: number;
    shippingCosts: number;
    topProviders: Array<{
      providerId: string;
      providerName: string;
      shipmentCount: number;
      averageCost: number;
      onTimeRate: number;
    }>;
    deliveryPerformance: Array<{
      date: string;
      shipments: number;
      delivered: number;
      delayed: number;
    }>;
  }> {
    try {
      const where: any = {};
      if (sellerId) {
        where.order = { sellerId };
      }
      if (dateRange) {
        where.createdAt = {
          gte: dateRange.from,
          lte: dateRange.to,
        };
      }

      const orders = await this.prisma.order.findMany({
        where: {
          trackingNumber: { not: null },
          ...where,
        },
        include: {
          buyer: true,
          seller: true,
        },
      });

      const totalShipments = orders.length;
      const deliveredShipments = orders.filter(s => s.status === 'delivered').length;
      
      // Calculate average delivery time
      const deliveredWithTimes = orders.filter(s => 
        s.status === 'delivered' && s.actualDelivery && s.createdAt
      );
      
      const averageDeliveryTime = deliveredWithTimes.length > 0
        ? deliveredWithTimes.reduce((sum: number, s: any) => {
            const deliveryTime = s.actualDelivery!.getTime() - s.createdAt.getTime();
            return sum + (deliveryTime / (1000 * 60 * 60 * 24)); // Convert to days
          }, 0) / deliveredWithTimes.length
        : 0;

      // Calculate on-time delivery rate
      const onTimeDeliveries = deliveredWithTimes.filter((s: any) => 
        s.actualDelivery! <= s.estimatedDelivery!
      ).length;
      const onTimeDeliveryRate = deliveredWithTimes.length > 0
        ? (onTimeDeliveries / deliveredWithTimes.length) * 100
        : 0;

      // Calculate total shipping costs
      const shippingCosts = orders.reduce((sum: number, s: any) => 
        sum + Number(s.shippingAmount || 0), 0
      );

      // Calculate top providers
      const providerStats = new Map();
      orders.forEach(order => {
        const providerId = order.shippingProvider || 'unknown';
        const providerName = order.shippingProvider || 'Unknown Provider';
        
        if (!providerStats.has(providerId)) {
          providerStats.set(providerId, {
            providerId,
            providerName,
            shipmentCount: 0,
            totalCost: 0,
            onTimeCount: 0,
            deliveredCount: 0,
          });
        }
        
        const stats = providerStats.get(providerId);
        stats.shipmentCount++;
        stats.totalCost += Number(order.shippingAmount || 0);
        
        if (order.status === 'delivered') {
          stats.deliveredCount++;
          if (order.actualDelivery && order.estimatedDelivery &&
              order.actualDelivery <= order.estimatedDelivery) {
            stats.onTimeCount++;
          }
        }
      });

      const topProviders = Array.from(providerStats.values())
        .map(stats => ({
          providerId: stats.providerId,
          providerName: stats.providerName,
          shipmentCount: stats.shipmentCount,
          averageCost: stats.shipmentCount > 0 ? stats.totalCost / stats.shipmentCount : 0,
          onTimeRate: stats.deliveredCount > 0 ? (stats.onTimeCount / stats.deliveredCount) * 100 : 0,
        }))
        .sort((a, b) => b.shipmentCount - a.shipmentCount)
        .slice(0, 5);

      // Mock delivery performance data
      const deliveryPerformance = this.generateDeliveryPerformanceData(orders, dateRange);

      return {
        totalShipments,
        deliveredShipments,
        averageDeliveryTime: Number(averageDeliveryTime.toFixed(1)),
        onTimeDeliveryRate: Number(onTimeDeliveryRate.toFixed(1)),
        shippingCosts,
        topProviders,
        deliveryPerformance,
      };
    } catch (error) {
      logger.error('Error getting logistics analytics:', error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private async calculateProviderRates(
    provider: any,
    fromAddress: DeliveryAddress,
    toAddress: DeliveryAddress,
    packageDetails: PackageDetails
  ): Promise<ShippingRate[]> {
    // Mock rate calculation - in real implementation, integrate with provider APIs
    const baseRate = this.calculateBaseRate(fromAddress, toAddress, packageDetails);
    const services = ['Standard', 'Express', 'Overnight'];
    
    return services.map((service, index) => ({
      providerId: provider.id,
      providerName: provider.displayName,
      serviceName: service,
      cost: baseRate * (1 + index * 0.5), // Standard, +50%, +100%
      estimatedDays: 5 - index * 2, // 5, 3, 1 days
      features: this.getServiceFeatures(service),
    }));
  }

  private calculateBaseRate(
    fromAddress: DeliveryAddress,
    toAddress: DeliveryAddress,
    packageDetails: PackageDetails
  ): number {
    // Simplified rate calculation
    const distance = this.calculateDistance(fromAddress, toAddress);
    const weightFactor = Math.max(1, packageDetails.weight / 1000); // Per kg
    const valueFactor = packageDetails.value > 10000 ? 1.2 : 1; // Insurance for high value
    
    return Math.round(distance * 0.1 * weightFactor * valueFactor);
  }

  private calculateDistance(from: DeliveryAddress, to: DeliveryAddress): number {
    // Mock distance calculation - in real implementation, use geocoding API
    if (from.city === to.city) return 10;
    if (from.state === to.state) return 100;
    return 500;
  }

  private getServiceFeatures(service: string): string[] {
    const features = {
      'Standard': ['Tracking', 'Insurance up to ₹5,000'],
      'Express': ['Tracking', 'Insurance up to ₹10,000', 'Priority handling'],
      'Overnight': ['Tracking', 'Insurance up to ₹25,000', 'Priority handling', 'SMS updates'],
    };
    return features[service as keyof typeof features] || [];
  }

  private getEstimatedDays(serviceType: string): number {
    const days = {
      'standard': 5,
      'express': 3,
      'overnight': 1,
    };
    return days[serviceType.toLowerCase() as keyof typeof days] || 5;
  }

  private generateTrackingNumber(providerCode: string): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substr(2, 6).toUpperCase();
    return `${providerCode}${timestamp.slice(-6)}${random}`;
  }

  private async calculateShippingCost(provider: any, packageDetails: PackageDetails): Promise<number> {
    // Mock shipping cost calculation
    const baseCost = 50;
    const weightCost = packageDetails.weight * 10;
    const valueCost = packageDetails.value * 0.001;
    
    return Math.round(baseCost + weightCost + valueCost);
  }

  private async generateShippingLabel(
    shipmentId: string,
    provider: any,
    fromAddress: DeliveryAddress,
    toAddress: DeliveryAddress
  ): Promise<string> {
    // Mock label generation - in real implementation, integrate with provider APIs
    return `https://labels.example.com/${shipmentId}.pdf`;
  }

  private async getProviderTracking(provider: any, trackingNumber: string): Promise<ShipmentTracking[]> {
    // Mock provider tracking - in real implementation, integrate with provider APIs
    return [
      {
        trackingNumber,
        status: 'in_transit',
        location: 'Mumbai Hub',
        timestamp: new Date(),
        description: 'Package is in transit',
      },
    ];
  }

  private async syncTrackingHistory(orderId: string, providerTracking: ShipmentTracking[]): Promise<void> {
    // Sync tracking history with provider data
    for (const tracking of providerTracking) {
      try {
        const existing = await this.prisma.orderTrackingHistory.findFirst({
          where: {
            orderId,
            status: tracking.status,
            timestamp: tracking.timestamp,
          },
        });

        if (!existing) {
          await this.prisma.orderTrackingHistory.create({
            data: {
              orderId,
              status: tracking.status,
              location: tracking.location,
              description: tracking.description,
              timestamp: tracking.timestamp,
            },
          });
        }
      } catch (error) {
        logger.warn('OrderTrackingHistory model not found, skipping tracking history sync');
      }
    }
  }

  private getLocalPostalCodes(fromPostalCode: string): string[] {
    // Mock local postal codes
    const baseCode = parseInt(fromPostalCode.substr(0, 3));
    return Array.from({ length: 10 }, (_, i) => `${baseCode + i}000`);
  }

  private getRegionalPostalCodes(fromPostalCode: string): string[] {
    // Mock regional postal codes
    const baseCode = parseInt(fromPostalCode.substr(0, 2));
    return Array.from({ length: 50 }, (_, i) => `${baseCode}${i.toString().padStart(4, '0')}`);
  }

  private getNationalPostalCodes(fromPostalCode: string): string[] {
    // Mock national postal codes
    return Array.from({ length: 100 }, (_, i) => `${i.toString().padStart(6, '0')}`);
  }

  private generateDeliveryPerformanceData(shipments: any[], dateRange?: { from: Date; to: Date }): any[] {
    // Mock delivery performance data
    const days = dateRange 
      ? Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24))
      : 30;

    return Array.from({ length: days }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (days - i));
      
      return {
        date: date.toISOString().split('T')[0],
        shipments: Math.floor(Math.random() * 20) + 5,
        delivered: Math.floor(Math.random() * 15) + 3,
        delayed: Math.floor(Math.random() * 3),
      };
    });
  }
}

export default LogisticsManagementService;