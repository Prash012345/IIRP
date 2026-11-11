import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool, query, redis } from '../config/db.js';
import { env } from '../config/env.js';
import { authenticate, authorizeRoles } from '../middlewares/auth.js';
import {
  hasCircularDependency,
  calculateDependencyImpact,
  findCorrelatedDeployments,
  findRecurringIncidents,
} from '../utils/smartEngine.js';
import { io } from '../server.js';

const router = express.Router();


// 1. AUTH & USERS (Requirement 1)

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'ENGINEER']).default('ENGINEER'),
  title: z.string().optional(),
});

router.post('/user', authenticate, authorizeRoles('ADMIN'), async (req, res, next) => {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
    }
    
    const { name, email, password, role, title } = parsed.data;

    const existingUser = await query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    
    const result = await query(
      'INSERT INTO users (name, email, password_hash, role, title) VALUES (?, ?, ?, ?, ?)',
      [name, email, passwordHash, role, title || null]
    );

    const createdUser = await query(
      'SELECT id, name, email, role, title, created_at FROM users WHERE id = ?', 
      [result.insertId]
    );
    
    res.status(201).json(createdUser[0]);
  } catch (err) {
    next(err);
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/auth/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid email or password format' });
    }
    const { email, password } = parsed.data;
    const users = await query('SELECT * FROM users WHERE email = ?', [email]);
    const user = users[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      title: user.title,
    };
    const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, user: payload });
  } catch (err) {
    next(err);
  }
});

