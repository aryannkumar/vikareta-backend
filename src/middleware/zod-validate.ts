import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export const validateBody = (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (err: any) {
    // Format the error to match what the frontend expects
    const validationErrors = err.errors || [];
    const errorMessage = validationErrors.length > 0 
      ? validationErrors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ')
      : 'Validation failed';
    
    res.status(400).json({ 
      success: false, 
      error: { 
        code: 'VALIDATION_ERROR', 
        message: errorMessage 
      },
      details: validationErrors
    });
  }
};

export const validateQuery = (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = schema.parse(req.query);
    req.query = parsed as any;
    next();
  } catch (err: any) {
    const validationErrors = err.errors || [];
    const errorMessage = validationErrors.length > 0 
      ? validationErrors.map((e: any) => e.message).join(', ')
      : 'Validation failed';
    
    res.status(400).json({ 
      success: false, 
      error: { 
        code: 'VALIDATION_ERROR', 
        message: errorMessage 
      },
      details: validationErrors
    });
  }
};

export const validateParams = (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = schema.parse(req.params);
    req.params = parsed as any;
    next();
  } catch (err: any) {
    const validationErrors = err.errors || [];
    const errorMessage = validationErrors.length > 0 
      ? validationErrors.map((e: any) => e.message).join(', ')
      : 'Validation failed';
    
    res.status(400).json({ 
      success: false, 
      error: { 
        code: 'VALIDATION_ERROR', 
        message: errorMessage 
      },
      details: validationErrors
    });
  }
};
