import { Request, Response, NextFunction } from 'express';
import { z, ZodType } from 'zod';

/**
 * Validation middleware factory
 * Creates middleware that validates request body against a Zod schema
 */
export function validateRequest(schema: ZodType<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body
      const validatedData = schema.parse(req.body);
      
      // Replace request body with validated data
      req.body = validatedData;
      
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Format Zod validation errors
        const formattedErrors = error.issues.map((err: any) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));

        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: formattedErrors
          }
        });
      }

      // Handle other validation errors
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data'
        }
      });
    }
  };
}

/**
 * Validate query parameters
 */
export function validateQuery(schema: ZodType<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = schema.parse(req.query);
      req.query = validatedData as any;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.issues.map((err: any) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));

        return res.status(400).json({
          success: false,
          error: {
            code: 'QUERY_VALIDATION_ERROR',
            message: 'Query parameter validation failed',
            details: formattedErrors
          }
        });
      }

      return res.status(400).json({
        success: false,
        error: {
          code: 'QUERY_VALIDATION_ERROR',
          message: 'Invalid query parameters'
        }
      });
    }
  };
}

/**
 * Validate URL parameters
 */
export function validateParams(schema: ZodType<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = schema.parse(req.params);
      req.params = validatedData as any;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.issues.map((err: any) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));

        return res.status(400).json({
          success: false,
          error: {
            code: 'PARAMS_VALIDATION_ERROR',
            message: 'URL parameter validation failed',
            details: formattedErrors
          }
        });
      }

      return res.status(400).json({
        success: false,
        error: {
          code: 'PARAMS_VALIDATION_ERROR',
          message: 'Invalid URL parameters'
        }
      });
    }
  };
}

/**
 * Common validation schemas
 */
export const commonSchemas = {
  // UUID validation
  uuid: z.string().uuid({ message: 'Invalid UUID format' }),
  
  // Pagination
  pagination: z.object({
    page: z.string().regex(/^\d+$/).transform(Number).optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).optional(),
    offset: z.string().regex(/^\d+$/).transform(Number).optional()
  }),
  
  // Search and filtering
  search: z.object({
    q: z.string().min(1).optional(),
    search: z.string().min(1).optional(),
    filter: z.string().optional(),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).optional()
  }),
  
  // Date range
  dateRange: z.object({
    startDate: z.string().datetime({ message: 'Invalid datetime format' }).optional(),
    endDate: z.string().datetime({ message: 'Invalid datetime format' }).optional()
  }),
  
  // File upload
  fileUpload: z.object({
    filename: z.string().min(1),
    mimetype: z.string().min(1),
    size: z.number().positive()
  })
};

/**
 * Sanitize input data
 */
export function sanitizeInput(data: any): any {
  if (typeof data === 'string') {
    // Basic HTML/script tag removal
    return data
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]*>/g, '')
      .trim();
  }
  
  if (Array.isArray(data)) {
    return data.map(sanitizeInput);
  }
  
  if (data && typeof data === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }
  
  return data;
}

/**
 * Sanitization middleware
 */
export function sanitizeRequest(req: Request, res: Response, next: NextFunction) {
  if (req.body) {
    req.body = sanitizeInput(req.body);
  }
  
  if (req.query) {
    req.query = sanitizeInput(req.query);
  }
  
  next();
}

export default {
  validateRequest,
  validateQuery,
  validateParams,
  commonSchemas,
  sanitizeInput,
  sanitizeRequest
};