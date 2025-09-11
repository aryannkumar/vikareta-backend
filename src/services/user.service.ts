import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
// Local fallbacks for types to avoid build issues when Prisma types are unavailable at tooling time
// These are intentionally broad; actual runtime types come from Prisma
type User = any;
type Prisma = any;
import { BaseService, PaginationOptions, SortOptions, PaginatedResult } from './base.service';
import { config } from '../config/environment';
import { ValidationError, NotFoundError, ConflictError, AuthenticationError } from '../middleware/error-handler';
import { elasticsearchHelper, INDICES } from '@/config/elasticsearch';
import { JWTPayload } from '../types/auth.types';

export interface CreateUserData {
  email?: string;
  phone?: string;
  password: string;
  firstName?: string;
  lastName?: string;
  businessName?: string;
  gstin?: string;
  userType: string;
  role?: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

export interface UpdateUserData {
  firstName?: string;
  lastName?: string;
  businessName?: string;
  gstin?: string;
  bio?: string;
  website?: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

export interface LoginCredentials {
  email?: string;
  phone?: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: Partial<User>;
}

export class UserService extends BaseService {
  /**
   * Create a new user
   */
  async createUser(data: CreateUserData): Promise<User> {
    try {
      // Validate required fields
      if (!data.email && !data.phone) {
        throw new ValidationError('Either email or phone is required');
      }

      if (!data.password) {
        throw new ValidationError('Password is required');
      }

      // Check if user already exists
      const existingUser = await this.prisma.user.findFirst({
        where: {
          OR: [
            data.email ? { email: data.email } : {},
            data.phone ? { phone: data.phone } : {},
          ].filter(condition => Object.keys(condition).length > 0),
        },
      });

      if (existingUser) {
        throw new ConflictError('User with this email or phone already exists');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(data.password, 12);

      // Prevent unknown field errors by excluding raw password and only passing allowed fields
      const allowedData = {
        email: data.email,
        phone: data.phone,
        firstName: data.firstName,
        lastName: data.lastName,
        businessName: data.businessName,
        gstin: data.gstin,
        userType: data.userType,
        role: data.role,
        location: data.location,
        city: data.city,
        state: data.state,
        country: data.country,
        postalCode: data.postalCode,
      } as const;

      // Create user
      const user = await this.prisma.user.create({
        data: {
          ...allowedData,
          passwordHash,
          isActive: true,
          isVerified: false,
          verificationTier: 'basic',
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

      // Create shopping cart for user
      await this.prisma.shoppingCart.create({
        data: {
          userId: user.id,
        },
      });

      // Index user in Elasticsearch
      await this.indexUserInElasticsearch(user);

  // Remove password hash from response
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _passwordHash, ...userWithoutPassword } = user as any;

  this.logOperation('createUser', { userId: user.id, userType: user.userType });

  return userWithoutPassword as User;
    } catch (error) {
      this.handleError(error, 'createUser', data);
    }
  }

  /**
   * Authenticate user and return tokens
   */
  async login(credentials: LoginCredentials): Promise<AuthTokens> {
    try {
      // Find user by email or phone
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [
            credentials.email ? { email: credentials.email } : {},
            credentials.phone ? { phone: credentials.phone } : {},
          ].filter(condition => Object.keys(condition).length > 0),
        },
      });

      if (!user) {
        throw new AuthenticationError('Invalid credentials');
      }

      if (!user.isActive) {
        throw new AuthenticationError('Account has been deactivated');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(credentials.password, user.passwordHash || '');
      if (!isPasswordValid) {
        throw new AuthenticationError('Invalid credentials');
      }

      // Generate tokens
      const tokens = this.generateTokens(user);

      // Cache user data
      await this.cache.set(`user:${user.id}`, {
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role,
        userType: user.userType,
        isVerified: user.isVerified,
        verificationTier: user.verificationTier,
        isActive: user.isActive,
      }, 900); // 15 minutes

  // Remove password hash from response
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _passwordHash, ...userWithoutPassword } = user as any;

      this.logOperation('login', { userId: user.id, userType: user.userType });

      return {
        ...tokens,
        user: userWithoutPassword,
      };
    } catch (error) {
      this.handleError(error, 'login', credentials);
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string): Promise<any | null> {
    try {
      this.validateUUID(id, 'userId');

      const cacheKey = this.buildCacheKey('user', id);
      
      return await this.getWithCache(
        cacheKey,
        async () => {
          const user = await this.prisma.user.findUnique({
            where: { id },
            select: {
              id: true,
              email: true,
              phone: true,
              firstName: true,
              lastName: true,
              businessName: true,
              gstin: true,
              userType: true,
              role: true,
              verificationTier: true,
              isVerified: true,
              isActive: true,
              avatar: true,
              bio: true,
              website: true,
              location: true,
              city: true,
              state: true,
              country: true,
              postalCode: true,
              latitude: true,
              longitude: true,
              createdAt: true,
              updatedAt: true,
            },
          });

          return user;
        },
        3600 // 1 hour
      );
    } catch (error) {
      this.handleError(error, 'getUserById', { id });
    }
  }

  /**
   * Update user profile
   */
  async updateUser(id: string, data: UpdateUserData): Promise<User> {
    try {
      this.validateUUID(id, 'userId');

      await this.checkRecordExists(this.prisma.user, id, 'User not found');

      const user = await this.prisma.user.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });

      // Invalidate cache
      await this.invalidateCache(`user:${id}*`);

      // Update in Elasticsearch
      await this.indexUserInElasticsearch(user);

  // Remove password hash from response
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _passwordHash, ...userWithoutPassword } = user as any;

