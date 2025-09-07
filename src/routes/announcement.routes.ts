import { Router, Request, Response } from 'express';
import { announcementController } from '@/controllers/announcement.controller';

const router = Router();

router.get('/', (req: Request, res: Response) => { void announcementController.list(req, res); });
router.post('/', (req: Request, res: Response) => { void announcementController.create(req, res); });
router.patch('/:id', (req: Request, res: Response) => { void announcementController.update(req, res); });
router.post('/:id/publish', (req: Request, res: Response) => { void announcementController.publish(req, res); });

export const announcementRoutes = router;
export default router;
