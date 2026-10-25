import { query } from '../config/db.js';
import asyncHandler from '../utils/asyncHandler.js';

// GET /api/chat/:complaintId/messages - fetch chat history
export const getChatMessages = asyncHandler(async (req, res) => {
  const complaintId = Number(req.params.complaintId);

  const messages = await query(
    'SELECT * FROM chat_message WHERE complaint_id = ? ORDER BY sent_at ASC',
    [complaintId]
  );

  return res.json(messages);
});

// POST /api/chat/:complaintId/messages - REST fallback to post a message
export const postChatMessage = asyncHandler(async (req, res) => {
  const complaintId = Number(req.params.complaintId);
  const { sender_id, sender_role, message } = req.body;

  if (!sender_id || !sender_role || !message) {
    return res.status(400).json({ message: 'sender_id, sender_role, and message are required' });
  }

  const result = await query(
    'INSERT INTO chat_message (complaint_id, sender_id, sender_role, message) VALUES (?, ?, ?, ?)',
    [complaintId, sender_id, sender_role, message]
  );

  const [saved] = await query(
    'SELECT * FROM chat_message WHERE message_id = ?',
    [result.insertId]
  );

  return res.status(201).json(saved);
});
