import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../.env') });
import { pool } from '../src/db/index.js';

const BUDGET_MS = 2500;
async function timedQuery(label: string, sql: string, params: unknown[] = []) {
  const started = performance.now();
  const clientStarted = performance.now();
  let client;
  try {
    client = await pool.connect();
    const acquireMs = performance.now() - clientStarted;
    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout = '${BUDGET_MS}ms'`);
    const queryStarted = performance.now();
    const result = await client.query(sql, params);
    return {
      label,
      pass: true,
      totalMs: Math.round(performance.now() - started),
      acquireMs: Math.round(acquireMs),
      queryMs: Math.round(performance.now() - queryStarted),
      rows: result.rowCount,
      explain: label.startsWith('explain') ? {
        executionMs: result.rows[0]?.['QUERY PLAN']?.[0]?.['Execution Time'],
        planningMs: result.rows[0]?.['QUERY PLAN']?.[0]?.['Planning Time'],
        plan: result.rows[0]?.['QUERY PLAN']?.[0]?.Plan?.['Node Type'],
        index: result.rows[0]?.['QUERY PLAN']?.[0]?.Plan?.Plans?.[0]?.['Index Name'] || result.rows[0]?.['QUERY PLAN']?.[0]?.Plan?.Plans?.[0]?.Plans?.[0]?.['Index Name'],
        actualRows: result.rows[0]?.['QUERY PLAN']?.[0]?.Plan?.['Actual Rows'],
      } : undefined,
    };
  } catch (error: any) {
    return {
      label,
      pass: false,
      totalMs: Math.round(performance.now() - started),
      errorCode: error.code,
      error: error.message,
    };
  } finally {
    if (client) {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  }
}

async function run() {
  const results = [];
  results.push(await timedQuery('counts', `SELECT
    (SELECT count(*) FROM mahabharata_child_chunks)::int AS child_chunks,
    (SELECT count(*) FROM gita_verses)::int AS gita_verses`));
  results.push(await timedQuery('gita-full-load', `SELECT id, chapter, verse, speaker, listener, sanskrit,
    transliteration, translation, deep_meaning, krishna_teaching, provenance
    FROM gita_verses ORDER BY chapter ASC, verse ASC`));
  results.push(await timedQuery('gita-exact-verse', 'SELECT id, chapter, verse, translation FROM gita_verses WHERE chapter = $1 AND verse = $2 LIMIT 1', [2, 47]));
  results.push(await timedQuery('explain-gita-exact', 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id, chapter, verse, translation FROM gita_verses WHERE chapter = 2 AND verse = 47 LIMIT 1'));
  results.push(await timedQuery('mahabharata-fts-bhishma', `SELECT id, parent_chunk_id, source_reference, text
    FROM mahabharata_child_chunks
    WHERE search_vector @@ websearch_to_tsquery('english', 'Bhishma Parashurama')
    ORDER BY ts_rank_cd(search_vector, websearch_to_tsquery('english', 'Bhishma Parashurama')) DESC
    LIMIT 30`));
  results.push(await timedQuery('mahabharata-fts-parashurama', `SELECT id, parent_chunk_id, source_reference, text
    FROM mahabharata_child_chunks
    WHERE search_vector @@ to_tsquery('english', 'parashurama:*')
    ORDER BY ts_rank_cd(search_vector, to_tsquery('english', 'parashurama:*')) DESC
    LIMIT 30`));
  results.push(await timedQuery('mahabharata-fts-bhishma-prefix', `SELECT id, parent_chunk_id, source_reference, text
    FROM mahabharata_child_chunks
    WHERE search_vector @@ to_tsquery('english', 'bhishma:* | parashurama:*')
    ORDER BY ts_rank_cd(search_vector, to_tsquery('english', 'bhishma:* | parashurama:*')) DESC
    LIMIT 30`));
  results.push(await timedQuery('explain-mahabharata-fts', `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT id, parent_chunk_id, source_reference, text FROM mahabharata_child_chunks
    WHERE search_vector @@ websearch_to_tsquery('english', 'Bhishma Parashurama')
    ORDER BY ts_rank_cd(search_vector, websearch_to_tsquery('english', 'Bhishma Parashurama')) DESC LIMIT 30`));
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), budgetMs: BUDGET_MS, pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount }, results }, null, 2));
  await pool.end();
}

run().catch(async error => {
  console.error(error);
  await pool.end();
  process.exitCode = 1;
});
