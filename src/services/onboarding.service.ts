import { BaseService } from '@/services/base.service';
import { businessProfileService } from './business-profile.service';
import { subscriptionService } from './subscription.service';

interface OnboardingStep {
  key: string;
  label: string;
  completed: boolean;
  required: boolean;
  meta?: any;
}

interface OnboardingFlow {
  userType: 'normal' | 'business';
  steps: OnboardingStep[];
  progress: number;
  completed: boolean;
}

export class OnboardingService extends BaseService {
  async getStatus(userId: string): Promise<OnboardingFlow> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { businessProfile: true }
    });
    if (!user) throw new Error('User not found');

    const isBusinessUser = user.userType === 'business' || user.userType === 'both';
    const userType = isBusinessUser ? 'business' : 'normal';

    if (userType === 'business') {
      return this.getBusinessOnboardingStatus(user);
    } else {
      return this.getNormalUserOnboardingStatus(user);
    }
  }

  private async getNormalUserOnboardingStatus(user: any): Promise<OnboardingFlow> {
    const subscription = await subscriptionService.getCurrent(user.id).catch(() => null);
    const securitySettings = await this.prisma.securitySettings.findUnique({ where: { userId: user.id } });

    const steps: OnboardingStep[] = [
      {
        key: 'basicProfile',
        label: 'Complete your profile',
        completed: !!(user.firstName && user.lastName),
        required: true
      },
      {
        key: 'emailVerification',
        label: 'Verify your email',
        completed: !!user.isVerified,
        required: true
      },
      {
        key: 'securitySetup',
        label: 'Set up security (optional)',
        completed: !!(user.twoFactorEnabled || securitySettings),
        required: false
      },
      {
        key: 'subscription',
        label: 'Choose a subscription plan',
        completed: !!subscription,
        required: false
      }
    ];

    const requiredSteps = steps.filter(s => s.required);
    const completedRequired = requiredSteps.filter(s => s.completed).length;
    const progress = requiredSteps.length === 0 ? 100 : Math.round((completedRequired / requiredSteps.length) * 100);

    return {
      userType: 'normal',
      steps,
      progress,
      completed: completedRequired === requiredSteps.length
    };
  }

  private async getBusinessOnboardingStatus(user: any): Promise<OnboardingFlow> {
    const businessProfile = user.businessProfile;
    const documentsCount = await this.prisma.userDocument.count({ where: { userId: user.id } });
    const subscription = await subscriptionService.getCurrent(user.id).catch(() => null);
    const securitySettings = await this.prisma.securitySettings.findUnique({ where: { userId: user.id } });

    const steps: OnboardingStep[] = [
      {
        key: 'basicProfile',
        label: 'Complete your profile',
        completed: !!(user.firstName && user.lastName),
        required: true
      },
      {
        key: 'businessBasic',
        label: 'Business information',
        completed: !!(businessProfile && businessProfile.companyName && businessProfile.businessType),
        required: true
      },
      {
        key: 'businessTax',
        label: 'Tax information (GST/PAN)',
        completed: !!(businessProfile && businessProfile.taxInfo && (
          (businessProfile.taxInfo as any).gstin || (businessProfile.taxInfo as any).panNumber
        )),
        required: true
      },
      {
        key: 'businessBank',
        label: 'Bank details',
        completed: !!(businessProfile && businessProfile.bankDetails && (businessProfile.bankDetails as any).accountNumber),
        required: true
      },
      {
        key: 'businessDocuments',
        label: 'Business documents',
        completed: documentsCount > 0,
        required: true,
        meta: { documentsCount }
      },
      {
        key: 'emailVerification',
        label: 'Verify your email',
        completed: !!user.isVerified,
        required: true
      },
      {
        key: 'businessVerification',
        label: 'Business verification',
        completed: !!(businessProfile && businessProfile.verification && (businessProfile.verification as any).isVerified),
        required: false
      },
      {
        key: 'securitySetup',
        label: 'Set up security (optional)',
        completed: !!(user.twoFactorEnabled || securitySettings),
        required: false
      },
      {
        key: 'subscription',
        label: 'Choose a subscription plan',
        completed: !!subscription,
        required: false
      }
    ];

    const requiredSteps = steps.filter(s => s.required);
    const completedRequired = requiredSteps.filter(s => s.completed).length;
    const progress = requiredSteps.length === 0 ? 100 : Math.round((completedRequired / requiredSteps.length) * 100);

    return {
      userType: 'business',
      steps,
      progress,
      completed: completedRequired === requiredSteps.length
    };
  }

  async completeProfile(userId: string, data: any) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

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
        bio: data.bio ?? undefined,
        avatar: data.avatar ?? undefined,
        latitude: data.latitude ?? undefined,
        longitude: data.longitude ?? undefined,
      },
    });

    // If business user, update business profile
    if (user.userType === 'business' || user.userType === 'both') {
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
    }

    return this.getStatus(userId);
  }

  async updateBusinessSection(userId: string, section: string, payload: any) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    if (user.userType !== 'business' && user.userType !== 'both') {
      throw new Error('Business profile updates are only available for business users');
    }

    const bp = await businessProfileService.get(userId);
    if (!bp) {
      await businessProfileService.upsert(userId, payload.data || payload);
      return this.getStatus(userId);
    }

    const update: any = {};
    switch (section) {
      case 'basic':
        update.companyName = payload.data?.companyName;
        update.businessType = payload.data?.businessType;
        update.industry = payload.data?.industry;
        update.description = payload.data?.description;
        update.website = payload.data?.website;
        update.email = payload.data?.email;
        update.phone = payload.data?.phone;
        update.address = payload.data?.address;
        break;
      case 'tax':
        update.taxInfo = payload.data || payload;
        break;
      case 'bank':
        update.bankDetails = payload.data || payload;
        break;
      case 'documents':
        // Handle document uploads separately
        break;
      case 'verification':
        update.verification = payload.data || payload;
        break;
      case 'settings':
        update.settings = payload.data || payload;
        break;
      default:
        Object.assign(update, payload.data || payload);
    }

    await this.prisma.businessProfile.update({ where: { userId }, data: update });
    return this.getStatus(userId);
  }

  async uploadBusinessDocument(userId: string, documentData: any) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    if (user.userType !== 'business' && user.userType !== 'both') {
      throw new Error('Document uploads are only available for business users');
    }

    // Create document record
    const document = await this.prisma.userDocument.create({
      data: {
        userId,
        documentType: documentData.documentType,
        documentUrl: documentData.documentUrl,
        documentNumber: documentData.documentNumber,
        expiryDate: documentData.expiryDate ? new Date(documentData.expiryDate) : null,
        digilockerUri: documentData.digilockerUri,
        verificationStatus: 'pending'
      }
    });

    return document;
  }

  async getBusinessDocuments(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    if (user.userType !== 'business' && user.userType !== 'both') {
      throw new Error('Document access is only available for business users');
    }

    return this.prisma.userDocument.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async updateDocumentVerification(userId: string, documentId: string, status: string) {
    // This would typically be called by admin/verification service
    await this.prisma.userDocument.update({
      where: { id: documentId, userId },
      data: {
        verificationStatus: status,
        verifiedAt: status === 'verified' ? new Date() : null
      }
    });

    return this.getStatus(userId);
  }
}

export const onboardingService = new OnboardingService();
