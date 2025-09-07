import { BaseService } from '@/services/base.service';
import { businessProfileService } from './business-profile.service';
import { subscriptionService } from './subscription.service';

interface OnboardingStep {
  key: string;
  label: string;
  completed: boolean;
  meta?: any;
}

export class OnboardingService extends BaseService {
  async getStatus(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const businessProfile = await businessProfileService.get(userId);
    const documentsCount = await this.prisma.userDocument.count({ where: { userId } });
    const subscription = await subscriptionService.getCurrent(userId).catch(() => null);
    const securitySettings = await this.prisma.securitySettings.findUnique({ where: { userId } });

    const steps: OnboardingStep[] = [
      { key: 'basicProfile', label: 'Basic profile details', completed: !!(user.firstName || user.businessName) },
      { key: 'emailVerification', label: 'Email verified', completed: !!user.isVerified },
      { key: 'businessProfile', label: 'Business profile created', completed: !!businessProfile },
      { key: 'taxInfo', label: 'Tax information added', completed: !!(businessProfile && businessProfile.taxInfo && Object.keys(businessProfile.taxInfo || {}).length > 0) },
      { key: 'bankDetails', label: 'Bank details added', completed: !!(businessProfile && businessProfile.bankDetails && (businessProfile.bankDetails as any).accountNumber) },
      { key: 'documents', label: 'Business / KYC documents uploaded', completed: documentsCount > 0, meta: { documentsCount } },
  { key: 'subscription', label: 'Active subscription', completed: !!subscription },
      { key: 'securitySetup', label: 'Security settings / 2FA configured', completed: !!(user.twoFactorEnabled || securitySettings) },
    ];

    const completed = steps.filter(s => s.completed).length;
    const progress = steps.length === 0 ? 0 : Math.round((completed / steps.length) * 100);

    return { userId, progress, steps };
  }

  async completeProfile(userId: string, data: any) {
    // Update basic user fields
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: data.firstName ?? undefined,
        lastName: data.lastName ?? undefined,
        businessName: data.businessName ?? undefined,
        website: data.website ?? undefined,
        city: data.city ?? undefined,
        state: data.state ?? undefined,
        country: data.country ?? undefined,
      },
    });
    // Upsert business profile minimal
    await businessProfileService.upsert(userId, {
      companyName: data.businessName || data.companyName,
      businessType: data.businessType,
      industry: data.industry,
      description: data.description,
      logo: data.logo,
      website: data.website,
      email: data.businessEmail,
      phone: data.businessPhone,
      address: data.address,
    });
    return this.getStatus(userId);
  }

  async updateBusinessSection(userId: string, section: string, payload: any) {
    const bp = await businessProfileService.get(userId);
    if (!bp) {
      await businessProfileService.upsert(userId, payload);
      return this.getStatus(userId);
    }
    const update: any = {};
    switch (section) {
      case 'taxInfo':
        update.taxInfo = payload.taxInfo;
        break;
      case 'bankDetails':
        update.bankDetails = payload.bankDetails;
        break;
      case 'verification':
        update.verification = payload.verification;
        break;
      case 'settings':
        update.settings = payload.settings;
        break;
      default:
        Object.assign(update, payload);
    }
    await this.prisma.businessProfile.update({ where: { userId }, data: update });
    return this.getStatus(userId);
  }
}

export const onboardingService = new OnboardingService();
