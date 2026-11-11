import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';
import {
  hasCircularDependency,
  calculateDependencyImpact,
  findCorrelatedDeployments,
} from '../utils/smartEngine.js';

describe('Smart Engine Business Logic Tests', () => {
  it('detects circular dependencies accurately', () => {
    const edges = [
      { service_id: 2, depends_on_id: 1 }, // Storefront -> API Gateway
      { service_id: 5, depends_on_id: 2 }, // Mobile App -> Storefront
    ];
    // Making API Gateway (1) depend on Mobile App (5) creates a cycle: 1 -> 5 -> 2 -> 1
    expect(hasCircularDependency(edges, 1, 5)).toBe(true);
    // Making Payments (4) depend on API Gateway (1) is valid
    expect(hasCircularDependency(edges, 4, 1)).toBe(false);
  });

  it('calculates directly and potentially affected downstream services', () => {
    const services = [
      { id: 1, name: 'API Gateway' },
      { id: 2, name: 'Storefront' },
      { id: 4, name: 'Payments' },
      { id: 5, name: 'Mobile App' },
    ];
    const dependencies = [
      { service_id: 2, depends_on_id: 1 },
      { service_id: 4, depends_on_id: 1 },
      { service_id: 5, depends_on_id: 2 },
    ];

    const impact = calculateDependencyImpact(services, dependencies, 1);
    expect(impact.directlyAffected.map((s) => s.name)).toEqual(['Storefront', 'Payments']);
    expect(impact.potentiallyAffected.map((s) => s.name)).toEqual(['Mobile App']);
  });

  it('correlates deployments within window and marks as suggestion', () => {
    const now = Date.now();
    const incident = {
      service_id: 1,
      created_at: new Date(now).toISOString(),
    };
    const deployments = [
      {
        id: 10,
        version: 'v2.4.1',
        service_id: 1,
        deployed_at: new Date(now - 25 * 60 * 1000).toISOString(), // 25m before
      },
      {
        id: 11,
        version: 'v2.0.0',
        service_id: 1,
        deployed_at: new Date(now - 180 * 60 * 1000).toISOString(), // 3h before (outside 60m window)
      },
    ];

    const correlated = findCorrelatedDeployments(deployments, incident, 60);
    expect(correlated).toHaveLength(1);
    expect(correlated[0].version).toBe('v2.4.1');
    expect(correlated[0].isSuggestion).toBe(true);
  });
});

describe('API Authentication & Security Tests', () => {
  it('returns 200 on /api/health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('rejects unauthenticated requests to /api/incidents', async () => {
    const res = await request(app).get('/api/incidents');
    expect(res.status).toBe(401);
  });

  it('authenticates admin user and returns JWT', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@incident.io', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('ADMIN');
  });
});