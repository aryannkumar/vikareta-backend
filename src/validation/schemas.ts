import { z } from 'zod';

// Delivery Partner Schemas
export const createDeliveryPartnerSchema = z.object({
  name: z.string().min(2).max(100),
  code: z.string().regex(/^[A-Z0-9_-]{2,20}$/),
  contactEmail: z.string().email().optional(),
  active: z.boolean().optional().default(true)
});
export const updateDeliveryPartnerSchema = createDeliveryPartnerSchema.partial();
// Aliases matching route import naming convention
export const deliveryPartnerCreateSchema = createDeliveryPartnerSchema;
export const deliveryPartnerUpdateSchema = updateDeliveryPartnerSchema;

// Security Settings Schema
export const updateSecuritySettingsSchema = z.object({
  mfaEnabled: z.boolean().optional(),
  sessionTimeoutMinutes: z.number().int().min(5).max(24 * 60).optional(),
  ipWhitelist: z.array(z.string()).optional()
});
export const securitySettingsSchema = updateSecuritySettingsSchema;

// Notification Settings Schema
export const updateNotificationSettingsSchema = z.object({
  emailNotifications: z.boolean().optional(),
  smsNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional()
});
export const notificationSettingsSchema = updateNotificationSettingsSchema;

// Shipping Address Schema
export const shippingAddressCreateSchema = z.object({
  name: z.string().min(2).max(255),
  phone: z.string().min(5).max(20),
  addressLine1: z.string().min(5).max(255),
  addressLine2: z.string().max(255).optional().nullable(),
  city: z.string().min(2).max(100),
  state: z.string().min(2).max(100),
  postalCode: z.string().min(3).max(20),
  country: z.string().min(2).max(100).default('India').optional(),
  isDefault: z.boolean().optional()
});
export const shippingAddressUpdateSchema = shippingAddressCreateSchema.partial();

// Inventory Adjust Schema
export const inventoryAdjustSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  movementType: z.enum(['in', 'out', 'adjustment']),
  quantity: z.number().int().positive(),
  reason: z.string().min(3).max(255),
  notes: z.string().max(1000).optional()
});

// Auth Schemas
export const authRegisterSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().regex(/^[0-9+\-() ]{7,20}$/).optional(),
  password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Weak password'),
  firstName: z.string().min(2).max(50).optional(),
  lastName: z.string().min(2).max(50).optional(),
  businessName: z.string().min(2).max(100).optional(),
  userType: z.enum(['buyer', 'seller', 'business', 'both']),
  gstin: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/).optional(),
});
export const authLoginSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().regex(/^[0-9+\-() ]{7,20}$/).optional(),
  password: z.string().min(1),
}).refine(d => d.email || d.phone, { message: 'Email or phone required', path: ['email'] });
export const authForgotPasswordSchema = z.object({ email: z.string().email() });
export const authResetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Weak password'),
});
export const authChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Weak password'),
});
export const authSendOTPSchema = z.object({ phone: z.string().regex(/^[0-9+\-() ]{7,20}$/) });
export const authVerifyOTPSchema = z.object({
  phone: z.string().regex(/^[0-9+\-() ]{7,20}$/),
  otp: z.string().regex(/^\d{4,6}$/),
});
export const authVerify2FASchema = z.object({ token: z.string().length(6) });

// Generic pagination & sorting
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
});

export const productSortFields = ['price','createdAt','title'] as const;
export const orderSortFields = ['createdAt','totalAmount','status'] as const;
export const rfqSortFields = ['createdAt','budgetMax','expiresAt'] as const;
const sortEnum = (fields: readonly string[]) => z.string().refine(v => fields.includes(v.split(':')[0]), 'Invalid sort field');

export const sortQuerySchema = (fields: readonly string[]) => z.object({
  sort: sortEnum(fields).optional(),
});