      this.logOperation('updateUser', { userId: id }, id);

      return userWithoutPassword as User;
    } catch (error) {
      this.handleError(error, 'updateUser', { id, data });
    }
  }

  /**
   * Get users with pagination and filters
   */
  async getUsers(
    pagination: PaginationOptions,
    sort: SortOptions,
    filters: {
      userType?: string;
      verificationTier?: string;
      isVerified?: boolean;
      isActive?: boolean;
      city?: string;
      state?: string;
      country?: string;
      search?: string;
    } = {}
  ): Promise<PaginatedResult<User>> {
    try {
  const where: any = {};

      // Apply filters
      if (filters.userType) {
        where.userType = filters.userType;
      }

      if (filters.verificationTier) {
        where.verificationTier = filters.verificationTier;
      }

      if (filters.isVerified !== undefined) {
        where.isVerified = filters.isVerified;
      }

      if (filters.isActive !== undefined) {
        where.isActive = filters.isActive;
      }

      if (filters.city) {
        where.city = { contains: filters.city, mode: 'insensitive' };
      }

      if (filters.state) {
        where.state = { contains: filters.state, mode: 'insensitive' };
      }

      if (filters.country) {
        where.country = { contains: filters.country, mode: 'insensitive' };
      }

      // Apply search
      if (filters.search) {
        where.OR = [
          { firstName: { contains: filters.search, mode: 'insensitive' } },
          { lastName: { contains: filters.search, mode: 'insensitive' } },
          { businessName: { contains: filters.search, mode: 'insensitive' } },
          { email: { contains: filters.search, mode: 'insensitive' } },
        ];
      }

      // Get total count
      const total = await this.prisma.user.count({ where });

      // Get users
      const users = await this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          phone: true,
          firstName: true,
          lastName: true,
          businessName: true,
          gstin: true,
          userType: true,
          role: true,
          verificationTier: true,
          isVerified: true,
          isActive: true,
          avatar: true,
          location: true,
          city: true,
          state: true,
          country: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: this.buildOrderBy(sort),
        skip: pagination.skip,
        take: pagination.limit,
      });

