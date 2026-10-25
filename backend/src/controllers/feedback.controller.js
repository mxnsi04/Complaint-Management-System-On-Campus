import { query } from '../config/db.js';
import asyncHandler from '../utils/asyncHandler.js';

export const createFeedback = asyncHandler(async (req, res) => {
  const { complaint_id, student_id, rating, message = null } = req.body;

  if (!complaint_id || !student_id || rating === undefined) {
    return res.status(400).json({ message: 'complaint_id, student_id, and rating are required' });
  }

  const numericRating = Number(rating);

  if (numericRating < 1 || numericRating > 5) {
    return res.status(400).json({ message: 'rating must be between 1 and 5' });
  }

  const result = await query(
    'INSERT INTO feedback (message, rating, complaint_id, student_id) VALUES (?, ?, ?, ?)',
    [message, numericRating, complaint_id, student_id]
  );

  // --- Workflow 2: Feedback Loop Auto-Reopen ---
  // The DB trigger (trg_reopen_on_low_feedback) handles the actual reopen + audit.
  // Here we just reflect in the response whether a reopen was triggered.
  const reopened = numericRating < 2;

  return res.status(201).json({
    message: reopened
      ? 'Feedback submitted. Complaint has been automatically reopened due to low rating.'
      : 'Feedback submitted',
    feedback_id: result.insertId,
    auto_reopened: reopened
  });
});

export const getFeedbackByComplaint = asyncHandler(async (req, res) => {
  const complaintId = Number(req.params.complaintId);

  const rows = await query(
    `SELECT feedback_id, message, rating, date, complaint_id, student_id
     FROM feedback
     WHERE complaint_id = ?`,
    [complaintId]
  );

  if (!rows.length) {
    return res.status(404).json({ message: 'Feedback not found for this complaint' });
  }

  return res.json(rows[0]);
});
