import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Environment validation schema
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.string().transform(Number).default(() => 3000),
  
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  
  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  
  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  
  // Session
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  
  // CORS
  ALLOWED_ORIGINS: z.string().default('https://vikareta.com,https://www.vikareta.com,https://dashboard.vikareta.com,https://admin.vikareta.com,https://api.vikareta.com'),
  
  // External APIs
  CASHFREE_CLIENT_ID: z.string().optional(),
  CASHFREE_CLIENT_SECRET: z.string().optional(),
  CASHFREE_ENV: z.enum(['SANDBOX', 'PRODUCTION']).default('SANDBOX'),
  CASHFREE_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  
  DIGILOCKER_CLIENT_ID: z.string().optional(),
  DIGILOCKER_CLIENT_SECRET: z.string().optional(),
  
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
  
  // Email
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform(Number).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  
  // SMS
  SMS_API_KEY: z.string().optional(),
  SMS_API_SECRET: z.string().optional(),
  
  // WhatsApp
  WHATSAPP_API_KEY: z.string().optional(),
  WHATSAPP_API_SECRET: z.string().optional(),
  
  // AWS S3
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('ap-south-1'),
  AWS_S3_BUCKET: z.string().optional(),
  
  // MinIO S3 Compatible Storage
  MINIO_ENDPOINT: z.string().optional(),
  MINIO_PORT: z.string().transform(Number).optional(),
  MINIO_USE_SSL: z.string().default('false').transform(val => val === 'true'),
  MINIO_ACCESS_KEY: z.string().optional(),
  MINIO_SECRET_KEY: z.string().optional(),
  MINIO_BUCKET_PREFIX: z.string().default('vikareta'),
  MINIO_REGION: z.string().default('us-east-1'),
  
  // Storage Configuration
  STORAGE_PROVIDER: z.enum(['aws', 'minio']).default('minio'),
  STORAGE_CDN_URL: z.string().optional(),
  
  // Elasticsearch
  ELASTICSEARCH_URL: z.string().default('http://localhost:9200'),
  ELASTICSEARCH_USERNAME: z.string().optional(),
  ELASTICSEARCH_PASSWORD: z.string().optional(),
  
  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  
  // APM/Tracing
  JAEGER_ENDPOINT: z.string().optional(),
  JAEGER_SERVICE_NAME: z.string().default('vikareta-backend'),
  
  // Security
  ENCRYPTION_KEY: z.string().optional(),
  SSL_CERT_DIR: z.string().optional(),
  HTTPS_PORT: z.string().transform(Number).optional(),
  
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default(() => 900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default(() => 100),
  AUTH_RATE_LIMIT_MAX: z.string().transform(Number).default(() => 5),
  PAYMENT_RATE_LIMIT_MAX: z.string().transform(Number).default(() => 10),
});

// Validate environment variables
const env = envSchema.parse(process.env);

export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  
  database: {
    url: env.DATABASE_URL,
  },
  
  redis: {
    url: env.REDIS_URL,
  },
  
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    refreshSecret: env.JWT_REFRESH_SECRET,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },
  
  session: {
    secret: env.SESSION_SECRET,
  },
  
  cors: {
    allowedOrigins: env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()),
  },
  
  cashfree: {
    clientId: env.CASHFREE_CLIENT_ID,
    clientSecret: env.CASHFREE_CLIENT_SECRET,
    environment: env.CASHFREE_ENV || env.CASHFREE_ENVIRONMENT,
    baseUrl: (env.CASHFREE_ENV === 'PRODUCTION' || env.CASHFREE_ENVIRONMENT === 'production')
      ? 'https://api.cashfree.com' 
      : 'https://sandbox.cashfree.com',
  },
  
  digilocker: {
    clientId: env.DIGILOCKER_CLIENT_ID,
    clientSecret: env.DIGILOCKER_CLIENT_SECRET,
    baseUrl: 'https://api.digitallocker.gov.in',
  },
  
  oauth: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackUrl: `http://localhost:${env.PORT}/auth/google/callback`,
    },
    
    linkedin: {
      clientId: env.LINKEDIN_CLIENT_ID,
      clientSecret: env.LINKEDIN_CLIENT_SECRET,
      callbackUrl: `http://localhost:${env.PORT}/auth/linkedin/callback`,
    },

    digilocker: {
      clientId: env.DIGILOCKER_CLIENT_ID,
      clientSecret: env.DIGILOCKER_CLIENT_SECRET,
      callbackUrl: `http://localhost:${env.PORT}/auth/digilocker/callback`,
    },
  },
  
  email: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
  
  sms: {
    apiKey: env.SMS_API_KEY,
    apiSecret: env.SMS_API_SECRET,
  },
  
  whatsapp: {
    apiKey: env.WHATSAPP_API_KEY,
    apiSecret: env.WHATSAPP_API_SECRET,
  },
  
  aws: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    region: env.AWS_REGION,
    s3Bucket: env.AWS_S3_BUCKET || 'vikareta-uploads',
  },
  
  minio: {
    endpoint: env.MINIO_ENDPOINT,
    port: env.MINIO_PORT,
    useSSL: env.MINIO_USE_SSL,
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY,
    bucketPrefix: env.MINIO_BUCKET_PREFIX,
    region: env.MINIO_REGION,
  },
  
  storage: {
    provider: env.STORAGE_PROVIDER,
    cdnUrl: env.STORAGE_CDN_URL,
  },
  
  elasticsearch: {
    url: env.ELASTICSEARCH_URL,
    auth: env.ELASTICSEARCH_USERNAME && env.ELASTICSEARCH_PASSWORD ? {
      username: env.ELASTICSEARCH_USERNAME,
      password: env.ELASTICSEARCH_PASSWORD,
    } : undefined,
  },
  
  logging: {
    level: env.LOG_LEVEL,
  },
  
  jaeger: {
    endpoint: env.JAEGER_ENDPOINT,
    serviceName: env.JAEGER_SERVICE_NAME,
  },
  
  security: {
    encryptionKey: env.ENCRYPTION_KEY,
    sslCertDir: env.SSL_CERT_DIR,
    httpsPort: env.HTTPS_PORT,
    rateLimiting: {
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
      authMaxRequests: env.AUTH_RATE_LIMIT_MAX,
      paymentMaxRequests: env.PAYMENT_RATE_LIMIT_MAX,
    },
  },
} as const;