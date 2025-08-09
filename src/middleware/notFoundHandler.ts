import { Request, Response, NextFunction } from 'express';
import { CustomError } from '@/middleware/errorHandler';

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  const error = new CustomError(
    `Route ${req.originalUrl} not found`,
    404,
    'NOT_FOUND'
  );
  next(error);
};