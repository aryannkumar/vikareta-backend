import { Request, Response } from 'express';
import { onboardingService } from '@/services/onboarding.service';

export class OnboardingController {
  async status(req: Request, res: Response) {
    const userId = req.user!.id;
    const data = await onboardingService.getStatus(userId);
    res.json({ success: true, data });
  }
  async completeProfile(req: Request, res: Response) {
    const userId = req.user!.id;
    const data = await onboardingService.completeProfile(userId, req.body || {});
    res.json({ success: true, message: 'Profile updated', data });
  }
  async updateBusinessSection(req: Request, res: Response) {
    const userId = req.user!.id;
    const { section } = req.params;
    const data = await onboardingService.updateBusinessSection(userId, section, req.body || {});
    res.json({ success: true, message: 'Business profile section updated', data });
  }
}

export const onboardingController = new OnboardingController();
