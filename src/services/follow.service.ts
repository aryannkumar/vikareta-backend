import { BaseService } from './base.service';
import { prisma } from '@/config/database';

class FollowService extends BaseService {
  async follow(followerId: string, followingId: string) {
    if (followerId === followingId) return { skipped: true } as any;
    await prisma.userFollow.upsert({
      where: { followerId_followingId: { followerId, followingId } },
      create: { followerId, followingId },
      update: {}
    });
    return { success: true };
  }

  async unfollow(followerId: string, followingId: string) {
    await prisma.userFollow.deleteMany({ where: { followerId, followingId } });
    return { success: true };
  }

  async following(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      prisma.userFollow.findMany({ where: { followerId: userId }, include: { following: { select: { id: true, firstName: true, lastName: true, businessName: true, avatar: true } } }, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.userFollow.count({ where: { followerId: userId } })
    ]);
    return { data: rows.map(r => r.following), total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async followers(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      prisma.userFollow.findMany({ where: { followingId: userId }, include: { follower: { select: { id: true, firstName: true, lastName: true, businessName: true, avatar: true } } }, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.userFollow.count({ where: { followingId: userId } })
    ]);
    return { data: rows.map(r => r.follower), total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}

export const followService = new FollowService();
