/**
 * Order Fulfillment Service
 * Handles automated order processing, shipment creation, and delivery partner integration
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';

export interface DeliveryPartner {
  id: string;
  name: string;
  apiEndpoint: string;
  apiKey: string;
  supportedServices: string[];
  isActive: boolean;
  priority: number;
}

export interface ShipmentRequest {
  orderId: string;
  pickupAddress: {
    name: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  deliveryAddress: {
    name: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  packageDetails: {
    weight: number;
    length: number;
    width: number;
    height: number;
    description: string;
    value: number;
  };
  serviceType: 'standard' | 'express' | 'overnight';
  paymentMode: 'prepaid' | 'cod';
}

export interface ShipmentResponse {
  success: boolean;
  trackingNumber?: string;
  awbNumber?: string;
  estimatedDelivery?: Date;
  shippingCost?: number;
  error?: string;
}

export class OrderFulfillmentService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Process order and create shipment automatically
   */
  async processOrder(orderId: string, sellerId: string): Promise<{
    success: boolean;
    shipment?: any;
    error?: string;
  }> {
    try {
      // Get order details with all necessary information
      const order = await this.prisma.order.findFirst({
        where: {
          id: orderId,
          sellerId: sellerId
        },
        include: {
          buyer: {
            select: {
              firstName: true,
              lastName: true,
              businessName: true,
              phone: true,
              email: true
            }
          },
          seller: {
            select: {
              firstName: true,
              lastName: true,
              businessName: true,
              phone: true,
              email: true,
              address: true,
              city: true,
              state: true,
              country: true,
              postalCode: true
            }
          },
          items: {
            include: {
              product: {
                select: {
                  title: true,
                  weight: true,
                  // dimensions: true,
                  price: true
                }
              }
            }
          }
        }
      });

      if (!order) {
        return {
          success: false,
          error: 'Order not found'
        };
      }

      // Check if order is in correct status for processing
      if (order.status !== 'confirmed') {
        return {
          success: false,
          error: `Order status must be 'confirmed' to process. Current status: ${order.status}`
        };
      }

      // Check if shipment already exists
      const existingShipment = await this.prisma.shipment.findFirst({
        where: { orderId }
      });

      if (existingShipment) {
        return {
          success: false,
          error: 'Shipment already exists for this order'
        };
      }

      // Get seller's preferred delivery partner
      const deliveryPartner = await this.getPreferredDeliveryPartner(sellerId, order.deliveryAddress);

      if (!deliveryPartner) {
        return {
          success: false,
          error: 'No delivery partner available for this location'
        };
      }

      // Calculate package details from order items
      // const packageDetails = this.calculatePackageDetails(order.items);

      // Prepare shipment request
      const shipmentRequest: ShipmentRequest = {
        orderId: order.id,
        pickupAddress: {
          name: 'Seller Name', // order.seller.businessName || `${order.seller.firstName} ${order.seller.lastName}`,
          phone: '', // order.seller.phone || '',
          addressLine1: '', // order.seller.address || '',
          city: '', // order.seller.city || '',
          state: '', // order.seller.state || '',
          postalCode: '', // order.seller.postalCode || '',
          country: 'India' // order.seller.country || 'India'
        },
        deliveryAddress: order.deliveryAddress as any,
        packageDetails: {
          weight: 1.0,
          length: 10,
          width: 10,
          height: 10,
          description: 'Order Package',
          value: Number(order.totalAmount)
        },
        serviceType: this.determineServiceType(Number(order.totalAmount)),
        paymentMode: order.paymentStatus === 'paid' ? 'prepaid' : 'cod'
      };

      // Create shipment with delivery partner
      const shipmentResponse = await this.createShipmentWithPartner(deliveryPartner, shipmentRequest);

      if (!shipmentResponse.success) {
        return {
          success: false,
          error: shipmentResponse.error || 'Failed to create shipment with delivery partner'
        };
      }

      // Create shipment record in database
      const shipment = await this.prisma.shipment.create({
        data: {
          orderId: order.id,
          trackingNumber: shipmentResponse.trackingNumber || this.generateTrackingNumber(),
          awbNumber: shipmentResponse.awbNumber,
          carrier: deliveryPartner.name,
          service: shipmentRequest.serviceType,
          status: 'pending',
          estimatedDelivery: shipmentResponse.estimatedDelivery,
          shippingCost: shipmentResponse.shippingCost || 0,
          pickupAddress: shipmentRequest.pickupAddress,
          deliveryAddress: shipmentRequest.deliveryAddress,
          packageDetails: shipmentRequest.packageDetails,
          providerId: deliveryPartner.id
        },
        include: {
          order: {
            select: {
              orderNumber: true,
              buyer: {
                select: {
                  firstName: true,
                  lastName: true,
                  businessName: true,
                  email: true
                }
              }
            }
          }
        }
      });

      // Update order status to 'processing'
      await this.prisma.order.update({
        where: { id: orderId },
        data: { 
          status: 'processing',
          updatedAt: new Date()
        }
      });

      // Create order status history
      await this.prisma.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: 'processing',
          notes: `Shipment created with ${deliveryPartner.name}. Tracking: ${shipment.trackingNumber}`,
          updatedBy: sellerId
        }
      });

      // Send notifications (implement as needed)
      await this.sendShipmentNotifications(order, shipment);

      logger.info(`Shipment created successfully for order ${order.orderNumber}`, {
        orderId: order.id,
        shipmentId: shipment.id,
        trackingNumber: shipment.trackingNumber,
        carrier: deliveryPartner.name
      });

      return {
        success: true,
        shipment: {
          id: shipment.id,
          trackingNumber: shipment.trackingNumber,
          awbNumber: shipment.awbNumber,
          carrier: shipment.carrier,
          service: shipment.service,
          status: shipment.status,
          estimatedDelivery: shipment.estimatedDelivery,
          shippingCost: shipment.shippingCost,
          createdAt: shipment.createdAt
        }
      };

    } catch (error) {
      logger.error('Error processing order for shipment:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Get preferred delivery partner for seller and location
   */
  private async getPreferredDeliveryPartner(sellerId: string, deliveryAddress: any): Promise<DeliveryPartner | null> {
    try {
      // First, check if seller has preferred delivery partners
      const sellerPreferences = await this.prisma.sellerDeliveryPreference.findMany({
        where: { sellerId },
        include: {
          deliveryPartner: true
        },
        orderBy: { priority: 'asc' }
      });

      if (sellerPreferences.length > 0) {
        for (const pref of sellerPreferences) {
          if (pref.deliveryPartner.isActive && this.isServiceAvailable(pref.deliveryPartner, deliveryAddress)) {
            return pref.deliveryPartner as DeliveryPartner;
          }
        }
      }

      // Fallback to default delivery partners
      const defaultPartners = await this.prisma.logisticsProvider.findMany({
        where: { 
          isActive: true,
          // Add location-based filtering if needed
        },
        orderBy: { priority: 'asc' }
      });

      if (defaultPartners.length > 0) {
        return {
          id: defaultPartners[0].id,
          name: defaultPartners[0].name,
          apiEndpoint: defaultPartners[0].apiEndpoint || '',
          apiKey: defaultPartners[0].apiKey || '',
          supportedServices: ['standard', 'express'],
          isActive: defaultPartners[0].isActive,
          priority: defaultPartners[0].priority
        };
      }

      return null;
    } catch (error) {
      logger.error('Error getting delivery partner:', error);
      return null;
    }
  }

  /**
   * Check if delivery service is available for the location
   */
  private isServiceAvailable(partner: any, deliveryAddress: any): boolean {
    // Implement location-based service availability check
    // For now, return true for all locations
    return true;
  }

  /**
   * Calculate package details from order items
   */
  private calculatePackageDetails(items: any[]): ShipmentRequest['packageDetails'] {
    let totalWeight = 0;
    let totalValue = 0;
    let maxLength = 0;
    let maxWidth = 0;
    let maxHeight = 0;
    const descriptions: string[] = [];

    items.forEach(item => {
      const product = item.product;
      const quantity = item.quantity;

      // Calculate weight
      const itemWeight = product.weight || 0.5; // Default 500g if not specified
      totalWeight += itemWeight * quantity;

      // Calculate value
      totalValue += Number(product.price) * quantity;

      // Calculate dimensions (assuming items are packed together)
      const dimensions = product.dimensions || { length: 20, width: 15, height: 10 };
      maxLength = Math.max(maxLength, dimensions.length || 20);
      maxWidth = Math.max(maxWidth, dimensions.width || 15);
      maxHeight += (dimensions.height || 10) * quantity; // Stack items

      descriptions.push(`${product.title} (${quantity})`);
    });

    return {
      weight: Math.max(totalWeight, 0.1), // Minimum 100g
      length: Math.max(maxLength, 10),
      width: Math.max(maxWidth, 10),
      height: Math.max(maxHeight, 5),
      description: descriptions.join(', '),
      value: totalValue
    };
  }

  /**
   * Determine service type based on order value and customer preferences
   */
  private determineServiceType(orderValue: number): 'standard' | 'express' | 'overnight' {
    if (orderValue > 10000) {
      return 'express'; // High value orders get express delivery
    } else if (orderValue > 5000) {
      return 'express';
    } else {
      return 'standard';
    }
  }

  /**
   * Create shipment with delivery partner API
   */
  private async createShipmentWithPartner(
    partner: DeliveryPartner, 
    request: ShipmentRequest
  ): Promise<ShipmentResponse> {
    try {
      // For demo purposes, simulate API call to delivery partner
      // In production, this would make actual API calls to partners like:
      // - Delhivery, Blue Dart, DTDC, Ecom Express, etc.

      const mockResponse = await this.simulateDeliveryPartnerAPI(partner, request);
      return mockResponse;

    } catch (error) {
      logger.error(`Error creating shipment with ${partner.name}:`, error);
      return {
        success: false,
        error: `Failed to create shipment with ${partner.name}`
      };
    }
  }

  /**
   * Simulate delivery partner API response
   * In production, replace with actual API integrations
   */
  private async simulateDeliveryPartnerAPI(
    partner: DeliveryPartner, 
    request: ShipmentRequest
  ): Promise<ShipmentResponse> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Generate mock tracking number
    const trackingNumber = this.generateTrackingNumber();
    const awbNumber = `AWB${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    // Calculate estimated delivery (2-7 days based on service type)
    const deliveryDays = request.serviceType === 'overnight' ? 1 : 
                        request.serviceType === 'express' ? 2 : 
                        Math.floor(Math.random() * 5) + 3;
    
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + deliveryDays);

    // Calculate shipping cost based on weight and service type
    const baseCost = request.packageDetails.weight * 50; // ₹50 per kg
    const serviceMultiplier = request.serviceType === 'overnight' ? 3 : 
                             request.serviceType === 'express' ? 2 : 1;
    const shippingCost = baseCost * serviceMultiplier;

    return {
      success: true,
      trackingNumber,
      awbNumber,
      estimatedDelivery,
      shippingCost: Math.round(shippingCost)
    };
  }

  /**
   * Generate tracking number
   */
  private generateTrackingNumber(): string {
    const prefix = 'VKR';
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.random().toString(36).substr(2, 4).toUpperCase();
    return `${prefix}${timestamp}${random}`;
  }

  /**
   * Send shipment notifications to buyer and seller
   */
  private async sendShipmentNotifications(order: any, shipment: any): Promise<void> {
    try {
      // Create notifications for buyer
      await this.prisma.notification.create({
        data: {
          userId: order.buyerId,
          title: 'Order Shipped',
          message: `Your order ${order.orderNumber} has been shipped. Tracking: ${shipment.trackingNumber}`,
          type: 'order_shipped',
          data: {
            orderId: order.id,
            trackingNumber: shipment.trackingNumber,
            carrier: shipment.carrier
          }
        }
      });

      // Create notifications for seller
      await this.prisma.notification.create({
        data: {
          userId: order.sellerId,
          title: 'Shipment Created',
          message: `Shipment created for order ${order.orderNumber}. Tracking: ${shipment.trackingNumber}`,
          type: 'shipment_created',
          data: {
            orderId: order.id,
            trackingNumber: shipment.trackingNumber,
            carrier: shipment.carrier
          }
        }
      });

      logger.info(`Shipment notifications sent for order ${order.orderNumber}`);
    } catch (error) {
      logger.error('Error sending shipment notifications:', error);
    }
  }

  /**
   * Update shipment status from delivery partner webhook
   */
  async updateShipmentStatus(
    trackingNumber: string, 
    status: string, 
    location?: string, 
    timestamp?: Date
  ): Promise<void> {
    try {
      const shipment = await this.prisma.shipment.findFirst({
        where: { trackingNumber },
        include: { order: true }
      });

      if (!shipment) {
        logger.warn(`Shipment not found for tracking number: ${trackingNumber}`);
        return;
      }

      // Update shipment status
      await this.prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          status,
          updatedAt: new Date(),
          ...(status === 'delivered' && { deliveredAt: timestamp || new Date() })
        }
      });

      // Update order status if delivered
      if (status === 'delivered') {
        await this.prisma.order.update({
          where: { id: shipment.orderId },
          data: { status: 'delivered' }
        });

        // Create order status history
        await this.prisma.orderStatusHistory.create({
          data: {
            orderId: shipment.orderId,
            status: 'delivered',
            notes: `Package delivered at ${location || 'destination'}`,
            updatedBy: 'system'
          }
        });
      }

      logger.info(`Shipment status updated: ${trackingNumber} -> ${status}`);
    } catch (error) {
      logger.error('Error updating shipment status:', error);
    }
  }

  /**
   * Get shipment tracking details
   */
  async getShipmentTracking(trackingNumber: string): Promise<any> {
    try {
      const shipment = await this.prisma.shipment.findFirst({
        where: { trackingNumber },
        include: {
          order: {
            select: {
              orderNumber: true,
              buyer: {
                select: {
                  firstName: true,
                  lastName: true,
                  businessName: true
                }
              }
            }
          }
        }
      });

      if (!shipment) {
        return null;
      }

      // In production, fetch real-time tracking from delivery partner API
      const trackingHistory = await this.getTrackingHistory(trackingNumber);

      return {
        trackingNumber: shipment.trackingNumber,
        awbNumber: shipment.awbNumber,
        status: shipment.status,
        carrier: shipment.carrier,
        estimatedDelivery: shipment.estimatedDelivery,
        deliveredAt: shipment.deliveredAt,
        order: {
          orderNumber: shipment.order.orderNumber,
          customer: shipment.order.buyer.businessName || 
                   `${shipment.order.buyer.firstName} ${shipment.order.buyer.lastName}`
        },
        trackingHistory
      };
    } catch (error) {
      logger.error('Error getting shipment tracking:', error);
      return null;
    }
  }

  /**
   * Get tracking history from delivery partner
   */
  private async getTrackingHistory(trackingNumber: string): Promise<any[]> {
    // Mock tracking history - in production, fetch from delivery partner API
    return [
      {
        status: 'Order Confirmed',
        location: 'Origin Hub',
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        description: 'Order has been confirmed and is being prepared for shipment'
      },
      {
        status: 'Picked Up',
        location: 'Seller Location',
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        description: 'Package has been picked up from seller'
      },
      {
        status: 'In Transit',
        location: 'Transit Hub',
        timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000),
        description: 'Package is in transit to destination'
      }
    ];
  }
}