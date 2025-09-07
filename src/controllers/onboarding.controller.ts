import { Request, Response } from 'express';
import { onboardingService } from '@/services/onboarding.service';
import { businessDocumentUploadSchema } from '@/validation/schemas';

export class OnboardingController {
  async status(req: Request, res: Response) {
    const userId = req.user!.id;
    const data = await onboardingService.getStatus(userId);
    res.json({ success: true, data });
  }

  async completeProfile(req: Request, res: Response) {
    const userId = req.user!.id;
    const data = await onboardingService.completeProfile(userId, req.body || {});
    res.json({ success: true, message: 'Profile updated successfully', data });
  }

  async updateBusinessSection(req: Request, res: Response) {
    const userId = req.user!.id;
    const { section } = req.params;
    const data = await onboardingService.updateBusinessSection(userId, section, req.body || {});
    res.json({ success: true, message: 'Business profile section updated successfully', data });
  }

  async uploadBusinessDocument(req: Request, res: Response) {
    const userId = req.user!.id;
    const documentData = req.body;

    // Validate document data
    const validation = businessDocumentUploadSchema.safeParse(documentData);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document data',
        errors: validation.error.issues
      });
    }

    const document = await onboardingService.uploadBusinessDocument(userId, validation.data);
    res.json({
      success: true,
      message: 'Document uploaded successfully',
      data: document
    });
  }

  async getBusinessDocuments(req: Request, res: Response) {
    const userId = req.user!.id;
    const documents = await onboardingService.getBusinessDocuments(userId);
    res.json({ success: true, data: documents });
  }

  async updateDocumentVerification(req: Request, res: Response) {
    const userId = req.user!.id;
    const { documentId } = req.params;
    const { status } = req.body;

    if (!['pending', 'verified', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification status'
      });
    }

    const data = await onboardingService.updateDocumentVerification(userId, documentId, status);
    res.json({
      success: true,
      message: 'Document verification updated successfully',
      data
    });
  }

  async getOnboardingFlow(req: Request, res: Response) {
    const userId = req.user!.id;
    const flow = await onboardingService.getStatus(userId);

    // Return flow-specific information
    const response = {
      userType: flow.userType,
      progress: flow.progress,
      completed: flow.completed,
      steps: flow.steps,
      nextRequiredStep: flow.steps.find(step => step.required && !step.completed),
      canProceed: flow.completed
    };

    res.json({ success: true, data: response });
  }
}

export const onboardingController = new OnboardingController();