router.get('/auth/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

router.get('/users', authenticate, async (_req, res, next) => {
  try {
    const users = await query('SELECT id, name, email, role, title FROM users ORDER BY name ASC');
    res.json(users);
  } catch (err) {
    next(err);
  }
});


// 2. INCIDENTS & TIMELINE (Requirements 2, 3, 5)

router.get('/incidents', authenticate, async (req, res, next) => {
  try {
    const { status, severity, serviceId, assignedToId, search } = req.query;

    let sql = `
      SELECT i.*, 
             s.name AS service_name, s.slug AS service_slug, s.status AS service_status,
             u1.name AS created_by_name,
             u2.name AS assigned_to_name, u2.title AS assigned_to_title
      FROM incidents i
      JOIN services s ON i.service_id = s.id
      JOIN users u1 ON i.created_by_id = u1.id
      LEFT JOIN users u2 ON i.assigned_to_id = u2.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ' AND i.status = ?';
      params.push(status);
    }
    if (severity) {
      sql += ' AND i.severity = ?';
      params.push(severity);
    }
    if (serviceId) {
      sql += ' AND i.service_id = ?';
      params.push(Number(serviceId));
    }
    if (assignedToId) {
      sql += ' AND i.assigned_to_id = ?';
      params.push(Number(assignedToId));
    }
    if (search) {
      sql += ' AND (i.title LIKE ? OR i.code LIKE ? OR s.name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY i.created_at DESC';
    const incidents = await query(sql, params);

    // Dashboard summary counts
    const allIncidents = await query('SELECT status, severity FROM incidents');
    const summary = {
      openTotal: allIncidents.filter((i) => i.status !== 'RESOLVED').length,
      critical: allIncidents.filter((i) => i.severity === 'CRITICAL' && i.status !== 'RESOLVED').length,
      investigating: allIncidents.filter((i) => i.status === 'INVESTIGATING').length,
      resolved: allIncidents.filter((i) => i.status === 'RESOLVED').length,
    };

    res.json({ summary, incidents });
  } catch (err) {
    next(err);
  }
});

// Get single incident with Timeline, Correlated Deployments, and Recurrence info
router.get('/incidents/:id', authenticate, async (req, res, next) => {
  try {
    const param = req.params.id;
    const isCode = isNaN(Number(param));

    const incidents = await query(
      `SELECT i.*, 
              s.name AS service_name, s.slug AS service_slug, s.status AS service_status,
              u1.name AS created_by_name,
              u2.name AS assigned_to_name, u2.title AS assigned_to_title
       FROM incidents i
       JOIN services s ON i.service_id = s.id
       JOIN users u1 ON i.created_by_id = u1.id
       LEFT JOIN users u2 ON i.assigned_to_id = u2.id
       WHERE ${isCode ? 'i.code = ?' : 'i.id = ?'}`,
      [param]
    );

    const incident = incidents[0];
    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    const timeline = await query(
      `SELECT t.*, u.name AS user_name, u.title AS user_title
       FROM timeline_events t
       LEFT JOIN users u ON t.user_id = u.id
       WHERE t.incident_id = ?
       ORDER BY t.occurred_at ASC, t.id ASC`,
      [incident.id]
    );

    const deployments = await query(
      `SELECT d.*, s.name AS service_name 
       FROM deployments d 
       JOIN services s ON d.service_id = s.id 
       WHERE d.service_id = ? 
       ORDER BY d.deployed_at DESC`,
      [incident.service_id]
    );

    const allIncidents = await query(
      'SELECT id, code, title, category, severity, status, service_id, created_at FROM incidents'
    );

    const correlatedDeployments = findCorrelatedDeployments(
      deployments,
      incident,
      env.CORRELATION_WINDOW_MINUTES
    );

    const recurringIncidents = findRecurringIncidents(allIncidents, incident, 72);

    res.json({
      incident,
      timeline,
      correlatedDeployments,
      recurringIncidents,
      correlationWindowMinutes: env.CORRELATION_WINDOW_MINUTES,
    });
  } catch (err) {
    next(err);
  }
});

const createIncidentSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  category: z.string().default('Backend'),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  serviceId: z.number().int(),
  assignedToId: z.number().int().nullable().optional(),
});

router.post('/incidents', authenticate, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const parsed = createIncidentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
    }
    const { title, description, category, severity, serviceId, assignedToId } = parsed.data;

    await conn.beginTransaction();

    // Generate next INC-XXXX code
    const [countRows] = await conn.execute('SELECT COUNT(*) as count FROM incidents');
    const nextNum = 1001 + Number(countRows[0].count);
    const code = `INC-${nextNum}`;

    const [result] = await conn.execute(
      `INSERT INTO incidents (code, title, description, category, severity, status, service_id, created_by_id, assigned_to_id)
       VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)`,
      [code, title, description || '', category, severity, serviceId, req.user.id, assignedToId || null]
    );

    const incidentId = result.insertId;

    // 1. Record INCIDENT_CREATED event
    await conn.execute(
      `INSERT INTO timeline_events (incident_id, user_id, type, title, description)
       VALUES (?, ?, 'INCIDENT_CREATED', 'Incident created', ?)`,
      [incidentId, req.user.id, 'Initial ticket logged.']
    );

    // 2. Check automatic deployment correlation within window
    const [deployments] = await conn.execute(
      'SELECT * FROM deployments WHERE service_id = ? ORDER BY deployed_at DESC',
      [serviceId]
    );

    const correlated = findCorrelatedDeployments(
      deployments,
      { service_id: serviceId, created_at: new Date() },
      env.CORRELATION_WINDOW_MINUTES
    );

    for (const dep of correlated) {
      await conn.execute(
        `INSERT INTO timeline_events (incident_id, type, title, description, metadata)
         VALUES (?, 'DEPLOYMENT_DETECTED', ?, ?, ?)`,
        [
          incidentId,
          `Deployment ${dep.version} detected`,
          `Suggested correlation (not confirmed root cause): ${dep.explanation}`,
          JSON.stringify({ deploymentId: dep.id, version: dep.version, isSuggestion: true }),
        ]
      );
    }

    // Mark service as DEGRADED or UNAVAILABLE if Critical/High
    if (severity === 'CRITICAL' || severity === 'HIGH') {
      await conn.execute('UPDATE services SET status = ? WHERE id = ?', [
        severity === 'CRITICAL' ? 'UNAVAILABLE' : 'DEGRADED',
        serviceId,
      ]);
    }

    await conn.commit();

    const [createdRows] = await conn.execute('SELECT * FROM incidents WHERE id = ?', [incidentId]);
    io.emit('incident_created', createdRows[0]);

    res.status(201).json(createdRows[0]);
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// Update incident status, severity, or assignee
router.patch('/incidents/:id', authenticate, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const incidentId = Number(req.params.id);
    const { status, severity, assignedToId, title, category } = req.body;

    await conn.beginTransaction();

    // Row lock for concurrent update consistency
    const [existingRows] = await conn.execute('SELECT * FROM incidents WHERE id = ? FOR UPDATE', [incidentId]);
    const incident = existingRows[0];
    if (!incident) {
      await conn.rollback();
      return res.status(404).json({ error: 'Incident not found' });
    }

    const newStatus = status || incident.status;
    const newSeverity = severity || incident.severity;
    const newAssignedTo = assignedToId !== undefined ? assignedToId : incident.assigned_to_id;
    const resolvedAt =
      newStatus === 'RESOLVED' && incident.status !== 'RESOLVED' ? new Date() : incident.resolved_at;

    await conn.execute(
      `UPDATE incidents 
       SET status = ?, severity = ?, assigned_to_id = ?, title = ?, category = ?, resolved_at = ?
       WHERE id = ?`,
      [
        newStatus,
        newSeverity,
        newAssignedTo,
        title || incident.title,
        category || incident.category,
        resolvedAt,
        incidentId,
      ]
    );

    const generatedEventIds = []; 

    // Record Status change on timeline
    if (status && status !== incident.status) {
      const [result] = await conn.execute(
        `INSERT INTO timeline_events (incident_id, user_id, type, title, description)
         VALUES (?, ?, 'STATUS_CHANGE', ?, ?)`,
        [
          incidentId,
          req.user.id,
          `Status changed to ${status}`,
          `Transitioned from ${incident.status} → ${status}`,
        ]
      );
      generatedEventIds.push(result.insertId);

      // If resolved, restore service status to HEALTHY
      if (status === 'RESOLVED') {
        await conn.execute('UPDATE services SET status = "HEALTHY" WHERE id = ?', [incident.service_id]);
      }
    }

    // Record Severity change on timeline
    if (severity && severity !== incident.severity) {
      const [result] = await conn.execute(
        `INSERT INTO timeline_events (incident_id, user_id, type, title, description)
         VALUES (?, ?, 'STATUS_CHANGE', ?, ?)`,
        [
          incidentId,
          req.user.id,
          `Severity changed to ${severity}`,
          `Transitioned from ${incident.severity} → ${severity}`,
        ]
      );
      generatedEventIds.push(result.insertId);
    }

    // Record Assignment change on timeline
    if (assignedToId !== undefined && Number(assignedToId) !== Number(incident.assigned_to_id)) {
      if (assignedToId === null) {
        const [result] = await conn.execute(
          `INSERT INTO timeline_events (incident_id, user_id, type, title, description)
           VALUES (?, ?, 'ASSIGNMENT', 'Incident unassigned', 'Unassigned')`,
          [incidentId, req.user.id]
        );
        generatedEventIds.push(result.insertId);
      } else {
        const [users] = await conn.execute('SELECT name, title FROM users WHERE id = ?', [assignedToId]);
        const assignee = users[0];
        if (assignee) {
          const [result] = await conn.execute(
            `INSERT INTO timeline_events (incident_id, user_id, type, title, description)
             VALUES (?, ?, 'ASSIGNMENT', ?, ?)`,
            [
              incidentId,
              req.user.id,
              `Assigned to ${assignee.name}`,
              `(${assignee.title || 'Engineer'})`,
            ]
          );
          generatedEventIds.push(result.insertId);
        }
      }
    }

    await conn.commit();

    // 1. Broadcast the incident state changes
    io.to(`incident:${incidentId}`).emit('incident_updated', { 
      incidentId, 
      status: newStatus, 
      severity: newSeverity, 
      assignedToId: newAssignedTo 
    });
    io.emit('dashboard_updated', { incidentId });

    // 2. Broadcast every new timeline event so other users see the history populate instantly
    for (const eventId of generatedEventIds) {
      const [eventRows] = await conn.execute(
        `SELECT t.*, u.name AS user_name, u.title AS user_title
         FROM timeline_events t
         LEFT JOIN users u ON t.user_id = u.id
         WHERE t.id = ?`,
        [eventId]
      );
      if (eventRows[0]) {
        io.to(`incident:${incidentId}`).emit('timeline_event_added', eventRows[0]);
      }
    }

    res.json({ message: 'Incident updated', status: newStatus, severity: newSeverity, assignedToId: newAssignedTo });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// Add Timeline Event / Comment / Structured Evidence / Recovery Action (With Idempotency Key!)
const timelineEventSchema = z.object({
  type: z.enum([
    'COMMENT',
    'NOTE',
    'ERROR_EVENT',
    'SERVER_EVENT',
    'APP_EVENT',
    'RECOVERY_ACTION',
  ]),
  title: z.string().min(1),
  description: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  idempotencyKey: z.string().optional(),
});

router.post('/incidents/:id/events', authenticate, async (req, res, next) => {
  try {
    const incidentId = Number(req.params.id);
    const parsed = timelineEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid event data', details: parsed.error.format() });
    }

    const { type, title, description, metadata, idempotencyKey } = parsed.data;

    // Duplicate Event Prevention via Redis + MySQL Unique Constraint (Requirement 5)
    if (idempotencyKey) {
      const redisLockKey = `idempotency:event:${idempotencyKey}`;
      const isFirstTime = await redis.set(redisLockKey, '1', 'EX', 3600, 'NX');
      if (!isFirstTime) {
        const existing = await query('SELECT * FROM timeline_events WHERE idempotency_key = ?', [
          idempotencyKey,
        ]);
        return res.status(200).json({ duplicated: true, event: existing[0] });
      }
    }

    const result = await query(
      `INSERT INTO timeline_events (incident_id, user_id, type, title, description, metadata, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        incidentId,
        req.user.id,
        type,
        title,
        description || '',
        metadata ? JSON.stringify(metadata) : null,
        idempotencyKey || null,
      ]
    );

    const insertedEvents = await query(
      `SELECT t.*, u.name AS user_name, u.title AS user_title
       FROM timeline_events t
       LEFT JOIN users u ON t.user_id = u.id
       WHERE t.id = ?`,
      [result.insertId]
    );

    const newEvent = insertedEvents[0];

    // Broadcast in real-time to all engineers viewing this incident
    io.to(`incident:${incidentId}`).emit('timeline_event_added', newEvent);

    res.status(201).json({ duplicated: false, event: newEvent });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(200).json({ duplicated: true, message: 'Duplicate event ignored' });
    }
    next(err);
  }
});


