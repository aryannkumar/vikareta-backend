/**
 * Order System Types
 * Comprehensive type definitions for the updated order system supporting both products and services
 */

export enum OrderType {
  PRODUCT = 'product',
  SERVICE = 'service'
}

export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded'
}

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded'
}

export enum ServiceOrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  RESCHEDULED = 'rescheduled'
}

export enum PaymentMethod {
  CREDIT_CARD = 'credit_card',
  DEBIT_CARD = 'debit_card',
  UPI = 'upi',
  NET_BANKING = 'net_banking',
  WALLET = 'wallet',
  COD = 'cod',
  EMI = 'emi'
}

export enum PaymentGateway {
  RAZORPAY = 'razorpay',
  CASHFREE = 'cashfree',
  PAYU = 'payu',
  STRIPE = 'stripe',
  PAYPAL = 'paypal'
}

export interface Address {
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  landmark?: string;
}

export interface OrderCreateRequest {
  orderType: OrderType;
  items: OrderItemRequest[];
  serviceOrders?: ServiceOrderRequest[];
  deliveryAddress?: Address;
  billingAddress?: Address;
  notes?: string;
  couponCode?: string;
  paymentMethod: PaymentMethod;
  paymentGateway: PaymentGateway;
}

export interface OrderItemRequest {
  productId: string;
  variantId?: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
}

export interface ServiceOrderRequest {
  serviceId: string;
  quantity: number;
  unitPrice: number;
  scheduledDate?: Date;
  duration?: string;
  location?: ServiceLocation;
  requirements?: string;
  customerNotes?: string;
}

export interface ServiceLocation {
  type: 'customer_location' | 'provider_location' | 'online';
  address?: Address;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  additionalInfo?: string;
}

export interface OrderResponse {
  id: string;
  orderNumber: string;
  orderType: OrderType;
  buyerId: string;
  sellerId: string;
  subtotal: number;
  taxAmount: number;
  shippingAmount: number;
  discountAmount: number;
  totalAmount: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryAddress?: Address;
  billingAddress?: Address;
  notes?: string;
  estimatedDelivery?: Date;
  actualDelivery?: Date;
  createdAt: Date;
  updatedAt: Date;
  
  // Relations
  buyer: {
    id: string;
    firstName?: string;
    lastName?: string;
    businessName?: string;
    email?: string;
    phone?: string;
  };
  seller: {
    id: string;
    firstName?: string;
    lastName?: string;
    businessName?: string;
    email?: string;
    phone?: string;
  };
  items: OrderItemResponse[];
  serviceOrders: ServiceOrderResponse[];
  payments: PaymentResponse[];
  statusHistory: OrderStatusHistoryResponse[];
  deliveryTracking?: DeliveryTrackingResponse;
}

export interface OrderItemResponse {
  id: string;
  productId: string;
  variantId?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  status: string;
  notes?: string;
  
  product: {
    id: string;
    title: string;
    description?: string;
    media: Array<{
      url: string;
      mediaType: string;
      altText?: string;
    }>;
  };
  variant?: {
    id: string;
    name: string;
    sku?: string;
  };
}

export interface ServiceOrderResponse {
  id: string;
  serviceId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  scheduledDate?: Date;
  completedDate?: Date;
  duration?: string;
  location?: ServiceLocation;
  requirements?: string;
  status: ServiceOrderStatus;
  providerNotes?: string;
  customerNotes?: string;
  createdAt: Date;
  updatedAt: Date;
  
  service: {
    id: string;
    title: string;
    description?: string;
    duration?: string;
    serviceType: string;
    media: Array<{
      url: string;
      mediaType: string;
      altText?: string;
    }>;
    provider: {
      id: string;
      firstName?: string;
      lastName?: string;
      businessName?: string;
    };
  };
}

export interface PaymentResponse {
  id: string;
  paymentMethod: PaymentMethod;
  paymentGateway: PaymentGateway;
  gatewayTransactionId?: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  failureReason?: string;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderStatusHistoryResponse {
  id: string;
  status: OrderStatus;
  notes?: string;
  updatedBy?: string;
  createdAt: Date;
}

export interface DeliveryTrackingResponse {
  id: string;
  trackingNumber?: string;
  carrier?: string;
  status: string;
  estimatedDelivery?: Date;
  actualDelivery?: Date;
  trackingUrl?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderUpdateRequest {
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  notes?: string;
  estimatedDelivery?: Date;
  actualDelivery?: Date;
}

export interface ServiceOrderUpdateRequest {
  status?: ServiceOrderStatus;
  scheduledDate?: Date;
  completedDate?: Date;
  providerNotes?: string;
  customerNotes?: string;
  location?: ServiceLocation;
}

export interface OrderFilters {
  orderType?: OrderType;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  buyerId?: string;
  sellerId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
}

export interface OrderListResponse {
  orders: OrderResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  filters: OrderFilters;
}

export interface OrderStats {
  totalOrders: number;
  totalRevenue: number;
  ordersByStatus: Record<OrderStatus, number>;
  ordersByType: Record<OrderType, number>;
  averageOrderValue: number;
  topProducts: Array<{
    productId: string;
    productTitle: string;
    orderCount: number;
    revenue: number;
  }>;
  topServices: Array<{
    serviceId: string;
    serviceTitle: string;
    orderCount: number;
    revenue: number;
  }>;
}

// Service-specific types
export enum ServiceType {
  ONE_TIME = 'one-time',
  RECURRING = 'recurring',
  SUBSCRIPTION = 'subscription'
}

export interface ServiceAvailability {
  days: string[]; // ['monday', 'tuesday', etc.]
  timeSlots: Array<{
    start: string; // '09:00'
    end: string;   // '17:00'
  }>;
  timezone: string;
  advanceBookingDays?: number;
  maxBookingsPerDay?: number;
}

export interface ServiceBookingRequest {
  serviceId: string;
  scheduledDate: Date;
  duration?: string;
  location?: ServiceLocation;
  requirements?: string;
  customerNotes?: string;
  quantity?: number;
}

export interface ServiceBookingResponse {
  id: string;
  orderId: string;
  serviceId: string;
  scheduledDate: Date;
  status: ServiceOrderStatus;
  confirmationCode: string;
  estimatedDuration?: string;
  location?: ServiceLocation;
  requirements?: string;
  service: {
    id: string;
    title: string;
    provider: {
      id: string;
      businessName?: string;
      phone?: string;
      email?: string;
    };
  };
}

// Error types
export class OrderError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'OrderError';
  }
}

export class PaymentError extends Error {
  constructor(
    message: string,
    public code: string,
    public gatewayError?: any,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

export class ServiceBookingError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'ServiceBookingError';
  }
}