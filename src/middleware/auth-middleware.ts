import {
  authenticateToken,
  optionalAuth,
  requireRole,
  requireUserType,
  requireVerificationTier,
  requireVerifiedUser,
  requireAdmin,
  requireSuperAdmin,
  blacklistToken,
} from './auth.middleware';

// Backward-compatible exports expected by older imports
export const authMiddleware = authenticateToken;
export const optionalAuthMiddleware = optionalAuth;

export {
  authenticateToken,
  optionalAuth,
  requireRole,
  requireUserType,
  requireVerificationTier,
  requireVerifiedUser,
  requireAdmin,
  requireSuperAdmin,
  blacklistToken,
};

export default authMiddleware;
