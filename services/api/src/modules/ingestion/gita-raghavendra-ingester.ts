import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../../db/index.js';
import { defaultEmbeddingProvider } from '../ai/providers/bge-embedding.provider.js';
import { splitIntoSemanticChunks } from './child-chunk-ingester.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const RAGHAVENDRA_SOURCE_TITLE = 'The Bhagavad Gita - Sri Raghavendra Teertha Gita Vivruti (TTD / Dr. Giridhar Boray)';
export const RAGHAVENDRA_VOLUME_PARVA = 'Bhishma Parva (Gita Vivruti & Madhwacharya Bhashya, 18 Chapters)';
export const RAGHAVENDRA_SOURCE_TYPE = 'gita_raghavendra_vivruti';

export interface RaghavendraPageItem {
  pageNumber: number;
  chapter: number;
  chapterTitle: string;
  verseCount: number;
  verses: string[];
  charLength: number;
  text: string;
}

export interface RaghavendraIngestionStats {
  sourceId: string;
  totalPages: number;
  parentChunksInserted: number;
  childChunksInserted: number;
  elapsedMs: number;
}

export class GitaRaghavendraIngester {
  public static async getOrCreateSourceId(): Promise<string> {
    const existing = await pool.query(
      `SELECT id FROM mahabharata_sources WHERE source_type = $1 LIMIT 1`,
      [RAGHAVENDRA_SOURCE_TYPE]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0].id;
    }