// Product Schemas
export const productCreateSchema = z.object({
  title: z.string().min(2).max(255),
  description: z.string().min(5).max(5000),
  categoryId: z.string().uuid(),
  price: z.number().positive(),
  currency: z.string().length(3).default('INR').optional(),
  stock: z.number().int().nonnegative().default(0).optional(),
  attributes: z.record(z.string(), z.any()).optional(),
  sku: z.string().min(1).max(100).optional(),
  status: z.enum(['draft','active','inactive']).default('active').optional(),
});
export const productUpdateSchema = productCreateSchema.partial();
export const productIdParamsSchema = z.object({ id: z.string().uuid() });
export const productListQuerySchema = paginationQuerySchema.merge(sortQuerySchema(productSortFields)).extend({ q: z.string().min(1).max(255).optional() });

// Order Schemas
export const orderCreateSchema = z.object({
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().positive() })).min(1),
  shippingAddressId: z.string().uuid(),
  paymentMethod: z.enum(['cod','prepaid','wallet']).default('cod').optional(),
  notes: z.string().max(1000).optional(),
});
export const orderUpdateSchema = z.object({
  notes: z.string().max(1000).optional(),
});
export const orderStatusUpdateSchema = z.object({ status: z.enum(['pending','processing','shipped','delivered','cancelled','returned']) });
export const orderIdParamsSchema = z.object({ id: z.string().uuid() });
export const orderListQuerySchema = paginationQuerySchema.merge(sortQuerySchema(orderSortFields));
export const orderTrackingEventSchema = z.object({
  status: z.string().min(2).max(50),
  location: z.string().max(255).optional(),
  description: z.string().max(1000).optional(),
  provider: z.string().max(100).optional(),
  providerTrackingId: z.string().max(255).optional(),
  timestamp: z.string().datetime().optional(),
});
export const orderTrackingEventParamsSchema = z.object({ id: z.string().uuid() });

// Service Order (when orderType service)
export const serviceOrderCreateSchema = z.object({
  serviceId: z.string().uuid(),
  quantity: z.number().int().positive().default(1).optional(),
  unitPrice: z.number().positive(),
  scheduledDate: z.string().datetime().optional(),
  location: z.record(z.string(), z.any()).optional(),
  requirements: z.string().max(2000).optional(),
});

// Notification Preference Schemas
export const notificationPreferenceCreateSchema = z.object({
  channel: z.enum(['email','sms','push','in_app']),
  type: z.string().min(2).max(50),
  enabled: z.boolean().default(true).optional(),
});
export const notificationPreferenceUpdateSchema = notificationPreferenceCreateSchema.partial();
export const notificationPreferenceIdParamsSchema = z.object({ id: z.string().uuid() });
export const notificationPreferenceListQuerySchema = paginationQuerySchema.extend({
  channel: z.enum(['email','sms','push','in_app']).optional(),
  type: z.string().optional(),
  enabled: z.coerce.boolean().optional(),
});

// Notification Batch Schemas
export const notificationBatchCreateSchema = z.object({
  name: z.string().min(3).max(255),
  description: z.string().max(1000).optional(),
  type: z.string().min(2).max(50),
  channel: z.enum(['email','sms','push','in_app']).default('in_app').optional(),
  templateId: z.string().uuid().optional(),
  variables: z.record(z.string(), z.any()).optional(),
  userIds: z.array(z.string().uuid()).min(1).optional(),
  segment: z.object({
    // Simple segmentation filters (extend as needed)
    role: z.string().optional(),
    isVerified: z.boolean().optional(),
    country: z.string().optional(),
    userType: z.string().optional(),
  }).optional(),
  title: z.string().min(1).max(255),
  message: z.string().min(1).max(5000),
  scheduleAt: z.string().datetime().optional(),
});
export const notificationBatchIdParamsSchema = z.object({ id: z.string().uuid() });
export const notificationBatchListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['pending','processing','completed','failed']).optional(),
  type: z.string().optional(),
});

