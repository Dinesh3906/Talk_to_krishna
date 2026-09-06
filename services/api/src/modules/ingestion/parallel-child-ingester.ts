import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { fileURLToPath } from 'url';
import path from 'path';
import { pool } from '../../db/index.js';
import { splitIntoSemanticChunks } from './child-chunk-ingester.js';

const __filename = fileURLToPath(import.meta.url);

const MAJOR_CHARACTERS = [
  'Krishna', 'Arjuna', 'Yudhishthira', 'Bhima', 'Draupadi', 'Nakula', 'Sahadeva',
  'Karna', 'Duryodhana', 'Dushasana', 'Bhishma', 'Drona', 'Vidura', 'Dhritarashtra',
  'Gandhari', 'Kunti', 'Sanjaya', 'Shakuni', 'Ashwatthama', 'Kripa', 'Vyasa',
  'Janamejaya', 'Vaisampayana', 'Suta', 'Balarama', 'Abhimanyu', 'Satyaki', 'Subhadra'
];

export interface IngestionChunkItem {
  parentChunkId: string;
  sourceId: string | null;
  sourceType: string;
  parva: string | null;
  pageNumber: number;
  chunkIndex: number;
  section: string;
  sourceReference: string;
  characters: string[];
  themes: string[];
  text: string;
}

export async function runParallelChildIngestion(numWorkers = 6): Promise<{
  parentPages: number;
  totalChildChunks: number;
  durationMs: number;
}> {
  if (!isMainThread) {
    throw new Error('runParallelChildIngestion can only be called from the main thread.');
  }
    const startTime = Date.now();
    console.log('====================================================');
    console.log(`STARTING PARALLEL PARENT-CHILD INGESTION (${numWorkers} WORKER THREADS)`);
    console.log('====================================================');

    // 1. Fetch all 6,764 canonical parent pages
    console.log('[Parallel Ingester] Step 1: Loading canonical parent pages from mahabharata_chunks...');
    const parentRes = await pool.query(`
      SELECT 
        id, 
        source_id, 
        source_type, 
        parva, 
        section, 
        source_reference, 
        characters, 
        themes, 
        translation
      FROM mahabharata_chunks
      WHERE source_type = 'pdf_volume'
      ORDER BY id ASC;
    `);

    const parents = parentRes.rows;
    console.log(`[Parallel Ingester] Loaded ${parents.length} canonical parent pages.`);

    // 2. Generate all semantic child chunks in memory
    console.log('[Parallel Ingester] Step 2: Segmenting text into boundary-aware semantic child chunks...');
    const allChildChunks: IngestionChunkItem[] = [];

    for (let pIdx = 0; pIdx < parents.length; pIdx++) {
      const parent = parents[pIdx];
      const match = (parent.section || parent.source_reference || '').match(/Page\s+(\d+)/i);
      const pageNum = match ? parseInt(match[1], 10) : pIdx + 1;

      const semanticChunks = splitIntoSemanticChunks(parent.translation, 180, 25);

      for (let cIdx = 0; cIdx < semanticChunks.length; cIdx++) {
        const chunkText = semanticChunks[cIdx];
        const charsInChunk = MAJOR_CHARACTERS.filter(c => chunkText.includes(c));

        allChildChunks.push({
          parentChunkId: parent.id,
          sourceId: parent.source_id,
          sourceType: parent.source_type || 'pdf_volume',
          parva: parent.parva,
          pageNumber: pageNum,
          chunkIndex: cIdx,
          section: `Page ${pageNum} [${cIdx + 1}/${semanticChunks.length}]`,
          sourceReference: `Mahabharata Page ${pageNum}`,
          characters: charsInChunk.length > 0 ? charsInChunk : (parent.characters || []),
          themes: parent.themes || ['dharma', 'epic', 'history', 'philosophy'],
          text: chunkText,
        });
      }
    }

    console.log(`[Parallel Ingester] Generated ${allChildChunks.length} semantic child chunks (avg ${(allChildChunks.length / parents.length).toFixed(2)} chunks/page).`);

    // 3. Clear existing child chunks
    console.log('[Parallel Ingester] Step 3: Truncating mahabharata_child_chunks table...');
    await pool.query('TRUNCATE TABLE mahabharata_child_chunks CASCADE;');

    // 4. Partition child chunks among workers
    const chunksPerWorker = Math.ceil(allChildChunks.length / numWorkers);
    const workerPromises: Promise<number>[] = [];
    let completedChunksTotal = 0;

    console.log(`[Parallel Ingester] Step 4: Spawning ${numWorkers} worker threads (~${chunksPerWorker} chunks/worker)...`);

    for (let w = 0; w < numWorkers; w++) {
      const startIdx = w * chunksPerWorker;
      const endIdx = Math.min(startIdx + chunksPerWorker, allChildChunks.length);
      const workerSlice = allChildChunks.slice(startIdx, endIdx);

      const p = new Promise<number>((resolve, reject) => {
        const worker = new Worker(__filename, {
          workerData: {
            workerId: w + 1,
            chunks: workerSlice,
          },
        });

        worker.on('message', (msg) => {
          if (msg.type === 'progress') {
            completedChunksTotal += msg.batchCount;
            const elapsedSec = (Date.now() - startTime) / 1000;
            const rate = (completedChunksTotal / elapsedSec).toFixed(1);
            const pct = ((completedChunksTotal / allChildChunks.length) * 100).toFixed(1);
            console.log(`[Parallel Ingester] Progress: ${completedChunksTotal}/${allChildChunks.length} chunks (${pct}%) at ${rate} chunks/sec...`);
          } else if (msg.type === 'done') {
            resolve(msg.inserted);
          }
        });

        worker.on('error', reject);
        worker.on('exit', (code) => {
          if (code !== 0) {
            reject(new Error(`Worker ${w + 1} stopped with exit code ${code}`));
          }
        });
      });

      workerPromises.push(p);
    }

    await Promise.all(workerPromises);

    const durationMs = Date.now() - startTime;
    console.log('====================================================');
    console.log(`PARALLEL INGESTION COMPLETE in ${(durationMs / 1000).toFixed(1)}s!`);
    console.log(`- Canonical Parent Pages: ${parents.length}`);
    console.log(`- Total Child Chunks Inserted: ${allChildChunks.length}`);
    console.log(`- Average Throughput: ${(allChildChunks.length / (durationMs / 1000)).toFixed(1)} chunks/sec`);
    console.log('====================================================');

    return {
      parentPages: parents.length,
      totalChildChunks: allChildChunks.length,
      durationMs,
    };
  }

