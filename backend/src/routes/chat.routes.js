import { Router } from 'express';
import { getChatMessages, postChatMessage } from '../controllers/chat.controller.js';

const router = Router();

router.get('/:complaintId/messages', getChatMessages);
router.post('/:complaintId/messages', postChatMessage);

export default router;
