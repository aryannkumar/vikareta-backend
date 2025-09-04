# Vikareta B2B Marketplace Backend

A comprehensive B2B marketplace backend built with Node.js, TypeScript, Express, and modern technologies.

## 🚀 Features

### Core Functionality
- **User Management**: Registration, authentication, profiles, verification
- **Product Catalog**: Products, services, categories, variants, media
- **RFQ/Quote System**: Request for quotes, negotiations, deal management
- **Order Management**: Complete order lifecycle, tracking, fulfillment
- **Payment Processing**: Multiple gateways, wallet system, transactions
- **Inventory Management**: Stock tracking, warehouses, movements
- **Search & Discovery**: Elasticsearch-powered search with filters
- **Messaging System**: Internal communication between users
- **Support System**: Ticket management, customer support
- **Wishlist**: Save products, services, and businesses
- **Analytics**: Comprehensive business intelligence and reporting

### Technical Features
- **Real-time Updates**: WebSocket integration for live notifications
- **File Management**: MinIO for scalable file storage
- **Caching**: Redis for performance optimization
- **Search Engine**: Elasticsearch for advanced search capabilities
- **Job Scheduling**: Automated tasks and background processing
- **API Documentation**: Comprehensive REST API
- **Security**: JWT authentication, rate limiting, input validation
- **Monitoring**: Health checks, metrics, logging
- **Scalability**: Microservices-ready architecture

## 🛠 Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis
- **Search**: Elasticsearch
- **File Storage**: MinIO
- **Authentication**: JWT with 2FA support
- **Real-time**: Socket.IO
- **Job Queue**: Node-cron
- **Validation**: express-validator
- **Logging**: Winston
- **Monitoring**: Custom metrics + Grafana ready

## 📋 Prerequisites

- Node.js 18 or higher
- PostgreSQL 14 or higher
- Redis 6 or higher
- Elasticsearch 8 or higher
- MinIO (optional, for file storage)

## 🚀 Quick Start

### 1. Clone and Install
```bash
git clone <repository-url>
cd vikareta-backend
npm install
```

### 2. Environment Setup
Create `.env` file:
```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/vikareta"

# JWT
JWT_SECRET="your-super-secret-jwt-key"
JWT_EXPIRES_IN="7d"

# Redis
REDIS_HOST="localhost"
REDIS_PORT="6379"
REDIS_PASSWORD=""
REDIS_DB="0"

# Elasticsearch
ELASTICSEARCH_URL="http://localhost:9200"

# MinIO
MINIO_ENDPOINT="localhost"
MINIO_PORT="9000"
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"
MINIO_BUCKET_NAME="vikareta"

# App Configuration
NODE_ENV="development"
PORT="5001"
CORS_ORIGINS="http://localhost:3000"
```

### 3. Database Setup
```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed database (optional)
npm run db:seed
```

### 4. Start Development Server
```bash
npm run dev
```

The API will be available at `http://localhost:5001`

## 📚 API Documentation

### Base URL
```
http://localhost:5001/api/v1
```

### Authentication
All protected endpoints require a Bearer token:
```
Authorization: Bearer <your-jwt-token>
```

### Key Endpoints

#### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `POST /auth/logout` - User logout
- `POST /auth/refresh` - Refresh token
- `POST /auth/forgot-password` - Password reset

#### Products
- `GET /products` - List products
- `POST /products` - Create product
- `GET /products/:id` - Get product details
- `PUT /products/:id` - Update product
- `DELETE /products/:id` - Delete product

#### Services
- `GET /services` - List services
- `POST /services` - Create service
- `GET /services/:id` - Get service details
- `PUT /services/:id` - Update service
- `DELETE /services/:id` - Delete service

#### Orders
- `GET /orders` - List orders
- `POST /orders` - Create order
- `GET /orders/:id` - Get order details
- `PUT /orders/:id/status` - Update order status

#### Search
- `GET /search/products` - Search products
- `GET /search/services` - Search services
- `GET /search/global` - Global search
- `GET /search/suggestions` - Search suggestions

#### Wishlist
- `GET /wishlist` - Get user wishlist
- `POST /wishlist` - Add to wishlist
- `DELETE /wishlist/:id` - Remove from wishlist

