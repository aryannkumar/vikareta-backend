import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export interface LogisticsProvider {
  id: string;
  name: string;
  displayName: string;
  apiEndpoint: string;
  apiKey?: string | undefined;
  isActive: boolean;
  supportedServices: string[];
  configuration: Record<string, any>;
}

export interface ShippingAddress {
  name: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  landmark?: string;
  [key: string]: any; // Allow additional properties for JSON compatibility
}

export interface PackageDetails {
  weight: number; // in kg
  length: number; // in cm
  width: number; // in cm
  height: number; // in cm
  contents: string;
  value: number; // in INR
  fragile?: boolean;
  hazardous?: boolean;
  [key: string]: any; // Allow additional properties for JSON compatibility
}

export interface CreateShipmentRequest {
  orderId: string;
  providerId: string;
  pickupAddress: ShippingAddress;
  deliveryAddress: ShippingAddress;
  packageDetails: PackageDetails;
  serviceType?: 'standard' | 'express' | 'overnight';
  insuranceRequired?: boolean;
  codAmount?: number; // Cash on Delivery amount
  specialInstructions?: string;
}

export interface TrackingInfo {
  trackingNumber: string;
  status: string;
  location?: string | undefined;
  timestamp: Date;
  description?: string | undefined;
  provider: string;
  estimatedDelivery?: Date | undefined;
  actualDelivery?: Date | undefined;
}

export interface DeliveryProof {
  type: 'signature' | 'photo' | 'otp' | 'biometric';
  data: string; // base64 encoded image or signature data
  recipientName?: string;
  recipientPhone?: string;
  timestamp: Date;
  location?: {
    latitude: number;
    longitude: number;
  };
}

export interface RateCalculationRequest {
  fromPincode: string;
  toPincode: string;
  weight: number;
  dimensions: {
    length: number;
    width: number;
    height: number;
  };
  serviceType?: string;
  codAmount?: number | undefined;
}

export interface ShippingRate {
  providerId: string;
  providerName: string;
  serviceType: string;
  rate: number;
  estimatedDays: number;
  currency: string;
}

export class LogisticsService {
  /**
   * Get all active logistics providers
   */
  async getActiveProviders(): Promise<LogisticsProvider[]> {
    try {
      const providers = await prisma.logisticsProvider.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });

