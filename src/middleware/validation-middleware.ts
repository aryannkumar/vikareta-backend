import {
  validateRequest,
  validate,
  validatePagination,
  validateSort,
  validateFilters,
  validateFileUpload,
  validateUUID,
  validateDateRange,
  validateSearch,
} from './validation.middleware';

// Backward-compatible exports
export const validationMiddleware = validateRequest;
export { validateRequest as validateRequest };
export { validate as validate };
export { validatePagination, validateSort, validateFilters, validateFileUpload, validateUUID, validateDateRange, validateSearch };

export default validateRequest;
