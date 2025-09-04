import winston from 'winston';
import { config } from '@/config/environment';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Define format for logs
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Define which transports the logger must use
const transports = [
  // Console transport
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }),
  
  // File transport for errors
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
  }),
  
  // File transport for all logs
  new winston.transports.File({
    filename: 'logs/combined.log',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
  }),
];

// Create the logger
export const logger = winston.createLogger({
  level: config.logLevel,
  levels,
  format,
  transports,
  exitOnError: false,
});

// Create a stream object for Morgan HTTP logger
export const loggerStream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

// Helper functions for structured logging
export const logHelper = {
  // Log API request
  logRequest: (req: any, res: any, responseTime: number) => {
    logger.info(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${responseTime}ms - ${req.ip}`);
  },

  // Log database query
  logQuery: (query: string, params: any[], duration: number) => {
    logger.debug(`DB Query: ${query} | Params: ${JSON.stringify(params)} | Duration: ${duration}ms`);
  },

  // Log cache operation
  logCache: (operation: string, key: string, hit: boolean = false) => {
    logger.debug(`Cache ${operation}: ${key} | Hit: ${hit}`);
  },

  // Log authentication event
  logAuth: (event: string, userId?: string, details?: any) => {
    logger.info(`Auth ${event}: ${userId || 'anonymous'} | ${JSON.stringify(details || {})}`);
  },

  // Log business event
  logBusiness: (event: string, userId: string, details: any) => {
    logger.info(`Business ${event}: ${userId} | ${JSON.stringify(details)}`);
  },

  // Log error with context
  logError: (error: Error, context?: any) => {
    logger.error(`Error: ${error.message} | Stack: ${error.stack} | Context: ${JSON.stringify(context || {})}`);
  },

  // Log performance metric
  logPerformance: (operation: string, duration: number, details?: any) => {
    logger.info(`Performance ${operation}: ${duration}ms | ${JSON.stringify(details || {})}`);
  },

  // Log security event
  logSecurity: (event: string, ip: string, userAgent?: string, details?: any) => {
    logger.warn(`Security ${event}: ${ip} | UserAgent: ${userAgent || 'unknown'} | ${JSON.stringify(details || {})}`);
  },

  // Log external API call
  logExternalAPI: (service: string, endpoint: string, method: string, statusCode: number, duration: number) => {
    logger.info(`External API ${service}: ${method} ${endpoint} - ${statusCode} - ${duration}ms`);
  },

  // Log webhook event
  logWebhook: (event: string, source: string, payload?: any) => {
    logger.info(`Webhook ${event}: ${source} | ${JSON.stringify(payload || {})}`);
  },

  // Log cron job
  logCron: (jobName: string, status: 'started' | 'completed' | 'failed', duration?: number, error?: Error) => {
    if (status === 'failed' && error) {
      logger.error(`Cron ${jobName}: ${status} | Error: ${error.message}`);
    } else {
      logger.info(`Cron ${jobName}: ${status} | Duration: ${duration || 0}ms`);
    }
  },
};

export default logger;