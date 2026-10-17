import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL || 'postgresql://krisna_user:krisna_password@localhost:5432/talk_to_krisna_db';

const isLocalDb = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');

let connectionString = databaseUrl.replace(/([?&])channel_binding=require(&|$)/, '$1').replace(/[?&]$/, '');
if (!isLocalDb && connectionString.includes('sslmode=') && !connectionString.includes('uselibpqcompat=')) {
  connectionString += (connectionString.includes('?') ? '&' : '?') + 'uselibpqcompat=true';
}

// Production connection pool with bounds, timeouts, and cloud SSL support
export const pool = new Pool({
  connectionString,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
  min: 0, // Serverless pooler drops idle sockets; dynamic acquire eliminates stale socket drops
  max: 20, // Connection budget for horizontal scaling
  idleTimeoutMillis: 20000, // 20s idle timeout
  connectionTimeoutMillis: 10000,
  statement_timeout: 45000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

pool.on('error', (err) => {
  const errorCode = (err as Error & { code?: unknown }).code;
  const code = typeof errorCode === 'string' && /^[A-Z0-9_]{2,32}$/.test(errorCode) ? errorCode : 'UNKNOWN';
  console.error('[PostgreSQL Pool Error]: Unexpected error on idle client', { errorCode: code });
});

// Non-blocking pool pre-warm to ensure zero-latency first queries
Promise.all([pool.query('SELECT 1'), pool.query('SELECT 1'), pool.query('SELECT 1')])
  .then(() => {
    console.log('[PostgreSQL Pool]: Connection pool (3 sockets) pre-warmed and ready.');
  })
  .catch((err) => {
    const code = typeof err?.code === 'string' && /^[A-Z0-9_]{2,32}$/.test(err.code) ? err.code : 'UNKNOWN';
    console.warn('[PostgreSQL Pool]: Initial pre-warm probe failed.', { errorCode: code });
  });

export const db = drizzle(pool, { schema });
export { schema };
