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

// Define which transports the logger must use. File transports are optional
// because some container environments don't allow creating a 'logs' dir.
const transports: any[] = [];

// Always add console transport
transports.push(new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.simple()
  ),
}));

// If LOG_DIR is set, try to use it; otherwise attempt to create 'logs' but
// gracefully handle permission errors and skip file transports.
const logDir = process.env.LOG_DIR || 'logs';
try {
  // Attempt to require fs here to perform a quick writable check
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  transports.push(new winston.transports.File({
    filename: `${logDir}/error.log`,
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
  }));

  transports.push(new winston.transports.File({
    filename: `${logDir}/combined.log`,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
  }));
} catch (err: any) {
  // If we can't create or write to the log directory, fall back to console-only
  // This avoids container startup failures due to EACCES when creating 'logs'
  // Prefer to surface a warning so operators know file logging is disabled.
  // eslint-disable-next-line no-console
  console.warn('File logging disabled. Could not create or write to log directory:', logDir, err?.message || err);
}

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