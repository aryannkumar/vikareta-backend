import { Request, Response } from 'express';
import { securityEventService } from '@/services/security-event.service';
import { securityEventsErrorsCounter } from '@/observability/metrics';
import { logger } from '@/utils/logger';

export class SecurityController {
  async events(req: Request, res: Response): Promise<void> {
    try {
      const { page = '1', limit = '20', userId, type, severity, from, to } = req.query;
  const pageNum = parseInt(page as string); const take = parseInt(limit as string);
      const where: any = {};
      if (userId) where.userId = userId;
      if (type) where.type = type;
      if (severity) where.severity = severity;
      if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = new Date(String(from));
        if (to) where.createdAt.lte = new Date(String(to));
      }
      const result = await securityEventService.listEvents(pageNum, take, { userId: userId as string | undefined, type: type as string | undefined, severity: severity as string | undefined, from: from ? new Date(String(from)) : undefined, to: to ? new Date(String(to)) : undefined });
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('SecurityController.events error', error);
      securityEventsErrorsCounter.inc();
      res.status(500).json({ success: false, error: 'Failed to fetch security events' });
    }
  }

  async sessions(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.query;
      const where: any = {};
      if (userId) where.userId = userId;
  const sessions = await securityEventService.listSessions(userId as string | undefined);
      res.json({ success: true, data: sessions });
    } catch (error) {
      securityEventsErrorsCounter.inc();
      res.status(500).json({ success: false, error: 'Failed to fetch sessions' });
    }
  }

  async revokeSession(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
  const session = await securityEventService.revokeSession(id);
      res.json({ success: true, message: 'Session revoked', data: session });
    } catch (error) {
      securityEventsErrorsCounter.inc();
      res.status(400).json({ success: false, error: 'Failed to revoke session' });
    }
  }
}
export const securityController = new SecurityController();
