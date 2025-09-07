import { Router, Request, Response } from 'express';
import { apiKeyController } from '@/controllers/api-key.controller';
const router = Router();
router.get('/', (req: Request, res: Response) => { void apiKeyController.list(req, res); });
router.post('/', (req: Request, res: Response) => { void apiKeyController.create(req, res); });
router.post('/:id/revoke', (req: Request, res: Response) => { void apiKeyController.revoke(req, res); });
router.post('/:id/rotate', (req: Request, res: Response) => { void apiKeyController.rotate(req, res); });
export const apiKeyRoutes = router; export default router;
