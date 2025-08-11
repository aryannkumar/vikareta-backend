import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';

const prisma = new PrismaClient();

export interface DigiLockerProfile {
  id: string;
  name: string;
  email: string;
  mobile?: string;
  dob?: string;
  gender?: string;
  address?: string;
}

export interface DigiLockerDocument {
  uri: string;
  doctype: string;
  name: string;
  size: number;
  date: string;
  issuer: string;
}

export interface DigiLockerAuthResult {
  user: any;
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
  };
  isNewUser: boolean;
  documents: DigiLockerDocument[];
}

export class DigiLockerService {
  private static readonly BASE_URL = config.digilocker.baseUrl;
  private static readonly CLIENT_ID = config.digilocker.clientId;
  private static readonly CLIENT_SECRET = config.digilocker.clientSecret;

  /**
   * Get DigiLocker OAuth authorization URL
   */
  static getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.CLIENT_ID!,
      redirect_uri: `${config.oauth.digilocker?.callbackUrl || 'http://localhost:3000/api/auth/digilocker/callback'}`,
      scope: 'profile documents',
      state: state || 'default',
    });

    return `${this.BASE_URL}/oauth2/1/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  static async exchangeCodeForToken(code: string, state?: string): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
  }> {
    try {
      const response = await axios.post(`${this.BASE_URL}/oauth2/1/token`, {
        grant_type: 'authorization_code',
        client_id: this.CLIENT_ID,
        client_secret: this.CLIENT_SECRET,
        code,
        redirect_uri: `${config.oauth.digilocker?.callbackUrl || 'http://localhost:3000/api/auth/digilocker/callback'}`,
        state: state || 'default',
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      return response.data;
    } catch (error: any) {
      logger.error('DigiLocker token exchange failed:', error.response?.data || error.message);
      throw new Error('Failed to exchange authorization code for token');
    }
  }

  /**
   * Get user profile from DigiLocker
   */
  static async getUserProfile(accessToken: string): Promise<DigiLockerProfile> {
    try {
      const response = await axios.get(`${this.BASE_URL}/api/v1/profile`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      return {
        id: response.data.aadhaar || response.data.mobile || response.data.email,
        name: response.data.name,
        email: response.data.email,
        mobile: response.data.mobile,
        dob: response.data.dob,
        gender: response.data.gender,
        address: response.data.address,
      };
    } catch (error: any) {
      logger.error('DigiLocker profile fetch failed:', error.response?.data || error.message);
      throw new Error('Failed to fetch user profile from DigiLocker');
    }
  }

  /**
   * Get user documents from DigiLocker
   */
  static async getUserDocuments(accessToken: string): Promise<DigiLockerDocument[]> {
    try {
      const response = await axios.get(`${this.BASE_URL}/api/v1/documents`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      return response.data.documents || [];
    } catch (error: any) {
      logger.error('DigiLocker documents fetch failed:', error.response?.data || error.message);
      throw new Error('Failed to fetch documents from DigiLocker');
    }
  }

  /**
   * Download specific document from DigiLocker
   */
  static async downloadDocument(accessToken: string, uri: string): Promise<Buffer> {
    try {
      const response = await axios.get(`${this.BASE_URL}/api/v1/document/${encodeURIComponent(uri)}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
        responseType: 'arraybuffer',
      });

      return Buffer.from(response.data);
    } catch (error: any) {
      logger.error('DigiLocker document download failed:', error.response?.data || error.message);
      throw new Error('Failed to download document from DigiLocker');
    }
  }

  /**
   * Handle DigiLocker OAuth authentication and user creation/login
   */
  static async handleDigiLockerAuth(
    code: string,
    state?: string
  ): Promise<DigiLockerAuthResult> {
    try {
      // Exchange code for token
      const tokenData = await this.exchangeCodeForToken(code, state);
      
      // Get user profile
      const profile = await this.getUserProfile(tokenData.access_token);
      
      // Get user documents
      const documents = await this.getUserDocuments(tokenData.access_token);

      // Check if user exists with this DigiLocker ID or email
      let socialLogin = await prisma.socialLogin.findFirst({
        where: {
          provider: 'digilocker',
          providerId: profile.id,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              phone: true,
              firstName: true,
              lastName: true,
              businessName: true,
              gstin: true,
              userType: true,
              verificationTier: true,
              isVerified: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      });

      let user;
      let isNewUser = false;

      if (socialLogin) {
        // Update tokens
        await prisma.socialLogin.update({
          where: { id: socialLogin.id },
          data: {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || null,
          },
        });
        user = socialLogin.user;
      } else {
        // Check if user exists with this email
        const existingUser = await prisma.user.findUnique({
          where: { email: profile.email },
          select: {
            id: true,
            email: true,
            phone: true,
            firstName: true,
            lastName: true,
            businessName: true,
            gstin: true,
            userType: true,
            verificationTier: true,
            isVerified: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        if (existingUser) {
          // Link DigiLocker account to existing user
          await prisma.socialLogin.create({
            data: {
              userId: existingUser.id,
              provider: 'digilocker',
              providerId: profile.id,
              accessToken: tokenData.access_token,
              refreshToken: tokenData.refresh_token || null,
            },
          });
          user = existingUser;
        } else {
          // Create new user with DigiLocker data
          const nameParts = profile.name.split(' ');
          const firstName = nameParts[0] || '';
          const lastName = nameParts.slice(1).join(' ') || '';

          const newUser = await prisma.user.create({
            data: {
              email: profile.email,
              phone: profile.mobile || null,
              firstName,
              lastName,
              verificationTier: 'enhanced', // DigiLocker users get enhanced tier
              isVerified: true, // DigiLocker accounts are considered verified
            },
            select: {
              id: true,
              email: true,
              phone: true,
              firstName: true,
              lastName: true,
              businessName: true,
              gstin: true,
              userType: true,
              verificationTier: true,
              isVerified: true,
              createdAt: true,
              updatedAt: true,
            },
          });

          // Create social login record
          await prisma.socialLogin.create({
            data: {
              userId: newUser.id,
              provider: 'digilocker',
              providerId: profile.id,
              accessToken: tokenData.access_token,
              refreshToken: tokenData.refresh_token || null,
            },
          });

          // Create wallet for the user
          await prisma.wallet.create({
            data: {
              userId: newUser.id,
              availableBalance: 0,
              lockedBalance: 0,
              negativeBalance: 0,
            },
          });

          // Create shopping cart for the user
          await prisma.shoppingCart.create({
            data: {
              userId: newUser.id,
            },
          });

          user = newUser;
          isNewUser = true;
        }
      }

      // Store/update user documents
      await this.syncUserDocuments(user.id, documents);

      // Generate JWT tokens
      const { AuthService } = await import('./auth.service');
      const tokens = AuthService.generateTokens({
        userId: user.id,
        email: user.email ?? undefined,
        phone: user.phone ?? undefined,
        userType: user.userType || 'user',
        verificationTier: user.verificationTier,
      });

      logger.info(`DigiLocker auth successful for user: ${user.id}, isNewUser: ${isNewUser}`);

      return {
        user,
        tokens,
        isNewUser,
        documents,
      };
    } catch (error) {
      logger.error('DigiLocker auth failed:', error);
      throw error;
    }
  }

  /**
   * Sync user documents with database
   */
  static async syncUserDocuments(userId: string, documents: any[]): Promise<void> {
    try {
      for (const doc of documents) {
        // Determine document type based on doctype or name
        let documentType = 'other';
        const docName = doc.name.toLowerCase();
        const docType = doc.doctype.toLowerCase();

        if (docName.includes('aadhaar') || docType.includes('aadhaar')) {
          documentType = 'aadhaar';
        } else if (docName.includes('pan') || docType.includes('pan')) {
          documentType = 'pan';
        } else if (docName.includes('driving') || docType.includes('driving')) {
          documentType = 'driving_license';
        } else if (docName.includes('passport') || docType.includes('passport')) {
          documentType = 'passport';
        } else if (docName.includes('voter') || docType.includes('voter')) {
          documentType = 'voter_id';
        }

        // Check if document already exists
        const existingDoc = await prisma.userDocument.findFirst({
          where: {
            userId,
            digilockerUri: doc.uri,
          },
        });

        if (!existingDoc) {
          await prisma.userDocument.create({
            data: {
              userId,
              documentType,
              documentNumber: doc.docId || 'DIGILOCKER_DOC',
              documentUrl: doc.uri,
              digilockerUri: doc.uri,
              verificationStatus: 'verified', // DigiLocker documents are pre-verified
            },
          });
        } else {
          // Update verification status if needed
          await prisma.userDocument.update({
            where: { id: existingDoc.id },
            data: {
              verificationStatus: 'verified',
            },
          });
        }
      }

      logger.info(`Synced ${documents.length} documents for user: ${userId}`);
    } catch (error) {
      logger.error('Document sync failed:', error);
      throw error;
    }
  }

  /**
   * Get user's DigiLocker documents from database
   */
  static async getUserDocumentsFromDB(userId: string) {
    try {
      const documents = await prisma.userDocument.findMany({
        where: {
          userId,
          digilockerUri: {
            not: null,
          },
        },
        select: {
          id: true,
          documentType: true,
          documentNumber: true,
          digilockerUri: true,
          verificationStatus: true,
          createdAt: true,
        },
      });

      return documents;
    } catch (error) {
      logger.error('Failed to get user documents from DB:', error);
      throw error;
    }
  }

  /**
   * Refresh user documents from DigiLocker
   */
  static async refreshUserDocuments(userId: string): Promise<DigiLockerDocument[]> {
    try {
      // Get user's DigiLocker social login
      const socialLogin = await prisma.socialLogin.findFirst({
        where: {
          userId,
          provider: 'digilocker',
        },
      });

      if (!socialLogin || !socialLogin.accessToken) {
        throw new Error('DigiLocker account not linked or access token not available');
      }

      // Fetch fresh documents from DigiLocker
      const documents = await this.getUserDocuments(socialLogin.accessToken);

      // Sync with database
      await this.syncUserDocuments(userId, documents);

      logger.info(`Refreshed documents for user: ${userId}`);

      return documents;
    } catch (error) {
      logger.error('Document refresh failed:', error);
      throw error;
    }
  }

  /**
   * Perform KYC verification based on DigiLocker documents
   */
  static async performKYCVerification(userId: string): Promise<{
    verificationTier: string;
    verifiedDocuments: string[];
    missingDocuments: string[];
  }> {
    try {
      const documents = await this.getUserDocumentsFromDB(userId);
      
      const verifiedDocuments: string[] = [];
      const requiredDocuments = ['aadhaar', 'pan'];
      const optionalDocuments = ['driving_license', 'passport', 'voter_id'];

      // Check which documents are verified
      documents.forEach(doc => {
        if (doc.verificationStatus === 'verified') {
          verifiedDocuments.push(doc.documentType);
        }
      });

      // Determine verification tier based on available documents
      let verificationTier = 'basic';
      
      const hasAadhaar = verifiedDocuments.includes('aadhaar');
      const hasPAN = verifiedDocuments.includes('pan');
      const hasOptionalDoc = optionalDocuments.some(doc => verifiedDocuments.includes(doc));

      if (hasAadhaar && hasPAN) {
        verificationTier = 'enhanced';
        if (hasOptionalDoc) {
          verificationTier = 'premium';
        }
      } else if (hasAadhaar || hasPAN) {
        verificationTier = 'standard';
      }

      // Update user verification tier
      await prisma.user.update({
        where: { id: userId },
        data: { verificationTier },
      });

      const missingDocuments = requiredDocuments.filter(doc => !verifiedDocuments.includes(doc));

      logger.info(`KYC verification completed for user: ${userId}, tier: ${verificationTier}`);

      return {
        verificationTier,
        verifiedDocuments,
        missingDocuments,
      };
    } catch (error) {
      logger.error('KYC verification failed:', error);
      throw error;
    }
  }
}