import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export interface FollowRequest {
  followerId: string;
  followingId: string;
}

export interface FollowStats {
  followersCount: number;
  followingCount: number;
  mutualFollowsCount: number;
}

export interface FollowActivity {
  id: string;
  type: 'follow' | 'unfollow';
  follower: {
    id: string;
    name: string;
    businessName?: string;
    verificationTier: string;
  };
  following: {
    id: string;
    name: string;
    businessName?: string;
    verificationTier: string;
  };
  createdAt: Date;
}

export interface FollowAnalytics {
  totalFollowers: number;
  totalFollowing: number;
  followersGrowth: Array<{
    month: string;
    count: number;
  }>;
  topFollowers: Array<{
    userId: string;
    userName: string;
    businessName?: string | null;
    verificationTier: string;
    followedAt: Date;
  }>;
  followingByTier: Record<string, number>;
}

export class FollowService {
  /**
   * Follow a user
   */
  async followUser(followerId: string, followingId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(followerId) || !uuidRegex.test(followingId)) {
        return {
          success: false,
          message: 'Invalid user ID'
        };
      }

      // Cannot follow yourself
      if (followerId === followingId) {
        return {
          success: false,
          message: 'Cannot follow yourself'
        };
      }

      // Check if both users exist
      const [follower, following] = await Promise.all([
        prisma.user.findUnique({ where: { id: followerId } }),
        prisma.user.findUnique({ where: { id: followingId } })
      ]);

      if (!follower || !following) {
        return {
          success: false,
          message: 'User not found'
        };
      }

      // Check if already following
      const existingFollow = await prisma.userFollow.findUnique({
        where: {
          followerId_followingId: {
            followerId,
            followingId
          }
        }
      });

      if (existingFollow) {
        return {
          success: false,
          message: 'Already following this user'
        };
      }

      // Create follow relationship
      await prisma.userFollow.create({
        data: {
          followerId,
          followingId
        }
      });

      logger.info('User followed successfully:', {
        followerId,
        followingId,
        followerName: follower.businessName || `${follower.firstName} ${follower.lastName}`,
        followingName: following.businessName || `${following.firstName} ${following.lastName}`
      });

