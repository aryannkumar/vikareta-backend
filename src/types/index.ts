// Common types and interfaces

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
    requestId: string;
  };
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface JwtPayload {
  userId: string;
  email?: string;
  phone?: string;
  role?: string;
  verificationTier: string;
  iat?: number;
  exp?: number;
}

export interface SessionData {
  userId: string;
  email?: string;
  phone?: string;
  isAuthenticated: boolean;
  loginTime: number;
}

// External API response types
export interface CashfreeOrderResponse {
  cf_order_id: string;
  order_id: string;
  payment_session_id: string;
  order_status: string;
  order_amount: number;
  order_currency: string;
}

export interface DigiLockerProfile {
  name: string;
  dob: string;
  gender: string;
  aadhaar_last_4: string;
  mobile: string;
  email: string;
}

export interface GoogleProfile {
  id: string;
  email: string;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
  verified_email: boolean;
}

export interface LinkedInProfile {
  id: string;
  firstName: {
    localized: Record<string, string>;
  };
  lastName: {
    localized: Record<string, string>;
  };
  profilePicture?: {
    displayImage: string;
  };
}