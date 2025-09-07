import { Request, Response } from 'express';
import { serviceAppointmentService } from '@/services/service-appointment.service';
import { logger } from '@/utils/logger';

class ServiceAppointmentController {
  async list(req: Request, res: Response) {
    try {
      const { page = 1, limit = 20, serviceId, status, from, to, providerId, customerId } = req.query;
      const filters = {
        serviceId: serviceId as string | undefined,
        status: status as string | undefined,
        providerId: (providerId as string) || undefined,
        customerId: (customerId as string) || undefined,
        from: from ? new Date(from as string) : undefined,
        to: to ? new Date(to as string) : undefined,
      };

      // If provider/customer not explicitly provided, apply current user context filters optionally via query flags
      const result = await serviceAppointmentService.list(filters, parseInt(page as string), parseInt(limit as string));
      res.json({ success: true, message: 'Appointments retrieved', data: result });
    } catch (e: any) {
      logger.error('ServiceAppointment list error', e);
      res.status(400).json({ error: e.message || 'Unable to list appointments' });
    }
  }

  async get(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const appt = await serviceAppointmentService.getById(id);
      res.json({ success: true, message: 'Appointment retrieved', data: appt });
    } catch (e: any) {
      logger.error('ServiceAppointment get error', e);
      const code = e.name === 'NotFoundError' ? 404 : 400;
      res.status(code).json({ error: e.message || 'Unable to get appointment' });
    }
  }

  async updateStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = req.user?.id!;
      const updated = await serviceAppointmentService.updateStatus(id, status, userId);
      res.json({ success: true, message: 'Appointment status updated', data: updated });
    } catch (e: any) {
      logger.error('ServiceAppointment updateStatus error', e);
      const code = e.name === 'NotFoundError' ? 404 : 400;
      res.status(code).json({ error: e.message || 'Unable to update status' });
    }
  }

  async reschedule(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { scheduledDate, duration } = req.body;
      const userId = req.user?.id!;
      const newDate = new Date(scheduledDate);
      const updated = await serviceAppointmentService.reschedule(id, newDate, duration, userId);
      res.json({ success: true, message: 'Appointment rescheduled', data: updated });
    } catch (e: any) {
      logger.error('ServiceAppointment reschedule error', e);
      const code = e.name === 'NotFoundError' ? 404 : 400;
      res.status(code).json({ error: e.message || 'Unable to reschedule appointment' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const { orderId, serviceId, scheduledDate, duration, notes } = req.body;
      const userId = req.user?.id!;
      const appt = await serviceAppointmentService.createManual({
        orderId,
        serviceId,
        scheduledDate: new Date(scheduledDate),
        duration,
        notes,
        userId,
      });
      res.status(201).json({ success: true, message: 'Appointment created', data: appt });
    } catch (e: any) {
      logger.error('ServiceAppointment create error', e);
      const code = e.name === 'NotFoundError' ? 404 : 400;
      res.status(code).json({ error: e.message || 'Unable to create appointment' });
    }
  }
}

export const serviceAppointmentController = new ServiceAppointmentController();
