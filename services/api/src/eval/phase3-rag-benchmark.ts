import { HybridRetriever } from '../modules/ai/hybrid-retriever.js';
import { pool } from '../db/index.js';

interface TestCase {
  category: string;
  query: string;
  expectedSourceType: 'mahabharata_source' | 'bhagavad_gita';
  expectedReferenceMatch?: string; // regex or substring
  expectedConcept?: string;
}

const TEST_CASES: TestCase[] = [
  {
    category: 'Krishna War Strategy',
    query: "Why didn't Krishna fight in the Mahabharata?",
    expectedSourceType: 'mahabharata_source',
    expectedReferenceMatch: 'Udyoga Parva',
    expectedConcept: 'vow / charioteer / non-combat'
  },
  {
    category: 'Krishna Strategic Alliance',
    query: 'Why did Krishna choose Arjuna?',
    expectedSourceType: 'mahabharata_source',
    expectedConcept: 'Arjuna / devotion / chariot'
  },
  {
    category: 'Factual Event',
    query: "Who received Krishna's army?",
    expectedSourceType: 'mahabharata_source',
    expectedConcept: 'Duryodhana / Narayani'
  },
  {
    category: 'Key Relationship & Dialogue',
    query: 'What happened between Krishna and Karna in the chariot?',
    expectedSourceType: 'mahabharata_source',
    expectedConcept: 'Karna / chariot / Kunti / loyalty'
  },
  {
    category: 'Ethical & Strategic Dilemma',
    query: 'Why did Krishna allow Karna to die when his chariot wheel was stuck?',
    expectedSourceType: 'mahabharata_source',
    expectedReferenceMatch: 'Karna Parva',
    expectedConcept: 'Karna / wheel / dharma / Abhimanyu'
  },
  {
    category: 'Pivotal Character Vow',
    query: 'Why did Bhishma take his vow of celibacy?',
    expectedSourceType: 'mahabharata_source',
    expectedConcept: 'Shantanu / Satyavati / vow'
  },
  {
    category: 'Pivotal Injustice',
    query: 'Why was Draupadi humiliated in the assembly?',
    expectedSourceType: 'mahabharata_source',
    expectedReferenceMatch: 'Sabha Parva',
    expectedConcept: 'dice / Yudhishthira / vastraharan'
  },
  {
    category: 'Canonical Verse Citation',
    query: 'Explain Gita 2.47.',
    expectedSourceType: 'bhagavad_gita',
    expectedReferenceMatch: 'Bhagavad Gita 2.47',
    expectedConcept: 'Karmanye vadhikaraste'
  },
  {
    category: 'Canonical Verse Deep Meaning',
    query: 'What does Gita 2.47 mean?',
    expectedSourceType: 'bhagavad_gita',
    expectedReferenceMatch: 'Bhagavad Gita 2.47',
    expectedConcept: 'action / fruits'
  },
  {
    category: 'Personal Life Dilemma: Fear of Failure',
    query: 'I am afraid to start because I might fail.',
    expectedSourceType: 'bhagavad_gita',
    expectedConcept: 'duty / attachment / failure'
  },
  {
    category: 'Personal Life Dilemma: Letting Go',
    query: "I can't let go of someone who left me.",
    expectedSourceType: 'bhagavad_gita',
    expectedConcept: 'attachment / impermanence'
  },
  {
    category: 'Personal Life Dilemma: Betrayal & Rage',
    query: 'I am angry because someone betrayed me.',
    expectedSourceType: 'bhagavad_gita',
    expectedConcept: 'anger / delusion / peace'
  }
];

export async function runRAGBenchmark() {
  console.log('================================================================');
  console.log('TALK TO KRISHNA — PHASE 3 TRUE SOURCE RAG RETRIEVAL BENCHMARK');
  console.log('================================================================');

  let passedCount = 0;
  const latencies: number[] = [];
  const results: any[] = [];

  console.log('Pre-warming embedding model & Gita cache for production measurement...');
  const { defaultEmbeddingProvider } = await import('../modules/ai/providers/bge-embedding.provider.js');
  await defaultEmbeddingProvider.embedQuery('warmup');
  await HybridRetriever.getGitaVerses();
  await pool.query('SELECT 1');
  console.log('Warmup complete. Commencing benchmark.\n');

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    console.log(`\n[Test ${i + 1}/${TEST_CASES.length}] [${tc.category}]`);
    console.log(`Query: "${tc.query}"`);

    const result = await HybridRetriever.retrieve(tc.query, [], [], 3);
    latencies.push(result.retrievalLatencyMs);

    const hasPassages = result.passages.length > 0;
    const topPassage = result.passages[0];
    const topSourceType = topPassage?.sourceType;
    const topRef = topPassage?.sourceReference || 'NONE';
    const topText = topPassage?.translation || '';

    const matchedPassage = tc.expectedReferenceMatch
      ? result.passages.find((p) => p.sourceReference?.toLowerCase().includes(tc.expectedReferenceMatch!.toLowerCase()))
      : topPassage;

    // Verify it is NOT mock metadata
    const isNotMock = topSourceType === 'mahabharata_source' || topSourceType === 'bhagavad_gita';
    const hasSourceText = topText.length > 50;

    let matchPassed = hasPassages && isNotMock && hasSourceText;
    if (tc.expectedReferenceMatch) {
      matchPassed = matchPassed && !!matchedPassage;
    }

    if (matchPassed) {
      passedCount++;
      console.log(`  ✓ PASS (${result.retrievalLatencyMs} ms)`);
    } else {
      console.log(`  ✗ REVIEW (${result.retrievalLatencyMs} ms)`);
    }

    console.log(`  Source Type: ${topSourceType}`);
    console.log(`  Reference:   ${matchedPassage?.sourceReference || topRef}`);
    console.log(`  Score:       ${matchedPassage?.relevanceScore?.toFixed(3) || topPassage?.relevanceScore?.toFixed(3) || '0'}`);
    console.log(`  Snippet:     "${(matchedPassage?.translation || topText).replace(/\s+/g, ' ').slice(0, 140)}..."`);

    results.push({
      id: i + 1,
      query: tc.query,
      latencyMs: result.retrievalLatencyMs,
      sourceType: topSourceType,
      reference: topRef,
      pass: matchPassed
    });
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];

  console.log('\n================================================================');
  console.log('BENCHMARK SUMMARY');
  console.log('================================================================');
  console.log(`Total Scenarios:    ${TEST_CASES.length}`);
  console.log(`Passed Criteria:    ${passedCount}/${TEST_CASES.length}`);
  console.log(`P50 Retrieval Time: ${p50} ms`);
  console.log(`P95 Retrieval Time: ${p95} ms`);
  console.log('================================================================');

  return { passedCount, total: TEST_CASES.length, p50, p95, results };
}

if (process.argv[1]?.includes('phase3-rag-benchmark')) {
  runRAGBenchmark()
    .then(async res => {
      await pool.end();
      if (res.passedCount >= 10) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch(async err => {
      console.error('Benchmark Error:', err);
      await pool.end();
      process.exit(1);
    });
}
