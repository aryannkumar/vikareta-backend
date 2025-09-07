import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Environment validation schema
const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default(5001),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Database
  DATABASE_URL: z.string(),

  // Redis
  REDIS_URL: z.string(),
  REDIS_PASSWORD: z.string().optional(),

  // MinIO
  MINIO_ENDPOINT: z.string(),
  MINIO_PORT: z.string().transform(Number).default(9000),
  MINIO_ACCESS_KEY: z.string(),
  MINIO_SECRET_KEY: z.string(),
  MINIO_USE_SSL: z.string().transform(val => val === 'true').default(false),
  MINIO_BUCKET_NAME: z.string().default('vikareta-uploads'),
  MINIO_REGION: z.string().default('us-east-1'),
  MINIO_PUBLIC_URL: z.string().optional(),

  // Elasticsearch
  ELASTICSEARCH_URL: z.string(),
  ELASTICSEARCH_USERNAME: z.string().optional(),
  ELASTICSEARCH_PASSWORD: z.string().optional(),

  // JWT
  JWT_SECRET: z.string(),
  JWT_REFRESH_SECRET: z.string(),
  JWT_ACCESS_EXPIRES: z.string().default('1h'),
  JWT_REFRESH_EXPIRES: z.string().default('7d'),

  // Session
  SESSION_SECRET: z.string(),

  // CORS
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),

  // Payment
  CASHFREE_CLIENT_ID: z.string(),
  CASHFREE_CLIENT_SECRET: z.string(),
  CASHFREE_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),

  // Email
  SMTP_HOST: z.string(),
  SMTP_PORT: z.string().transform(Number).default(587),
  SMTP_SECURE: z.string().transform(val => val === 'true').default(false),
  SMTP_USER: z.string(),
  SMTP_PASS: z.string(),
  FROM_EMAIL: z.string(),
  FROM_NAME: z.string().default('Vikareta'),

  // OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),

  // WhatsApp
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_API_URL: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),

  // SMS (optional)
  SMS_API_URL: z.string().optional(),
  SMS_API_KEY: z.string().optional(),

  // URLs
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  ADMIN_DOMAIN: z.string().optional(),
  DASHBOARD_DOMAIN: z.string().optional(),
  // Kafka (optional)
  KAFKA_BROKERS: z.string().optional(),
  KAFKA_SSL: z.string().optional(),
  KAFKA_SASL_USERNAME: z.string().optional(),
  KAFKA_SASL_PASSWORD: z.string().optional(),
  KAFKA_SASL_MECHANISM: z.string().optional(),
});

// Validate environment variables
const env = envSchema.parse(process.env);

// Export configuration object
export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  logLevel: env.LOG_LEVEL,

  database: {
    url: env.DATABASE_URL,
  },

  redis: {
    url: env.REDIS_URL,
    password: env.REDIS_PASSWORD,
  },

  minio: {
    endpoint: env.MINIO_ENDPOINT,
    port: env.MINIO_PORT,
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY,
    useSSL: env.MINIO_USE_SSL,
    bucketName: env.MINIO_BUCKET_NAME,
    region: env.MINIO_REGION,
    publicUrl: env.MINIO_PUBLIC_URL,
  },

  elasticsearch: {
    url: env.ELASTICSEARCH_URL,
    username: env.ELASTICSEARCH_USERNAME,
    password: env.ELASTICSEARCH_PASSWORD,
  },

  jwt: {
    secret: env.JWT_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessExpires: env.JWT_ACCESS_EXPIRES,
    refreshExpires: env.JWT_REFRESH_EXPIRES,
  },

  session: {
    secret: env.SESSION_SECRET,
  },

  cors: {
    allowedOrigins: env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()),
  },

  payment: {
    cashfree: {
      clientId: env.CASHFREE_CLIENT_ID,
      clientSecret: env.CASHFREE_CLIENT_SECRET,
      environment: env.CASHFREE_ENVIRONMENT,
    },
  },

  email: {
    smtp: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    },
    from: {
      email: env.FROM_EMAIL,
      name: env.FROM_NAME,
    },
  },

  oauth: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
    linkedin: {
      clientId: env.LINKEDIN_CLIENT_ID,
      clientSecret: env.LINKEDIN_CLIENT_SECRET,
    },
  },

  whatsapp: {
    accessToken: env.WHATSAPP_ACCESS_TOKEN,
    apiUrl: env.WHATSAPP_API_URL,
    businessAccountId: env.WHATSAPP_BUSINESS_ACCOUNT_ID,
  },

  urls: {
    frontend: env.FRONTEND_URL,
    admin: env.ADMIN_DOMAIN,
    dashboard: env.DASHBOARD_DOMAIN,
  },
} as const;

export type Config = typeof config;