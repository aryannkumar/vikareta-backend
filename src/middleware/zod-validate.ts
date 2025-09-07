import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export const validateBody = (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (err: any) {
    res.status(400).json({ success: false, error: 'Validation failed', issues: err.errors });
  }
};

export const validateQuery = (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = schema.parse(req.query);
    req.query = parsed as any;
    next();
  } catch (err: any) {
    res.status(400).json({ success: false, error: 'Validation failed', issues: err.errors });
  }
};

export const validateParams = (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = schema.parse(req.params);
    req.params = parsed as any;
    next();
  } catch (err: any) {
    res.status(400).json({ success: false, error: 'Validation failed', issues: err.errors });
  }
};
