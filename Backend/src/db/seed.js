import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function seed() {
  const connection = await mysql.createConnection({
    uri: env.DATABASE_URL,
    multipleStatements: true,
  });

  try {
    console.log('   Applying schema.sql...');
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await connection.query(schemaSql);

    console.log('   Seeding initial data...');
    const passwordHash = await bcrypt.hash('password123', 10);

    // 1. Users
    await connection.execute(
      `INSERT INTO users (id, name, email, password_hash, role, title) VALUES
       (1, 'John', 'admin@incident.io', ?, 'ADMIN', 'Admin'),
       (2, 'Kevin', 'kevin@incident.io', ?, 'ENGINEER', 'SRE Lead'),
       (3, 'Juan', 'juan@incident.io', ?, 'ENGINEER', 'Backend Engineer')`,
      [passwordHash, passwordHash, passwordHash]
    );

    // 2. Services (matching UI Reference)
    await connection.execute(
      `INSERT INTO services (id, name, slug, status, description) VALUES
       (1, 'API Gateway', 'api-gateway', 'DEGRADED', 'Core edge routing gateway'),
       (2, 'Storefront', 'storefront', 'DEGRADED', 'Web Frontend Storefront'),
       (3, 'Database', 'database', 'HEALTHY', 'Primary relational cluster'),
       (4, 'Payments', 'payments', 'DEGRADED', 'Payment processing microservice'),
       (5, 'Mobile App', 'mobile-app', 'DEGRADED', 'iOS and Android client API consumer')`
    );

    // 3. Service Dependencies (matching UI Diagram #3)
    // Storefront(2), Database(3), Payments(4) depend on API Gateway(1)
    // Mobile App(5) depends on Storefront(2)
    await connection.execute(
      `INSERT INTO service_dependencies (service_id, depends_on_id) VALUES
       (2, 1),
       (3, 1),
       (4, 1),
       (5, 2)`
    );

    const now = Date.now();
    const minAgo = (m) => new Date(now - m * 60 * 1000);
    const hoursAgo = (h) => new Date(now - h * 60 * 60 * 1000);

    // 4. Deployments
    await connection.execute(
      `INSERT INTO deployments (id, version, environment, status, description, service_id, deployed_at) VALUES
       (1, 'v2.4.1', 'production', 'SUCCESS', 'Updated rate-limiting and header forwarding config', 1, ?),
       (2, 'v1.9.0', 'production', 'SUCCESS', 'Stripe webhook retry handler', 4, ?)`,
      [minAgo(145), hoursAgo(6)]
    );

    // 5. Incidents (INC-1001 to INC-1005 + INC-1000 for recurrence check)
    await connection.execute(
      `INSERT INTO incidents (id, code, title, description, category, severity, status, service_id, created_by_id, assigned_to_id, created_at, resolved_at) VALUES
       (1, 'INC-1001', 'API returning 500 errors', 'High rate of HTTP 500 responses observed on /v1/checkout routes through API Gateway.', 'Backend', 'CRITICAL', 'INVESTIGATING', 1, 2, 3, ?, NULL),
       (2, 'INC-1002', 'Slow response time', 'Elevated p99 latency on storefront SSR pages.', 'Frontend', 'HIGH', 'OPEN', 2, 2, NULL, ?, NULL),
       (3, 'INC-1003', 'Payment webhook delay', 'Webhook delivery queue experiencing 45s lag.', 'Payments', 'MEDIUM', 'MONITORING', 4, 3, 3, ?, NULL),
       (4, 'INC-1004', 'Database connection errors', 'Intermittent connection pool exhaustion.', 'Database', 'HIGH', 'INVESTIGATING', 3, 2, NULL, ?, NULL),
       (5, 'INC-1005', 'Mobile app crashes', 'Null pointer exception on legacy iOS version.', 'Mobile', 'LOW', 'RESOLVED', 5, 1, NULL, ?, ?),
       (6, 'INC-1000', 'Gateway 502 Bad Gateway spike', 'Upstream timeout errors in API Gateway.', 'Backend', 'HIGH', 'RESOLVED', 1, 2, 3, ?, ?)`,
      [
        hoursAgo(2),
        hoursAgo(3),
        hoursAgo(5),
        hoursAgo(6),
        hoursAgo(8), hoursAgo(4),
        hoursAgo(18), hoursAgo(16),
      ]
    );

    // 6. Timeline Events for INC-1001
    await connection.execute(
      `INSERT INTO timeline_events (incident_id, user_id, type, title, description, metadata, occurred_at) VALUES
       (1, 2, 'INCIDENT_CREATED', 'Incident created', 'By Kevin', NULL, ?),
       (1, 3, 'ASSIGNMENT', 'Assigned to Juan', '(Backend Engineer)', NULL, ?),
       (1, 3, 'ERROR_EVENT', 'Error event received', 'API returned 500 errors', ?, ?),
       (1, NULL, 'DEPLOYMENT_DETECTED', 'Deployment v2.4.1 detected', 'Potentially related to incident (Suggested correlation - deployed 25m before incident)', ?, ?),
       (1, 3, 'RECOVERY_ACTION', 'Recovery action recorded', 'Service is responding normally', NULL, ?)`,
      [
        minAgo(120),
        minAgo(107),
        JSON.stringify({ errorCode: 'HTTP_500_UPSTREAM', errorRate: '18%', endpoint: '/api/v1/checkout' }),
        minAgo(92),
        JSON.stringify({ deploymentId: 1, version: 'v2.4.1', isSuggestion: true }),
        minAgo(70),
        minAgo(37),
      ]
    );

    // 7. Post-Incident Report & Corrective Actions for INC-1001
    await connection.execute(
      `INSERT INTO post_incident_reports (incident_id, summary, impact, suspected_cause) VALUES
       (1, 'API returned 500 errors for 3 hours, affecting customer checkout flow. Service recovered after deployment rollback.',
           'Customers experienced errors during checkout. Estimated 18% of requests failed.',
           'Recent deployment v2.4.1 introduced a configuration issue in the API service (Suspected correlation - pending root cause verification).')`
    );

    await connection.execute(
      `INSERT INTO corrective_actions (incident_id, title, status, assignee_id) VALUES
       (1, 'Add deployment validation', 'COMPLETED', 3),
       (1, 'Add automated regression test', 'COMPLETED', 2),
       (1, 'Improve error logging', 'IN_PROGRESS', 3)`
    );

    console.log('   Database schema applied & seeded successfully!');
    console.log('   Admin Login:    admin@incident.io / password123');
    console.log('   Engineer Login: kevin@incident.io  / password123');
    console.log('   Engineer Login: juan@incident.io  / password123');
  } catch (err) {
    console.error(' Seed error:', err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

seed();