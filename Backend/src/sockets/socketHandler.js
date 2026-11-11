import { redis } from '../config/db.js';

export function setupSockets(io) {
  io.on('connection', (socket) => {
    let currentIncidentId = null;
    let currentUser = null;

    socket.on('join_incident', async ({ incidentId, user }) => {
      if (!incidentId) return;
      currentIncidentId = String(incidentId);
      currentUser = user || { id: socket.id, name: 'Anonymous Engineer' };

      const roomName = `incident:${currentIncidentId}`;
      socket.join(roomName);

      // Store live presence in Redis hash with 1 hour expiry
      const presenceKey = `incident:presence:${currentIncidentId}`;
      try {
        await redis.hset(presenceKey, socket.id, JSON.stringify(currentUser));
        await redis.expire(presenceKey, 3600);

        const rawMembers = await redis.hvals(presenceKey);
        const activeUsers = rawMembers.map((m) => JSON.parse(m));
        io.to(roomName).emit('presence_updated', activeUsers);
      } catch (err) {
        console.error('Redis presence error:', err.message);
      }
    });

    socket.on('leave_incident', async ({ incidentId }) => {
      const id = String(incidentId || currentIncidentId);
      if (!id) return;
      const roomName = `incident:${id}`;
      socket.leave(roomName);

      const presenceKey = `incident:presence:${id}`;
      try {
        await redis.hdel(presenceKey, socket.id);
        const rawMembers = await redis.hvals(presenceKey);
        const activeUsers = rawMembers.map((m) => JSON.parse(m));
        io.to(roomName).emit('presence_updated', activeUsers);
      } catch (err) {
        console.error('Redis leave error:', err.message);
      }
    });

    socket.on('disconnect', async () => {
      if (currentIncidentId) {
        const presenceKey = `incident:presence:${currentIncidentId}`;
        try {
          await redis.hdel(presenceKey, socket.id);
          const rawMembers = await redis.hvals(presenceKey);
          const activeUsers = rawMembers.map((m) => JSON.parse(m));
          io.to(`incident:${currentIncidentId}`).emit('presence_updated', activeUsers);
        } catch (err) {
          console.error('Redis disconnect cleanup error:', err.message);
        }
      }
    });
  });
}