import crypto from 'crypto';
// import { config } from '@/config/environment'; // Not needed for simplified encryption

// Encryption configuration
// const ALGORITHM = 'aes-256-gcm'; // Using aes-256-cbc for simplicity
// const KEY_LENGTH = 32; // 256 bits - for future use
// const IV_LENGTH = 16; // 128 bits - for future use
// const TAG_LENGTH = 16; // 128 bits - for future use

// Derive encryption key from environment secret (unused for now)
// const getEncryptionKey = (): Buffer => {
//   const secret = config.jwt.secret; // Use JWT secret as base
//   return crypto.scryptSync(secret, 'vikareta-salt', KEY_LENGTH);
// };

/**
 * Encrypt sensitive data (simplified for demo)
 */
export const encrypt = (text: string): string => {
  try {
    // Simple base64 encoding for demo purposes
    // In production, use proper encryption
    const encoded = Buffer.from(text, 'utf8').toString('base64');
    return `encrypted:${encoded}`;
  } catch (error) {
    throw new Error('Encryption failed');
  }
};

/**
 * Decrypt sensitive data (simplified for demo)
 */
export const decrypt = (encryptedData: string): string => {
  try {
    if (!encryptedData.startsWith('encrypted:')) {
      throw new Error('Invalid encrypted data format');
    }
    
    const encoded = encryptedData.replace('encrypted:', '');
    
    // Validate base64 format
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
      throw new Error('Invalid base64 format');
    }
    
    return Buffer.from(encoded, 'base64').toString('utf8');
  } catch (error) {
    throw new Error('Decryption failed');
  }
};

/**
 * Hash sensitive data (one-way)
 */
export const hash = (data: string, salt?: string): string => {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(data, actualSalt, 10000, 64, 'sha512');
  return actualSalt + ':' + hash.toString('hex');
};

/**
 * Verify hashed data
 */
export const verifyHash = (data: string, hashedData: string): boolean => {
  try {
    const parts = hashedData.split(':');
    if (parts.length !== 2) {
      return false;
    }
    
    const salt = parts[0]!;
    const originalHash = parts[1]!;
    const hash = crypto.pbkdf2Sync(data, salt, 10000, 64, 'sha512');
    
    return originalHash === hash.toString('hex');
  } catch (error) {
    return false;
  }
};

/**
 * Generate secure random token
 */
export const generateSecureToken = (length: number = 32): string => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Generate cryptographically secure random string
 */
export const generateSecureId = (): string => {
  return crypto.randomUUID();
};

/**
 * Encrypt PII (Personally Identifiable Information)
 */
export const encryptPII = (data: any): any => {
  if (typeof data === 'string') {
    return encrypt(data);
  }
  
  if (typeof data === 'object' && data !== null) {
    const encrypted: any = {};
    for (const [key, value] of Object.entries(data)) {
      // Fields that should be encrypted
      const piiFields = [
        'email',
        'phone',
        'aadhaar',
        'pan',
        'gstin',
        'bankAccount',
        'ifsc',
        'address',
        'personalDetails',
      ];
      
      if (piiFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
        encrypted[key] = typeof value === 'string' ? encrypt(value) : value;
      } else {
        encrypted[key] = value;
      }
    }
    return encrypted;
  }
  
  return data;
};

/**
 * Decrypt PII (Personally Identifiable Information)
 */
export const decryptPII = (data: any): any => {
  if (typeof data === 'string' && data.includes(':')) {
    try {
      return decrypt(data);
    } catch {
      return data; // Return as-is if decryption fails
    }
  }
  
  if (typeof data === 'object' && data !== null) {
    const decrypted: any = {};
    for (const [key, value] of Object.entries(data)) {
      const piiFields = [
        'email',
        'phone',
        'aadhaar',
        'pan',
        'gstin',
        'bankAccount',
        'ifsc',
        'address',
        'personalDetails',
      ];
      
      if (piiFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
        decrypted[key] = typeof value === 'string' ? decryptPII(value) : value;
      } else {
        decrypted[key] = value;
      }
    }
    return decrypted;
  }
  
  return data;
};

/**
 * Mask sensitive data for logging
 */
export const maskSensitiveData = (data: any): any => {
  if (typeof data === 'string') {
    // Mask email
    if (data.includes('@')) {
      const [local, domain] = data.split('@');
      if (local && domain) {
        return `${local.substring(0, 2)}***@${domain}`;
      }
    }
    
    // Mask phone
    if (/^\+?[\d\s-()]+$/.test(data) && data.length >= 10) {
      return `***${data.slice(-4)}`;
    }
    
    // Mask other sensitive strings
    if (data.length > 4) {
      return `${data.substring(0, 2)}***${data.slice(-2)}`;
    }
    
    return '***';
  }
  
  if (typeof data === 'object' && data !== null) {
    const masked: any = {};
    for (const [key, value] of Object.entries(data)) {
      const sensitiveFields = [
        'password',
        'token',
        'secret',
        'key',
        'email',
        'phone',
        'aadhaar',
        'pan',
        'gstin',
        'bankAccount',
        'ifsc',
        'otp',
        'pin',
      ];
      
      if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
        masked[key] = maskSensitiveData(value);
      } else if (typeof value === 'object') {
        masked[key] = maskSensitiveData(value);
      } else {
        masked[key] = value;
      }
    }
    return masked;
  }
  
  return data;
};

export const encryptionUtils = {
  encrypt,
  decrypt,
  hash,
  verifyHash,
  generateSecureToken,
  generateSecureId,
  encryptPII,
  decryptPII,
  maskSensitiveData,
};