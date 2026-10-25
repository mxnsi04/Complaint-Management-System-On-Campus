import { query } from '../config/db.js';
import asyncHandler from '../utils/asyncHandler.js';

const VALID_STATUSES = ['pending', 'open', 'in_progress', 'resolved', 'closed', 'rejected', 'reopened'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'];

// --- Workflow 1: Auto-Assignment ---
// Finds the staff member with the fewest active (open/in_progress/pending) complaints.
// If tied, picks the one most recently assigned least recently (oldest last assignment wins).
async function autoAssignStaff(complaintId) {
  const staffRows = await query(
    `SELECT
       st.staff_id,
       COUNT(CASE WHEN c.status IN ('open','in_progress','pending') THEN 1 END) AS active_count
     FROM staff st
     LEFT JOIN complaint c ON st.staff_id = c.staff_id AND c.complaint_id != ?
     WHERE st.role = 'staff'
     GROUP BY st.staff_id
     ORDER BY active_count ASC, st.staff_id ASC
     LIMIT 1`,
    [complaintId]
  );

  if (!staffRows.length) return; // No staff available — leave unassigned

  const assignedStaffId = staffRows[0].staff_id;

  await query(
    `UPDATE complaint
     SET staff_id = ?, status = 'open'
     WHERE complaint_id = ?`,
    [assignedStaffId, complaintId]
  );
}

export const createComplaint = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    student_id,
    category_id,
    priority = 'medium',
    staff_id = null
  } = req.body;

  if (!title || !description || !student_id || !category_id) {
    return res.status(400).json({
      message: 'title, description, student_id, and category_id are required'
    });
  }

  if (!VALID_PRIORITIES.includes(priority)) {
    return res.status(400).json({ message: 'Invalid priority value' });
  }

  const result = await query(
    `INSERT INTO complaint (title, description, status, priority, student_id, category_id, staff_id)
     VALUES (?, ?, 'pending', ?, ?, ?, ?)`,
    [title, description, priority, student_id, category_id, staff_id]
  );

  const complaintId = result.insertId;

  // Workflow 1: Auto-assign to least-loaded staff (only if not manually assigned)
  if (!staff_id) {
    await autoAssignStaff(complaintId);
  }

  return res.status(201).json({
    message: 'Complaint created and auto-assigned',
    complaint_id: complaintId
  });
});

