import http from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import env from './config/env.js';
import { testConnection } from './config/db.js';
import { query } from './config/db.js';

const httpServer = http.createServer(app);

export const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  // Join a complaint room
  socket.on('join_complaint', (complaintId) => {
    socket.join(`complaint_${complaintId}`);
  });

  // Leave a complaint room
  socket.on('leave_complaint', (complaintId) => {
    socket.leave(`complaint_${complaintId}`);
  });

  // Send a chat message
  socket.on('send_message', async (data) => {
    const { complaint_id, sender_id, sender_role, message } = data;
    try {
      const result = await query(
        'INSERT INTO chat_message (complaint_id, sender_id, sender_role, message) VALUES (?, ?, ?, ?)',
        [complaint_id, sender_id, sender_role, message]
      );
      const [saved] = await query(
        'SELECT * FROM chat_message WHERE message_id = ?',
        [result.insertId]
      );
      // Broadcast to everyone in the complaint room
      io.to(`complaint_${complaint_id}`).emit('receive_message', saved);
    } catch (err) {
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
});

const startServer = async () => {
  try {
    await testConnection();
    httpServer.listen(env.port, () => {
      console.log(`Server running on http://localhost:${env.port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();