      return {
        success: true,
        message: 'User followed successfully'
      };
    } catch (error) {
      logger.error('Error following user:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to follow user'
      };
    }
  }

  /**
   * Unfollow a user
   */
  async unfollowUser(followerId: string, followingId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(followerId) || !uuidRegex.test(followingId)) {
        return {
          success: false,
          message: 'Invalid user ID'
        };
      }

      // Check if follow relationship exists
      const existingFollow = await prisma.userFollow.findUnique({
        where: {
          followerId_followingId: {
            followerId,
            followingId
          }
        }
      });

      if (!existingFollow) {
        return {
          success: false,
          message: 'Not following this user'
        };
      }

      // Remove follow relationship
      await prisma.userFollow.delete({
        where: {
          followerId_followingId: {
            followerId,
            followingId
          }
        }
      });

      logger.info('User unfollowed successfully:', {
        followerId,
        followingId
      });

      return {
        success: true,
        message: 'User unfollowed successfully'
      };
    } catch (error) {
      logger.error('Error unfollowing user:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to unfollow user'
      };
    }
  }

  /**
   * Check if user is following another user
   */
  async isFollowing(followerId: string, followingId: string): Promise<{
    success: boolean;
    isFollowing?: boolean;
    message: string;
  }> {
    try {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(followerId) || !uuidRegex.test(followingId)) {
        return {
          success: false,
          message: 'Invalid user ID'
        };
      }

      const follow = await prisma.userFollow.findUnique({
        where: {
          followerId_followingId: {
            followerId,
            followingId
          }
        }
      });

      return {
        success: true,
        isFollowing: !!follow,
        message: 'Follow status retrieved successfully'
      };
    } catch (error) {
      logger.error('Error checking follow status:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to check follow status'
      };
    }
  }

  /**
   * Get user's followers
   */
  async getFollowers(userId: string, options: {
    page?: number;
    limit?: number;
    sortBy?: 'createdAt' | 'name';
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<{
    success: boolean;
    followers?: any[];
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    message: string;
  }> {
    try {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        return {
          success: false,
          message: 'Invalid user ID'
        };
      }

      const {
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = options;

      const skip = (page - 1) * limit;

      // Get total count
      const total = await prisma.userFollow.count({
        where: { followingId: userId }
      });

      // Get followers with user details
      const follows = await prisma.userFollow.findMany({
        where: { followingId: userId },
        include: {
          follower: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              verificationTier: true,
              isVerified: true
            }
          }
        },
        orderBy: sortBy === 'createdAt' 
          ? { createdAt: sortOrder }
          : { follower: { firstName: sortOrder } },
        skip,
        take: limit
      });

      const followers = follows.map(follow => ({
        id: follow.follower.id,
        name: `${follow.follower.firstName} ${follow.follower.lastName}`,
        businessName: follow.follower.businessName,
        verificationTier: follow.follower.verificationTier,
        isVerified: follow.follower.isVerified,
        followedAt: follow.createdAt
      }));

      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        followers,
        pagination: {
          page,
          limit,
          total,
          totalPages
        },
        message: 'Followers retrieved successfully'
      };
    } catch (error) {
      logger.error('Error getting followers:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get followers'
      };
    }
  }

  /**
   * Get users that a user is following
   */
  async getFollowing(userId: string, options: {
    page?: number;
    limit?: number;
    sortBy?: 'createdAt' | 'name';
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<{
    success: boolean;
    following?: any[];
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    message: string;
  }> {
    try {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        return {
          success: false,
          message: 'Invalid user ID'
        };
      }

      const {
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = options;

      const skip = (page - 1) * limit;

      // Get total count
      const total = await prisma.userFollow.count({
        where: { followerId: userId }
      });

      // Get following with user details
      const follows = await prisma.userFollow.findMany({
        where: { followerId: userId },
        include: {
          following: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              verificationTier: true,
              isVerified: true
            }
          }
        },
        orderBy: sortBy === 'createdAt' 
          ? { createdAt: sortOrder }
          : { following: { firstName: sortOrder } },
        skip,
        take: limit
      });

      const following = follows.map(follow => ({
        id: follow.following.id,
        name: `${follow.following.firstName} ${follow.following.lastName}`,
        businessName: follow.following.businessName,
        verificationTier: follow.following.verificationTier,
        isVerified: follow.following.isVerified,
        followedAt: follow.createdAt
      }));

      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        following,
        pagination: {
          page,
          limit,
          total,
          totalPages
        },
        message: 'Following list retrieved successfully'
      };
    } catch (error) {
      logger.error('Error getting following list:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get following list'
      };
    }
  }

  /**
   * Get follow statistics for a user
   */
  async getFollowStats(userId: string): Promise<{
    success: boolean;
    stats?: FollowStats;
    message: string;
  }> {
    try {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        return {
          success: false,
          message: 'Invalid user ID'
        };
      }

      const [followersCount, followingCount, mutualFollows] = await Promise.all([
        // Count followers
        prisma.userFollow.count({
          where: { followingId: userId }
        }),
        // Count following
        prisma.userFollow.count({
          where: { followerId: userId }
        }),
        // Count mutual follows (users who follow each other)
        prisma.userFollow.count({
          where: {
            followerId: userId,
            following: {
              followers: {
                some: {
                  followerId: userId
                }
              }
            }
          }
        })
      ]);

      const stats: FollowStats = {
        followersCount,
        followingCount,
        mutualFollowsCount: mutualFollows
      };

      return {
        success: true,
        stats,
        message: 'Follow statistics retrieved successfully'
      };
    } catch (error) {
      logger.error('Error getting follow stats:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get follow statistics'
      };
    }
  }

  /**
   * Get mutual follows between two users
   */
  async getMutualFollows(userId1: string, userId2: string): Promise<{
    success: boolean;
    mutualFollows?: any[];
    message: string;
  }> {
    try {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId1) || !uuidRegex.test(userId2)) {
        return {
          success: false,
          message: 'Invalid user ID'
        };
      }

      // Get users that both users follow
      const mutualFollows = await prisma.user.findMany({
        where: {
          AND: [
            {
              followers: {
                some: { followerId: userId1 }
              }
            },
            {
              followers: {
                some: { followerId: userId2 }
              }
            }
          ]
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          businessName: true,
          verificationTier: true,
          isVerified: true
        }
      });

      const formattedMutualFollows = mutualFollows.map(user => ({
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        businessName: user.businessName,
        verificationTier: user.verificationTier,
        isVerified: user.isVerified
      }));

      return {
        success: true,
        mutualFollows: formattedMutualFollows,
        message: 'Mutual follows retrieved successfully'
      };
    } catch (error) {
      logger.error('Error getting mutual follows:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get mutual follows'
      };
    }
  }

  /**
   * Get follow analytics for a user
   */
  async getFollowAnalytics(userId: string): Promise<{
    success: boolean;
    analytics?: FollowAnalytics;
    message: string;
  }> {
    try {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        return {
          success: false,
          message: 'Invalid user ID'
        };
      }

      // Get basic counts
      const [totalFollowers, totalFollowing] = await Promise.all([
        prisma.userFollow.count({ where: { followingId: userId } }),
        prisma.userFollow.count({ where: { followerId: userId } })
      ]);

      // Get followers growth over last 12 months
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

      const recentFollowers = await prisma.userFollow.findMany({
        where: {
          followingId: userId,
          createdAt: {
            gte: twelveMonthsAgo
          }
        },
        select: {
          createdAt: true
        }
      });

      // Group by month
      const followersGrowthMap = new Map<string, number>();
      recentFollowers.forEach(follow => {
        const month = follow.createdAt.toISOString().substring(0, 7); // YYYY-MM format
        followersGrowthMap.set(month, (followersGrowthMap.get(month) || 0) + 1);
      });

      const followersGrowth = Array.from(followersGrowthMap.entries())
        .map(([month, count]) => ({ month, count }))
        .sort((a, b) => a.month.localeCompare(b.month));

      // Get top followers (most recent)
      const topFollowersData = await prisma.userFollow.findMany({
        where: { followingId: userId },
        include: {
          follower: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessName: true,
              verificationTier: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      });

      const topFollowers = topFollowersData.map(follow => ({
        userId: follow.follower.id,
        userName: `${follow.follower.firstName} ${follow.follower.lastName}`,
        businessName: follow.follower.businessName,
        verificationTier: follow.follower.verificationTier,
        followedAt: follow.createdAt
      }));

      // Get following by verification tier
      const followingByTierData = await prisma.userFollow.groupBy({
        by: ['followingId'],
        where: { followerId: userId },
        _count: { followingId: true }
      });

      const followingIds = followingByTierData.map(item => item.followingId);
      const followingUsers = await prisma.user.findMany({
        where: { id: { in: followingIds } },
        select: {
          id: true,
          verificationTier: true
        }
      });

      const followingByTier = followingUsers.reduce((acc, user) => {
        acc[user.verificationTier] = (acc[user.verificationTier] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const analytics: FollowAnalytics = {
        totalFollowers,
        totalFollowing,
        followersGrowth,
        topFollowers,
        followingByTier
      };

      return {
        success: true,
        analytics,
        message: 'Follow analytics retrieved successfully'
      };
    } catch (error) {
      logger.error('Error getting follow analytics:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get follow analytics'
      };
    }
  }

  /**
   * Get suggested users to follow based on mutual connections and activity
   */
  async getSuggestedFollows(userId: string, limit: number = 10): Promise<{
    success: boolean;
    suggestions?: any[];
    message: string;
  }> {
    try {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        return {
          success: false,
          message: 'Invalid user ID'
        };
      }

      // Get users that the current user's follows are following (2nd degree connections)
      const suggestions = await prisma.user.findMany({
        where: {
          AND: [
            // Not the current user
            { id: { not: userId } },
            // Not already following
            {
              followers: {
                none: { followerId: userId }
              }
            },
            // Has followers from people the current user follows
            {
              followers: {
                some: {
                  follower: {
                    followers: {
                      some: { followerId: userId }
                    }
                  }
                }
              }
            }
          ]
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          businessName: true,
          verificationTier: true,
          isVerified: true,
          _count: {
            select: {
              followers: true,
              follows: true
            }
          }
        },
        take: limit
      });

      const formattedSuggestions = suggestions.map(user => ({
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        businessName: user.businessName,
        verificationTier: user.verificationTier,
        isVerified: user.isVerified,
        followersCount: user._count.followers,
        followingCount: user._count.follows
      }));

      return {
        success: true,
        suggestions: formattedSuggestions,
        message: 'Follow suggestions retrieved successfully'
      };
    } catch (error) {
      logger.error('Error getting follow suggestions:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get follow suggestions'
      };
    }
  }
}

export const followService = new FollowService();