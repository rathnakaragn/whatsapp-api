const request = require('supertest');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Set test environment before requiring app
process.env.NODE_ENV = 'test';
process.env.API_KEY = 'test-api-key';

const { createApp, createDatabase } = require('../app');

describe('Authentication Middleware', () => {
  let app;
  let db;
  const testDbPath = path.join(__dirname, 'test-auth.db');
  const TEST_API_KEY = 'test-api-key';

  beforeAll(() => {
    db = createDatabase(testDbPath);
    app = createApp(db, TEST_API_KEY);
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
    if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
  });

  describe('Public Endpoints', () => {
    test('GET /api/v1/health should not require authentication', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
    });
  });

  describe('Protected Endpoints - Header Authentication', () => {
    test('GET /api/v1/status should succeed with valid X-API-Key header', async () => {
      const res = await request(app)
        .get('/api/v1/status')
        .set('X-API-Key', TEST_API_KEY);
      expect(res.status).toBe(200);
    });

    test('GET /api/v1/status should fail without authentication', async () => {
      const res = await request(app).get('/api/v1/status');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    test('GET /api/v1/status should fail with invalid API key', async () => {
      const res = await request(app)
        .get('/api/v1/status')
        .set('X-API-Key', 'wrong-key');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    test('GET /api/v1/status should fail with empty API key', async () => {
      const res = await request(app)
        .get('/api/v1/status')
        .set('X-API-Key', '');
      expect(res.status).toBe(401);
    });

    test('GET /api/v1/inbox should succeed with valid X-API-Key header', async () => {
      const res = await request(app)
        .get('/api/v1/inbox')
        .set('X-API-Key', TEST_API_KEY);
      expect(res.status).toBe(200);
    });

    test('GET /api/v1/inbox should fail without authentication', async () => {
      const res = await request(app).get('/api/v1/inbox');
      expect(res.status).toBe(401);
    });

    test('POST /api/v1/messages/:id/reply should require authentication', async () => {
      const res = await request(app)
        .post('/api/v1/messages/test-id/reply')
        .send({ message: 'test' });
      expect(res.status).toBe(401);
    });

    test('PATCH /api/v1/messages/:id/status should require authentication', async () => {
      const res = await request(app)
        .patch('/api/v1/messages/test-id/status')
        .send({ status: 'read' });
      expect(res.status).toBe(401);
    });
  });

  describe('Protected Endpoints - Query Parameter Authentication', () => {
    test('GET /api/v1/status should succeed with valid api_key query param', async () => {
      const res = await request(app).get(`/api/v1/status?api_key=${TEST_API_KEY}`);
      expect(res.status).toBe(200);
    });

    test('GET /api/v1/inbox should succeed with valid api_key query param', async () => {
      const res = await request(app).get(`/api/v1/inbox?api_key=${TEST_API_KEY}`);
      expect(res.status).toBe(200);
    });

    test('GET /api/v1/status should fail with invalid api_key query param', async () => {
      const res = await request(app).get('/api/v1/status?api_key=wrong-key');
      expect(res.status).toBe(401);
    });
  });

  describe('Case Sensitivity', () => {
    test('X-API-Key header should be case-sensitive for value', async () => {
      const res = await request(app)
        .get('/api/v1/status')
        .set('X-API-Key', TEST_API_KEY.toUpperCase());
      expect(res.status).toBe(401);
    });

    test('Header name should be case-insensitive (HTTP standard)', async () => {
      const res = await request(app)
        .get('/api/v1/status')
        .set('x-api-key', TEST_API_KEY);
      expect(res.status).toBe(200);
    });
  });
});
