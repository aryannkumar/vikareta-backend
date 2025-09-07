import { Router, Request, Response } from 'express';
import { logisticsProviderController } from '@/controllers/logistics-provider.controller';

const router = Router();

router.get('/', (req: Request, res: Response) => { void logisticsProviderController.list(req, res); });
router.post('/', (req: Request, res: Response) => { void logisticsProviderController.create(req, res); });
router.patch('/:id', (req: Request, res: Response) => { void logisticsProviderController.update(req, res); });
router.patch('/:id/status', (req: Request, res: Response) => { void logisticsProviderController.toggleActive(req, res); });

export const logisticsProviderRoutes = router;
export default router;