// 3. SERVICES & DEPENDENCY IMPACT (Requirement 4)

router.get('/services/graph', authenticate, async (_req, res, next) => {
  try {
    const services = await query('SELECT * FROM services ORDER BY id ASC');
    const dependencies = await query('SELECT * FROM service_dependencies');

    // Calculate combined impact across any currently non-healthy services
    const failingServices = services.filter((s) => s.status !== 'HEALTHY');
    const impactByService = {};

    for (const failing of failingServices) {
      impactByService[failing.id] = {
        service: failing,
        ...calculateDependencyImpact(services, dependencies, failing.id),
      };
    }

    res.json({
      services,
      dependencies,
      impactByService,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/services', authenticate, authorizeRoles('ADMIN'), async (req, res, next) => {
  try {
    const { name, description, status } = req.body;
    if (!name) return res.status(400).json({ error: 'Service name is required' });
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const result = await query(
      'INSERT INTO services (name, slug, description, status) VALUES (?, ?, ?, ?)',
      [name, slug, description || '', status || 'HEALTHY']
    );
    const created = await query('SELECT * FROM services WHERE id = ?', [result.insertId]);
    res.status(201).json(created[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/services/:id/status', authenticate, async (req, res, next) => {
  try {
    const serviceId = Number(req.params.id);
    const { status } = req.body;
    if (!['HEALTHY', 'DEGRADED', 'UNAVAILABLE'].includes(status)) {
      return res.status(400).json({ error: 'Invalid service status' });
    }
    await query('UPDATE services SET status = ? WHERE id = ?', [status, serviceId]);
    io.emit('service_status_updated', { serviceId, status });
    res.json({ serviceId, status });
  } catch (err) {
    next(err);
  }
});

// Add Service Dependency with Circular Dependency Prevention
router.post('/services/dependencies', authenticate, async (req, res, next) => {
  try {
    const { serviceId, dependsOnId } = req.body;
    if (!serviceId || !dependsOnId) {
      return res.status(400).json({ error: 'serviceId and dependsOnId are required' });
    }

    const existingEdges = await query('SELECT service_id, depends_on_id FROM service_dependencies');

    if (hasCircularDependency(existingEdges, Number(serviceId), Number(dependsOnId))) {
      return res.status(400).json({
        error: 'Circular dependency detected! Adding this dependency would create a cycle.',
      });
    }

    await query('INSERT INTO service_dependencies (service_id, depends_on_id) VALUES (?, ?)', [
      Number(serviceId),
      Number(dependsOnId),
    ]);

    res.status(201).json({ message: 'Dependency added successfully' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Dependency already exists' });
    }
    next(err);
  }
});


// 4. DEPLOYMENTS (Requirement 3)

router.get('/deployments', authenticate, async (_req, res, next) => {
  try {
    const deployments = await query(
      `SELECT d.*, s.name AS service_name, s.slug AS service_slug
       FROM deployments d
       JOIN services s ON d.service_id = s.id
       ORDER BY d.deployed_at DESC`
    );
    res.json(deployments);
  } catch (err) {
    next(err);
  }
});

router.post('/deployments', authenticate, async (req, res, next) => {
  try {
    const { version, serviceId, environment, status, description } = req.body;
    if (!version || !serviceId) {
      return res.status(400).json({ error: 'version and serviceId are required' });
    }
    const result = await query(
      `INSERT INTO deployments (version, service_id, environment, status, description)
       VALUES (?, ?, ?, ?, ?)`,
      [version, Number(serviceId), environment || 'production', status || 'SUCCESS', description || '']
    );
    const created = await query(
      `SELECT d.*, s.name AS service_name FROM deployments d JOIN services s ON d.service_id = s.id WHERE d.id = ?`,
      [result.insertId]
    );
    res.status(201).json(created[0]);
  } catch (err) {
    next(err);
  }
});


// 5. POST-INCIDENT REPORT & CORRECTIVE ACTIONS (Requirement 6)

router.get('/incidents/:id/report', authenticate, async (req, res, next) => {
  try {
    const incidentId = Number(req.params.id);
    const incidents = await query(
      `SELECT i.*, s.name AS service_name
       FROM incidents i
       JOIN services s ON i.service_id = s.id
       WHERE i.id = ?`,
      [incidentId]
    );
    const incident = incidents[0];
    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    const reports = await query('SELECT * FROM post_incident_reports WHERE incident_id = ?', [incidentId]);
    const actions = await query(
      `SELECT ca.*, u.name AS assignee_name
       FROM corrective_actions ca
       LEFT JOIN users u ON ca.assignee_id = u.id
       WHERE ca.incident_id = ?
       ORDER BY ca.id ASC`,
      [incidentId]
    );
    const timeline = await query(
      `SELECT t.*, u.name AS user_name
       FROM timeline_events t
       LEFT JOIN users u ON t.user_id = u.id
       WHERE t.incident_id = ? 
       ORDER BY t.occurred_at ASC`,
      [incidentId]
    );
    const services = await query('SELECT * FROM services');
    const dependencies = await query('SELECT * FROM service_dependencies');
    const impactGraph = calculateDependencyImpact(services, dependencies, incident.service_id);

    res.json({
      incident,
      report: reports[0] || {
        summary: `${incident.title} on ${incident.service_name}.`,
        impact: `Service ${incident.service_name} and ${impactGraph.directlyAffected.length} downstream services affected.`,
        suspectedCause: 'Investigation ongoing — reviewing correlated deployments and error events.',
      },
      actions,
      timeline,
      affectedServices: [
        incident.service_name,
        ...impactGraph.directlyAffected.map((s) => s.name),
      ],
    });
  } catch (err) {
    next(err);
  }
});

router.put('/incidents/:id/report', authenticate, async (req, res, next) => {
  try {
    const incidentId = Number(req.params.id);
    const { summary, impact, suspectedCause } = req.body;

    await query(
      `INSERT INTO post_incident_reports (incident_id, summary, impact, suspected_cause)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE summary = VALUES(summary), impact = VALUES(impact), suspected_cause = VALUES(suspected_cause)`,
      [incidentId, summary, impact, suspectedCause]
    );

    const updated = await query('SELECT * FROM post_incident_reports WHERE incident_id = ?', [incidentId]);
    res.json(updated[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/incidents/:id/actions', authenticate, async (req, res, next) => {
  try {
    const incidentId = Number(req.params.id);
    const { title, assigneeId } = req.body;
    if (!title) return res.status(400).json({ error: 'Action title is required' });

    const result = await query(
      'INSERT INTO corrective_actions (incident_id, title, status, assignee_id) VALUES (?, ?, "PENDING", ?)',
      [incidentId, title, assigneeId || null]
    );
    const created = await query('SELECT * FROM corrective_actions WHERE id = ?', [result.insertId]);
    res.status(201).json(created[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/actions/:actionId', authenticate, async (req, res, next) => {
  try {
    const actionId = Number(req.params.actionId);
    const { status } = req.body;
    if (!['PENDING', 'IN_PROGRESS', 'COMPLETED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    await query('UPDATE corrective_actions SET status = ? WHERE id = ?', [status, actionId]);
    const updated = await query('SELECT * FROM corrective_actions WHERE id = ?', [actionId]);
    res.json(updated[0]);
  } catch (err) {
    next(err);
  }
});

export default router;