import { BaseService } from '@/services/base.service';
import { adminActionService } from '@/services/admin-action.service';

export class UserAdminService extends BaseService {
  async verifyUser(userId: string, verificationTier: string, adminId: string, notes?: string) {
    this.validateUUID(userId, 'userId');
    await this.prisma.user.update({
      where: { id: userId },
      data: { verificationTier, isVerified: verificationTier !== 'basic' },
    });
    await adminActionService.log('USER_VERIFY', 'USER', userId, adminId, { verificationTier, notes });
    await this.invalidateCache(`user:${userId}*`);
    this.logOperation('verifyUser', { userId, verificationTier }, adminId);
    return { id: userId, verificationTier };
  }

  async activateUser(userId: string, adminId: string) {
    this.validateUUID(userId, 'userId');
    await this.prisma.user.update({ where: { id: userId }, data: { isActive: true } });
    await adminActionService.log('USER_ACTIVATE', 'USER', userId, adminId, {});
    await this.invalidateCache(`user:${userId}*`);
    this.logOperation('activateUser', { userId }, adminId);
    return { id: userId, isActive: true };
  }
}

export const userAdminService = new UserAdminService();
