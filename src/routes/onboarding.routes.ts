import { Router } from 'express';
import { authenticateToken } from '@/middleware/auth.middleware';
import { validateBody, validateParams } from '@/middleware/zod-validate';
import { onboardingProfileSchema, onboardingBusinessSectionSchema, onboardingSectionParamsSchema } from '@/validation/schemas';
import { onboardingController } from '@/controllers/onboarding.controller';

const router = Router();
router.use(authenticateToken);

router.get('/status', (req, res) => onboardingController.status(req, res));
router.post('/profile', validateBody(onboardingProfileSchema), (req, res) => onboardingController.completeProfile(req, res));
router.post('/business/:section', validateParams(onboardingSectionParamsSchema), validateBody(onboardingBusinessSectionSchema), (req, res) => onboardingController.updateBusinessSection(req, res));

export default router;
