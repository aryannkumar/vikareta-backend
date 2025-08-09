import { z } from 'zod';

// Common validation patterns
const phoneRegex = /^[+]?[1-9][\d\s\-\(\)]{7,15}$/;
const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// User registration validation schema
export const registerSchema = z.object({
  email: z.string().email('Invalid email format').optional(),
  phone: z.string().regex(phoneRegex, 'Invalid phone number format').optional(),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  firstName: z.string().min(1, 'First name is required').max(100, 'First name too long').optional(),
  lastName: z.string().min(1, 'Last name is required').max(100, 'Last name too long').optional(),
  businessName: z.string().min(1, 'Business name is required').max(255, 'Business name too long').optional(),
  gstin: z.string().regex(gstinRegex, 'Invalid GSTIN format').optional(),
}).refine(
  (data) => data.email || data.phone,
  {
    message: 'Either email or phone number is required',
    path: ['email', 'phone'],
  }
);

// User login validation schema
export const loginSchema = z.object({
  email: z.string().email('Invalid email format').optional(),
  phone: z.string().regex(phoneRegex, 'Invalid phone number format').optional(),
  password: z.string().min(1, 'Password is required'),
}).refine(
  (data) => data.email || data.phone,
  {
    message: 'Either email or phone number is required',
    path: ['email', 'phone'],
  }
);

// Refresh token validation schema
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// OTP verification schema (for future use)
export const otpVerificationSchema = z.object({
  email: z.string().email('Invalid email format').optional(),
  phone: z.string().regex(phoneRegex, 'Invalid phone number format').optional(),
  otp: z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must contain only digits'),
}).refine(
  (data) => data.email || data.phone,
  {
    message: 'Either email or phone number is required',
    path: ['email', 'phone'],
  }
);

// Password reset request schema
export const passwordResetRequestSchema = z.object({
  email: z.string().email('Invalid email format').optional(),
  phone: z.string().regex(phoneRegex, 'Invalid phone number format').optional(),
}).refine(
  (data) => data.email || data.phone,
  {
    message: 'Either email or phone number is required',
    path: ['email', 'phone'],
  }
);

// Password reset confirmation schema
export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
});

// User profile update schema
export const updateProfileSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100, 'First name too long').optional(),
  lastName: z.string().min(1, 'Last name is required').max(100, 'Last name too long').optional(),
  businessName: z.string().min(1, 'Business name is required').max(255, 'Business name too long').optional(),
  gstin: z.string().regex(gstinRegex, 'Invalid GSTIN format').optional(),
});

// Validation helper function
export const validateRequest = <T>(schema: z.ZodSchema<T>, data: unknown): T => {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.issues.map((err: z.ZodIssue) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      
      const validationError = new Error('Validation failed');
      (validationError as any).code = 'VALIDATION_ERROR';
      (validationError as any).details = formattedErrors;
      throw validationError;
    }
    throw error;
  }
};

// Individual validation functions
export const validateEmail = (email: string): boolean => {
  return z.string().email().safeParse(email).success;
};

export const validatePhone = (phone: string): boolean => {
  return phoneRegex.test(phone);
};

export const validateGSTIN = (gstin: string): boolean => {
  return gstinRegex.test(gstin);
};

// XSS-safe string validation
const xssSafeString = (fieldName: string, minLength = 1, maxLength = 255) => 
  z.string()
    .min(minLength, `${fieldName} must be at least ${minLength} characters`)
    .max(maxLength, `${fieldName} must not exceed ${maxLength} characters`)
    .refine(
      (val) => !/<script|javascript:|vbscript:|on\w+\s*=|<iframe|<object|<embed/gi.test(val),
      `${fieldName} contains potentially dangerous content`
    )
    .transform((val) => val.trim());

