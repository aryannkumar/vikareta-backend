import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';

const prisma = new PrismaClient();

export interface UpdateProfileData {
  firstName?: string;
  lastName?: string;
  businessName?: string;
  gstin?: string;
  phone?: string;
}

export interface GST_Info {
  gstin: string;
  legalName: string;
  tradeName?: string;
  registrationDate: string;
  status: string;
  businessType: string;
  address: string;
  state: string;
  pincode: string;
}

export interface VerificationTierInfo {
  tier: string;
  description: string;
  benefits: string[];
  requirements: string[];
  transactionLimits: {
    daily: number;
    monthly: number;
    perTransaction: number;
  };
}

export class ProfileService {
  /**
   * Get user profile with complete information
   */
  static async getUserProfile(userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          phone: true,
          firstName: true,
          lastName: true,
          businessName: true,
          gstin: true,
          verificationTier: true,
          isVerified: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Get social logins
      const socialLogins = await prisma.socialLogin.findMany({
        where: { userId },
        select: {
          provider: true,
          createdAt: true,
        },
      });

      // Get documents
      const documents = await prisma.userDocument.findMany({
        where: { userId },
        select: {
          id: true,
          documentType: true,
          documentNumber: true,
          verificationStatus: true,
          createdAt: true,
        },
      });

      // Get wallet info
      const wallet = await prisma.wallet.findUnique({
        where: { userId },
        select: {
          availableBalance: true,
          lockedBalance: true,
          negativeBalance: true,
        },
      });

      // Get verification tier info
      const tierInfo = this.getVerificationTierInfo(user.verificationTier);

      return {
        user,
        socialLogins,
        documents,
        wallet,
        verificationTier: tierInfo,
      };
    } catch (error) {
      logger.error('Get user profile failed:', error);
      throw error;
    }
  }

  /**
   * Update user profile
   */
  static async updateProfile(userId: string, data: UpdateProfileData) {
    try {
      // Validate GSTIN if provided
      if (data.gstin) {
        const isValidGSTIN = await this.validateGSTIN(data.gstin);
        if (!isValidGSTIN) {
          throw new Error('Invalid GSTIN provided');
        }
      }

      const updateData: any = {};
      if (data.firstName !== undefined) updateData.firstName = data.firstName;
      if (data.lastName !== undefined) updateData.lastName = data.lastName;
      if (data.businessName !== undefined) updateData.businessName = data.businessName;
      if (data.gstin !== undefined) updateData.gstin = data.gstin;
      if (data.phone !== undefined) updateData.phone = data.phone;

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          email: true,
          phone: true,
          firstName: true,
          lastName: true,
          businessName: true,
          gstin: true,
          verificationTier: true,
          isVerified: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      logger.info(`Profile updated for user: ${userId}`);

      return updatedUser;
    } catch (error) {
      logger.error('Update profile failed:', error);
      throw error;
    }
  }

  /**
   * Validate GSTIN format and check with government API (mock implementation)
   */
  static async validateGSTIN(gstin: string): Promise<boolean> {
    try {
      // Basic GSTIN format validation
      const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      
      if (!gstinRegex.test(gstin)) {
        return false;
      }

      // In a real implementation, you would call the GST API
      // For now, we'll simulate validation
      logger.info(`GSTIN validation requested for: ${gstin}`);
      
      // Mock validation - in production, integrate with GST API
      return true;
    } catch (error) {
      logger.error('GSTIN validation failed:', error);
      return false;
    }
  }

  /**
   * Get GST information (mock implementation)
   */
  static async getGSTInfo(gstin: string): Promise<GST_Info | null> {
    try {
      // In a real implementation, you would call the GST API
      // This is a mock implementation
      if (!await this.validateGSTIN(gstin)) {
        return null;
      }

      // Mock GST info
      return {
        gstin,
        legalName: 'Sample Business Pvt Ltd',
        tradeName: 'Sample Business',
        registrationDate: '2020-01-01',
        status: 'Active',
        businessType: 'Private Limited Company',
        address: '123 Business Street, Business City',
        state: 'Maharashtra',
        pincode: '400001',
      };
    } catch (error) {
      logger.error('Get GST info failed:', error);
      return null;
    }
  }

  /**
   * Perform business verification with GSTIN
   */
  static async verifyBusiness(userId: string, gstin: string) {
    try {
      // Validate GSTIN
      const gstInfo = await this.getGSTInfo(gstin);
      if (!gstInfo) {
        throw new Error('Invalid GSTIN or GST information not found');
      }

      // Update user with GST information
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          gstin,
          businessName: gstInfo.tradeName || gstInfo.legalName,
        },
      });

      // Create or update GST document
      const existingGstDoc = await prisma.userDocument.findFirst({
        where: {
          userId,
          documentType: 'gst',
        },
      });

      if (existingGstDoc) {
        await prisma.userDocument.update({
          where: { id: existingGstDoc.id },
          data: {
            documentNumber: gstin,
            verificationStatus: 'verified',
          },
        });
      } else {
        await prisma.userDocument.create({
          data: {
            userId,
            documentType: 'gst',
            documentNumber: gstin,
            documentUrl: '', // Will be updated when document is uploaded
            verificationStatus: 'verified',
          },
        });
      }

      // Recalculate verification tier
      await this.recalculateVerificationTier(userId);

      logger.info(`Business verified for user: ${userId}, GSTIN: ${gstin}`);

      return {
        user: updatedUser,
        gstInfo,
      };
    } catch (error) {
      logger.error('Business verification failed:', error);
      throw error;
    }
  }

  /**
   * Get verification tier information
   */
  static getVerificationTierInfo(tier: string): VerificationTierInfo {
    const tiers: Record<string, VerificationTierInfo> = {
      basic: {
        tier: 'basic',
        description: 'Basic verification with email/phone',
        benefits: [
          'Basic marketplace access',
          'Limited transaction capabilities',
          'Standard customer support',
        ],
        requirements: [
          'Email verification',
          'Phone verification',
        ],
        transactionLimits: {
          daily: 10000,
          monthly: 100000,
          perTransaction: 5000,
        },
      },
      standard: {
        tier: 'standard',
        description: 'Standard verification with social login or partial KYC',
        benefits: [
          'Enhanced marketplace access',
          'Increased transaction limits',
          'Priority customer support',
          'Access to premium features',
        ],
        requirements: [
          'Social login (Google/LinkedIn)',
          'OR partial KYC documents',
        ],
        transactionLimits: {
          daily: 50000,
          monthly: 500000,
          perTransaction: 25000,
        },
      },
      enhanced: {
        tier: 'enhanced',
        description: 'Enhanced verification with complete KYC',
        benefits: [
          'Full marketplace access',
          'High transaction limits',
          'Premium customer support',
          'Advanced analytics',
          'Bulk operations',
        ],
        requirements: [
          'Complete KYC (Aadhaar + PAN)',
          'OR DigiLocker verification',
        ],
        transactionLimits: {
          daily: 200000,
          monthly: 2000000,
          perTransaction: 100000,
        },
      },
      premium: {
        tier: 'premium',
        description: 'Premium verification with business documents',
        benefits: [
          'Unlimited marketplace access',
          'Highest transaction limits',
          'Dedicated account manager',
          'Custom integrations',
          'White-label solutions',
          'API access',
        ],
        requirements: [
          'Complete KYC + Business verification',
          'GSTIN verification',
          'Additional identity documents',
        ],
        transactionLimits: {
          daily: 1000000,
          monthly: 10000000,
          perTransaction: 500000,
        },
      },
    };

    if (tier in tiers) {
      return tiers[tier] as VerificationTierInfo;
    }
    return tiers['basic'] as VerificationTierInfo;
  }

  /**
   * Recalculate user verification tier based on available documents
   */
  static async recalculateVerificationTier(userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          verificationTier: true,
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Get user documents
      const documents = await prisma.userDocument.findMany({
        where: {
          userId,
          verificationStatus: 'verified',
        },
        select: {
          documentType: true,
        },
      });

      // Get social logins
      const socialLogins = await prisma.socialLogin.findMany({
        where: { userId },
        select: {
          provider: true,
        },
      });

      const verifiedDocTypes = documents.map(d => d.documentType);
      const socialProviders = socialLogins.map(s => s.provider);

      let newTier = 'basic';

      // Check for premium tier
      const hasAadhaar = verifiedDocTypes.includes('aadhaar');
      const hasPAN = verifiedDocTypes.includes('pan');
      const hasGST = verifiedDocTypes.includes('gst');
      // Check for optional documents (not used in current logic but kept for future use)
      // const hasOptionalDoc = ['driving_license', 'passport', 'voter_id'].some(doc => 
      //   verifiedDocTypes.includes(doc)
      // );

      if (hasAadhaar && hasPAN && hasGST) {
        newTier = 'premium';
      } else if (hasAadhaar && hasPAN) {
        newTier = 'enhanced';
      } else if (
        hasAadhaar || 
        hasPAN || 
        socialProviders.includes('linkedin') ||
        socialProviders.includes('digilocker')
      ) {
        newTier = 'standard';
      } else if (socialProviders.includes('google')) {
        newTier = 'standard';
      }

      // Update tier if changed
      if (newTier !== user.verificationTier) {
        await prisma.user.update({
          where: { id: userId },
          data: { verificationTier: newTier },
        });

        logger.info(`Verification tier updated for user: ${userId}, ${user.verificationTier} -> ${newTier}`);
      }

      return newTier;
    } catch (error) {
      logger.error('Recalculate verification tier failed:', error);
      throw error;
    }
  }

  /**
   * Get user verification status and next steps
   */
  static async getVerificationStatus(userId: string) {
    try {
      const profile = await this.getUserProfile(userId);
      const currentTier = profile.verificationTier;
      
      // Determine next tier and requirements
      const tierHierarchy = ['basic', 'standard', 'enhanced', 'premium'];
      const currentIndex = tierHierarchy.indexOf(currentTier.tier);
      const nextTier = currentIndex < tierHierarchy.length - 1 
        ? tierHierarchy[currentIndex + 1] 
        : null;

      const nextTierInfo = nextTier ? this.getVerificationTierInfo(nextTier) : null;

      // Check what documents are missing
      const verifiedDocTypes = profile.documents
        .filter(d => d.verificationStatus === 'verified')
        .map(d => d.documentType);

      const socialProviders = profile.socialLogins.map(s => s.provider);

      const missingRequirements = [];

      if (nextTier === 'standard' && !socialProviders.length) {
        missingRequirements.push('Link social account (Google/LinkedIn)');
      }

      if (nextTier === 'enhanced' || nextTier === 'premium') {
        if (!verifiedDocTypes.includes('aadhaar')) {
          missingRequirements.push('Aadhaar verification');
        }
        if (!verifiedDocTypes.includes('pan')) {
          missingRequirements.push('PAN verification');
        }
      }

      if (nextTier === 'premium') {
        if (!verifiedDocTypes.includes('gst')) {
          missingRequirements.push('GSTIN verification');
        }
      }

      return {
        currentTier: currentTier,
        nextTier: nextTierInfo,
        missingRequirements,
        verifiedDocuments: verifiedDocTypes,
        linkedSocialAccounts: socialProviders,
        canUpgrade: missingRequirements.length === 0 && nextTier !== null,
      };
    } catch (error) {
      logger.error('Get verification status failed:', error);
      throw error;
    }
  }

  /**
   * Upload and verify document
   */
  static async uploadDocument(
    userId: string, 
    documentType: string, 
    documentNumber: string,
    _fileBuffer?: Buffer
  ) {
    try {
      // Validate document type
      const validTypes = ['aadhaar', 'pan', 'driving_license', 'passport', 'voter_id', 'gst'];
      if (!validTypes.includes(documentType)) {
        throw new Error('Invalid document type');
      }

      // In a real implementation, you would:
      // 1. Upload file to S3
      // 2. Extract text using OCR
      // 3. Validate document number
      // 4. Verify with government APIs

      // For now, we'll create the document record
      const existingDoc = await prisma.userDocument.findFirst({
        where: {
          userId,
          documentType,
        },
      });

      let document;
      if (existingDoc) {
        document = await prisma.userDocument.update({
          where: { id: existingDoc.id },
          data: {
            documentNumber,
            verificationStatus: 'pending',
          },
        });
      } else {
        document = await prisma.userDocument.create({
          data: {
            userId,
            documentType,
            documentNumber,
            documentUrl: '', // Will be updated when document is uploaded
            verificationStatus: 'pending',
          },
        });
      }

      // Simulate verification process
      // In production, this would be an async process
      setTimeout(async () => {
        try {
          await prisma.userDocument.update({
            where: { id: document.id },
            data: { verificationStatus: 'verified' },
          });

          await this.recalculateVerificationTier(userId);
          
          logger.info(`Document verified: ${documentType} for user: ${userId}`);
        } catch (error) {
          logger.error('Document verification failed:', error);
        }
      }, 5000); // 5 second delay to simulate processing

      logger.info(`Document uploaded: ${documentType} for user: ${userId}`);

      return document;
    } catch (error) {
      logger.error('Document upload failed:', error);
      throw error;
    }
  }

  /**
   * Get user's transaction limits based on verification tier
   */
  static async getTransactionLimits(userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          verificationTier: true,
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const tierInfo = this.getVerificationTierInfo(user.verificationTier);
      
      return {
        tier: user.verificationTier,
        limits: tierInfo.transactionLimits,
        benefits: tierInfo.benefits,
      };
    } catch (error) {
      logger.error('Get transaction limits failed:', error);
      throw error;
    }
  }
}