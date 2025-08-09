-- Vikareta Database Schema for Featured Products and Services
-- This schema shows how real data would be stored instead of using mock data

-- Users table (suppliers and service providers)
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role ENUM('buyer', 'supplier', 'service_provider', 'admin') NOT NULL,
    company_name VARCHAR(255),
    phone VARCHAR(20),
    location VARCHAR(255),
    verified BOOLEAN DEFAULT FALSE,
    experience VARCHAR(50),
    avatar_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Products table (actual products from suppliers)
CREATE TABLE products (
    id VARCHAR(36) PRIMARY KEY,
    supplier_id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    original_price DECIMAL(10, 2),
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    image_url VARCHAR(500),
    images JSON, -- Array of image URLs
    in_stock BOOLEAN DEFAULT TRUE,
    min_order_quantity INT DEFAULT 1,
    tags JSON, -- Array of tags
    specifications JSON, -- Product specifications
    rating DECIMAL(3, 2) DEFAULT 0,
    review_count INT DEFAULT 0,
    status ENUM('active', 'inactive', 'pending') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_category (category),
    INDEX idx_supplier (supplier_id),
    INDEX idx_status (status)
);

-- Services table (actual services from providers)
CREATE TABLE services (
    id VARCHAR(36) PRIMARY KEY,
    provider_id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    base_price DECIMAL(10, 2) NOT NULL,
    original_price DECIMAL(10, 2),
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    image_url VARCHAR(500),
    images JSON, -- Array of image URLs
    available BOOLEAN DEFAULT TRUE,
    delivery_time VARCHAR(50), -- e.g., "3-7 days"
    service_type ENUM('one-time', 'monthly', 'project-based') NOT NULL,
    tags JSON, -- Array of tags
    specifications JSON, -- Service specifications
    rating DECIMAL(3, 2) DEFAULT 0,
    review_count INT DEFAULT 0,
    status ENUM('active', 'inactive', 'pending') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_category (category),
    INDEX idx_provider (provider_id),
    INDEX idx_status (status),
    INDEX idx_service_type (service_type)
);

-- Featured products table (when suppliers promote their products)
CREATE TABLE featured_products (
    id VARCHAR(36) PRIMARY KEY,
    product_id VARCHAR(36) NOT NULL,
    supplier_id VARCHAR(36) NOT NULL,
    promotion_type ENUM('standard', 'premium', 'organic') NOT NULL,
    featured_until TIMESTAMP NOT NULL,
    status ENUM('active', 'expired', 'cancelled') DEFAULT 'active',
    payment_amount DECIMAL(10, 2) NOT NULL,
    payment_status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
    views INT DEFAULT 0,
    clicks INT DEFAULT 0,
    orders INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (supplier_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_featured_until (featured_until),
    INDEX idx_status (status),
    INDEX idx_promotion_type (promotion_type),
    INDEX idx_supplier (supplier_id)
);

-- Featured services table (when providers promote their services)
CREATE TABLE featured_services (
    id VARCHAR(36) PRIMARY KEY,
    service_id VARCHAR(36) NOT NULL,
    provider_id VARCHAR(36) NOT NULL,
    promotion_type ENUM('standard', 'premium', 'creative') NOT NULL,
    featured_until TIMESTAMP NOT NULL,
    status ENUM('active', 'expired', 'cancelled') DEFAULT 'active',
    payment_amount DECIMAL(10, 2) NOT NULL,
    payment_status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
    views INT DEFAULT 0,
    inquiries INT DEFAULT 0,
    bookings INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_featured_until (featured_until),
    INDEX idx_status (status),
    INDEX idx_promotion_type (promotion_type),
    INDEX idx_provider (provider_id)
);

-- Analytics table for tracking performance
CREATE TABLE analytics (
    id VARCHAR(36) PRIMARY KEY,
    entity_type ENUM('featured_product', 'featured_service') NOT NULL,
    entity_id VARCHAR(36) NOT NULL,
    event_type ENUM('view', 'click', 'inquiry', 'order', 'booking') NOT NULL,
    user_id VARCHAR(36), -- Optional, for logged-in users
    ip_address VARCHAR(45),
    user_agent TEXT,
    referrer VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_event_type (event_type),
    INDEX idx_created_at (created_at)
);

-- Payment transactions for promotions
CREATE TABLE promotion_payments (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    entity_type ENUM('featured_product', 'featured_service') NOT NULL,
    entity_id VARCHAR(36) NOT NULL,
    promotion_type VARCHAR(50) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    payment_method VARCHAR(50),
    payment_gateway_id VARCHAR(255),
    status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_status (status),
    INDEX idx_entity (entity_type, entity_id)
);

-- Sample queries that would replace the mock data:

-- Get all active featured products
/*
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
WHERE fp.status = 'active' 
    AND fp.featured_until > NOW()
    AND fp.payment_status = 'completed'
ORDER BY 
    CASE fp.promotion_type 
        WHEN 'premium' THEN 1 
        WHEN 'organic' THEN 2 
        ELSE 3 
    END,
    p.rating DESC
LIMIT 10;
*/

-- Get all active featured services
/*
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
WHERE fs.status = 'active' 
    AND fs.featured_until > NOW()
    AND fs.payment_status = 'completed'
ORDER BY 
    CASE fs.promotion_type 
        WHEN 'premium' THEN 1 
        WHEN 'creative' THEN 2 
        ELSE 3 
    END,
    s.rating DESC
LIMIT 10;
*/

-- Get statistics for a supplier's featured products
/*
SELECT 
    COUNT(*) as total_featured,
    SUM(CASE WHEN fp.featured_until > NOW() THEN 1 ELSE 0 END) as active_featured,
    SUM(CASE WHEN fp.featured_until <= NOW() THEN 1 ELSE 0 END) as expired_featured,
    SUM(fp.views) as total_views,
    SUM(fp.clicks) as total_clicks,
    ROUND(AVG(CASE WHEN fp.clicks > 0 THEN (fp.orders / fp.clicks) * 100 ELSE 0 END), 2) as conversion_rate
FROM featured_products fp
WHERE fp.supplier_id = ? AND fp.payment_status = 'completed';
*/