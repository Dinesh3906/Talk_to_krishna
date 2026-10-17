import fs from 'fs';
import pdf from 'pdf-parse';
import { pool } from '../../db/index.js';
import { defaultEmbeddingProvider } from '../ai/providers/bge-embedding.provider.js';
import { splitIntoSemanticChunks } from './child-chunk-ingester.js';

export const DEBROY_SOURCE_TITLE = 'The Mahabharata (Set of 10 Volumes) - Bibek Debroy (Critical Edition Translation)';
export const DEBROY_VOLUME_PARVA = '10 Volumes, All 18 Parvas (Critical Edition Translation)';
export const DEBROY_SOURCE_TYPE = 'debroy_10_vol';

export interface DebroyIngestionOptions {
  pdfPath?: string;
  startPage?: number;
  maxPages?: number;
  batchSize?: number;
  embeddingBatchSize?: number;
  resumeFromCheckpoint?: boolean;
}

export interface DebroyIngestionStats {
  sourceId: string;
  totalPages: number;
  pagesProcessed: number;
  parentChunksInserted: number;
  childChunksInserted: number;
  elapsedMs: number;
}

export interface ParsedPageStructure {
  pageNumber: number;
  volumeNumber: number;
  volumeTitle: string;
  parva: string;
  section: string;
  chapter: string | null;
  speakers: string[];
  rawText: string;
  cleanedText: string;
}

