import { Router } from 'express';
import categoriesRoutes from './categories.routes.js';
import complaintsRoutes from './complaints.routes.js';
import feedbackRoutes from './feedback.routes.js';
import reportsRoutes from './reports.routes.js';
import responsesRoutes from './responses.routes.js';
import staffRoutes from './staff.routes.js';
import studentsRoutes from './students.routes.js';
import chatRoutes from './chat.routes.js';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ message: 'Backend is running' });
});

router.use('/categories', categoriesRoutes);
router.use('/students', studentsRoutes);
router.use('/staff', staffRoutes);
router.use('/complaints', complaintsRoutes);
router.use('/responses', responsesRoutes);
router.use('/feedback', feedbackRoutes);
router.use('/reports', reportsRoutes);
router.use('/chat', chatRoutes);

export default router;
