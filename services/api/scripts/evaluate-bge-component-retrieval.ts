import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { defaultEmbeddingProvider } from '../src/modules/ai/providers/bge-embedding.provider.js';

interface CanonicalVerse {
  id: string;
  translation: string;
}

interface EvaluationCase {
  id: string;
  query: string;
  expectedPassageIds?: string[];
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../../..');
const corpus = JSON.parse(
  await readFile(path.join(repositoryRoot, 'data/mahabharata/corpus/gita_700_canonical.json'), 'utf8'),
) as CanonicalVerse[];
const evaluationData = JSON.parse(
  await readFile(path.join(scriptDirectory, 'retrieval-evaluation-cases.json'), 'utf8'),
) as { cases: EvaluationCase[] };

const passages = corpus.filter((verse) => verse.id && verse.translation);
const passageIndex = new Map(passages.map((verse, index) => [verse.id, index]));
const cases = evaluationData.cases.filter((item) =>
  item.expectedPassageIds?.length && item.expectedPassageIds.every((id) => passageIndex.has(id)),
);

const modelStarted = performance.now();
const documentEmbeddings: number[][] = [];
let documentEmbeddingMs = 0;
for (let start = 0; start < passages.length; start += 16) {
  const batchStarted = performance.now();
  const batch = await defaultEmbeddingProvider.embedBatch(
    passages.slice(start, start + 16).map((verse) => verse.translation),
  );
  documentEmbeddingMs += performance.now() - batchStarted;
  if (batch.some((embedding) => embedding.length !== 768 || embedding.some((value) => !Number.isFinite(value)))) {
    throw new Error('BGE returned an invalid embedding batch.');
  }
  documentEmbeddings.push(...batch);
}

const queryStarted = performance.now();
const queryEmbeddings = await defaultEmbeddingProvider.embedBatch(cases.map((item) => item.query));
const queryEmbeddingMs = performance.now() - queryStarted;
if (queryEmbeddings.some((embedding) => embedding.length !== 768 || embedding.some((value) => !Number.isFinite(value)))) {
  throw new Error('BGE returned an invalid query embedding.');
}

const results = cases.map((item, queryIndex) => {
  const query = queryEmbeddings[queryIndex];
  const ranked = passages
    .map((passage, passageIndexValue) => ({
      id: passage.id,
      score: query.reduce(
        (sum, value, dimension) => sum + value * documentEmbeddings[passageIndexValue][dimension],
        0,
      ),
    }))
    .sort((left, right) => right.score - left.score);
  const rank = ranked.findIndex((passage) => item.expectedPassageIds?.includes(passage.id)) + 1;
  return {
    id: item.id,
    expectedPassageIds: item.expectedPassageIds,
    rank: rank || null,
    top5: ranked.slice(0, 5).map((item) => item.id),
  };
});

const positiveCount = results.length;
const hitAt1 = results.filter((item) => item.rank === 1).length;
const recallAt5 = results.filter((item) => item.rank !== null && item.rank <= 5).length;
const reciprocalRank = results.reduce((sum, item) => sum + (item.rank ? 1 / item.rank : 0), 0) / positiveCount;

process.stdout.write(
  `${JSON.stringify(
    {
      evaluationMode: 'local BGE embedding component only; canonical Gita translations; no PostgreSQL, full-text retrieval, fusion, reranking, confidence, or model generation',
      provider: defaultEmbeddingProvider.providerName,
      dimensions: defaultEmbeddingProvider.dimensions,
      runtime: process.version,
      passageCount: passages.length,
      labeledQueries: positiveCount,
      modelLoadAndDocumentEmbeddingMs: Math.round(performance.now() - modelStarted),
      documentEmbeddingMs: Math.round(documentEmbeddingMs),
      queryEmbeddingMs: Math.round(queryEmbeddingMs),
      hitAt1: `${hitAt1}/${positiveCount}`,
      recallAt5: `${recallAt5}/${positiveCount}`,
      mrr: Number(reciprocalRank.toFixed(4)),
      cases: results,
    },
    null,
    2,
  )}\n`,
);
