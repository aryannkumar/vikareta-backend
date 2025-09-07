import { Router, Request, Response } from 'express';
import { securityController } from '@/controllers/security.controller';
const router = Router();
router.get('/events', (req: Request, res: Response) => { void securityController.events(req, res); });
router.get('/sessions', (req: Request, res: Response) => { void securityController.sessions(req, res); });
router.delete('/sessions/:id', (req: Request, res: Response) => { void securityController.revokeSession(req, res); });
export const securityRoutes = router; export default router;