export const listComplaints = asyncHandler(async (req, res) => {
  const {
    status,
    priority,
    student_id,
    staff_id,
    category_id,
    q,
    page = 1,
    limit = 20
  } = req.query;

  const where = [];
  const params = [];

  if (status) {
    where.push('c.status = ?');
    params.push(status);
  }

  if (priority) {
    where.push('c.priority = ?');
    params.push(priority);
  }

  if (student_id) {
    where.push('c.student_id = ?');
    params.push(Number(student_id));
  }

  if (staff_id) {
    if (staff_id === 'unassigned') {
      where.push('c.staff_id IS NULL');
    } else {
      where.push('c.staff_id = ?');
      params.push(Number(staff_id));
    }
  }

  if (category_id) {
    where.push('c.category_id = ?');
    params.push(Number(category_id));
  }

  if (q) {
    where.push('(c.title LIKE ? OR c.description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  const pageNo = Math.max(Number(page), 1);
  const pageSize = Math.min(Math.max(Number(limit), 1), 100);
  const offset = (pageNo - 1) * pageSize;

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const paginationClause = `LIMIT ${pageSize} OFFSET ${offset}`;

  const rows = await query(
    `SELECT
      c.complaint_id,
      c.title,
      c.description,
      c.status,
      c.priority,
      c.date_filed,
      c.date_resolved,
      s.name AS student_name,
      cat.name AS category,
      IFNULL(st.name, 'Unassigned') AS assigned_staff
    FROM complaint c
    JOIN student s ON c.student_id = s.student_id
    JOIN category cat ON c.category_id = cat.category_id
    LEFT JOIN staff st ON c.staff_id = st.staff_id
    ${whereClause}
    ORDER BY c.date_filed DESC
    ${paginationClause}`,
    params
  );

  return res.json({
    page: pageNo,
    limit: pageSize,
    data: rows
  });
});

export const getComplaintById = asyncHandler(async (req, res) => {
  const complaintId = Number(req.params.id);

  const rows = await query(
    `SELECT
      c.complaint_id,
      c.title,
      c.description,
      c.status,
      c.priority,
      c.date_filed,
      c.date_resolved,
      c.student_id,
      s.name AS student_name,
      c.category_id,
      cat.name AS category,
      c.staff_id,
      st.name AS assigned_staff
    FROM complaint c
    JOIN student s ON c.student_id = s.student_id
    JOIN category cat ON c.category_id = cat.category_id
    LEFT JOIN staff st ON c.staff_id = st.staff_id
    WHERE c.complaint_id = ?`,
    [complaintId]
  );

  if (!rows.length) {
    return res.status(404).json({ message: 'Complaint not found' });
  }

  const responses = await query(
    `SELECT r.response_id, r.message, r.date_responded, r.staff_id, st.name AS staff_name
     FROM response r
     JOIN staff st ON r.staff_id = st.staff_id
     WHERE r.complaint_id = ?
     ORDER BY r.date_responded DESC`,
    [complaintId]
  );

  const feedback = await query(
    `SELECT feedback_id, message, rating, date, student_id
     FROM feedback
     WHERE complaint_id = ?`,
    [complaintId]
  );

  return res.json({
    ...rows[0],
    responses,
    feedback: feedback[0] || null
  });
});

export const updateComplaint = asyncHandler(async (req, res) => {
  const complaintId = Number(req.params.id);
  const { title, description, status, priority, category_id, staff_id } = req.body;

  if (
    title === undefined &&
    description === undefined &&
    status === undefined &&
    priority === undefined &&
    category_id === undefined &&
    staff_id === undefined
  ) {
    return res.status(400).json({ message: 'At least one field is required' });
  }

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ message: 'Invalid status value' });
  }

  if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
    return res.status(400).json({ message: 'Invalid priority value' });
  }

  const fields = [];
  const values = [];

  if (title !== undefined) {
    fields.push('title = ?');
    values.push(title);
  }
  if (description !== undefined) {
    fields.push('description = ?');
    values.push(description);
  }
  if (status !== undefined) {
    fields.push('status = ?');
    values.push(status);
  }
  if (priority !== undefined) {
    fields.push('priority = ?');
    values.push(priority);
  }
  if (category_id !== undefined) {
    fields.push('category_id = ?');
    values.push(category_id);
  }
  if (staff_id !== undefined) {
    fields.push('staff_id = ?');
    values.push(staff_id);
  }

  values.push(complaintId);

  const result = await query(
    `UPDATE complaint SET ${fields.join(', ')} WHERE complaint_id = ?`,
    values
  );

  if (!result.affectedRows) {
    return res.status(404).json({ message: 'Complaint not found' });
  }

  return res.json({ message: 'Complaint updated' });
});

export const assignComplaint = asyncHandler(async (req, res) => {
  const complaintId = Number(req.params.id);
  const { staff_id } = req.body;

  if (staff_id === undefined) {
    return res.status(400).json({ message: 'staff_id is required' });
  }

  let normalizedStaffId = null;

  if (staff_id !== null && staff_id !== '') {
    normalizedStaffId = Number(staff_id);

    if (!Number.isInteger(normalizedStaffId) || normalizedStaffId <= 0) {
      return res.status(400).json({ message: 'staff_id must be a valid positive number or null' });
    }

    const staffRows = await query('SELECT staff_id FROM staff WHERE staff_id = ?', [normalizedStaffId]);
    if (!staffRows.length) {
      return res.status(404).json({ message: 'Staff not found' });
    }
  }

  const result = await query(
    `UPDATE complaint
     SET staff_id = ?,
         status = CASE
                    WHEN ? IS NOT NULL AND status = 'pending' THEN 'open'
                    WHEN ? IS NULL AND status = 'open' THEN 'pending'
                    ELSE status
                  END
     WHERE complaint_id = ?`,
    [normalizedStaffId, normalizedStaffId, normalizedStaffId, complaintId]
  );

  if (!result.affectedRows) {
    return res.status(404).json({ message: 'Complaint not found' });
  }

  return res.json({
    message: normalizedStaffId ? 'Complaint assigned successfully' : 'Complaint unassigned successfully'
  });
});

export const deleteComplaint = asyncHandler(async (req, res) => {
  const complaintId = Number(req.params.id);
  const result = await query('DELETE FROM complaint WHERE complaint_id = ?', [complaintId]);

  if (!result.affectedRows) {
    return res.status(404).json({ message: 'Complaint not found' });
  }

  return res.json({ message: 'Complaint deleted' });
});