      return providers.map(provider => ({
        id: provider.id,
        name: provider.name,
        displayName: provider.displayName,
        apiEndpoint: provider.apiEndpoint,
        apiKey: provider.apiKey ?? undefined,
        isActive: provider.isActive,
        supportedServices: provider.supportedServices as string[],
        configuration: provider.configuration as Record<string, any>,
      })) as LogisticsProvider[];
    } catch (error) {
      logger.error('Error getting active providers:', error);
      throw new Error('Failed to get logistics providers');
    }
  }

  /**
   * Calculate shipping rates from multiple providers
   */
  async calculateShippingRates(request: RateCalculationRequest): Promise<ShippingRate[]> {
    try {
      const providers = await this.getActiveProviders();
      const rates: ShippingRate[] = [];

      for (const provider of providers) {
        try {
          const providerRates = await this.getProviderRates(provider, request);
          rates.push(...providerRates);
        } catch (error) {
          logger.warn(`Failed to get rates from provider ${provider.name}:`, error);
          // Continue with other providers
        }
      }

      // Sort by rate (cheapest first)
      return rates.sort((a, b) => a.rate - b.rate);
    } catch (error) {
      logger.error('Error calculating shipping rates:', error);
      throw new Error('Failed to calculate shipping rates');
    }
  }

  /**
   * Create a shipment with a logistics provider
   */
  async createShipment(request: CreateShipmentRequest): Promise<{
    success: boolean;
    shipmentId?: string | undefined;
    trackingNumber?: string | undefined;
    labelUrl?: string | undefined;
    estimatedDelivery?: Date | undefined;
    shippingCost?: number | undefined;
    message: string;
  }> {
    try {
      const provider = await prisma.logisticsProvider.findUnique({
        where: { id: request.providerId },
      });

      if (!provider || !provider.isActive) {
        return {
          success: false,
          message: 'Invalid or inactive logistics provider',
        };
      }

      // Create shipment with provider API
      const shipmentData = await this.createProviderShipment(provider, request);

      if (!shipmentData.success) {
        return {
          success: false,
          message: shipmentData.message || 'Failed to create shipment with provider',
        };
      }

      // Save shipment to database
      const shipment = await prisma.shipment.create({
        data: {
          orderId: request.orderId,
          providerId: request.providerId,
          trackingNumber: shipmentData.trackingNumber!,
          labelUrl: shipmentData.labelUrl ?? null,
          status: 'created',
          pickupAddress: request.pickupAddress as any,
          deliveryAddress: request.deliveryAddress as any,
          packageDetails: request.packageDetails as any,
          shippingCost: shipmentData.shippingCost ?? null,
          estimatedDelivery: shipmentData.estimatedDelivery ?? null,
        },
      });

      // Update order with tracking information
      await prisma.order.update({
        where: { id: request.orderId },
        data: {
          trackingNumber: shipmentData.trackingNumber ?? null,
          shippingProvider: provider.displayName,
          estimatedDelivery: shipmentData.estimatedDelivery ?? null,
          status: 'processing',
        },
      });

      // Create initial tracking history
      await this.addTrackingHistory(request.orderId, {
        status: 'shipment_created',
        description: 'Shipment created and ready for pickup',
        provider: provider.name,
        timestamp: new Date(),
      });

      logger.info('Shipment created successfully:', {
        orderId: request.orderId,
        shipmentId: shipment.id,
        trackingNumber: shipmentData.trackingNumber,
        provider: provider.name,
      });

      return {
        success: true,
        shipmentId: shipment.id,
        trackingNumber: shipmentData.trackingNumber ?? undefined,
        labelUrl: shipmentData.labelUrl ?? undefined,
        estimatedDelivery: shipmentData.estimatedDelivery ?? undefined,
        shippingCost: shipmentData.shippingCost ?? undefined,
        message: 'Shipment created successfully',
      };
    } catch (error) {
      logger.error('Error creating shipment:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create shipment',
      };
    }
  }

  /**
   * Track shipment status
   */
  async trackShipment(trackingNumber: string): Promise<{
    success: boolean;
    trackingInfo?: TrackingInfo[] | undefined;
    currentStatus?: string | undefined;
    estimatedDelivery?: Date | undefined;
    message: string;
  }> {
    try {
      const shipment = await prisma.shipment.findUnique({
        where: { trackingNumber },
        include: {
          logisticsProvider: true,
          order: {
            include: {
              trackingHistory: {
                orderBy: { timestamp: 'desc' },
              },
            },
          },
        },
      });

      if (!shipment) {
        return {
          success: false,
          message: 'Shipment not found',
        };
      }

      // Get latest tracking info from provider
      const providerTracking = await this.getProviderTracking(shipment.provider, trackingNumber);
      
      // Update local tracking history if new updates available
      if (providerTracking.length > 0) {
        await this.syncTrackingHistory(shipment.orderId, providerTracking);
      }

      // Get updated tracking history
      const trackingHistory = await prisma.orderTrackingHistory.findMany({
        where: { orderId: shipment.orderId },
        orderBy: { timestamp: 'desc' },
      });

      const trackingInfo = trackingHistory.map(history => ({
        trackingNumber,
        status: history.status,
        location: history.location ?? undefined,
        timestamp: history.timestamp,
        description: history.description ?? undefined,
        provider: history.provider ?? shipment.logisticsProvider?.name ?? shipment.provider,
        estimatedDelivery: shipment.estimatedDelivery ?? undefined,
        actualDelivery: shipment.actualDelivery ?? undefined,
      })) as TrackingInfo[];

      return {
        success: true,
        trackingInfo,
        currentStatus: shipment.status,
        estimatedDelivery: shipment.estimatedDelivery ?? undefined,
        message: 'Tracking information retrieved successfully',
      };
    } catch (error) {
      logger.error('Error tracking shipment:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to track shipment',
      };
    }
  }

  /**
   * Update shipment status
   */
  async updateShipmentStatus(
    trackingNumber: string,
    status: string,
    location?: string,
    description?: string,
    deliveryProof?: DeliveryProof
  ): Promise<{ success: boolean; message: string }> {
    try {
      const order = await prisma.order.findFirst({
        where: { trackingNumber },
      });

      if (!order) {
        return {
          success: false,
          message: 'Shipment not found',
        };
      }

      // Update shipment status
      const updateData: any = { status };
      
      if (status === 'delivered') {
        updateData.actualDelivery = new Date();
        if (deliveryProof) {
          updateData.deliveryProof = deliveryProof;
        }
      }

      await prisma.shipment.update({
        where: { trackingNumber },
        data: updateData,
      });

      // Update order status
      let orderStatus = 'processing';
      if (status === 'delivered') {
        orderStatus = 'delivered';
      } else if (status === 'shipped' || status === 'in_transit') {
        orderStatus = 'shipped';
      } else if (status === 'returned') {
        orderStatus = 'returned';
      }

      await prisma.order.update({
        where: { id: order.id },
        data: { 
          status: orderStatus,
          actualDelivery: status === 'delivered' ? new Date() : null,
        },
      });

      // Add tracking history
      await this.addTrackingHistory(order.id, {
        status,
        location,
        description,
        provider: 'Logistics Provider',
        timestamp: new Date(),
        providerTrackingId: trackingNumber,
      });

      logger.info('Shipment status updated:', {
        trackingNumber,
        status,
        location,
        orderId: order.id,
      });

      return {
        success: true,
        message: 'Shipment status updated successfully',
      };
    } catch (error) {
      logger.error('Error updating shipment status:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to update shipment status',
      };
    }
  }

  /**
   * Request return pickup
   */
  async requestReturnPickup(orderId: string, returnReason: string, pickupAddress?: ShippingAddress): Promise<{
    success: boolean;
    returnTrackingNumber?: string | undefined;
    pickupDate?: Date | undefined;
    message: string;
  }> {
    try {
      const shipment = await prisma.shipment.findUnique({
        where: { orderId },
      });

      if (!shipment) {
        return {
          success: false,
          message: 'Original shipment not found',
        };
      }

      if (shipment.status !== 'delivered') {
        return {
          success: false,
          message: 'Return can only be requested for delivered orders',
        };
      }

      // Create return shipment with provider
      const returnShipment = await this.createReturnShipment(shipment, returnReason, pickupAddress);

      if (!returnShipment.success) {
        return {
          success: false,
          message: returnShipment.message || 'Failed to create return shipment',
        };
      }

      // Update original shipment
      await prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          returnRequested: true,
          returnReason,
        },
      });

      // Update order status
      await prisma.order.update({
        where: { id: orderId },
        data: { status: 'return_requested' },
      });

      // Add tracking history
      await this.addTrackingHistory(orderId, {
        status: 'return_requested',
        description: `Return requested: ${returnReason}`,
        provider: (shipment.provider as any).name,
        timestamp: new Date(),
      });

      return {
        success: true,
        returnTrackingNumber: returnShipment.trackingNumber ?? undefined,
        pickupDate: returnShipment.pickupDate ?? undefined,
        message: 'Return pickup requested successfully',
      };
    } catch (error) {
      logger.error('Error requesting return pickup:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to request return pickup',
      };
    }
  }

  /**
   * Cancel shipment
   */
  async cancelShipment(trackingNumber: string, reason: string): Promise<{
    success: boolean;
    refundAmount?: number | undefined;
    message: string;
  }> {
    try {
      const shipment = await prisma.shipment.findUnique({
        where: { trackingNumber },
      });

      if (!shipment) {
        return {
          success: false,
          message: 'Shipment not found',
        };
      }

      if (shipment.status === 'delivered') {
        return {
          success: false,
          message: 'Cannot cancel delivered shipment',
        };
      }

      // Cancel with provider
      const cancellation = await this.cancelProviderShipment(shipment.provider, trackingNumber, reason);

      if (!cancellation.success) {
        return {
          success: false,
          message: cancellation.message || 'Failed to cancel shipment with provider',
        };
      }

      // Update shipment status
      await prisma.shipment.update({
        where: { trackingNumber },
        data: { status: 'cancelled' },
      });

      // Update order status
      await prisma.order.update({
        where: { id: shipment.orderId },
        data: { status: 'cancelled' },
      });

      // Add tracking history
      await this.addTrackingHistory(shipment.orderId, {
        status: 'cancelled',
        description: `Shipment cancelled: ${reason}`,
        provider: (shipment.provider as any).name,
        timestamp: new Date(),
      });

      return {
        success: true,
        refundAmount: cancellation.refundAmount ?? undefined,
        message: 'Shipment cancelled successfully',
      };
    } catch (error) {
      logger.error('Error cancelling shipment:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to cancel shipment',
      };
    }
  }

  /**
   * Get delivery proof
   */
  async getDeliveryProof(trackingNumber: string): Promise<{
    success: boolean;
    deliveryProof?: DeliveryProof;
    message: string;
  }> {
    try {
      const shipment = await prisma.shipment.findUnique({
        where: { trackingNumber },
      });

      if (!shipment) {
        return {
          success: false,
          message: 'Shipment not found',
        };
      }

      if (shipment.status !== 'delivered') {
        return {
          success: false,
          message: 'Delivery proof is only available for delivered shipments',
        };
      }

      const deliveryProof = shipment.deliveryProof ? JSON.parse(shipment.deliveryProof) as DeliveryProof : null;

      if (!deliveryProof) {
        return {
          success: false,
          message: 'Delivery proof not available',
        };
      }

      return {
        success: true,
        deliveryProof,
        message: 'Delivery proof retrieved successfully',
      };
    } catch (error) {
      logger.error('Error getting delivery proof:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get delivery proof',
      };
    }
  }

  // Private helper methods

  private async getProviderRates(provider: LogisticsProvider, request: RateCalculationRequest): Promise<ShippingRate[]> {
    // Mock implementation - in real scenario, this would call provider APIs
    const baseRate = this.calculateMockRate(request);
    
    return [
      {
        providerId: provider.id,
        providerName: provider.displayName,
        serviceType: 'standard',
        rate: baseRate,
        estimatedDays: 3,
        currency: 'INR',
      },
      {
        providerId: provider.id,
        providerName: provider.displayName,
        serviceType: 'express',
        rate: baseRate * 1.5,
        estimatedDays: 1,
        currency: 'INR',
      },
    ];
  }

  private calculateMockRate(request: RateCalculationRequest): number {
    const baseRate = 50;
    const weightRate = request.weight * 10;
    const volumeRate = (request.dimensions.length * request.dimensions.width * request.dimensions.height) / 1000 * 5;
    const codFee = request.codAmount ? request.codAmount * 0.02 : 0;
    
    return Math.round(baseRate + weightRate + volumeRate + codFee);
  }

  private async createProviderShipment(provider: any, request: CreateShipmentRequest): Promise<{
    success: boolean;
    trackingNumber?: string;
    labelUrl?: string;
    estimatedDelivery?: Date;
    shippingCost?: number;
    message?: string;
  }> {
    // Mock implementation - in real scenario, this would call provider APIs
    const trackingNumber = `${provider.name.toUpperCase()}-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 3);

    return {
      success: true,
      trackingNumber,
      labelUrl: `https://labels.${provider.name}.com/${trackingNumber}.pdf`,
      estimatedDelivery,
      shippingCost: this.calculateMockRate({
        fromPincode: request.pickupAddress.postalCode,
        toPincode: request.deliveryAddress.postalCode,
        weight: request.packageDetails.weight,
        dimensions: {
          length: request.packageDetails.length,
          width: request.packageDetails.width,
          height: request.packageDetails.height,
        },
        codAmount: request.codAmount ?? undefined,
      }),
    };
  }

  private async getProviderTracking(_provider: any, _trackingNumber: string): Promise<any[]> {
    // Mock implementation - in real scenario, this would call provider APIs
    return [
      {
        status: 'picked_up',
        location: 'Origin Hub',
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        description: 'Package picked up from seller',
      },
      {
        status: 'in_transit',
        location: 'Transit Hub',
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        description: 'Package in transit',
      },
    ];
  }

  private async syncTrackingHistory(orderId: string, providerTracking: any[]): Promise<void> {
    for (const tracking of providerTracking) {
      await this.addTrackingHistory(orderId, {
        status: tracking.status,
        location: tracking.location,
        description: tracking.description,
        timestamp: tracking.timestamp,
        provider: 'provider',
      });
    }
  }

  private async addTrackingHistory(orderId: string, tracking: {
    status: string;
    location?: string | undefined;
    description?: string | undefined;
    timestamp: Date;
    provider?: string | undefined;
    providerTrackingId?: string | undefined;
  }): Promise<void> {
    await prisma.orderTrackingHistory.create({
      data: {
        orderId,
        status: tracking.status,
        location: tracking.location ?? null,
        description: tracking.description ?? null,
        timestamp: tracking.timestamp,
        provider: tracking.provider ?? null,
        providerTrackingId: tracking.providerTrackingId ?? null,
      },
    });
  }

  private async createReturnShipment(originalShipment: any, _returnReason: string, _pickupAddress?: ShippingAddress): Promise<{
    success: boolean;
    trackingNumber?: string;
    pickupDate?: Date;
    message?: string;
  }> {
    // Mock implementation for return shipment
    const trackingNumber = `RET-${originalShipment.trackingNumber}`;
    const pickupDate = new Date();
    pickupDate.setDate(pickupDate.getDate() + 1);

    return {
      success: true,
      trackingNumber,
      pickupDate,
    };
  }

  private async cancelProviderShipment(_provider: any, _trackingNumber: string, _reason: string): Promise<{
    success: boolean;
    refundAmount?: number;
    message?: string;
  }> {
    // Mock implementation for shipment cancellation
    return {
      success: true,
      refundAmount: 50, // Mock refund amount
    };
  }
}

export const logisticsService = new LogisticsService();