import { pool } from '../src/db/index.js';
import { defaultEmbeddingProvider } from '../src/modules/ai/providers/bge-embedding.provider.js';

async function explainHybrid() {
  console.log('=== HYBRID SEARCH SCORING & PROVENANCE EXPLANATION ===\n');

  const query = 'Anukramanika Parva recitation by Sauti';
  console.log(`Query: "${query}"`);

  // 1. Generate real query vector
  const embedding = await defaultEmbeddingProvider.embedQuery(query);
  const embString = `[${embedding.join(',')}]`;

  // 2. Run EXPLAIN ANALYZE on real PostgreSQL hybrid query
  const explainSql = `
    EXPLAIN ANALYZE
    WITH vector_candidates AS (
      SELECT id, 1 - (embedding <=> $1::vector) AS vector_similarity 
      FROM mahabharata_child_chunks 
      ORDER BY embedding <=> $1::vector ASC LIMIT 35
    ),
    fts_candidates AS (
      SELECT id, ts_rank_cd(search_vector, websearch_to_tsquery('english', $2::text)) AS keyword_rank 
      FROM mahabharata_child_chunks 
      WHERE search_vector @@ websearch_to_tsquery('english', $2::text) 
      ORDER BY keyword_rank DESC LIMIT 25
    )
    SELECT 
      c.id,
      c.source_type,
      c.parva,
      c.page_number,
      c.source_reference,
      COALESCE(vc.vector_similarity, 0.0) AS vec_score,
      COALESCE(fc.keyword_rank, 0.0) AS fts_score,
      (
        (COALESCE(vc.vector_similarity, 0.0) * 0.75)
        + (LEAST(COALESCE(fc.keyword_rank, 0.0), 1.0) * 0.25)
      ) AS combined_score
    FROM mahabharata_child_chunks c
    LEFT JOIN vector_candidates vc ON c.id = vc.id
    LEFT JOIN fts_candidates fc ON c.id = fc.id
    WHERE vc.id IS NOT NULL OR fc.id IS NOT NULL
    ORDER BY combined_score DESC
    LIMIT 5;
  `;

  const explainRes = await pool.query(explainSql, [embString, query]);
  console.log('[PostgreSQL Execution Plan]:');
  for (const r of explainRes.rows) {
    console.log(`  ${r['QUERY PLAN']}`);
  }

  // 3. Run the actual data query and show real scoring
  const dataRes = await pool.query(
    explainSql.replace('EXPLAIN ANALYZE', ''),
    [embString, query]
  );

  console.log('\n[Top Retrieved Real Chunks with Hybrid Fusion Scores]:');
  for (const r of dataRes.rows) {
    console.log(`  • ID: ${r.id}`);
    console.log(`    Source Type: ${r.source_type} | Parva: ${r.parva} | Page: ${r.page_number}`);
    console.log(`    Vector Cosine Similarity: ${parseFloat(r.vec_score).toFixed(4)}`);
    console.log(`    FTS BM25 Keyword Rank:   ${parseFloat(r.fts_score).toFixed(4)}`);
    console.log(`    Combined Fusion Score:    ${parseFloat(r.combined_score).toFixed(4)}`);
    console.log(`    Reference: ${r.source_reference}\n`);
  }

  await pool.end();
}

explainHybrid().catch(err => {
  console.error('[Explain Error]:', err);
  process.exit(1);
});
