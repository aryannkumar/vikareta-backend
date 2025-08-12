import { executeQuery, executeSingle, generateId } from './database';
import { FeaturedProduct } from '../models/Product';
import { logger } from '../utils/logger';

export interface FeaturedProductFilters {
  limit?: number;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
}

export interface FeaturedProductStats {
  totalFeatured: number;
  activeFeatured: number;
  expiredFeatured: number;
  totalViews: number;
  totalClicks: number;
  conversionRate: number;
  byCategory: Record<string, number>;
}

export class FeaturedProductService {
  // Get all active featured products
  static async getFeaturedProducts(filters: FeaturedProductFilters = {}): Promise<{
    products: FeaturedProduct[];
    total: number;
    hasMore: boolean;
  }> {
    const { limit = 10, category, minPrice, maxPrice } = filters;
    
    let whereConditions = [
      'fp.status = "active"',
      'fp.featured_until > NOW()',
      'fp.payment_status = "completed"',
      'p.status = "active"'
    ];
    
    const params: any[] = [];
    
    if (category) {
      whereConditions.push('p.category = ?');
      params.push(category);
    }
    
    if (minPrice) {
      whereConditions.push('p.price >= ?');
      params.push(minPrice);
    }
    
    if (maxPrice) {
      whereConditions.push('p.price <= ?');
      params.push(maxPrice);
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM featured_products fp
      JOIN products p ON fp.product_id = p.id
      JOIN users u ON fp.supplier_id = u.id
      WHERE ${whereClause}
    `;
    
    const [countResult] = await executeQuery<{ total: number }>(countQuery, params);
    const total = countResult.total;
    
    // Get featured products
    const query = `
      SELECT 
        p.*,
        fp.promotion_type,
        fp.featured_until,
        fp.views,
        fp.clicks,
        fp.orders,
        u.company_name as supplier_name,
        u.location as supplier_location,
        u.verified as supplier_verified
      FROM featured_products fp
      JOIN products p ON fp.product_id = p.id
      JOIN users u ON fp.supplier_id = u.id
      WHERE ${whereClause}
      ORDER BY 
        CASE fp.promotion_type 
          WHEN 'premium' THEN 1 
          WHEN 'organic' THEN 2 
          ELSE 3 
        END,
        p.rating DESC,
        fp.created_at DESC
      LIMIT ?
    `;
    
    const products = await executeQuery<FeaturedProduct>(query, [...params, limit]);
    
    return {
      products,
      total,
      hasMore: total > limit
    };
  }

  // Get specific featured product
  static async getFeaturedProduct(id: string): Promise<FeaturedProduct | null> {
    const query = `
      SELECT 
        p.*,
        fp.promotion_type,
        fp.featured_until,
        fp.views,
        fp.clicks,
        fp.orders,
        u.company_name as supplier_name,
        u.location as supplier_location,
        u.verified as supplier_verified
      FROM featured_products fp
      JOIN products p ON fp.product_id = p.id
      JOIN users u ON fp.supplier_id = u.id
      WHERE p.id = ? 
        AND fp.status = 'active' 
        AND fp.featured_until > NOW()
        AND fp.payment_status = 'completed'
    `;
    
    const [product] = await executeQuery<FeaturedProduct>(query, [id]);
    return product || null;
  }

  // Promote a product
  static async promoteProduct(data: {
    productId: string;
    supplierId: string;
    promotionType: 'standard' | 'premium' | 'organic';
    duration: number;
    paymentAmount: number;
  }): Promise<string> {
    const id = generateId();
    const featuredUntil = new Date(Date.now() + data.duration * 24 * 60 * 60 * 1000);
    
    const query = `
      INSERT INTO featured_products (
        id, product_id, supplier_id, promotion_type, featured_until, 
        payment_amount, payment_status, status
      ) VALUES (?, ?, ?, ?, ?, ?, 'completed', 'active')
    `;
    
    await executeSingle(query, [
      id,
      data.productId,
      data.supplierId,
      data.promotionType,
      featuredUntil,
      data.paymentAmount
    ]);
    
    logger.info(`Product ${data.productId} promoted as ${data.promotionType} by supplier ${data.supplierId}`);
    return id;
  }

  // Remove featured status
  static async removeFeaturedStatus(productId: string, supplierId: string): Promise<void> {
    const query = `
      UPDATE featured_products 
      SET status = 'cancelled', updated_at = NOW()
      WHERE product_id = ? AND supplier_id = ? AND status = 'active'
    `;
    
    await executeSingle(query, [productId, supplierId]);
    logger.info(`Featured status removed for product ${productId} by supplier ${supplierId}`);
  }

  // Get statistics for supplier
  static async getStats(supplierId?: string): Promise<FeaturedProductStats> {
    let whereClause = 'fp.payment_status = "completed"';
    const params: any[] = [];
    
    if (supplierId) {
      whereClause += ' AND fp.supplier_id = ?';
      params.push(supplierId);
    }
    
    // Get main stats
    const statsQuery = `
      SELECT 
        COUNT(*) as total_featured,
        SUM(CASE WHEN fp.featured_until > NOW() AND fp.status = 'active' THEN 1 ELSE 0 END) as active_featured,
        SUM(CASE WHEN fp.featured_until <= NOW() OR fp.status != 'active' THEN 1 ELSE 0 END) as expired_featured,
        SUM(fp.views) as total_views,
        SUM(fp.clicks) as total_clicks,
        ROUND(AVG(CASE WHEN fp.clicks > 0 THEN (fp.orders / fp.clicks) * 100 ELSE 0 END), 2) as conversion_rate
      FROM featured_products fp
      WHERE ${whereClause}
    `;
    
    const [stats] = await executeQuery<{
      total_featured: number;
      active_featured: number;
      expired_featured: number;
      total_views: number;
      total_clicks: number;
      conversion_rate: number;
    }>(statsQuery, params);
    
    // Get category breakdown
    const categoryQuery = `
      SELECT p.category, COUNT(*) as count
      FROM featured_products fp
      JOIN products p ON fp.product_id = p.id
      WHERE ${whereClause}
      GROUP BY p.category
    `;
    
    const categoryStats = await executeQuery<{ category: string; count: number }>(categoryQuery, params);
    const byCategory = categoryStats.reduce((acc: Record<string, number>, item: { category: string; count: number }) => {
      acc[item.category] = item.count;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      totalFeatured: stats.total_featured || 0,
      activeFeatured: stats.active_featured || 0,
      expiredFeatured: stats.expired_featured || 0,
      totalViews: stats.total_views || 0,
      totalClicks: stats.total_clicks || 0,
      conversionRate: stats.conversion_rate || 0,
      byCategory
    };
  }

  // Track analytics
  static async trackEvent(
    productId: string,
    eventType: 'view' | 'click' | 'order',
    userId?: string,
    ipAddress?: string
  ): Promise<void> {
    // Update featured_products table
    const updateQuery = `
      UPDATE featured_products 
      SET ${eventType}s = ${eventType}s + 1, updated_at = NOW()
      WHERE product_id = ? AND status = 'active'
    `;
    
    await executeSingle(updateQuery, [productId]);
    
    // Insert into analytics table
    const analyticsQuery = `
      INSERT INTO analytics (id, entity_type, entity_id, event_type, user_id, ip_address)
      VALUES (?, 'featured_product', ?, ?, ?, ?)
    `;
    
    await executeSingle(analyticsQuery, [
      generateId(),
      productId,
      eventType,
      userId || null,
      ipAddress || null
    ]);
  }
}