    const insertRes = await pool.query(
      `INSERT INTO mahabharata_sources (title, volume_parva, source_type)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [RAGHAVENDRA_SOURCE_TITLE, RAGHAVENDRA_VOLUME_PARVA, RAGHAVENDRA_SOURCE_TYPE]
    );

    return insertRes.rows[0].id;
  }

  public static async ingestRaghavendraGita(options: {
    jsonPath?: string;
    batchSize?: number;
    embeddingBatchSize?: number;
  } = {}): Promise<RaghavendraIngestionStats> {
    const startTime = Date.now();
    const batchSize = options.batchSize || 25;
    const embBatchSize = options.embeddingBatchSize || 32;

    const resolvedJsonPath = options.jsonPath || path.resolve(__dirname, '../../../scratch/gita_pdf_parsed.json');
    if (!fs.existsSync(resolvedJsonPath)) {
      throw new Error(`[GitaRaghavendraIngester] Parsed JSON not found at ${resolvedJsonPath}`);
    }

    const pages: RaghavendraPageItem[] = JSON.parse(fs.readFileSync(resolvedJsonPath, 'utf8'));
    console.log(`[GitaRaghavendraIngester] Loaded ${pages.length} pages from ${resolvedJsonPath}`);

    const sourceId = await this.getOrCreateSourceId();
    console.log(`[GitaRaghavendraIngester] Using Source ID: ${sourceId}`);

    let totalParentChunks = 0;
    let totalChildChunks = 0;

    for (let batchStart = 0; batchStart < pages.length; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, pages.length);
      const batchSlice = pages.slice(batchStart, batchEnd);

      console.log(`\n[GitaRaghavendraIngester] Processing pages ${batchStart + 1} - ${batchEnd} of ${pages.length}...`);

      interface ChildCandidate {
        parentIndex: number;
        parentChunkId?: string;
        sourceId: string;
        sourceType: string;
        parva: string;
        pageNumber: number;
        chunkIndex: number;
        section: string;
        sourceReference: string;
        characters: string[];
        text: string;
      }

      const childCandidates: ChildCandidate[] = [];

      for (let pIdx = 0; pIdx < batchSlice.length; pIdx++) {
        const item = batchSlice[pIdx];
        const pageText = item.text.trim();
        if (!pageText || pageText.length < 30) continue;

        const semanticPassages = splitIntoSemanticChunks(pageText, 180, 25);
        const characters = ['Krishna', 'Arjuna'];
        if (item.chapter === 1) characters.push('Sanjaya', 'Dhritarashtra', 'Duryodhana', 'Bhishma', 'Drona');

        const verseRef = item.verses.length > 0 ? `Verses ${item.verses.join(', ')}` : (item.chapter > 0 ? `Chapter ${item.chapter}` : 'Intro');
        const sectionName = item.chapter > 0 ? `Chapter ${item.chapter}: ${item.chapterTitle}` : 'Introduction & Background';
        const sourceRef = `Sri Raghavendra Gita Vivruti, Ch ${item.chapter}, ${verseRef}, Page ${item.pageNumber}`;

        for (let cIdx = 0; cIdx < semanticPassages.length; cIdx++) {
          childCandidates.push({
            parentIndex: pIdx,
            sourceId,
            sourceType: RAGHAVENDRA_SOURCE_TYPE,
            parva: 'Bhishma Parva (Bhagavad Gita)',
            pageNumber: item.pageNumber,
            chunkIndex: cIdx,
            section: sectionName.slice(0, 200),
            sourceReference: sourceRef.slice(0, 200),
            characters,
            text: semanticPassages[cIdx],
          });
        }
      }

      // Compute embeddings in batches
      console.log(`[GitaRaghavendraIngester] Generating embeddings for ${childCandidates.length} semantic chunks...`);
      const allEmbeddings: number[][] = [];
      for (let cStart = 0; cStart < childCandidates.length; cStart += embBatchSize) {
        const cSlice = childCandidates.slice(cStart, cStart + embBatchSize);
        const textsToEmbed = cSlice.map(c => `Bhagavad Gita ${c.section}, ${c.sourceReference}: ${c.text}`);
        const embeddings = await defaultEmbeddingProvider.embedBatch(textsToEmbed);
        for (const emb of embeddings) {
          allEmbeddings.push(emb);
        }
      }

      // Insert atomically into DB
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Delete any existing chunks for this page range (idempotency)
        const pNumbers = batchSlice.map(b => b.pageNumber);
        const existingParents = await client.query(
          `SELECT DISTINCT parent_chunk_id FROM mahabharata_child_chunks 
           WHERE source_id = $1 AND page_number = ANY($2)`,
          [sourceId, pNumbers]
        );
        if (existingParents.rows.length > 0) {
          const pIds = existingParents.rows.map(r => r.parent_chunk_id);
          await client.query(`DELETE FROM mahabharata_chunks WHERE id = ANY($1)`, [pIds]);
        }
        await client.query(
          `DELETE FROM mahabharata_child_chunks 
           WHERE source_id = $1 AND page_number = ANY($2)`,
          [sourceId, pNumbers]
        );

        // Insert parent chunks
        const parentIds: string[] = [];
        for (const item of batchSlice) {
          const verseRef = item.verses.length > 0 ? `Verses ${item.verses.join(', ')}` : (item.chapter > 0 ? `Chapter ${item.chapter}` : 'Intro');
          const sectionName = item.chapter > 0 ? `Chapter ${item.chapter}: ${item.chapterTitle}` : 'Introduction & Background';
          const sourceRef = `Sri Raghavendra Gita Vivruti, Ch ${item.chapter}, ${verseRef}, Page ${item.pageNumber}`.slice(0, 200);

          const insertRes = await client.query(
            `INSERT INTO mahabharata_chunks (
              source_id, source_type, parva, chapter, section, verse_range,
              translation, characters, context_summary, source_reference
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id`,
            [
              sourceId,
              RAGHAVENDRA_SOURCE_TYPE,
              'Bhishma Parva (Bhagavad Gita)',
              (item.chapter > 0 ? `Chapter ${item.chapter}` : 'Intro').slice(0, 100),
              sectionName.slice(0, 200),
              verseRef.slice(0, 200),
              item.text,
              ['Krishna', 'Arjuna'],
              `Sri Raghavendra Teertha Gita Vivruti & Madhwacharya Bhashya, Chapter ${item.chapter}: ${item.chapterTitle}`.slice(0, 500),
              sourceRef.slice(0, 200),
            ]
          );
          parentIds.push(insertRes.rows[0].id);
        }

        // Map parent IDs to child candidates
        for (const cand of childCandidates) {
          cand.parentChunkId = parentIds[cand.parentIndex];
        }

        // Insert child chunks
        const CHUNK_INSERT_BATCH = 25;
        for (let i = 0; i < childCandidates.length; i += CHUNK_INSERT_BATCH) {
          const batchChildSlice = childCandidates.slice(i, i + CHUNK_INSERT_BATCH);
          const valueClauses: string[] = [];
          const params: any[] = [];
          let paramIdx = 1;

          for (let j = 0; j < batchChildSlice.length; j++) {
            const item = batchChildSlice[j];
            const emb = allEmbeddings[i + j];

            valueClauses.push(
              `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, $${paramIdx + 9}, $${paramIdx + 10}::vector)`
            );
            params.push(
              item.parentChunkId,
              item.sourceId,
              item.sourceType,
              item.parva,
              item.pageNumber,
              item.chunkIndex,
              item.section,
              item.sourceReference,
              item.characters,
              item.text,
              JSON.stringify(emb)
            );
            paramIdx += 11;
          }

          await client.query(
            `INSERT INTO mahabharata_child_chunks (
              parent_chunk_id, source_id, source_type, parva, page_number,
              chunk_index, section, source_reference, characters, text, embedding
            ) VALUES ${valueClauses.join(', ')}`,
            params
          );
        }

        await client.query('COMMIT');
        totalParentChunks += batchSlice.length;
        totalChildChunks += childCandidates.length;
        console.log(`[GitaRaghavendraIngester] Inserted ${batchSlice.length} parent chunks and ${childCandidates.length} child chunks.`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    const elapsedMs = Date.now() - startTime;
    console.log(`[GitaRaghavendraIngester] Ingestion Complete! ${totalParentChunks} parents, ${totalChildChunks} children in ${(elapsedMs / 1000).toFixed(1)}s.`);

    return {
      sourceId,
      totalPages: pages.length,
      parentChunksInserted: totalParentChunks,
      childChunksInserted: totalChildChunks,
      elapsedMs,
    };
  }
}
