# Vikareta Backend - Deployment Guide

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL 14+
- Redis 6+
- Elasticsearch 8+
- MinIO (optional, for file storage)

### Environment Setup

1. **Clone and Install**
```bash
git clone <repository-url>
cd vikareta-backend
npm install
```

2. **Environment Variables**
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

# Email (Optional)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"

# Payment Gateways
RAZORPAY_KEY_ID="your-razorpay-key"
RAZORPAY_KEY_SECRET="your-razorpay-secret"
CASHFREE_APP_ID="your-cashfree-app-id"
CASHFREE_SECRET_KEY="your-cashfree-secret"

# App Configuration
NODE_ENV="development"
PORT="5001"
API_VERSION="v1"
```

3. **Database Setup**
```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed database (optional)
npm run db:seed
```

4. **Start Services**
```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## 🐳 Docker Deployment

### Docker Compose (Recommended)

Create `docker-compose.yml`:
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "5001:5001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/vikareta
      - REDIS_HOST=redis
      - ELASTICSEARCH_URL=http://elasticsearch:9200
    depends_on:
      - db
      - redis
      - elasticsearch
    volumes:
      - ./uploads:/app/uploads

  db:
    image: postgres:14
    environment:
      - POSTGRES_DB=vikareta
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  elasticsearch:
    image: elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    ports:
      - "9200:9200"
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data

  minio:
    image: minio/minio
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data

volumes:
  postgres_data:
  redis_data:
  elasticsearch_data:
  minio_data:
```

### Deploy with Docker Compose
```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

## ☁️ Cloud Deployment

### AWS Deployment

1. **RDS (PostgreSQL)**
   - Create RDS PostgreSQL instance
   - Update DATABASE_URL in environment

2. **ElastiCache (Redis)**
   - Create Redis cluster
   - Update REDIS_HOST in environment

3. **OpenSearch (Elasticsearch)**
   - Create OpenSearch domain
   - Update ELASTICSEARCH_URL

4. **S3 (File Storage)**
   - Create S3 bucket
   - Configure MinIO environment variables

5. **ECS/EKS Deployment**
   - Build Docker image
   - Push to ECR
   - Deploy to ECS/EKS

### Environment Variables for Production
```env
NODE_ENV=production
DATABASE_URL="postgresql://user:pass@rds-endpoint:5432/vikareta"
REDIS_HOST="elasticache-endpoint"
ELASTICSEARCH_URL="https://opensearch-endpoint"
MINIO_ENDPOINT="s3.amazonaws.com"
# ... other production configs
```

## 🔧 Configuration

### Nginx Reverse Proxy
```nginx
server {
    listen 80;
    server_name api.vikareta.com;

    location / {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### PM2 Process Manager
```json
{
  "name": "vikareta-backend",
  "script": "dist/index.js",
  "instances": "max",
  "exec_mode": "cluster",
  "env": {
    "NODE_ENV": "production",
    "PORT": "5001"
  },
  "log_file": "logs/app.log",
  "error_file": "logs/error.log",
  "out_file": "logs/out.log",
  "log_date_format": "YYYY-MM-DD HH:mm:ss Z"
}
```

Start with PM2:
```bash
npm run build
pm2 start ecosystem.config.json
pm2 save
pm2 startup
```

## 📊 Monitoring & Health Checks

### Health Check Endpoints
- `GET /health` - Basic health check
- `GET /ready` - Readiness check (DB, Redis, Elasticsearch)
- `GET /metrics` - Application metrics

### Monitoring Setup
1. **Grafana Dashboard** - Import provided dashboard
2. **Prometheus Metrics** - Application metrics
3. **Log Aggregation** - Winston logs to ELK stack
4. **Error Tracking** - Sentry integration (optional)

## 🔒 Security Checklist

- [ ] Environment variables secured
- [ ] Database credentials rotated
- [ ] HTTPS enabled
- [ ] Rate limiting configured
- [ ] CORS properly set
- [ ] Input validation enabled
- [ ] Authentication middleware active
- [ ] File upload restrictions set
- [ ] Security headers configured

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

## 🚨 Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check DATABASE_URL format
   - Verify PostgreSQL is running
   - Check network connectivity

2. **Redis Connection Failed**
   - Verify Redis server is running
   - Check REDIS_HOST and REDIS_PORT
   - Test Redis connectivity

3. **Elasticsearch Not Available**
   - Check ELASTICSEARCH_URL
   - Verify Elasticsearch is running
   - Check cluster health

4. **File Upload Issues**
   - Check MinIO configuration
   - Verify bucket exists
   - Check file permissions

### Debug Mode
```bash
# Enable debug logging
DEBUG=* npm run dev

# Check specific module
DEBUG=vikareta:* npm run dev
```

### Log Files
- Application logs: `logs/app.log`
- Error logs: `logs/error.log`
- Access logs: `logs/access.log`

## 📈 Performance Optimization

### Production Optimizations
1. **Enable Redis caching**
2. **Configure Elasticsearch indices**
3. **Set up CDN for static files**
4. **Enable gzip compression**
5. **Configure connection pooling**
6. **Set up database read replicas**

### Scaling Considerations
- Horizontal scaling with load balancer
- Database sharding for large datasets
- Redis clustering for high availability
- Elasticsearch cluster for search performance
- CDN for global file distribution

## 🎯 Post-Deployment

### Initial Setup
1. Create admin user
2. Set up categories and subcategories
3. Configure payment gateways
4. Set up email templates
5. Initialize Elasticsearch indices
6. Configure monitoring alerts

### Maintenance
- Regular database backups
- Log rotation
- Security updates
- Performance monitoring
- Cache optimization

---

## 🏆 Success! 

Your Vikareta B2B Marketplace backend is now deployed and ready to serve millions of users!

For support, check the logs or contact the development team.