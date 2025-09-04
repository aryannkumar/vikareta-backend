import { Router } from 'express';
import { MessageController } from '../controllers/message.controller';
import { authenticateToken } from '../middleware/auth-middleware';
import { validateRequest } from '../middleware/validation-middleware';
import { body, param, query } from 'express-validator';

const router = Router();
const messageController = new MessageController();

// Validation schemas
const sendMessageValidation = [
    body('subject').notEmpty().isLength({ min: 1, max: 255 }).withMessage('Subject must be between 1 and 255 characters'),
    body('content').notEmpty().isLength({ min: 1, max: 10000 }).withMessage('Content must be between 1 and 10000 characters'),
    body('recipientId').notEmpty().isUUID().withMessage('Recipient ID must be a valid UUID'),
    body('messageType').optional().isIn(['email', 'sms', 'notification', 'system']).withMessage('Invalid message type'),
    body('priority').optional().isIn(['low', 'normal', 'high', 'urgent']).withMessage('Invalid priority'),
    body('type').optional().isIn(['email', 'sms', 'notification', 'system']).withMessage('Invalid type'),
    body('relatedType').optional().isIn(['order', 'rfq', 'quote', 'customer', 'supplier', 'product', 'service']).withMessage('Invalid related type'),
    body('relatedId').optional().isUUID().withMessage('Related ID must be a valid UUID'),
];

const getMessagesValidation = [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('status').optional().isIn(['unread', 'read', 'replied', 'archived']).withMessage('Invalid status'),
    query('type').optional().isIn(['email', 'sms', 'notification', 'system']).withMessage('Invalid type'),
    query('relatedType').optional().isIn(['order', 'rfq', 'quote', 'customer', 'supplier', 'product', 'service']).withMessage('Invalid related type'),
];

const getConversationValidation = [
    param('otherUserId').isUUID().withMessage('Other user ID must be a valid UUID'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

// Routes
router.get('/', authenticateToken, validateRequest(getMessagesValidation), messageController.getMessages.bind(messageController));
router.post('/', authenticateToken, validateRequest(sendMessageValidation), messageController.sendMessage.bind(messageController));
router.get('/unread-count', authenticateToken, messageController.getUnreadCount.bind(messageController));
router.get('/conversation/:otherUserId', authenticateToken, validateRequest(getConversationValidation), messageController.getConversation.bind(messageController));
router.get('/:id', authenticateToken, validateRequest([param('id').isUUID()]), messageController.getMessageById.bind(messageController));
router.put('/:id/read', authenticateToken, validateRequest([param('id').isUUID()]), messageController.markAsRead.bind(messageController));
router.delete('/:id', authenticateToken, validateRequest([param('id').isUUID()]), messageController.deleteMessage.bind(messageController));

export default router;