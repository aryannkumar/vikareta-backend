export interface Service {
  id: string;
  provider_id: string;
  name: string;
  description?: string;
  base_price: number;
  original_price?: number;
  category: string;
  subcategory?: string;
  image_url?: string;
  images?: string[];
  available: boolean;
  delivery_time: string;
  service_type: 'one-time' | 'monthly' | 'project-based';
  tags?: string[];
  specifications?: Record<string, any>;
  rating: number;
  review_count: number;
  status: 'active' | 'inactive' | 'pending';
  created_at: Date;
  updated_at: Date;
}

export interface FeaturedService extends Service {
  provider_name: string;
  provider_location: string;
  provider_verified: boolean;
  provider_experience: string;
  promotion_type: 'standard' | 'premium' | 'creative';
  featured_until: Date;
  views: number;
  inquiries: number;
  bookings: number;
}

export interface CreateServiceData {
  provider_id: string;
  name: string;
  description?: string;
  base_price: number;
  original_price?: number;
  category: string;
  subcategory?: string;
  image_url?: string;
  images?: string[];
  delivery_time: string;
  service_type: 'one-time' | 'monthly' | 'project-based';
  tags?: string[];
  specifications?: Record<string, any>;
}