import https from 'https';
import fs from 'fs';
import path from 'path';
import { config } from './environment';
import { logger } from '@/utils/logger';

export interface HttpsConfig {
  key: string;
  cert: string;
  ca?: string;
}

/**
 * Load SSL certificates for HTTPS
 */
export const loadSSLCertificates = (): HttpsConfig | null => {
  try {
    const certDir = process.env['SSL_CERT_DIR'] || '/etc/ssl/certs/vikareta';
    
    const keyPath = path.join(certDir, 'private.key');
    const certPath = path.join(certDir, 'certificate.crt');
    const caPath = path.join(certDir, 'ca_bundle.crt');
    
    // Check if certificate files exist
    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
      logger.warn('SSL certificates not found, running in HTTP mode');
      return null;
    }
    
    const httpsConfig: HttpsConfig = {
      key: fs.readFileSync(keyPath, 'utf8'),
      cert: fs.readFileSync(certPath, 'utf8'),
    };
    
    // Add CA bundle if available
    if (fs.existsSync(caPath)) {
      httpsConfig.ca = fs.readFileSync(caPath, 'utf8');
    }
    
    logger.info('SSL certificates loaded successfully');
    return httpsConfig;
    
  } catch (error) {
    logger.error('Failed to load SSL certificates:', error);
    return null;
  }
};

/**
 * Create HTTPS server with proper configuration
 */
export const createHttpsServer = (app: any): https.Server | null => {
  const httpsConfig = loadSSLCertificates();
  
  if (!httpsConfig) {
    return null;
  }
  
  const httpsOptions: https.ServerOptions = {
    ...httpsConfig,
    // Enhanced security options
    secureProtocol: 'TLSv1_2_method',
    ciphers: [
      'ECDHE-RSA-AES128-GCM-SHA256',
      'ECDHE-RSA-AES256-GCM-SHA384',
      'ECDHE-RSA-AES128-SHA256',
      'ECDHE-RSA-AES256-SHA384',
      'ECDHE-RSA-AES256-SHA256',
      'ECDHE-RSA-AES128-SHA',
      'ECDHE-RSA-AES256-SHA',
      'AES128-GCM-SHA256',
      'AES256-GCM-SHA384',
      'AES128-SHA256',
      'AES256-SHA256',
      'AES128-SHA',
      'AES256-SHA',
      'DES-CBC3-SHA',
    ].join(':'),
    honorCipherOrder: true,
    secureOptions: require('constants').SSL_OP_NO_SSLv2 | require('constants').SSL_OP_NO_SSLv3,
  };
  
  return https.createServer(httpsOptions, app);
};

/**
 * HTTP to HTTPS redirect middleware
 */
export const httpsRedirect = (req: any, res: any, next: any) => {
  // Skip HTTPS redirect in development environment
  if (config.env === 'development') {
    return next();
  }

  // Production HTTPS redirect logic
  if (config.env === 'production') {
    // Skip redirect for localhost (for local testing of production builds)
    if (req.get('host')?.includes('localhost')) {
      return next();
    }

    // Handle Cloudflare SSL termination
    if (req.get('cf-connecting-ip')) {
      // Request is coming from Cloudflare, trust the X-Forwarded-Proto header
      if (req.get('x-forwarded-proto') === 'http') {
        const httpsUrl = `https://${req.get('host')}${req.url}`;
        logger.info(`Redirecting HTTP to HTTPS via Cloudflare: ${req.url} -> ${httpsUrl}`);
        return res.redirect(301, httpsUrl);
      }
    } else if (!req.secure && req.get('x-forwarded-proto') !== 'https') {
      // Standard HTTPS redirect for non-Cloudflare requests
      const httpsUrl = `https://${req.get('host')}${req.url}`;
      logger.info(`Redirecting HTTP to HTTPS: ${req.url} -> ${httpsUrl}`);
      return res.redirect(301, httpsUrl);
    }
  }
  
  next();
};

/**
 * Security headers for HTTPS
 */
export const httpsSecurityHeaders = (_req: any, res: any, next: any) => {
  if (config.env === 'production') {
    // Strict Transport Security
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    
    // Upgrade insecure requests
    res.setHeader('Content-Security-Policy', 'upgrade-insecure-requests');
    
    // Expect-CT header for certificate transparency
    res.setHeader('Expect-CT', 'max-age=86400, enforce');
  }
  
  next();
};

export const httpsUtils = {
  loadSSLCertificates,
  createHttpsServer,
  httpsRedirect,
  httpsSecurityHeaders,
};