export interface PaymentGateway {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  status: 'active' | 'inactive';
  config: Record<string, any>;
}

export interface PaymentRequest {
  orderId: string;
  amount: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  description?: string;
  returnUrl: string;
  notifyUrl: string;
  metadata?: Record<string, any>;
}

export interface PaymentResponse {
  success: boolean;
  paymentId?: string;
  orderId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'success' | 'failed';
  gatewayResponse?: any;
  redirectUrl?: string;
  message?: string;
  error?: string;
}

export interface PaymentVerificationRequest {
  paymentId: string;
  orderId: string;
  signature?: string;
  additionalData?: Record<string, any>;
}

export interface PaymentOrder {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  paymentGateway: string;
  status: 'created' | 'pending' | 'success' | 'failed' | 'cancelled';
  paymentId?: string;
  transactionId?: string;
  gatewayOrderId?: string;
  customerDetails: {
    name: string;
    email: string;
    phone: string;
  };
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface WhatsAppMessage {
  to: string;
  type: 'text' | 'template';
  content: string | WhatsAppTemplate;
}

export interface WhatsAppTemplate {
  name: string;
  language: string;
  components: WhatsAppComponent[];
}

export interface WhatsAppComponent {
  type: 'header' | 'body' | 'footer' | 'button';
  parameters?: WhatsAppParameter[];
}

export interface WhatsAppParameter {
  type: 'text' | 'currency' | 'date_time';
  text?: string;
  currency?: {
    fallback_value: string;
    code: string;
    amount_1000: number;
  };
  date_time?: {
    fallback_value: string;
  };
}

export interface RFQRequest {
  id?: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  category: string;
  subcategory?: string;
  productName: string;
  description: string;
  quantity: number;
  unit: string;
  targetPrice?: number;
  deliveryLocation: string;
  timeline: string;
  specifications?: string;
  attachments?: string[];
  status?: 'open' | 'quoted' | 'closed' | 'cancelled';
  createdAt?: Date;
  updatedAt?: Date;
  buyerId: string;
}

export interface RFQQuote {
  id?: string;
  rfqId: string;
  supplierId: string;
  supplierName: string;
  supplierEmail: string;
  supplierPhone: string;
  quotedPrice: number;
  totalPrice: number;
  deliveryTime: string;
  validUntil: Date;
  terms: string;
  specifications?: string;
  attachments?: string[];
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  createdAt?: Date;
  updatedAt?: Date;
}

export interface OrderNotification {
  orderId: string;
  buyerId: string;
  supplierId?: string;
  type: 'order_placed' | 'order_confirmed' | 'order_shipped' | 'order_delivered' | 'payment_received' | 'rfq_received' | 'quote_received';
  status: string;
  message: string;
  additionalData?: Record<string, any>;
}