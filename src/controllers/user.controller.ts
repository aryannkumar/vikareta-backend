import { Request, Response } from 'express';
import { UserService } from '@/services/user.service';
import { logger } from '@/utils/logger';
import { userDocumentService } from '../services/user-document.service';
import { notificationSettingsService } from '@/services/notification-settings.service';
import { businessProfileService } from '../services/business-profile.service';
import { userStatsService } from '@/services/user-stats.service';
import { followService } from '@/services/follow.service';
import { minioService } from '@/services/minio.service';
import { userAdminService } from '@/services/user-admin.service';

export class UserController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  async getProfile(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const user = await this.userService.getUserById(userId);
    res.json({ success: true, data: user });
  }

  async updateProfile(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const user = await this.userService.updateUser(userId, req.body);
    res.json({ success: true, data: user, message: 'Profile updated successfully' });
  }

  async uploadAvatar(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      if (!req.file && !req.files) {
        res.status(400).json({ success: false, error: 'No file uploaded' });
        return;
      }

      // Support single-file middleware (e.g., multer) or raw buffer
      const file: any = (req as any).file || (Array.isArray((req as any).files) && (req as any).files[0]);

      if (!file) {
        res.status(400).json({ success: false, error: 'No file uploaded' });
        return;
      }

      const upload = await minioService.uploadFile(file.buffer || file.data || file, file.originalname || file.filename, 'users');

      // Update user's avatar URL
      await this.userService.updateUser(userId, { avatar: upload.url } as any);

      res.status(200).json({ success: true, message: 'Avatar uploaded', data: upload });
    } catch (error) {
      logger.error('Error uploading avatar:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async deleteAvatar(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const user = await this.userService.getUserById(userId);
      if (!user || !user.avatar) {
        res.status(404).json({ success: false, error: 'Avatar not found' });
        return;
      }

      const fileName = user.avatar.split('/').pop() as string;
      await minioService.deleteFile(fileName, 'users');

      await this.userService.updateUser(userId, { avatar: null } as any);

      res.status(200).json({ success: true, message: 'Avatar deleted successfully' });
    } catch (error) {
      logger.error('Error deleting avatar:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async uploadVerificationDocuments(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const { documents } = req.body as any;
    if (!Array.isArray(documents) || !documents.length) { res.status(400).json({ success: false, error: 'documents array required' }); return; }
    const created = await userDocumentService.bulkCreate(userId, documents);
    res.json({ success: true, message: 'Documents submitted', data: { count: created.count } });
  }

  async getVerificationStatus(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const docs = await userDocumentService.list(userId);
    res.json({ success: true, data: { documents: docs } });
  }

  async getPreferences(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const prefs = await notificationSettingsService.get(userId);
    res.json({ success: true, data: prefs || {} });
  }

  async updatePreferences(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const saved = await notificationSettingsService.upsert(userId, req.body);
    res.json({ success: true, message: 'Preferences updated successfully', data: saved });
  }

  // Address CRUD removed – use shipping controller endpoints instead.

  async getBusinessProfile(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const profile = await businessProfileService.get(userId);
    res.json({ success: true, data: profile || null });
  }

  async updateBusinessProfile(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const saved = await businessProfileService.upsert(userId, { ...req.body, userEmail: req.user!.email, userPhone: req.user!.phone });
    res.json({ success: true, message: 'Business profile updated successfully', data: saved });
  }

  async getUserStats(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const stats = await userStatsService.get(userId);
    res.json({ success: true, data: stats });
  }

  async getUserActivity(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const stats = await userStatsService.get(userId);
    const activity = [
      ...stats.recentProducts.map(r => ({ type: 'product', id: r.id, title: r.title, createdAt: r.createdAt })),
      ...stats.recentQuotes.map(r => ({ type: 'quote', id: r.id, totalPrice: r.totalPrice, status: r.status, createdAt: r.createdAt })),
      ...stats.recentOrders.map(r => ({ type: 'order', id: r.id, orderNumber: r.orderNumber, status: r.status, createdAt: r.createdAt })),
    ].sort((a,b) => (b.createdAt as any) - (a.createdAt as any));
    res.json({ success: true, data: activity });
  }

  async getFollowing(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const page = parseInt((req.query.page as string) || '1');
      const limit = parseInt((req.query.limit as string) || '20');
  const result = await followService.following(userId, page, limit);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      logger.error('Error getting following:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async getFollowers(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const page = parseInt((req.query.page as string) || '1');
      const limit = parseInt((req.query.limit as string) || '20');
  const result = await followService.followers(userId, page, limit);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      logger.error('Error getting followers:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async followUser(req: Request, res: Response): Promise<void> {
    try {
      const followerId = req.user!.id;
      const followingId = req.params.userId;
  await followService.follow(followerId, followingId);
      res.status(200).json({ success: true, message: 'User followed successfully' });
    } catch (error) {
      logger.error('Error following user:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async unfollowUser(req: Request, res: Response): Promise<void> {
    try {
      const followerId = req.user!.id;
      const followingId = req.params.userId;
  await followService.unfollow(followerId, followingId);
      res.status(200).json({ success: true, message: 'User unfollowed successfully' });
    } catch (error) {
      logger.error('Error unfollowing user:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async searchUsers(req: Request, res: Response): Promise<void> {
    const pagination = (req as any).pagination;
    const sort = (req as any).sort;
    const filters = (req as any).filters;
    
    const result = await this.userService.getUsers(pagination, sort, filters);
    res.json({ success: true, data: result });
  }

  async getUserById(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = await this.userService.getUserById(id);
    res.json({ success: true, data: user });
  }

  async getUsers(req: Request, res: Response): Promise<void> {
    const pagination = (req as any).pagination;
    const sort = (req as any).sort;
    const filters = (req as any).filters;
    
    const result = await this.userService.getUsers(pagination, sort, filters);
    res.json({ success: true, data: result });
  }

  async verifyUser(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { verificationTier, notes } = req.body as any;
    const result = await userAdminService.verifyUser(id, verificationTier, req.user!.id, notes);
    res.json({ success: true, message: 'User verified', data: result });
  }

  async deactivateUser(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    await this.userService.deactivateUser(id);
    res.json({ success: true, message: 'User deactivated successfully' });
  }

  async activateUser(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    await userAdminService.activateUser(id, req.user!.id);
    res.json({ success: true, message: 'User activated successfully' });
  }
}