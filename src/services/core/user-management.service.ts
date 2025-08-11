import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';
import bcrypt from 'bcrypt';

export interface CreateUserData {
  email?: string;
  phone?: string;
  password: string;
  firstName?: string;
  lastName?: string;
  businessName?: string;
  gstin?: string;
  userType?: string;
}

export interface UpdateUserData {
  firstName?: string;
  lastName?: string;
  businessName?: string;
  gstin?: string;
  email?: string;
  phone?: string;
}

export interface UserFilters {
  userType?: string;
  verificationTier?: string;
  isVerified?: boolean;
  search?: string;
}

export class UserManagementService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Create a new user
   */
  async createUser(userData: CreateUserData): Promise<string> {
    try {
      // Check if user already exists
      const existingUser = await this.prisma.user.findFirst({
        where: {
          OR: [
            { email: userData.email },
            { phone: userData.phone },
          ],
        },
      });

      if (existingUser) {
        throw new Error('User already exists with this email or phone');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(userData.password, 10);

      // Create user
      const user = await this.prisma.user.create({
        data: {
          email: userData.email,
          phone: userData.phone,
          passwordHash,
          firstName: userData.firstName,
          lastName: userData.lastName,
          businessName: userData.businessName,
          gstin: userData.gstin,
          userType: userData.userType || 'user',
          verificationTier: 'basic',
          isVerified: false,
        },
      });

      // Create wallet for user
      await this.prisma.wallet.create({
        data: {
          userId: user.id,
          availableBalance: 0,
          lockedBalance: 0,
          negativeBalance: 0,
        },
      });

      // Mock notification preferences creation (model doesn't exist)
      logger.info('Default notification preferences would be created', {
        userId: user.id,
        emailNotifications: true,
        smsNotifications: true,
        pushNotifications: true,
        orderUpdates: true,
        promotionalEmails: false,
        securityAlerts: true,
      });

      logger.info('User created successfully', { userId: user.id });
      return user.id;
    } catch (error) {
      logger.error('Error creating user:', error);
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateUser(userId: string, updateData: UpdateUserData): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Check if email/phone is already taken by another user
      if (updateData.email || updateData.phone) {
        const existingUser = await this.prisma.user.findFirst({
          where: {
            AND: [
              { id: { not: userId } },
              {
                OR: [
                  { email: updateData.email },
                  { phone: updateData.phone },
                ],
              },
            ],
          },
        });

        if (existingUser) {
          throw new Error('Email or phone already taken by another user');
        }
      }

      // Update user
      await this.prisma.user.update({
        where: { id: userId },
        data: updateData,
      });

      logger.info('User updated successfully', { userId });
    } catch (error) {
      logger.error('Error updating user:', error);
      throw error;
    }
  }

  /**
   * Get user details
   */
  async getUserDetails(userId: string): Promise<any> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          wallet: true,
          notificationPreferences: true,
          shippingAddresses: {
            orderBy: { isDefault: 'desc' },
          },
          products: {
            where: { status: 'active' },
            take: 5,
            select: {
              id: true,
              title: true,
              price: true,
              stockQuantity: true,
            },
          },
          services: {
            where: { status: 'active' },
            take: 5,
            select: {
              id: true,
              title: true,
              price: true,
            },
          },
          buyerOrders: {
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              orderNumber: true,
              status: true,
              totalAmount: true,
              createdAt: true,
            },
          },
          sellerOrders: {
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              orderNumber: true,
              status: true,
              totalAmount: true,
              createdAt: true,
            },
          },
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Remove sensitive data
      const { passwordHash, ...userWithoutPassword } = user;

      return userWithoutPassword;
    } catch (error) {
      logger.error('Error getting user details:', error);
      throw error;
    }
  }

  /**
   * Search users
   */
  async searchUsers(
    filters: UserFilters,
    page = 1,
    limit = 20
  ): Promise<{
    users: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const where: any = {};

      if (filters.userType) where.userType = filters.userType;
      if (filters.verificationTier) where.verificationTier = filters.verificationTier;
      if (filters.isVerified !== undefined) where.isVerified = filters.isVerified;

      if (filters.search) {
        where.OR = [
          { firstName: { contains: filters.search, mode: 'insensitive' } },
          { lastName: { contains: filters.search, mode: 'insensitive' } },
          { businessName: { contains: filters.search, mode: 'insensitive' } },
          { email: { contains: filters.search, mode: 'insensitive' } },
          { phone: { contains: filters.search, mode: 'insensitive' } },
        ];
      }

      const skip = (page - 1) * limit;

      const [users, total] = await Promise.all([
        this.prisma.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            phone: true,
            firstName: true,
            lastName: true,
            businessName: true,
            userType: true,
            verificationTier: true,
            isVerified: true,
            createdAt: true,
            _count: {
              select: {
                products: true,
                services: true,
                buyerOrders: true,
                sellerOrders: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.user.count({ where }),
      ]);

      return {
        users,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error('Error searching users:', error);
      throw error;
    }
  }

  /**
   * Verify user
   */
  async verifyUser(userId: string, verificationTier: string = 'verified'): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          isVerified: true,
          verificationTier,
        },
      });

      // Send verification notification
      await this.prisma.notification.create({
        data: {
          userId,
          type: 'account_verified',
          title: 'Account Verified',
          message: `Your account has been verified with ${verificationTier} tier.`,
          data: { verificationTier },
        },
      });

      logger.info('User verified successfully', { userId, verificationTier });
    } catch (error) {
      logger.error('Error verifying user:', error);
      throw error;
    }
  }

  /**
   * Change user password
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash || '');
      if (!isCurrentPasswordValid) {
        throw new Error('Current password is incorrect');
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      // Update password
      await this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
      });

      // Send security notification
      await this.prisma.notification.create({
        data: {
          userId,
          type: 'password_changed',
          title: 'Password Changed',
          message: 'Your password has been changed successfully.',
          data: { timestamp: new Date() },
        },
      });

      logger.info('Password changed successfully', { userId });
    } catch (error) {
      logger.error('Error changing password:', error);
      throw error;
    }
  }

  /**
   * Get user analytics
   */
  async getUserAnalytics(): Promise<{
    totalUsers: number;
    verifiedUsers: number;
    businessUsers: number;
    newUsersThisMonth: number;
    usersByType: Record<string, number>;
    usersByVerificationTier: Record<string, number>;
  }> {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [
        totalUsers,
        verifiedUsers,
        businessUsers,
        newUsersThisMonth,
        usersByType,
        usersByVerificationTier,
      ] = await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { isVerified: true } }),
        this.prisma.user.count({ where: { userType: 'business' } }),
        this.prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
        this.prisma.user.groupBy({
          by: ['userType'],
          _count: { id: true },
        }),
        this.prisma.user.groupBy({
          by: ['verificationTier'],
          _count: { id: true },
        }),
      ]);

      const userTypeStats: Record<string, number> = {};
      usersByType.forEach(group => {
        userTypeStats[group.userType] = group._count.id;
      });

      const verificationTierStats: Record<string, number> = {};
      usersByVerificationTier.forEach(group => {
        verificationTierStats[group.verificationTier] = group._count.id;
      });

      return {
        totalUsers,
        verifiedUsers,
        businessUsers,
        newUsersThisMonth,
        usersByType: userTypeStats,
        usersByVerificationTier: verificationTierStats,
      };
    } catch (error) {
      logger.error('Error getting user analytics:', error);
      throw error;
    }
  }

  /**
   * Deactivate user
   */
  async deactivateUser(userId: string, reason?: string): Promise<void> {
    try {
      // Update user status (assuming we add a status field)
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          isVerified: false,
          // status: 'inactive', // Add this field to schema if needed
        },
      });

      // Deactivate user's products and services
      await Promise.all([
        this.prisma.product.updateMany({
          where: { sellerId: userId },
          data: { status: 'inactive' },
        }),
        this.prisma.service.updateMany({
          where: { providerId: userId },
          data: { status: 'inactive' },
        }),
      ]);

      // Send notification
      await this.prisma.notification.create({
        data: {
          userId,
          type: 'account_deactivated',
          title: 'Account Deactivated',
          message: reason || 'Your account has been deactivated.',
          data: { reason, timestamp: new Date() },
        },
      });

      logger.info('User deactivated successfully', { userId, reason });
    } catch (error) {
      logger.error('Error deactivating user:', error);
      throw error;
    }
  }
}

export default UserManagementService;