import { Request, Response } from 'express';
import { advertisementService } from '@/services/advertisement.service';
import { logger } from '@/utils/logger';

export class AdvertisementController {
  async getCampaigns(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || (req.query.userId as string);
      const { page = '1', limit = '20', status } = req.query;
      const pageNum = parseInt(page as string); const take = parseInt(limit as string);
      const { items, total } = await advertisementService.listCampaigns(userId, pageNum, take, status as string | undefined);
      res.json({ success: true, data: { items, total, page: pageNum, limit: take, totalPages: Math.ceil(total / take) } });
    } catch (error) {
      logger.error('AdvertisementController.getCampaigns error', error);
      res.status(500).json({ success: false, error: 'Failed to fetch campaigns' });
    }
  }

  async createCampaign(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || req.body.userId;
      const campaign = await advertisementService.createCampaign(userId, req.body);
      res.status(201).json({ success: true, message: 'Campaign created', data: campaign });
    } catch (error: any) {
      logger.error('AdvertisementController.createCampaign error', error);
      res.status(400).json({ success: false, error: error.message || 'Failed to create campaign' });
    }
  }

  async getCampaignById(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || (req.query.userId as string);
      const { id } = req.params;
      const campaign = await advertisementService.getCampaign(userId, id);
      if (!campaign) { res.status(404).json({ success: false, error: 'Not found' }); return; }
      res.json({ success: true, data: campaign });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch campaign' });
    }
  }

  async updateCampaign(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || req.body.userId;
      const { id } = req.params;
      const campaign = await advertisementService.updateCampaign(userId, id, req.body);
      res.json({ success: true, message: 'Campaign updated', data: campaign });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message || 'Failed to update campaign' });
    }
  }

  async deleteCampaign(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || req.body.userId;
      const { id } = req.params;
      const campaign = await advertisementService.cancelCampaign(userId, id);
      res.json({ success: true, message: 'Campaign cancelled', data: campaign });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message || 'Failed to cancel campaign' });
    }
  }

  async listAds(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || (req.query.userId as string);
      const { campaignId } = req.params;
      const items = await advertisementService.listAds(userId, campaignId);
      res.json({ success: true, data: items });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message || 'Failed to list ads' });
    }
  }

  async createAd(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || req.body.userId;
      const { campaignId } = req.params;
      const ad = await advertisementService.createAd(userId, campaignId, req.body);
      res.status(201).json({ success: true, message: 'Ad created', data: ad });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message || 'Failed to create ad' });
    }
  }

  async listPlacements(req: Request, res: Response): Promise<void> {
    const { active } = req.query;
    const placements = await advertisementService.listPlacements(active === 'true');
    res.json({ success: true, data: placements });
  }

  async createPlacement(req: Request, res: Response): Promise<void> {
    try {
      const placement = await advertisementService.createPlacement(req.body);
      res.status(201).json({ success: true, message: 'Placement created', data: placement });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message || 'Failed to create placement' });
    }
  }

  async assignAd(req: Request, res: Response): Promise<void> {
    try {
      const { placementId } = req.params;
      const { advertisementId } = req.body;
      const assignment = await advertisementService.assignAdToPlacement(advertisementId, placementId, req.body);
      res.status(201).json({ success: true, message: 'Ad assigned', data: assignment });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message || 'Failed to assign ad' });
    }
  }

  async listAssignments(req: Request, res: Response): Promise<void> {
    try {
      const { placementId } = req.params;
      const items = await advertisementService.listAssignments(placementId);
      res.json({ success: true, data: items });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message || 'Failed to list assignments' });
    }
  }

  async createApproval(req: Request, res: Response): Promise<void> {
    try {
      const approval = await advertisementService.createApproval(req.body);
      res.status(201).json({ success: true, message: 'Approval created', data: approval });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message || 'Failed to create approval' });
    }
  }

  async updateApproval(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const approval = await advertisementService.updateApproval(id, req.body);
      res.json({ success: true, message: 'Approval updated', data: approval });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message || 'Failed to update approval' });
    }
  }

  async recordImpression(req: Request, res: Response): Promise<void> {
    try {
      const { adId } = req.params;
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
      const ua = req.headers['user-agent'] || '';
  const userId = req.user?.id;
  const referrer = (req.headers['referer'] as string) || (req.headers['referrer'] as string) || undefined;
  const ad = await advertisementService.recordImpression(adId, { ip, ua, userId, referrer });
      res.json({ success: true, data: ad });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message || 'Failed to record impression' });
    }
  }

  async recordClick(req: Request, res: Response): Promise<void> {
    try {
      const { adId } = req.params;
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
      const ua = req.headers['user-agent'] || '';
  const userId = req.user?.id;
  const referrer = (req.headers['referer'] as string) || (req.headers['referrer'] as string) || undefined;
  const ad = await advertisementService.recordClick(adId, { ip, ua, userId, referrer });
      res.json({ success: true, data: ad });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message || 'Failed to record click' });
    }
  }

  async getCampaignDailyAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || (req.query.userId as string);
      const { campaignId } = req.params;
      // Ensure ownership
      const campaign = await advertisementService.getCampaign(userId, campaignId);
      if (!campaign) { res.status(404).json({ success: false, error: 'Campaign not found' }); return; }
  const { days = '30' } = req.query;
  const rows = await advertisementService.campaignDailyAnalytics(userId, campaignId, parseInt(days as string, 10) || 30);
      res.json({ success: true, data: rows });
    } catch (err) {
      logger.error('getCampaignDailyAnalytics error', err);
      res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
    }
  }

  async getTopAds(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id || (req.query.userId as string);
      const { metric = 'ctr', limit = '10' } = req.query;
      const allowed = ['ctr', 'clicks', 'impressions', 'cpc'];
      const metricField = allowed.includes(metric as string) ? (metric as string) : 'ctr';
      const take = Math.min(parseInt(limit as string, 10) || 10, 50);
      const ads = await advertisementService.topAds(userId, metricField, take);
      res.json({ success: true, data: ads });
    } catch (err) {
      logger.error('getTopAds error', err);
      res.status(500).json({ success: false, error: 'Failed to fetch top ads' });
    }
  }

  async pauseCampaign(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { id } = req.params;
      const campaign = await advertisementService.pauseCampaign(userId, id);
      res.json({ success: true, message: 'Campaign paused successfully', data: campaign });
    } catch (error: any) {
      logger.error('AdvertisementController.pauseCampaign error', error);
      res.status(400).json({ success: false, error: error.message || 'Failed to pause campaign' });
    }
  }

  async resumeCampaign(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { id } = req.params;
      const campaign = await advertisementService.resumeCampaign(userId, id);
      res.json({ success: true, message: 'Campaign resumed successfully', data: campaign });
    } catch (error: any) {
      logger.error('AdvertisementController.resumeCampaign error', error);
      res.status(400).json({ success: false, error: error.message || 'Failed to resume campaign' });
    }
  }
}