// Cart Schemas
export const cartAddItemSchema = z.object({
  productId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  quantity: z.number().int().positive().default(1),
  unitPrice: z.number().positive().optional(),
}).refine(d => d.productId || d.serviceId, { message: 'productId or serviceId required' });
export const cartUpdateItemSchema = z.object({
  quantity: z.number().int().positive().optional(),
  variantId: z.string().uuid().optional(),
});
export const cartItemIdParamsSchema = z.object({ itemId: z.string().uuid() });

// RFQ Schemas
export const rfqCreateSchema = z.object({
  title: z.string().min(3).max(255),
  description: z.string().min(5).max(5000),
  categoryId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unit: z.string().min(1).max(50),
  budgetMin: z.number().nonnegative().optional(),
  budgetMax: z.number().positive().optional(),
  expiresAt: z.string().datetime().optional(),
});
export const rfqUpdateSchema = rfqCreateSchema.partial();
export const rfqIdParamsSchema = z.object({ id: z.string().uuid() });
export const rfqListQuerySchema = paginationQuerySchema.merge(sortQuerySchema(rfqSortFields));

// Quote Schemas
export const quoteCreateSchema = z.object({
  rfqId: z.string().uuid(),
  items: z.array(z.object({ description: z.string().min(1), quantity: z.number().int().positive(), unitPrice: z.number().positive() })).min(1),
  validityDays: z.number().int().min(1).max(90).default(30).optional(),
  notes: z.string().max(1000).optional(),
});
export const quoteUpdateSchema = quoteCreateSchema.partial();
export const quoteIdParamsSchema = z.object({ id: z.string().uuid() });
export const quoteListQuerySchema = paginationQuerySchema.merge(sortQuerySchema(['createdAt','totalPrice'] as const));

// Payment Schemas
export const paymentCreateSchema = z.object({
  orderId: z.string().uuid(),
  provider: z.enum(['razorpay','cashfree']).default('razorpay').optional(),
  method: z.enum(['card','netbanking','upi','wallet','cod']).optional(),
  amount: z.number().positive(),
  currency: z.string().length(3).default('INR').optional(),
});
export const paymentVerifySchema = z.object({
  provider: z.enum(['razorpay','cashfree']),
  payload: z.record(z.string(), z.any()),
});
export const paymentIdParamsSchema = z.object({ id: z.string().uuid() });

// Support Ticket Schemas
export const supportTicketCreateSchema = z.object({
  subject: z.string().min(5).max(255),
  description: z.string().min(10).max(5000),
  category: z.enum(['technical','billing','general','account','product','service']),
  priority: z.enum(['low','medium','high','urgent']).optional(),
  relatedType: z.enum(['order','product','service','payment','account']).optional(),
  relatedId: z.string().uuid().optional(),
});
export const supportTicketUpdateSchema = supportTicketCreateSchema.partial();
export const supportTicketMessageSchema = z.object({ message: z.string().min(1).max(5000) });
export const supportTicketCloseSchema = z.object({ reason: z.string().max(500).optional() });
export const supportTicketIdParamsSchema = z.object({ id: z.string().uuid() });
export const supportTicketListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['open','in_progress','closed','resolved']).optional(),
  category: z.enum(['technical','billing','general','account','product','service']).optional(),
  priority: z.enum(['low','medium','high','urgent']).optional(),
});

// Wishlist Schemas
export const wishlistAddSchema = z.object({
  productId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  businessId: z.string().uuid().optional(),
}).refine(d => d.productId || d.serviceId || d.businessId, { message: 'One of productId, serviceId, businessId required' });
export const wishlistQuerySchema = paginationQuerySchema.extend({
  type: z.enum(['products','services','businesses']).optional(),
});
export const wishlistCheckQuerySchema = z.object({
  productId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  businessId: z.string().uuid().optional(),
}).refine(d => d.productId || d.serviceId || d.businessId, { message: 'Provide an id to check' });
export const wishlistItemIdParamsSchema = z.object({ itemId: z.string().uuid() });
export const wishlistLegacyProductParams = z.object({ productId: z.string().uuid() });
export const wishlistLegacyServiceParams = z.object({ serviceId: z.string().uuid() });
export const wishlistLegacyBusinessParams = z.object({ businessId: z.string().uuid() });

