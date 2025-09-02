import { executeQuery, executeSingle, generateId } from './database';
import { FeaturedService } from '../models/Service';
import { logger } from '../utils/logger';

export interface FeaturedServiceFilters {
  limit?: number;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  serviceType?: string;
}

export interface FeaturedServiceStats {
  totalFeatured: number;
  activeFeatured: number;
  expiredFeatured: number;
  totalViews: number;
  totalInquiries: number;
  conversionRate: number;
  averageRating: number;
  byCategory: Record<string, number>;
}

export class FeaturedServiceService {
  // Get all active featured services
  static async getFeaturedServices(filters: FeaturedServiceFilters = {}): Promise<{
    services: FeaturedService[];
    total: number;
    hasMore: boolean;
  }> {
    const { limit = 10, category, minPrice, maxPrice, serviceType } = filters;
    
    let whereConditions = [
      'fs.status = "active"',
      'fs.featured_until > NOW()',
      'fs.payment_status = "completed"',
      's.status = "active"'
    ];
    
    const params: any[] = [];
    
    if (category) {
      whereConditions.push('s.category = ?');
      params.push(category);
    }
    
    if (minPrice) {
      whereConditions.push('s.base_price >= ?');
      params.push(minPrice);
    }
    
    if (maxPrice) {
      whereConditions.push('s.base_price <= ?');
      params.push(maxPrice);
    }
    
    if (serviceType) {
      whereConditions.push('s.service_type = ?');
      params.push(serviceType);
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM featured_services fs
      JOIN services s ON fs.service_id = s.id
      JOIN users u ON fs.provider_id = u.id
      WHERE ${whereClause}
    `;
    
    const [countResult] = await executeQuery<{ total: number }>(countQuery, params);
    const total = countResult.total;
    
    // Get featured services
    const query = `
      SELECT 
        s.*,
        fs.promotion_type,
        fs.featured_until,
        fs.views,
        fs.inquiries,
        fs.bookings,
        u.company_name as provider_name,
        u.location as provider_location,
        u.verified as provider_verified,
        u.experience as provider_experience
      FROM featured_services fs
      JOIN services s ON fs.service_id = s.id
      JOIN users u ON fs.provider_id = u.id
      WHERE ${whereClause}
      ORDER BY 
        CASE fs.promotion_type 
          WHEN 'PREMIUM' THEN 1 
          WHEN 'creative' THEN 2 
          ELSE 3 
        END,
        s.rating DESC,
        fs.created_at DESC
      LIMIT ?
    `;
    
    const services = await executeQuery<FeaturedService>(query, [...params, limit]);
    
    return {
      services,
      total,
      hasMore: total > limit
    };
  }

  // Get specific featured service
  static async getFeaturedService(id: string): Promise<FeaturedService | null> {
    const query = `
      SELECT 
        s.*,
        fs.promotion_type,
        fs.featured_until,
        fs.views,
        fs.inquiries,
        fs.bookings,
        u.company_name as provider_name,
        u.location as provider_location,
        u.verified as provider_verified,
        u.experience as provider_experience
      FROM featured_services fs
      JOIN services s ON fs.service_id = s.id
      JOIN users u ON fs.provider_id = u.id
      WHERE s.id = ? 
        AND fs.status = 'active' 
        AND fs.featured_until > NOW()
        AND fs.payment_status = 'completed'
    `;
    
    const [service] = await executeQuery<FeaturedService>(query, [id]);
    return service || null;
  }

  // Promote a service
  static async promoteService(data: {
    serviceId: string;
    providerId: string;
    promotionType: 'VERIFIED' | 'PREMIUM' | 'creative';
    duration: number;
    paymentAmount: number;
  }): Promise<string> {
    const id = generateId();
    const featuredUntil = new Date(Date.now() + data.duration * 24 * 60 * 60 * 1000);
    
    const query = `
      INSERT INTO featured_services (
        id, service_id, provider_id, promotion_type, featured_until, 
        payment_amount, payment_status, status
      ) VALUES (?, ?, ?, ?, ?, ?, 'completed', 'active')
    `;
    
    await executeSingle(query, [
      id,
      data.serviceId,
      data.providerId,
      data.promotionType,
      featuredUntil,
      data.paymentAmount
    ]);
    
    logger.info(`Service ${data.serviceId} promoted as ${data.promotionType} by provider ${data.providerId}`);
    return id;
  }

  // Remove featured status
  static async removeFeaturedStatus(serviceId: string, providerId: string): Promise<void> {
    const query = `
      UPDATE featured_services 
      SET status = 'CANCELLED', updated_at = NOW()
      WHERE service_id = ? AND provider_id = ? AND status = 'active'
    `;
    
    await executeSingle(query, [serviceId, providerId]);
    logger.info(`Featured status removed for service ${serviceId} by provider ${providerId}`);
  }

  // Get statistics for provider
  static async getStats(providerId?: string): Promise<FeaturedServiceStats> {
    let whereClause = 'fs.payment_status = "completed"';
    const params: any[] = [];
    
    if (providerId) {
      whereClause += ' AND fs.provider_id = ?';
      params.push(providerId);
    }
    
    // Get main stats
    const statsQuery = `
      SELECT 
        COUNT(*) as total_featured,
        SUM(CASE WHEN fs.featured_until > NOW() AND fs.status = 'active' THEN 1 ELSE 0 END) as active_featured,
        SUM(CASE WHEN fs.featured_until <= NOW() OR fs.status != 'active' THEN 1 ELSE 0 END) as expired_featured,
        SUM(fs.views) as total_views,
        SUM(fs.inquiries) as total_inquiries,
        ROUND(AVG(CASE WHEN fs.inquiries > 0 THEN (fs.bookings / fs.inquiries) * 100 ELSE 0 END), 2) as conversion_rate,
        ROUND(AVG(s.rating), 1) as average_rating
      FROM featured_services fs
      JOIN services s ON fs.service_id = s.id
      WHERE ${whereClause}
    `;
    
    const [stats] = await executeQuery<{
      total_featured: number;
      active_featured: number;
      expired_featured: number;
      total_views: number;
      total_inquiries: number;
      conversion_rate: number;
      average_rating: number;
    }>(statsQuery, params);
    
    // Get category breakdown
    const categoryQuery = `
      SELECT s.category, COUNT(*) as count
      FROM featured_services fs
      JOIN services s ON fs.service_id = s.id
      WHERE ${whereClause}
      GROUP BY s.category
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
      totalInquiries: stats.total_inquiries || 0,
      conversionRate: stats.conversion_rate || 0,
      averageRating: stats.average_rating || 0,
      byCategory
    };
  }

  // Track analytics
  static async trackEvent(
    serviceId: string,
    eventType: 'view' | 'inquiry' | 'booking',
    userId?: string,
    ipAddress?: string
  ): Promise<void> {
    // Update featured_services table
    const updateQuery = `
      UPDATE featured_services 
      SET ${eventType === 'inquiry' ? 'inquiries' : eventType === 'booking' ? 'bookings' : 'views'} = 
          ${eventType === 'inquiry' ? 'inquiries' : eventType === 'booking' ? 'bookings' : 'views'} + 1, 
          updated_at = NOW()
      WHERE service_id = ? AND status = 'active'
    `;
    
    await executeSingle(updateQuery, [serviceId]);
    
    // Insert into analytics table
    const analyticsQuery = `
      INSERT INTO analytics (id, entity_type, entity_id, event_type, user_id, ip_address)
      VALUES (?, 'featured_service', ?, ?, ?, ?)
    `;
    
    await executeSingle(analyticsQuery, [
      generateId(),
      serviceId,
      eventType,
      userId || null,
      ipAddress || null
    ]);
  }
}