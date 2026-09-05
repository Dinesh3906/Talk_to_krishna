import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL || 'postgresql://krisna_user:krisna_password@localhost:5432/talk_to_krisna_db';

const isLocalDb = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');

// Production connection pool with bounds, timeouts, and cloud SSL support
export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
  max: 20, // Connection budget for horizontal scaling
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  statement_timeout: 15000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL Pool Error]: Unexpected error on idle client', err);
});

export const db = drizzle(pool, { schema });
export { schema };
