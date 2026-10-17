import { HybridRetriever } from '../src/modules/ai/hybrid-retriever.js';
import { QuoteVerifier } from '../src/modules/ai/quote-verifier.js';
import { pool } from '../src/db/index.js';

async function runMultiSourceRetrievalTest() {
  console.log('=== MULTI-SOURCE RETRIEVAL & GROUNDING VERIFICATION ===\n');

  // Verify DB Sources
  const sourcesRes = await pool.query('SELECT id, title, source_type, created_at FROM mahabharata_sources ORDER BY created_at ASC');
  console.log('[Database Registered Sources]:');
  for (const s of sourcesRes.rows) {
    console.log(`  • ID: ${s.id} | Source Type: ${s.source_type} | Title: ${s.title}`);
  }
  console.log('');

  const testQueries = [
    {
      description: 'Query targeting Debroy Critical Edition Translation (Anukramanika Parva)',
      query: 'What is recounted in the Anukramanika Parva regarding the origins of the epic?',
      entities: ['Vyasa', 'Sauti'],
    },
    {
      description: 'Query targeting canonical Bhagavad Gita verse',
      query: 'What does Bhagavad Gita 2.47 teach regarding duty and karma?',
      entities: ['Krishna', 'Arjuna'],
    },
    {
      description: 'Query targeting original 12-volume narrative (Vidura council)',
      query: 'What counsel did Vidura offer Dhritarashtra before the great war?',
      entities: ['Vidura', 'Dhritarashtra'],
    },
  ];

  for (let i = 0; i < testQueries.length; i++) {
    const tq = testQueries[i];
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`Test ${i + 1}: ${tq.description}`);
    console.log(`Query: "${tq.query}"`);
    console.log(`Entities: [${tq.entities.join(', ')}]`);

    const result = await HybridRetriever.retrieve(tq.query, tq.entities, [], 5);
    console.log(`Retrieval Latency: ${result.retrievalLatencyMs}ms | Passages Found: ${result.passages.length}`);

    for (let pIdx = 0; pIdx < result.passages.length; pIdx++) {
      const p = result.passages[pIdx];
      console.log(`  [Passage ${pIdx + 1}] Source: ${p.sourceType} | Ref: ${p.sourceReference} | Score: ${p.relevanceScore.toFixed(3)}`);
      console.log(`    Context: ${p.contextSummary || 'N/A'}`);
      console.log(`    Text snippet: ${p.translation.slice(0, 120).replace(/\n/g, ' ')}...`);
    }

    if (result.passages.length > 0) {
      const firstPassage = result.passages[0];
      const verified = QuoteVerifier.verify(
        `As indicated in ancient record, ${firstPassage.translation.slice(0, 40).trim()}, demonstrating the eternal path.`,
        [firstPassage],
        false,
        [{ item: 'Teaching', type: 'teaching', supported: true, evidenceChunkId: firstPassage.id }]
      );

      console.log(`  Citation Verification: ${verified.citations.length} citation(s) produced`);
      for (const cit of verified.citations) {
        console.log(`    • Citation Source: "${cit.source}" | Ref: "${cit.sourceReference}"`);
      }
    }
    console.log('');
  }

  await pool.end();
}

runMultiSourceRetrievalTest().catch(err => {
  console.error('[Retrieval Test Error]:', err);
  process.exit(1);
});