// Message Schemas
export const messageSendSchema = z.object({
  subject: z.string().min(1).max(255),
  content: z.string().min(1).max(10000),
  recipientId: z.string().uuid(),
  messageType: z.enum(['email','sms','notification','system']).optional(),
  priority: z.enum(['low','normal','high','urgent']).optional(),
  type: z.enum(['email','sms','notification','system']).optional(),
  relatedType: z.enum(['order','rfq','quote','customer','supplier','product','service']).optional(),
  relatedId: z.string().uuid().optional(),
});
export const messageListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['unread','read','replied','archived']).optional(),
  type: z.enum(['email','sms','notification','system']).optional(),
  relatedType: z.enum(['order','rfq','quote','customer','supplier','product','service']).optional(),
});
export const messageConversationParamsSchema = z.object({ otherUserId: z.string().uuid() });
export const messageIdParamsSchema = z.object({ id: z.string().uuid() });

// Deal Schemas
export const dealCreateSchema = z.object({
  title: z.string().min(5).max(255),
  description: z.string().max(2000).optional(),
  milestone: z.string().max(1000).optional(),
  discountType: z.enum(['percentage','fixed']),
  discountValue: z.number(),
  dealValue: z.number().optional(),
  buyerId: z.string().uuid().optional(),
  sellerId: z.string().uuid().optional(),
  rfqId: z.string().uuid().optional(),
  quoteId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  nextFollowUp: z.string().datetime().optional(),
});
export const dealUpdateSchema = dealCreateSchema.partial().extend({
  status: z.enum(['active','completed','cancelled']).optional(),
});
export const dealIdParamsSchema = z.object({ id: z.string().uuid() });
export const dealListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['active','completed','cancelled']).optional(),
  buyerId: z.string().uuid().optional(),
  sellerId: z.string().uuid().optional(),
});
export const dealMessageSchema = z.object({
  message: z.string().min(1).max(2000),
  messageType: z.enum(['text','file','image']).optional(),
});

// Inventory Warehouse & Query Schemas
export const inventoryListQuerySchema = paginationQuerySchema.extend({
  warehouseId: z.string().uuid().optional(),
  lowStock: z.coerce.boolean().optional(),
});
export const inventoryWarehouseCreateSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().max(1000).optional(),
  location: z.string().max(255).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  contactPerson: z.string().max(255).optional(),
  contactPhone: z.string().max(20).optional(),
  contactEmail: z.string().email().optional(),
});
export const inventoryMovementsQuerySchema = paginationQuerySchema.extend({
  productId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  movementType: z.enum(['in','out','adjustment']).optional(),
});

