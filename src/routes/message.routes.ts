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
/**
 * @openapi
 * /api/v1/messages:
 *   get:
 *     summary: Get messages for current user
 *     tags:
 *       - Messages
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Message list
 */
router.get('/', authenticateToken, validateRequest(getMessagesValidation), messageController.getMessages.bind(messageController));
/**
 * @openapi
 * /api/v1/messages:
 *   post:
 *     summary: Send a message
 *     tags:
 *       - Messages
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Message sent
 */
router.post('/', authenticateToken, validateRequest(sendMessageValidation), messageController.sendMessage.bind(messageController));
/**
 * @openapi
 * /api/v1/messages/unread-count:
 *   get:
 *     summary: Get unread message count
 *     tags:
 *       - Messages
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread count
 */
router.get('/unread-count', authenticateToken, messageController.getUnreadCount.bind(messageController));
/**
 * @openapi
 * /api/v1/messages/conversation/{otherUserId}:
 *   get:
 *     summary: Get conversation with another user
 *     tags:
 *       - Messages
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: otherUserId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Conversation messages
 */
router.get('/conversation/:otherUserId', authenticateToken, validateRequest(getConversationValidation), messageController.getConversation.bind(messageController));
/**
 * @openapi
 * /api/v1/messages/{id}:
 *   get:
 *     summary: Get message by id
 *     tags:
 *       - Messages
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Message detail
 */
router.get('/:id', authenticateToken, validateRequest([param('id').isUUID()]), messageController.getMessageById.bind(messageController));
/**
 * @openapi
 * /api/v1/messages/{id}/read:
 *   put:
 *     summary: Mark message as read
 *     tags:
 *       - Messages
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Marked as read
 */
router.put('/:id/read', authenticateToken, validateRequest([param('id').isUUID()]), messageController.markAsRead.bind(messageController));
/**
 * @openapi
 * /api/v1/messages/{id}:
 *   delete:
 *     summary: Delete a message
 *     tags:
 *       - Messages
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted
 */
router.delete('/:id', authenticateToken, validateRequest([param('id').isUUID()]), messageController.deleteMessage.bind(messageController));

export default router;