if (!isMainThread) {
  // Worker Thread Execution
  async function runWorkerTask() {
    const { pipeline } = await import('@xenova/transformers');
    const { pool: workerPool } = await import('../../db/index.js');

    const { workerId, chunks } = workerData as {
      workerId: number;
      chunks: IngestionChunkItem[];
    };

    // Load local BGE model (quantized for high throughput)
    const extractor = await pipeline('feature-extraction', 'Xenova/bge-base-en-v1.5', { quantized: true });

    const BATCH_SIZE = 32;
    let insertedCount = 0;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const slice = chunks.slice(i, i + BATCH_SIZE);

      // Generate full text embeddings
      const textsToEmbed = slice.map(c => `${c.parva || 'Mahabharata'}, Page ${c.pageNumber}: ${c.text}`);
      const output = await extractor(textsToEmbed, { pooling: 'mean', normalize: true });
      const embDim = output.dims[1]; // 768

      const embeddings: number[][] = [];
      for (let j = 0; j < slice.length; j++) {
        const start = j * embDim;
        embeddings.push(Array.from((output.data as any).subarray(start, start + embDim)));
      }

      // Multi-row INSERT
      const client = await workerPool.connect();
      try {
        await client.query('BEGIN');
        for (let j = 0; j < slice.length; j++) {
          const item = slice[j];
          const embString = `[${embeddings[j].join(',')}]`;

          await client.query(`
            INSERT INTO mahabharata_child_chunks (
              parent_chunk_id, source_id, source_type, parva, page_number,
              chunk_index, section, source_reference, characters, themes,
              text, embedding
            ) VALUES (
              $1, $2, $3, $4, $5,
              $6, $7, $8, $9, $10,
              $11, $12::vector
            );
          `, [
            item.parentChunkId,
            item.sourceId,
            item.sourceType,
            item.parva,
            item.pageNumber,
            item.chunkIndex,
            item.section,
            item.sourceReference,
            item.characters,
            item.themes,
            item.text,
            embString,
          ]);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      insertedCount += slice.length;
      parentPort?.postMessage({ type: 'progress', workerId, batchCount: slice.length });
    }

    parentPort?.postMessage({ type: 'done', workerId, inserted: insertedCount });
  }

  runWorkerTask().catch(err => {
    console.error('Worker error:', err);
    process.exit(1);
  });
}
