import { Router } from 'express';
import { SupportController } from '../controllers/support.controller';
import { authenticateToken } from '../middleware/auth-middleware';
import { validateRequest } from '../middleware/validation-middleware';
import * as validator from 'express-validator';
const { body, param, query } = validator as any;

const router = Router();
const supportController = new SupportController();

// Validation schemas
const createTicketValidation = [
    body('subject').notEmpty().isLength({ min: 5, max: 255 }).withMessage('Subject must be between 5 and 255 characters'),
    body('description').notEmpty().isLength({ min: 10, max: 5000 }).withMessage('Description must be between 10 and 5000 characters'),
    body('category').notEmpty().isIn(['technical', 'billing', 'general', 'account', 'product', 'service']).withMessage('Invalid category'),
    body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority'),
    body('relatedType').optional().isIn(['order', 'product', 'service', 'payment', 'account']).withMessage('Invalid related type'),
    body('relatedId').optional().isUUID().withMessage('Related ID must be a valid UUID'),
];

const updateTicketValidation = [
    param('id').isUUID().withMessage('Ticket ID must be a valid UUID'),
    body('subject').optional().isLength({ min: 5, max: 255 }).withMessage('Subject must be between 5 and 255 characters'),
    body('description').optional().isLength({ min: 10, max: 5000 }).withMessage('Description must be between 10 and 5000 characters'),
    body('category').optional().isIn(['technical', 'billing', 'general', 'account', 'product', 'service']).withMessage('Invalid category'),
    body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority'),
];

const addMessageValidation = [
    param('id').isUUID().withMessage('Ticket ID must be a valid UUID'),
    body('message').notEmpty().isLength({ min: 1, max: 5000 }).withMessage('Message must be between 1 and 5000 characters'),
];

const closeTicketValidation = [
    param('id').isUUID().withMessage('Ticket ID must be a valid UUID'),
    body('reason').optional().isLength({ max: 500 }).withMessage('Reason must be less than 500 characters'),
];

const getTicketsValidation = [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('status').optional().isIn(['open', 'in_progress', 'closed', 'resolved']).withMessage('Invalid status'),
    query('category').optional().isIn(['technical', 'billing', 'general', 'account', 'product', 'service']).withMessage('Invalid category'),
    query('priority').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority'),
];

// Routes
router.get('/', authenticateToken, validateRequest(getTicketsValidation), supportController.getTickets.bind(supportController));
router.post('/', authenticateToken, validateRequest(createTicketValidation), supportController.createTicket.bind(supportController));
router.get('/stats', authenticateToken, supportController.getTicketStats.bind(supportController));
router.get('/:id', authenticateToken, validateRequest([param('id').isUUID()]), supportController.getTicketById.bind(supportController));
router.put('/:id', authenticateToken, validateRequest(updateTicketValidation), supportController.updateTicket.bind(supportController));
router.post('/:id/messages', authenticateToken, validateRequest(addMessageValidation), supportController.addMessage.bind(supportController));
router.post('/:id/close', authenticateToken, validateRequest(closeTicketValidation), supportController.closeTicket.bind(supportController));

export default router;