      return this.createPaginatedResult(users as User[], total, pagination);
    } catch (error) {
      this.handleError(error, 'getUsers', { pagination, sort, filters });
    }
  }

  /**
   * Change user password
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    try {
      this.validateUUID(userId, 'userId');

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, passwordHash: true },
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash || '');
      if (!isCurrentPasswordValid) {
        throw new AuthenticationError('Current password is incorrect');
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 12);

      // Update password
      await this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
      });

      // Invalidate cache
      await this.invalidateCache(`user:${userId}*`);

      this.logOperation('changePassword', { userId });
    } catch (error) {
      this.handleError(error, 'changePassword', { userId });
    }
  }

  /**
   * Deactivate user account
   */
  async deactivateUser(id: string): Promise<void> {
    try {
      this.validateUUID(id, 'userId');

      await this.checkRecordExists(this.prisma.user, id, 'User not found');

      await this.prisma.user.update({
        where: { id },
        data: { isActive: false },
      });

      // Invalidate cache
      await this.invalidateCache(`user:${id}*`);

      this.logOperation('deactivateUser', { userId: id });
    } catch (error) {
      this.handleError(error, 'deactivateUser', { id });
    }
  }

  /**
   * Follow another user
   */
  async followUser(followerId: string, followingId: string): Promise<void> {
    try {
      this.validateUUID(followerId, 'followerId');
      this.validateUUID(followingId, 'followingId');

      if (followerId === followingId) return;

  await this.prisma.$transaction(async (tx: any) => {
        await tx.userFollow.upsert({
          where: { followerId_followingId: { followerId, followingId } },
          create: { followerId, followingId },
          update: {},
        }).catch(() => null);
      });

      await this.invalidateCache(`user:${followerId}:following*`);
      await this.invalidateCache(`user:${followingId}:followers*`);

      this.logOperation('followUser', { followerId, followingId });
    } catch (error) {
      this.handleError(error, 'followUser', { followerId, followingId });
    }
  }

  /**
   * Unfollow a user
   */
  async unfollowUser(followerId: string, followingId: string): Promise<void> {
    try {
      this.validateUUID(followerId, 'followerId');
      this.validateUUID(followingId, 'followingId');

  await this.prisma.$transaction(async (tx: any) => {
        await tx.userFollow.deleteMany({ where: { followerId, followingId } });
      });

      await this.invalidateCache(`user:${followerId}:following*`);
      await this.invalidateCache(`user:${followingId}:followers*`);

      this.logOperation('unfollowUser', { followerId, followingId });
    } catch (error) {
      this.handleError(error, 'unfollowUser', { followerId, followingId });
    }
  }

  async getFollowing(userId: string, page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit;
      const [rows, total] = await Promise.all([
        this.prisma.userFollow.findMany({
          where: { followerId: userId },
          include: { following: { select: { id: true, firstName: true, lastName: true, businessName: true, avatar: true } } },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' }
        }),
        this.prisma.userFollow.count({ where: { followerId: userId } })
      ]);

  return { data: rows.map((r: any) => r.following), total };
    } catch (error) {
      this.handleError(error, 'getFollowing', { userId, page, limit });
    }
  }

  async getFollowers(userId: string, page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit;
      const [rows, total] = await Promise.all([
        this.prisma.userFollow.findMany({
          where: { followingId: userId },
          include: { follower: { select: { id: true, firstName: true, lastName: true, businessName: true, avatar: true } } },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' }
        }),
        this.prisma.userFollow.count({ where: { followingId: userId } })
      ]);

  return { data: rows.map((r: any) => r.follower), total };
    } catch (error) {
      this.handleError(error, 'getFollowers', { userId, page, limit });
    }
  }

  /**
   * Generate JWT tokens
   */
  private generateTokens(user: User): { accessToken: string; refreshToken: string } {
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      userType: user.userType,
      aud: 'web',
    };

    const accessToken = jwt.sign(payload, config.jwt.secret || 'fallback-secret', {
      expiresIn: '1h',
    });

    const refreshToken = jwt.sign(payload, config.jwt.refreshSecret || 'fallback-refresh-secret', {
      expiresIn: '7d',
    });

    return { accessToken, refreshToken };
  }

  /**
   * Index user in Elasticsearch
   */
  private async indexUserInElasticsearch(user: User): Promise<void> {
    try {
      const userDoc = {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        businessName: user.businessName,
        gstin: user.gstin,
        userType: user.userType,
        role: user.role,
        verificationTier: user.verificationTier,
        isVerified: user.isVerified,
        isActive: user.isActive,
        location: user.location,
        city: user.city,
        state: user.state,
        country: user.country,
        postalCode: user.postalCode,
        latitude: user.latitude,
        longitude: user.longitude,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };

      await elasticsearchHelper.indexDocument(INDICES.USERS, user.id, userDoc);
    } catch (error) {
      this.logger.error('Failed to index user in Elasticsearch:', error);
      // Don't throw error as this is not critical
    }
  }
}