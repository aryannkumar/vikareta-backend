export interface Product {
  id: string;
  supplier_id: string;
  name: string;
  description?: string;
  price: number;
  original_price?: number;
  category: string;
  subcategory?: string;
  image_url?: string;
  images?: string[];
  in_stock: boolean;
  min_order_quantity: number;
  tags?: string[];
  specifications?: Record<string, any>;
  rating: number;
  review_count: number;
  status: 'active' | 'inactive' | 'pending';
  created_at: Date;
  updated_at: Date;
}

export interface FeaturedProduct extends Product {
  supplier_name: string;
  supplier_location: string;
  supplier_verified: boolean;
  promotion_type: 'standard' | 'premium' | 'organic';
  featured_until: Date;
  views: number;
  clicks: number;
  orders: number;
}

export interface CreateProductData {
  supplier_id: string;
  name: string;
  description?: string;
  price: number;
  original_price?: number;
  category: string;
  subcategory?: string;
  image_url?: string;
  images?: string[];
  min_order_quantity?: number;
  tags?: string[];
  specifications?: Record<string, any>;
}