// Product validation schemas
export const createProductSchema = z.object({
  title: xssSafeString('Title', 3, 255),
  description: xssSafeString('Description', 0, 5000).optional(),
  categoryId: z.string().uuid('Category ID must be a valid UUID'),
  subcategoryId: z.string().uuid('Subcategory ID must be a valid UUID').optional(),
  price: z.number().min(0, 'Price must be non-negative'),
  currency: z.enum(['INR', 'USD', 'EUR']).default('INR'),
  stockQuantity: z.number().int().min(0, 'Stock quantity must be non-negative').optional(),
  minOrderQuantity: z.number().int().min(1, 'Minimum order quantity must be at least 1').optional(),
  isService: z.boolean().default(false),
  variants: z.array(z.object({
    name: xssSafeString('Variant name', 1, 100),
    value: xssSafeString('Variant value', 1, 100),
    priceAdjustment: z.number().optional(),
    stockQuantity: z.number().int().min(0).optional(),
  })).optional(),
});

export const updateProductSchema = z.object({
  title: xssSafeString('Title', 3, 255).optional(),
  description: xssSafeString('Description', 0, 5000).optional(),
  categoryId: z.string().uuid('Category ID must be a valid UUID').optional(),
  subcategoryId: z.string().uuid('Subcategory ID must be a valid UUID').optional(),
  price: z.number().min(0, 'Price must be non-negative').optional(),
  stockQuantity: z.number().int().min(0, 'Stock quantity must be non-negative').optional(),
  status: z.enum(['active', 'inactive', 'draft']).optional(),
});

export const productVariantSchema = z.object({
  name: xssSafeString('Variant name', 1, 100),
  value: xssSafeString('Variant value', 1, 100),
  priceAdjustment: z.number().optional(),
  stockQuantity: z.number().int().min(0).optional(),
});

export const productMediaSchema = z.object({
  mediaType: z.enum(['image', 'video', 'document']),
  url: z.string().url('URL must be valid'),
  altText: xssSafeString('Alt text', 0, 255).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// Wallet validation schemas with enhanced security
export const walletFundSchema = z.object({
  amount: z.number().min(1, 'Amount must be at least ₹1').max(100000, 'Amount cannot exceed ₹1,00,000'),
  currency: z.string().default('INR'),
  customerDetails: z.object({
    customerName: xssSafeString('Customer name', 1, 100),
    customerEmail: z.string().email('Invalid email format').optional(),
    customerPhone: z.string().regex(phoneRegex, 'Invalid phone number format').optional(),
  }),
  returnUrl: z.string().url('Return URL must be valid').optional(),
});

export const walletWithdrawSchema = z.object({
  amount: z.number().min(100, 'Minimum withdrawal amount is ₹100').max(500000, 'Maximum withdrawal amount is ₹5,00,000'),
  withdrawalMethod: z.enum(['bank_transfer', 'upi']),
  bankDetails: z.object({
    accountNumber: z.string().min(8).max(20).regex(/^\d+$/, 'Account number must contain only digits'),
    ifscCode: z.string().length(11).regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code format'),
    accountHolderName: xssSafeString('Account holder name', 1, 100),
  }).optional(),
  upiId: z.string().regex(/^[\w.-]+@[\w.-]+$/, 'Invalid UPI ID format').optional(),
}).refine(
  (data) => {
    if (data.withdrawalMethod === 'bank_transfer') return !!data.bankDetails;
    if (data.withdrawalMethod === 'upi') return !!data.upiId;
    return false;
  },
  {
    message: 'Bank details required for bank transfer, UPI ID required for UPI transfer',
  }
);

// Type exports for TypeScript
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type OtpVerificationInput = z.infer<typeof otpVerificationSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductVariantInput = z.infer<typeof productVariantSchema>;
export type ProductMediaInput = z.infer<typeof productMediaSchema>;
export type WalletFundInput = z.infer<typeof walletFundSchema>;
export type WalletWithdrawInput = z.infer<typeof walletWithdrawSchema>;