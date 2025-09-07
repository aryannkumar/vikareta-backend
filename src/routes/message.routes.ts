import { Router } from 'express';
import { MessageController } from '../controllers/message.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { validateQuery, validateBody, validateParams } from '@/middleware/zod-validate';
import { messageSendSchema, messageListQuerySchema, messageConversationParamsSchema, messageIdParamsSchema } from '@/validation/schemas';

const router = Router();
const messageController = new MessageController();

// Validation now powered by Zod

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
router.get('/', authenticateToken, validateQuery(messageListQuerySchema), messageController.getMessages.bind(messageController));
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
router.post('/', authenticateToken, validateBody(messageSendSchema), messageController.sendMessage.bind(messageController));
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
router.get('/conversation/:otherUserId', authenticateToken, validateParams(messageConversationParamsSchema), validateQuery(messageListQuerySchema), messageController.getConversation.bind(messageController));
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
router.get('/:id', authenticateToken, validateParams(messageIdParamsSchema), messageController.getMessageById.bind(messageController));
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
router.put('/:id/read', authenticateToken, validateParams(messageIdParamsSchema), messageController.markAsRead.bind(messageController));
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
router.delete('/:id', authenticateToken, validateParams(messageIdParamsSchema), messageController.deleteMessage.bind(messageController));

export default router;