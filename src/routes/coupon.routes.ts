import { Router, Request, Response } from 'express';
import { couponController } from '@/controllers/coupon.controller';

const router = Router();

router.post('/', (req: Request, res: Response) => { void couponController.create(req, res); });
router.get('/', (req: Request, res: Response) => { void couponController.list(req, res); });
router.get('/id/:id', (req: Request, res: Response) => { void couponController.getById(req, res); });
router.get('/code/:code', (req: Request, res: Response) => { void couponController.getByCode(req, res); });
router.patch('/:id', (req: Request, res: Response) => { void couponController.update(req, res); });
router.delete('/:id', (req: Request, res: Response) => { void couponController.softDelete(req, res); });
router.get('/validate/:code', (req: Request, res: Response) => { void couponController.validate(req, res); });

export const couponRoutes = router;
export default router;
