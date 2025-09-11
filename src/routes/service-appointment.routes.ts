import { Router } from 'express';
import { authMiddleware } from '@/middleware/authentication.middleware';
import { asyncHandler } from '@/middleware/error-handler';
import { validateBody, validateParams, validateQuery } from '@/middleware/zod-validate';
import { serviceAppointmentCreateSchema, serviceAppointmentIdParamsSchema, serviceAppointmentListQuerySchema, serviceAppointmentRescheduleSchema, serviceAppointmentStatusUpdateSchema } from '@/validation/schemas';
import { serviceAppointmentController } from '@/controllers/service-appointment.controller';

const router = Router();
router.use(authMiddleware);

router.get('/', validateQuery(serviceAppointmentListQuerySchema), asyncHandler(serviceAppointmentController.list.bind(serviceAppointmentController)));
router.get('/:id', validateParams(serviceAppointmentIdParamsSchema), asyncHandler(serviceAppointmentController.get.bind(serviceAppointmentController)));
router.post('/', validateBody(serviceAppointmentCreateSchema), asyncHandler(serviceAppointmentController.create.bind(serviceAppointmentController)));
router.patch('/:id/status', validateParams(serviceAppointmentIdParamsSchema), validateBody(serviceAppointmentStatusUpdateSchema), asyncHandler(serviceAppointmentController.updateStatus.bind(serviceAppointmentController)));
router.patch('/:id/reschedule', validateParams(serviceAppointmentIdParamsSchema), validateBody(serviceAppointmentRescheduleSchema), asyncHandler(serviceAppointmentController.reschedule.bind(serviceAppointmentController)));

export { router as serviceAppointmentRoutes };
