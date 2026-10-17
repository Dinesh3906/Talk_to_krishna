import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import app from '../index.js';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { getJwtSecret } from '../modules/auth/auth-config.js';

describe('Cross-User Authorization and Conversation Isolation', () => {
  let server: http.Server;
  let baseUrl: string;
  let userAId: string;
  let userBId: string;
  let tokenA: string;
  let tokenB: string;
  let conversationAId: string;

  beforeAll(async () => {
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Server address invalid');
    baseUrl = `http://127.0.0.1:${address.port}`;

    userAId = randomUUID();
    userBId = randomUUID();
    const secret = getJwtSecret();

    await db.insert(schema.users).values([
      { id: userAId, email: `usera-${userAId}@example.invalid`, isAnonymous: true, isVerified: true, tokenVersion: 1 },
      { id: userBId, email: `userb-${userBId}@example.invalid`, isAnonymous: true, isVerified: true, tokenVersion: 1 },
    ]);

    tokenA = jwt.sign({ sub: userAId, email: `usera-${userAId}@example.invalid`, tokenVersion: 1 }, secret, { expiresIn: '1h' });
    tokenB = jwt.sign({ sub: userBId, email: `userb-${userBId}@example.invalid`, tokenVersion: 1 }, secret, { expiresIn: '1h' });

    // User A creates conversation
    const res = await fetch(`${baseUrl}/api/v1/conversations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'User A Private Reflection' }),
    });

    expect(res.status).toBe(201);
    const json = await res.json() as any;
    conversationAId = json.data.id;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.delete(schema.conversations).where(eq(schema.conversations.userId, userAId));
    await db.delete(schema.conversations).where(eq(schema.conversations.userId, userBId));
    await db.delete(schema.users).where(eq(schema.users.id, userAId));
    await db.delete(schema.users).where(eq(schema.users.id, userBId));
  });

  it('allows User A to access their own conversation', async () => {
    const res = await fetch(`${baseUrl}/api/v1/conversations/${conversationAId}`, {
      headers: { 'Authorization': `Bearer ${tokenA}` },
    });

    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.data.id).toBe(conversationAId);
    expect(json.data.title).toBe('User A Private Reflection');
  });

  it('strictly forbids User B from viewing User A conversation (returns 404)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/conversations/${conversationAId}`, {
      headers: { 'Authorization': `Bearer ${tokenB}` },
    });

    expect(res.status).toBe(404);
    const json = await res.json() as any;
    expect(json.error.code).toBe('NOT_FOUND');
  });

  it('strictly forbids User B from sending messages to User A conversation (returns 404)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/conversations/${conversationAId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenB}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: 'Malicious injection attempt' }),
    });

    expect(res.status).toBe(404);
    const json = await res.json() as any;
    expect(json.error.code).toBe('NOT_FOUND');
  });

  it('rejects unauthenticated requests to protected conversation routes with 401', async () => {
    const resGet = await fetch(`${baseUrl}/api/v1/conversations/${conversationAId}`);
    expect(resGet.status).toBe(401);

    const resPost = await fetch(`${baseUrl}/api/v1/conversations/${conversationAId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Unauthenticated message' }),
    });
    expect(resPost.status).toBe(401);
  });
});