### Response Format
All API responses follow this format:
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    // Response data
  }
}
```

Error responses:
```json
{
  "success": false,
  "error": "Error message",
  "details": [
    // Validation errors (if applicable)
  ]
}
```

## 🏗 Architecture

### Directory Structure
```
src/
├── config/          # Configuration files
├── controllers/     # Route controllers
├── middleware/      # Express middleware
├── routes/          # API routes
├── services/        # Business logic
├── jobs/           # Background jobs
├── utils/          # Utility functions
├── websocket/      # WebSocket handlers
└── index.ts        # Application entry point
```

### Key Services

#### ElasticsearchService
- Product/service indexing
- Advanced search queries
- Real-time search suggestions
- Analytics data

#### MinioService
- File upload/download
- Image processing
- Storage management
- CDN integration

#### NotificationService
- Multi-channel notifications (email, SMS, push, in-app)
- Template management
- Real-time delivery
- Notification preferences

#### AnalyticsService
- User analytics
- Business metrics
- Platform statistics
- Real-time tracking

#### JobScheduler
- Automated tasks
- Data synchronization
- Cleanup operations
- Report generation

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | development |
| `PORT` | Server port | 5001 |
| `DATABASE_URL` | PostgreSQL connection | - |
| `JWT_SECRET` | JWT signing secret | - |
| `REDIS_HOST` | Redis host | localhost |
| `REDIS_PORT` | Redis port | 6379 |
| `ELASTICSEARCH_URL` | Elasticsearch URL | http://localhost:9200 |
| `MINIO_ENDPOINT` | MinIO endpoint | localhost |
| `MINIO_PORT` | MinIO port | 9000 |

### Database Configuration
The application uses Prisma ORM with PostgreSQL. The schema is located in `prisma/schema.prisma`.

### Redis Configuration
Redis is used for:
- Session storage
- Caching
- Real-time notifications
- Job queues

### Elasticsearch Configuration
Elasticsearch provides:
- Product/service search
- Analytics
- Logging
- Metrics

## 🧪 Testing

### Run Tests
```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# Coverage report
npm run test:coverage
```

### API Testing
```bash
# Health check
curl http://localhost:5001/health

# API info
curl http://localhost:5001/api/v1

# Test authentication
curl -X POST http://localhost:5001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'
```

## 📊 Monitoring

### Health Checks
- `GET /health` - Service health status
- `GET /ready` - Readiness probe
- `GET /metrics` - Application metrics

### Logging
Logs are written to:
- Console (development)
- Files in `logs/` directory
- External logging service (production)

### Metrics
The application exposes metrics for:
- Request/response times
- Database queries
- Cache hit rates
- Job execution status
- System resources

## 🚀 Deployment

### Docker
```bash
# Build image
docker build -t vikareta-backend .

# Run container
docker run -p 5001:5001 vikareta-backend
```

### Docker Compose
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f app
```

### Production Deployment
1. Set environment variables
2. Run database migrations
3. Build the application
4. Start with PM2 or similar process manager

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for detailed deployment instructions.

## 🔒 Security

### Authentication
- JWT tokens with configurable expiration
- Refresh token rotation
- 2FA support
- Password hashing with bcrypt

### Authorization
- Role-based access control
- Resource-level permissions
- API rate limiting
- Input validation

### Security Headers
- Helmet.js for security headers
- CORS configuration
- XSS protection
- CSRF protection

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

### Code Style
- Use TypeScript
- Follow ESLint rules
- Write tests for new features
- Document API changes

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue on GitHub
- Check the documentation
- Review the API examples

## 🗺 Roadmap

### Upcoming Features
- [ ] GraphQL API
- [ ] Microservices architecture
- [ ] Advanced analytics dashboard
- [ ] Mobile app API
- [ ] Third-party integrations
- [ ] AI-powered recommendations

### Performance Improvements
- [ ] Database query optimization
- [ ] Caching strategies
- [ ] CDN integration
- [ ] Load balancing
- [ ] Auto-scaling

---

**Vikareta Backend** - Built with ❤️ for the B2B marketplace ecosystem.