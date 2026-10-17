import fs from 'node:fs';
import path from 'node:path';

interface EvaluationCase {
  id: string;
  category: string;
  query: string;
  expectedPassageIds: string[];
  execution: 'offline' | 'requires_database';
  expectedAbstention?: boolean;
}

function wilsonInterval(successes: number, total: number): [number, number] | null {
  if (!total) return null;
  const z = 1.96;
  const proportion = successes / total;
  const denominator = 1 + z * z / total;
  const center = (proportion + z * z / (2 * total)) / denominator;
  const margin = z * Math.sqrt((proportion * (1 - proportion) + z * z / (4 * total)) / total) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

async function main(): Promise<void> {
  // This offline harness must never inherit the repository's runtime database URL.
  process.env.DATABASE_URL = 'postgresql://synthetic:synthetic@127.0.0.1:1/offline_retrieval_only';
  process.env.DISABLE_LOCAL_EMBEDDING = 'true';

  const casesPath = path.resolve(process.cwd(), 'scripts/retrieval-evaluation-cases.json');
  const cases = (JSON.parse(fs.readFileSync(casesPath, 'utf8')) as { cases: EvaluationCase[] }).cases;
  const scoredCases = cases.filter((item) => item.execution === 'offline');
  const { HybridRetriever } = await import('../src/modules/ai/hybrid-retriever.js');

  const originalQuery = HybridRetriever.queryWithTimeout;
  HybridRetriever.queryWithTimeout = (async () => ({ rows: [], rowCount: 0 })) as typeof HybridRetriever.queryWithTimeout;

  try {
    const results = [];
    for (const item of scoredCases) {
      const result = await HybridRetriever.retrieve(item.query, [], [], 10);
      const retrievedIds = result.passages.map((passage) => passage.id);
      results.push({
        id: item.id,
        category: item.category,
        expectedPassageIds: item.expectedPassageIds,
        retrievedPassageIds: retrievedIds,
        confidence: result.confidence,
        hasSufficientEvidence: result.hasSufficientEvidence,
        corpusDoesNotEstablish: result.corpusDoesNotEstablish,
        hitAt1: item.expectedPassageIds.length === 0 ? null : item.expectedPassageIds.includes(retrievedIds[0] || ''),
        recallAt5: item.expectedPassageIds.length === 0 ? null : item.expectedPassageIds.some((id) => retrievedIds.slice(0, 5).includes(id)),
        recallAt10: item.expectedPassageIds.length === 0 ? null : item.expectedPassageIds.some((id) => retrievedIds.slice(0, 10).includes(id)),
        reciprocalRank: item.expectedPassageIds.length === 0 ? null : (() => {
          const index = retrievedIds.findIndex((id) => item.expectedPassageIds.includes(id));
          return index < 0 ? 0 : 1 / (index + 1);
        })(),
        abstentionCorrect: item.expectedAbstention ? result.corpusDoesNotEstablish && result.passages.length === 0 : null,
      });
    }

    const positive = results.filter((result) => result.hitAt1 !== null);
    const abstentionCases = results.filter((result) => result.abstentionCorrect !== null);
    const sum = (selector: (result: typeof results[number]) => number) => positive.reduce((total, item) => total + selector(item), 0);
    const total = positive.length;
    const hitAt1 = total ? sum((item) => Number(item.hitAt1)) / total : 0;
    const metrics = {
      evaluationMode: 'offline deterministic retrieval; canonical disk corpus; PostgreSQL query boundary returns no rows; no model generation',
      totalDatasetCases: cases.length,
      scoredCases: scoredCases.length,
      databaseBlockedCases: cases.length - scoredCases.length,
      positiveCases: total,
      hitAt1: { value: hitAt1, wilson95: wilsonInterval(sum((item) => Number(item.hitAt1)), total) },
      recallAt5: total ? sum((item) => Number(item.recallAt5)) / total : 0,
      recallAt10: total ? sum((item) => Number(item.recallAt10)) / total : 0,
      mrr: total ? sum((item) => Number(item.reciprocalRank)) / total : 0,
      abstentionCases: abstentionCases.length,
      abstentionAccuracy: abstentionCases.length
        ? abstentionCases.filter((item) => item.abstentionCorrect).length / abstentionCases.length
        : null,
      cases: results,
    };
    console.log(JSON.stringify(metrics, null, 2));
    if (results.some((result) => result.hitAt1 === false || result.recallAt10 === false || result.abstentionCorrect === false)) {
      process.exitCode = 1;
    }
  } finally {
    HybridRetriever.queryWithTimeout = originalQuery;
    const { pool } = await import('../src/db/index.js');
    await pool.end();
  }
}

main().catch(() => {
  console.error('Offline retrieval evaluation failed. Database URL and query details were withheld.');
  process.exitCode = 1;
});