export class Debroy10VolIngester {
  public static cleanText(rawText: string): string {
    return rawText
      .replace(/\r\n/g, '\n')
      .replace(/[\u2029\u2028]/g, '\n\n')
      .replace(/(\w+)-\n(\w+)/g, '$1$2') // Rejoin hyphenated words across linebreaks
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  /**
   * Extract dynamic structure directly from the page text without hardcoded assumptions.
   */
  public static parsePageStructure(
    rawText: string,
    pageNumber: number,
    state: { currentVolume: number; currentParva: string; currentSection: string }
  ): ParsedPageStructure {
    const cleaned = this.cleanText(rawText);

    // 1. Dynamic Volume Detection from page text
    const volMatch = cleaned.match(/(?:The\s+Mahabharata\s+)?Volume\s+([0-9]{1,2})/i);
    if (volMatch) {
      const v = parseInt(volMatch[1], 10);
      if (v >= 1 && v <= 10) {
        state.currentVolume = v;
      }
    }

    // 2. Dynamic Parva Detection from headings in text (anchored to line start)
    const parvaMatch = cleaned.match(/(?:^|\n)\s*([A-Za-z\-]+(?:\s+[A-Za-z\-]+)?)\s+PARVA\b/i);
    if (parvaMatch) {
      const parvaName = parvaMatch[1].trim();
      const detected = `${parvaName.toUpperCase()} PARVA`;
      // Ignore if it's just a table of contents or introductory mention
      if (!cleaned.slice(0, 300).toLowerCase().includes('contents')) {
        state.currentParva = detected;
      }
    }

    // 3. Dynamic Section Detection
    const secMatch = cleaned.match(/\bSECTION\s+([A-Z0-9\-]+(?:\s+[A-Z0-9\-]+)?)\b/i);
    if (secMatch) {
      state.currentSection = `Section ${secMatch[1]}`;
    }

    // 4. Dynamic Chapter Detection
    const chapMatch = cleaned.match(/\bCHAPTER\s+([0-9]+(?:\([0-9]+\))?)\b/i);
    const chapterName = chapMatch ? `Chapter ${chapMatch[1]}` : null;

    // 5. Dynamic Speaker Attribution from actual dialogue tags in the text
    // E.g., "Vaishampayana said,", "Yudhishthira said,", "Sanjaya said,", "Krishna said,"
    const speakerRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+said\s*[,:—]/g;
    const speakersFound = new Set<string>();
    let sm: RegExpExecArray | null;
    while ((sm = speakerRegex.exec(cleaned)) !== null) {
      const spk = sm[1].trim();
      // Filter out non-person words
      if (!['The', 'Then', 'And', 'When', 'Having', 'Thus', 'So', 'There'].includes(spk)) {
        speakersFound.add(spk);
      }
    }

    return {
      pageNumber,
      volumeNumber: state.currentVolume,
      volumeTitle: `Volume ${state.currentVolume}`,
      parva: state.currentParva,
      section: state.currentSection,
      chapter: chapterName,
      speakers: Array.from(speakersFound),
      rawText,
      cleanedText: cleaned,
    };
  }

  /**
   * Ensures the Debroy 10-Volume source is registered idempotently in mahabharata_sources
   */
  public static async getOrCreateSourceId(): Promise<string> {
    const existing = await pool.query(
      `SELECT id FROM mahabharata_sources WHERE source_type = $1 LIMIT 1`,
      [DEBROY_SOURCE_TYPE]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0].id;
    }

    const inserted = await pool.query(
      `INSERT INTO mahabharata_sources (title, volume_parva, source_type)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [DEBROY_SOURCE_TITLE, DEBROY_VOLUME_PARVA, DEBROY_SOURCE_TYPE]
    );

    return inserted.rows[0].id;
  }

  /**
   * Reads or initializes checkpoint
   */
  public static async getCheckpoint(sourceId: string, totalPages: number): Promise<number> {
    const res = await pool.query(
      `SELECT current_page FROM ingestion_checkpoints 
       WHERE source_id = $1 AND source_type = $2 
       ORDER BY id DESC LIMIT 1`,
      [sourceId, DEBROY_SOURCE_TYPE]
    );

    if (res.rows.length > 0) {
      return res.rows[0].current_page;
    }

    await pool.query(
      `INSERT INTO ingestion_checkpoints (source_id, source_type, current_page, total_pages, status)
       VALUES ($1, $2, 0, $3, 'in_progress')`,
      [sourceId, DEBROY_SOURCE_TYPE, totalPages]
    );

    return 0;
  }

  /**
   * Updates progress checkpoint
   */
  public static async updateCheckpoint(
    sourceId: string,
    currentPage: number,
    totalPages: number,
    parentCount: number,
    childCount: number,
    status: string = 'in_progress',
    errorMessage: string | null = null
  ): Promise<void> {
    await pool.query(
      `UPDATE ingestion_checkpoints 
       SET current_page = $1, 
           parent_chunks_count = $2, 
           child_chunks_count = $3, 
           status = $4, 
           error_message = $5, 
           updated_at = NOW()
       WHERE source_id = $6 AND source_type = $7`,
      [currentPage, parentCount, childCount, status, errorMessage, sourceId, DEBROY_SOURCE_TYPE]
    );
  }

  /**
   * Extracts text per page with accurate page tracking
   */
  public static async extractPageTexts(
    pdfBuffer: Buffer,
    startPage: number,
    endPage: number
  ): Promise<Map<number, string>> {
    const pageTexts = new Map<number, string>();
    let currentPage = 0;

    await pdf(pdfBuffer, {
      max: endPage,
      pagerender: async (pageData: any) => {
        currentPage++;
        if (currentPage >= startPage && currentPage <= endPage) {
          const textContent = await pageData.getTextContent();
          let lastY: any = null;
          let text = '';
          for (const item of textContent.items) {
            if (lastY === item.transform[5] || !lastY) {
              text += item.str;
            } else {
              text += '\n' + item.str;
            }
            lastY = item.transform[5];
          }
          pageTexts.set(currentPage, text);
        }
        return '';
      }
    });

    return pageTexts;
  }

  /**
   * Ingests real pages of the 10-volume Debroy corpus dynamically
   */
  public static async ingest(options: DebroyIngestionOptions = {}): Promise<DebroyIngestionStats> {
    const startTime = Date.now();
    const pdfPath = options.pdfPath || 'D:\\The Mahabharata Set of 10 Volumes.pdf';

    if (!fs.existsSync(pdfPath)) {
      throw new Error(`[DebroyIngester] Real PDF source not found at path: ${pdfPath}`);
    }

    const pdfBuffer = fs.readFileSync(pdfPath);
    console.log(`[DebroyIngester] Loaded Real Source PDF (${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

    const sourceId = await this.getOrCreateSourceId();
    console.log(`[DebroyIngester] Registered Source ID: ${sourceId}`);

    const totalDocPages = 3723;
    let startPage = options.startPage || 1;

    if (options.resumeFromCheckpoint !== false) {
      const checkpointPage = await this.getCheckpoint(sourceId, totalDocPages);
      if (checkpointPage > 0 && !options.startPage) {
        startPage = checkpointPage + 1;
        console.log(`[DebroyIngester] Resuming from checkpoint at page ${startPage}`);
      }
    }

    const maxPages = options.maxPages || (totalDocPages - startPage + 1);
    const endPage = Math.min(startPage + maxPages - 1, totalDocPages);
    const batchPageSize = options.batchSize || 50;
    const embBatchSize = options.embeddingBatchSize || 32;

    console.log(`[DebroyIngester] Processing range: Pages ${startPage} to ${endPage} (${endPage - startPage + 1} pages)`);

    const parserState = {
      currentVolume: 1,
      currentParva: 'Adi Parva',
      currentSection: 'Section One',
    };

    // If starting from a later page, determine the dynamic state from existing chunks or recent pages
    if (startPage > 1) {
      const recentChunk = await pool.query(
        `SELECT parva, section, source_reference FROM mahabharata_chunks 
         WHERE source_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [sourceId]
      );
      if (recentChunk.rows.length > 0) {
        parserState.currentParva = recentChunk.rows[0].parva || 'Adi Parva';
        parserState.currentSection = recentChunk.rows[0].section || 'Section One';
      }
    }

    // Get current total counts for this source
    const parentCountRes = await pool.query(
      `SELECT count(*) FROM mahabharata_chunks WHERE source_id = $1`,
      [sourceId]
    );
    let totalParentChunks = parseInt(parentCountRes.rows[0].count, 10);

    const childCountRes = await pool.query(
      `SELECT count(*) FROM mahabharata_child_chunks WHERE source_id = $1`,
      [sourceId]
    );
    let totalChildChunks = parseInt(childCountRes.rows[0].count, 10);

    const flushBatch = async (batchPages: { pageNumber: number; text: string }[]) => {
      if (batchPages.length === 0) return;
      const batchStart = batchPages[0].pageNumber;
      const batchEnd = batchPages[batchPages.length - 1].pageNumber;
      const batchStartTime = Date.now();
      console.log(`\n[DebroyIngester] Processing Batch: Pages ${batchStart} to ${batchEnd} (${batchPages.length} pages)...`);

      const batchStructures: ParsedPageStructure[] = [];
      for (const p of batchPages) {
        if (p.text.trim().length < 80) continue; // Skip blank divider pages
        const parsed = this.parsePageStructure(p.text, p.pageNumber, parserState);
        batchStructures.push(parsed);
      }

      if (batchStructures.length === 0) {
        await this.updateCheckpoint(sourceId, batchEnd, totalDocPages, totalParentChunks, totalChildChunks);
        return;
      }

      // 1. Create fine-grained child candidate structures before DB transaction
      // Parent chunks will be inserted inside the transaction
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

      for (let pIdx = 0; pIdx < batchStructures.length; pIdx++) {
        const bs = batchStructures[pIdx];
        const slices = splitIntoSemanticChunks(bs.cleanedText, 180, 25);
        for (let cIdx = 0; cIdx < slices.length; cIdx++) {
          const sliceText = slices[cIdx];
          const sliceSpeakers = bs.speakers.filter(s => sliceText.includes(s));

          childCandidates.push({
            parentIndex: pIdx,
            sourceId,
            sourceType: DEBROY_SOURCE_TYPE,
            parva: bs.parva ? bs.parva.slice(0, 200) : 'Adi Parva',
            pageNumber: bs.pageNumber,
            chunkIndex: cIdx,
            section: `${bs.section} [Passage ${cIdx + 1}/${slices.length}]`.slice(0, 200),
            sourceReference: `Bibek Debroy Vol ${bs.volumeNumber}, ${bs.parva}, Page ${bs.pageNumber} (Passage ${cIdx + 1})`.slice(0, 200),
            characters: sliceSpeakers.length > 0 ? sliceSpeakers : bs.speakers,
            text: sliceText,
          });
        }
      }

      // 2. Compute real embeddings for all child candidates in batches (outside DB transaction)
      console.log(`[DebroyIngester] Embedding ${childCandidates.length} semantic passages with bge-base-en-v1.5...`);
      const allEmbeddings: number[][] = [];
      for (let cStart = 0; cStart < childCandidates.length; cStart += embBatchSize) {
        const cSlice = childCandidates.slice(cStart, cStart + embBatchSize);
        const textsToEmbed = cSlice.map(c => `${c.parva}, Page ${c.pageNumber}: ${c.text}`);
        const embeddings = await defaultEmbeddingProvider.embedBatch(textsToEmbed);
        for (const emb of embeddings) {
          allEmbeddings.push(emb);
        }
      }

      // 3. Perform atomic database operations in a single transaction
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Prevent duplicate records for this page range if resuming or retrying
        const existingParents = await client.query(
          `SELECT DISTINCT parent_chunk_id FROM mahabharata_child_chunks 
           WHERE source_id = $1 AND page_number >= $2 AND page_number <= $3`,
          [sourceId, batchStart, batchEnd]
        );
        if (existingParents.rows.length > 0) {
          const pIds = existingParents.rows.map(r => r.parent_chunk_id);
          await client.query(`DELETE FROM mahabharata_chunks WHERE id = ANY($1)`, [pIds]);
        }
        await client.query(
          `DELETE FROM mahabharata_child_chunks 
           WHERE source_id = $1 AND page_number >= $2 AND page_number <= $3`,
          [sourceId, batchStart, batchEnd]
        );

        // Insert parent chunks
        const parentIds: string[] = [];
        for (const bs of batchStructures) {
          const sourceRef = `Bibek Debroy Vol ${bs.volumeNumber}, ${bs.parva}, Page ${bs.pageNumber}`.slice(0, 200);
          const insertRes = await client.query(
            `INSERT INTO mahabharata_chunks (
              source_id, source_type, parva, chapter, section, translation, 
              characters, context_summary, source_reference
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id`,
            [
              sourceId,
              DEBROY_SOURCE_TYPE,
              bs.parva ? bs.parva.slice(0, 200) : 'Adi Parva',
              bs.chapter ? bs.chapter.slice(0, 200) : null,
              bs.section ? bs.section.slice(0, 200) : 'Section One',
              bs.cleanedText,
              bs.speakers,
              `Bibek Debroy Critical Edition Translation, Volume ${bs.volumeNumber}, ${bs.parva}, ${bs.section}${bs.chapter ? ` (${bs.chapter})` : ''}`.slice(0, 500),
              sourceRef,
            ]
          );
          parentIds.push(insertRes.rows[0].id);
        }

        // Map parent IDs to child candidates
        for (const cand of childCandidates) {
          cand.parentChunkId = parentIds[cand.parentIndex];
        }

        // Multi-row batch inserts for child chunks (25 records per query)
        const CHUNK_INSERT_BATCH = 25;
        for (let i = 0; i < childCandidates.length; i += CHUNK_INSERT_BATCH) {
          const batchSlice = childCandidates.slice(i, i + CHUNK_INSERT_BATCH);
          const valueClauses: string[] = [];
          const params: any[] = [];
          let paramIdx = 1;

          for (let j = 0; j < batchSlice.length; j++) {
            const item = batchSlice[j];
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

        // Reconcile live counts from DB inside transaction
        const liveParentCount = await client.query(
          `SELECT COUNT(*) FROM mahabharata_chunks WHERE source_id = $1`,
          [sourceId]
        );
        totalParentChunks = parseInt(liveParentCount.rows[0].count, 10);

        const liveChildCount = await client.query(
          `SELECT COUNT(*) FROM mahabharata_child_chunks WHERE source_id = $1`,
          [sourceId]
        );
        totalChildChunks = parseInt(liveChildCount.rows[0].count, 10);

        // Update checkpoint inside transaction
        await client.query(
          `UPDATE ingestion_checkpoints 
           SET current_page = $1, 
               parent_chunks_count = $2, 
               child_chunks_count = $3, 
               status = $4, 
               error_message = NULL, 
               updated_at = NOW()
           WHERE source_id = $5 AND source_type = $6`,
          [
            batchEnd,
            totalParentChunks,
            totalChildChunks,
            batchEnd >= endPage ? 'completed' : 'in_progress',
            sourceId,
            DEBROY_SOURCE_TYPE,
          ]
        );

        await client.query('COMMIT');
      } catch (dbErr) {
        await client.query('ROLLBACK');
        console.error(`[DebroyIngester] Error in batch ${batchStart}-${batchEnd}, transaction rolled back:`, dbErr);
        throw dbErr;
      } finally {
        client.release();
      }

      const batchDuration = ((Date.now() - batchStartTime) / 1000).toFixed(1);
      console.log(`[DebroyIngester] Batch ${batchStart}-${batchEnd} complete in ${batchDuration}s. Cumulative: ${totalParentChunks} parents, ${totalChildChunks} children.`);
    };

    let currentPage = 0;
    let pendingPages: { pageNumber: number; text: string }[] = [];
    let fatalError: Error | null = null;

    await pdf(pdfBuffer, {
      max: endPage,
      pagerender: async (pageData: any) => {
        if (fatalError) return '';
        currentPage++;
        if (currentPage >= startPage && currentPage <= endPage) {
          const textContent = await pageData.getTextContent();
          let lastY: any = null;
          let text = '';
          for (const item of textContent.items) {
            if (lastY === item.transform[5] || !lastY) {
              text += item.str;
            } else {
              text += '\n' + item.str;
            }
            lastY = item.transform[5];
          }

          pendingPages.push({ pageNumber: currentPage, text });
          if (pendingPages.length >= batchPageSize) {
            const toFlush = [...pendingPages];
            pendingPages = [];
            try {
              await flushBatch(toFlush);
            } catch (err: any) {
              fatalError = err;
              throw err;
            }
          }
        }
        return '';
      }
    });

    if (fatalError) {
      throw fatalError;
    }

    if (pendingPages.length > 0) {
      await flushBatch(pendingPages);
    }

    const totalDuration = Date.now() - startTime;
    return {
      sourceId,
      totalPages: totalDocPages,
      pagesProcessed: endPage - startPage + 1,
      parentChunksInserted: totalParentChunks,
      childChunksInserted: totalChildChunks,
      elapsedMs: totalDuration,
    };
  }
}
