import { Router, Request, Response } from 'express';
import { notificationTemplateController } from '@/controllers/notification-template.controller';

const router = Router();

router.post('/', (req: Request, res: Response) => { void notificationTemplateController.create(req, res); });
router.get('/', (req: Request, res: Response) => { void notificationTemplateController.list(req, res); });
router.get('/:id', (req: Request, res: Response) => { void notificationTemplateController.getById(req, res); });
router.patch('/:id', (req: Request, res: Response) => { void notificationTemplateController.update(req, res); });
router.patch('/:id/status', (req: Request, res: Response) => { void notificationTemplateController.toggleActive(req, res); });

export const notificationTemplateRoutes = router;
export default router;
