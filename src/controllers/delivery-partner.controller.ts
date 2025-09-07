import { Request, Response } from 'express';
import { deliveryPartnerService } from '@/services/delivery-partner.service';
import { deliveryPreferenceService } from '@/services/delivery-preference.service';

export class DeliveryPartnerController {
  async listPartners(req: Request, res: Response) {
    const { active } = req.query;
    const partners = await deliveryPartnerService.list(active === 'true' ? true : active === 'false' ? false : undefined);
    res.json({ success: true, data: partners });
  }
  async createPartner(req: Request, res: Response) {
    const created = await deliveryPartnerService.create(req.body);
    res.status(201).json({ success: true, message: 'Partner created', data: created });
  }
  async updatePartner(req: Request, res: Response) {
    const { id } = req.params; const updated = await deliveryPartnerService.update(id, req.body);
    res.json({ success: true, message: 'Partner updated', data: updated });
  }
  async togglePartner(req: Request, res: Response) {
    const { id } = req.params; const { isActive } = req.body; const updated = await deliveryPartnerService.toggle(id, !!isActive);
    res.json({ success: true, message: 'Partner toggled', data: updated });
  }
  async listPreferences(req: Request, res: Response) {
    const userId = req.user?.id; if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const prefs = await deliveryPreferenceService.listForSeller(userId);
    res.json({ success: true, data: prefs });
  }
  async upsertPreference(req: Request, res: Response) {
    const userId = req.user?.id; if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { partnerId } = req.params; const pref = await deliveryPreferenceService.setPreference(userId, partnerId, req.body);
    res.json({ success: true, message: 'Preference saved', data: pref });
  }
  async removePreference(req: Request, res: Response) {
    const userId = req.user?.id; if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { partnerId } = req.params; await deliveryPreferenceService.remove(userId, partnerId);
    res.json({ success: true, message: 'Preference removed' });
  }
}
export const deliveryPartnerController = new DeliveryPartnerController();