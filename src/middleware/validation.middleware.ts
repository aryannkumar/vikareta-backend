import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain } from 'express-validator';
import { logger } from '../utils/logger';

// Custom validation error class
export class ValidationError extends Error {
  public errors: any[];
  
  constructor(message: string, errors: any[] = []) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

// Validation middleware that processes express-validator results
export const validateRequest = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Run all validations
    await Promise.all(validations.map(validation => validation.run(req)));
    
    // Check for validation errors
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      const formattedErrors = errors.array().map(error => ({
        field: error.type === 'field' ? (error as any).path : error.type,
        message: error.msg,
        value: error.type === 'field' ? (error as any).value : undefined,
      }));

      logger.warn('Validation failed:', {
        url: req.url,
        method: req.method,
        errors: formattedErrors,
        body: req.body,
        query: req.query,
        params: req.params,
      });

      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: formattedErrors,
      });
      return;
    }
    
    next();
  };
};

// Simple validation middleware for single validation chains
export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      const formattedErrors = errors.array().map(error => ({
        field: error.type === 'field' ? (error as any).path : error.type,
        message: error.msg,
        value: error.type === 'field' ? (error as any).value : undefined,
      }));

      logger.warn('Validation failed:', {
        url: req.url,
        method: req.method,
        errors: formattedErrors,
        body: req.body,
        query: req.query,
        params: req.params,
      });

      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: formattedErrors,
      });
      return;
    }

    next();
  };
};

// Pagination validation middleware
export const validatePagination = (req: Request, res: Response, next: NextFunction): void => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  
  // Validate page
  if (page < 1) {
    res.status(400).json({
      success: false,
      error: 'Page must be greater than 0'
    });
    return;
  }
  
  // Validate limit
  if (limit < 1 || limit > 100) {
    res.status(400).json({
      success: false,
      error: 'Limit must be between 1 and 100'
    });
    return;
  }
  
  // Add pagination to request
  (req as any).pagination = {
    page,
    limit,
    skip: (page - 1) * limit,
  };
  
  next();
};

// Sort validation middleware
export const validateSort = (allowedFields: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const sortBy = req.query.sortBy as string;
    const sortOrder = req.query.sortOrder as string;
    
    if (sortBy && !allowedFields.includes(sortBy)) {
      res.status(400).json({
        success: false,
        error: `Invalid sort field. Allowed fields: ${allowedFields.join(', ')}`
      });
      return;
    }
    
    if (sortOrder && !['asc', 'desc'].includes(sortOrder.toLowerCase())) {
      res.status(400).json({
        success: false,
        error: 'Sort order must be "asc" or "desc"'
      });
      return;
    }
    
    // Add sort to request
    (req as any).sort = {
      field: sortBy || 'createdAt',
      order: sortOrder?.toLowerCase() === 'desc' ? 'desc' : 'asc',
    };
    
    next();
  };
};

// Filter validation middleware
export const validateFilters = (allowedFilters: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const filters: Record<string, any> = {};
    
    // Extract allowed filters from query
    allowedFilters.forEach(filter => {
      if (req.query[filter] !== undefined) {
        filters[filter] = req.query[filter];
      }
    });
    
    // Add filters to request
    (req as any).filters = filters;
    
    next();
  };
};

// File upload validation middleware
export const validateFileUpload = (options: {
  required?: boolean;
  maxSize?: number; // in bytes
  allowedTypes?: string[];
  maxFiles?: number;
}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const files = req.files as Express.Multer.File[] | undefined;
    const file = req.file as Express.Multer.File | undefined;
    
    // Check if file is required
    if (options.required && !file && (!files || files.length === 0)) {
      res.status(400).json({
        success: false,
        error: 'File upload is required'
      });
      return;
    }
    
    // Validate single file
    if (file) {
      const fileError = validateSingleFile(file, options);
      if (fileError) {
        res.status(400).json({
          success: false,
          error: fileError
        });
        return;
      }
    }
    
    // Validate multiple files
    if (files && files.length > 0) {
      if (options.maxFiles && files.length > options.maxFiles) {
        res.status(400).json({
          success: false,
          error: `Maximum ${options.maxFiles} files allowed`
        });
        return;
      }
      
      for (const f of files) {
        const fileError = validateSingleFile(f, options);
        if (fileError) {
          res.status(400).json({
            success: false,
            error: fileError
          });
          return;
        }
      }
    }
    
    next();
  };
};

// Helper function to validate a single file
const validateSingleFile = (file: Express.Multer.File, options: any): string | null => {
  // Check file size
  if (options.maxSize && file.size > options.maxSize) {
    return `File size must be less than ${options.maxSize} bytes`;
  }
  
  // Check file type
  if (options.allowedTypes && !options.allowedTypes.includes(file.mimetype)) {
    return `File type not allowed. Allowed types: ${options.allowedTypes.join(', ')}`;
  }

  return null;
};

// UUID validation middleware
export const validateUUID = (paramName: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const uuid = req.params[paramName];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    if (!uuid || !uuidRegex.test(uuid)) {
      res.status(400).json({
        success: false,
        error: `Invalid ${paramName} format`
      });
      return;
    }
    
    next();
  };
};

// Date range validation middleware
export const validateDateRange = (req: Request, res: Response, next: NextFunction): void => {
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;
  
  if (startDate && isNaN(Date.parse(startDate))) {
    res.status(400).json({
      success: false,
      error: 'Invalid start date format'
    });
    return;
  }
  
  if (endDate && isNaN(Date.parse(endDate))) {
    res.status(400).json({
      success: false,
      error: 'Invalid end date format'
    });
    return;
  }
  
  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    res.status(400).json({
      success: false,
      error: 'Start date must be before end date'
    });
    return;
  }
  
  // Add date range to request
  (req as any).dateRange = {
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
  };
  
  next();
};

// Search validation middleware
export const validateSearch = (req: Request, res: Response, next: NextFunction): void => {
  const query = req.query.q as string;
  
  if (query && query.length < 2) {
    res.status(400).json({
      success: false,
      error: 'Search query must be at least 2 characters long'
    });
    return;
  }
  
  if (query && query.length > 100) {
    res.status(400).json({
      success: false,
      error: 'Search query must be less than 100 characters'
    });
    return;
  }
  
  // Add search to request
  (req as any).search = {
    query: query?.trim(),
  };
  
  next();
};