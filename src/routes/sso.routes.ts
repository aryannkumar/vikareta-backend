import { Router } from 'express';
import { authenticateToken } from '@/middleware/auth.middleware';
import { validateBody } from '@/middleware/zod-validate';
import { ssoInitSchema, ssoExchangeSchema } from '@/validation/schemas';
import { ssoController } from '@/controllers/sso.controller';

const router = Router();

router.post('/init', authenticateToken, validateBody(ssoInitSchema), (req, res) => ssoController.init(req, res));
router.post('/exchange', validateBody(ssoExchangeSchema), (req, res) => ssoController.exchange(req, res));

export default router;
