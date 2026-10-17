import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../.env') });
process.env.DISABLE_LOCAL_EMBEDDING = 'true';
import { pool } from '../src/db/index.js';
import { HybridRetriever } from '../src/modules/ai/hybrid-retriever.js';

async function run() {
  // The production pool prewarms connections asynchronously; wait for one real
  // checkout here so this diagnostic reports the steady-state retrieval path.
  await pool.query('SELECT 1');
  const pairQueryStarted = performance.now();
  const pairSearch = await pool.query(`
    SELECT id, parva, source_reference, characters, text
    FROM mahabharata_child_chunks
    WHERE search_vector @@ to_tsquery('english', $1)
    ORDER BY ts_rank_cd(search_vector, to_tsquery('english', $1)) DESC
    LIMIT 10
  `, ["('bhishma':* | 'bhisma':*) & ('parashurama':* | 'parasurama':*)"]);
  const bhishmaAliasParents = await pool.query(`
    SELECT id, parva, source_reference, translation
    FROM mahabharata_chunks
    WHERE translation ILIKE '%bhishma%'
      AND translation ILIKE ANY(ARRAY['%bhargava%', '%jamadagni%', '%jamadagnya%', '%parasurama%'])
    LIMIT 20
  `);
  console.log(JSON.stringify({
    pairSearchMs: Math.round(performance.now() - pairQueryStarted),
    pairRows: pairSearch.rows.map((row: any) => ({ reference: row.source_reference, parva: row.parva, characters: row.characters, text: row.text.slice(0, 260) })),
    bhishmaAliasRows: bhishmaAliasParents.rows.slice(0, 2).map((row: any) => ({ reference: row.source_reference, parva: row.parva, text: row.translation.slice(0, 400) })),
  }, null, 2));
  const queries = [
    { query: 'Bhishma is a Mahabharata character; what is he known for?', characters: ['Bhishma'] },
    { query: 'Was Bhishma related to Parashurama, and did they fight?', characters: ['Bhishma', 'Parashurama'] },
    { query: 'What does Bhagavad Gita 2.47 teach about action?', characters: [] },
  ];
  const results = [];
  for (const item of queries) {
    const result = await HybridRetriever.retrieve(item.query, item.characters, [], item.query.includes('related') ? 8 : 3);
    results.push({
      query: item.query,
      passageCount: result.passages.length,
      sufficient: result.hasSufficientEvidence,
      path: result.retrievalPath,
      retrievalMs: result.retrievalLatencyMs,
      databaseMs: result.databaseLatencyMs,
      fallbackUsed: result.fallbackUsed,
      timedOut: result.timings?.databaseTimeout,
      references: result.passages.map(p => ({ sourceReference: p.sourceReference, characters: p.characters, text: p.translation.slice(0, 600) })),
      timings: result.timings,
    });
  }
  console.log(JSON.stringify(results, null, 2));
  await pool.end();
}

run().catch(async error => {
  console.error(error);
  await pool.end();
  process.exitCode = 1;
});
