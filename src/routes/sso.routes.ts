import { Router } from 'express';
import { authenticateToken, csrfProtection, generateCSRFToken, rateLimit, securityHeaders, requireUserType } from '@/middleware/authentication.middleware';
import { validateBody } from '@/middleware/zod-validate';
import { ssoInitSchema, ssoExchangeSchema } from '@/validation/schemas';
import { ssoController } from '@/controllers/sso.controller';

const router = Router();

// Apply security headers to all SSO routes
router.use(securityHeaders);

// Apply rate limiting to SSO endpoints
router.use(rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // 5 SSO requests per window
  keyGenerator: (req) => `${req.ip}:sso`,
}));

// CSRF protection for SSO operations
router.use(['/init'], generateCSRFToken);
router.use(['/init'], csrfProtection);

// SSO routes with enhanced security
router.post('/init', authenticateToken, requireUserType('admin', 'business'), validateBody(ssoInitSchema), (req, res) => ssoController.init(req, res));
router.post('/exchange', validateBody(ssoExchangeSchema), (req, res) => ssoController.exchange(req, res));

export default router;
