import { Router } from 'express';
import { authenticateToken } from '@/middleware/authentication.middleware';
import { validateBody, validateParams } from '@/middleware/zod-validate';
import { onboardingProfileSchema, onboardingBusinessSectionSchema, onboardingSectionParamsSchema, businessDocumentUploadSchema } from '@/validation/schemas';
import { onboardingController } from '@/controllers/onboarding.controller';

const router = Router();
router.use(authenticateToken);

// Get onboarding status and flow information
router.get('/status', (req, res) => onboardingController.status(req, res));
router.get('/flow', (req, res) => onboardingController.getOnboardingFlow(req, res));

// Profile management
router.post('/profile', validateBody(onboardingProfileSchema), (req, res) => onboardingController.completeProfile(req, res));

// Business-specific endpoints
router.post('/business/:section', validateParams(onboardingSectionParamsSchema), validateBody(onboardingBusinessSectionSchema), (req, res) => onboardingController.updateBusinessSection(req, res));

// Document management
router.post('/documents', validateBody(businessDocumentUploadSchema), (req, res) => onboardingController.uploadBusinessDocument(req, res));
router.get('/documents', (req, res) => onboardingController.getBusinessDocuments(req, res));
router.patch('/documents/:documentId/verification', (req, res) => onboardingController.updateDocumentVerification(req, res));

export default router;