// Search Schemas
const baseSearchQuery = {
  q: z.string().min(1).max(255).optional(),
  category: z.string().min(1).max(100).optional(),
  subcategory: z.string().min(1).max(100).optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  location: z.string().min(1).max(255).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
};
export const searchProductsQuerySchema = z.object({
  ...baseSearchQuery,
  sortBy: z.enum(['relevance','price_low','price_high','newest','oldest','rating']).optional(),
});
export const searchServicesQuerySchema = z.object({
  ...baseSearchQuery,
  serviceType: z.enum(['one-time','recurring','subscription']).optional(),
  sortBy: z.enum(['relevance','price_low','price_high','newest','oldest','rating','popular']).optional(),
});
export const searchGlobalQuerySchema = z.object({
  q: z.string().min(1).max(255),
  type: z.enum(['products','services','businesses']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export const searchSuggestionsQuerySchema = z.object({
  q: z.string().min(2).max(255),
  type: z.enum(['all','products','services','categories','businesses']).optional(),
});
export const popularSearchesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

// User Schemas
export const userProfileUpdateSchema = z.object({
  firstName: z.string().min(2).max(50).optional(),
  lastName: z.string().min(2).max(50).optional(),
  businessName: z.string().min(2).max(100).optional(),
  bio: z.string().max(500).optional(),
  website: z.string().url().optional(),
  location: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
// Business profile update schema (JSON heavy fields kept flexible but validated at shallow level)
export const businessProfileUpdateSchema = z.object({
  companyName: z.string().min(2).max(150).optional(),
  businessType: z.string().max(100).optional(),
  industry: z.string().max(100).optional(),
  description: z.string().max(1000).optional(),
  logo: z.string().url().optional(),
  website: z.string().url().optional(),
  email: z.string().email().optional(),
  phone: z.string().min(5).max(20).optional(),
  address: z.object({
    street: z.string().max(255).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    postalCode: z.string().max(20).optional(),
  }).partial().optional(),
  taxInfo: z.object({
    taxId: z.string().max(50).optional(),
    gstNumber: z.string().max(20).optional(),
    panNumber: z.string().max(20).optional(),
  }).partial().optional(),
  bankDetails: z.object({
    accountName: z.string().max(150).optional(),
    accountNumber: z.string().max(50).optional(),
    bankName: z.string().max(150).optional(),
    ifscCode: z.string().max(20).optional(),
    swiftCode: z.string().max(20).optional(),
  }).partial().optional(),
  verification: z.object({
    isVerified: z.boolean().optional(),
    verificationLevel: z.string().max(50).optional(),
    documents: z.array(z.any()).optional(),
  }).partial().optional(),
  settings: z.object({
    allowPublicProfile: z.boolean().optional(),
    showContactInfo: z.boolean().optional(),
    autoAcceptOrders: z.boolean().optional(),
  }).partial().optional(),
});
export const userAddressCreateSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().min(5).max(20),
  addressLine1: z.string().min(5).max(255),
  addressLine2: z.string().max(255).optional(),
  city: z.string().min(2).max(100),
  state: z.string().min(2).max(100),
  postalCode: z.string().min(5).max(20),
  country: z.string().max(100).optional(),
  isDefault: z.boolean().optional(),
});
export const userAddressUpdateSchema = userAddressCreateSchema.partial();
export const addressIdParamsSchema = z.object({ id: z.string().uuid() });
export const userIdParamsSchema = z.object({ id: z.string().uuid() });
export const followUserParamsSchema = z.object({ userId: z.string().uuid() });
export const userSearchQuerySchema = paginationQuerySchema.merge(sortQuerySchema(['businessName','location','verificationTier','createdAt'] as const)).extend({
  q: z.string().min(2).max(100).optional(),
  userType: z.enum(['buyer','seller','both']).optional(),
  verificationTier: z.enum(['basic','verified','premium']).optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  isVerified: z.coerce.boolean().optional(),
});
export const userAdminListQuerySchema = paginationQuerySchema.merge(sortQuerySchema(['businessName','email','createdAt','verificationTier'] as const)).extend({
  userType: z.enum(['buyer','seller','both']).optional(),
  verificationTier: z.enum(['basic','verified','premium']).optional(),
  isVerified: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional(),
  search: z.string().optional(),
});
export const userVerifyBodySchema = z.object({
  verificationTier: z.enum(['basic','verified','premium']),
  notes: z.string().optional(),
});
export const userDeactivateBodySchema = z.object({
  reason: z.string().min(10).max(500),
});
export const toggleDeliveryPartnerParamsSchema = z.object({ id: z.string().uuid() });
export const toggleDeliveryPartnerBodySchema = z.object({ isActive: z.boolean() });
export const deliveryPartnerPreferenceParamsSchema = z.object({ partnerId: z.string().uuid() });

// Delivery Tracking Schemas
export const deliveryTrackingCreateSchema = z.object({
  trackingNumber: z.string().max(100).optional(),
  carrier: z.string().max(100).optional(),
  status: z.string().min(2).max(50).optional(),
  estimatedDelivery: z.string().datetime().optional(),
  trackingUrl: z.string().url().optional(),
  notes: z.string().max(500).optional(),
});
export const deliveryTrackingUpdateSchema = deliveryTrackingCreateSchema.partial();
export const deliveryTrackingParamsSchema = z.object({ id: z.string().uuid() });

// Service Order Status Update
export const serviceOrderStatusUpdateSchema = z.object({
  status: z.enum(['pending','confirmed','scheduled','in_progress','completed','cancelled']),
  scheduledDate: z.string().datetime().optional(),
  providerNotes: z.string().max(1000).optional(),
  customerNotes: z.string().max(1000).optional(),
});
export const serviceOrderIdParamsSchema = z.object({ id: z.string().uuid() });

// SSO Schemas
export const ssoInitSchema = z.object({
  targetApp: z.enum(['web', 'dashboard', 'admin']),
});
export const ssoExchangeSchema = z.object({
  token: z.string().min(10).max(500),
});

// Onboarding Schemas
export const onboardingProfileSchema = z.object({
  userType: z.enum(['buyer', 'seller', 'business', 'both']).optional(),
  firstName: z.string().min(2).max(50).optional(),
  lastName: z.string().min(2).max(50).optional(),
  businessName: z.string().min(2).max(100).optional(),
  bio: z.string().max(500).optional(),
  website: z.string().url().optional(),
  location: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  avatar: z.string().url().optional(),
});

export const onboardingBusinessSectionSchema = z.object({
  section: z.enum(['basic', 'tax', 'bank', 'documents', 'verification', 'settings']),
  data: z.record(z.string(), z.any()),
});

export const onboardingSectionParamsSchema = z.object({
  section: z.enum(['basic', 'tax', 'bank', 'documents', 'verification', 'settings']),
});
export const digilockerDocumentCreateSchema = z.object({
  docId: z.string().min(2).max(255),
  docType: z.string().min(2).max(100),
  docName: z.string().min(2).max(255),
  issuer: z.string().min(2).max(255),
  issueDate: z.string().datetime().optional(),
  expiryDate: z.string().datetime().optional(),
  documentData: z.record(z.string(), z.any()).optional(),
});
export const digilockerDocumentUpdateSchema = digilockerDocumentCreateSchema.partial().extend({
  verificationStatus: z.enum(['pending','verified','rejected']).optional(),
});
export const digilockerDocumentIdParamsSchema = z.object({ id: z.string().uuid() });

// Service Appointment Schemas
export const serviceAppointmentListQuerySchema = paginationQuerySchema.extend({
  serviceId: z.string().uuid().optional(),
  status: z.enum(['scheduled','in_progress','completed','cancelled']).optional(),
  providerId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export const serviceAppointmentIdParamsSchema = z.object({ id: z.string().uuid() });
export const serviceAppointmentStatusUpdateSchema = z.object({
  status: z.enum(['scheduled','in_progress','completed','cancelled']),
});
export const serviceAppointmentRescheduleSchema = z.object({
  scheduledDate: z.string().datetime(),
  duration: z.string().max(100).optional(),
});
export const serviceAppointmentCreateSchema = z.object({
  orderId: z.string().uuid(),
  serviceId: z.string().uuid(),
  scheduledDate: z.string().datetime(),
  duration: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
});

// Marketplace Query Schema
export const marketplaceQuerySchema = paginationQuerySchema.extend({
  location: z.string().optional(),
  category: z.string().optional(),
  radius: z.coerce.number().min(1).max(1000).optional(),
  sortBy: z.enum(['trending', 'rating', 'distance', 'price']).optional(),
  type: z.enum(['businesses', 'products', 'services']).optional(),
  q: z.string().min(1).max(255).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

// Business Document Upload Schema
export const businessDocumentUploadSchema = z.object({
  documentType: z.enum(['gst_certificate', 'pan_card', 'aadhar_card', 'business_license', 'address_proof', 'bank_statement', 'other']),
  documentUrl: z.string().url(),
  documentNumber: z.string().min(5).max(100).optional(),
  expiryDate: z.string().datetime().optional(),
  digilockerUri: z.string().optional(),
});
