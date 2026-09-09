import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';
import { pool } from '../../db/index.js';
import { LocalEmbeddingProvider } from '../ai/providers/local-emb.provider.js';

export interface IngestionProgress {
  totalPages: number;
  nonEmptyPages: number;
  ingestedChunks: number;
  failedChunks: number;
  durationMs: number;
}

const PARVA_NAMES = [
  'Adi Parva', 'Sabha Parva', 'Vana Parva', 'Virata Parva', 'Udyoga Parva',
  'Bhishma Parva', 'Drona Parva', 'Karna Parva', 'Shalya Parva', 'Sauptika Parva',
  'Stri Parva', 'Shanti Parva', 'Anushasana Parva', 'Ashvamedhika Parva',
  'Ashramavasika Parva', 'Mausala Parva', 'Mahaprasthanika Parva', 'Svargarohanika Parva'
];

const MAJOR_CHARACTERS = [
  'Krishna', 'Arjuna', 'Yudhishthira', 'Bhima', 'Draupadi', 'Nakula', 'Sahadeva',
  'Karna', 'Duryodhana', 'Dushasana', 'Bhishma', 'Drona', 'Vidura', 'Dhritarashtra',
  'Gandhari', 'Kunti', 'Sanjaya', 'Shakuni', 'Ashwatthama', 'Kripa', 'Vyasa',
  'Janamejaya', 'Vaisampayana', 'Suta', 'Balarama', 'Abhimanyu', 'Satyaki', 'Subhadra'
];

export function normalizeCorpusText(rawText: string): string {
  if (!rawText) return '';
  return rawText
    .normalize('NFKC')
    .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/(\w+)-\s*\n\s*(\w+)/g, '$1$2') // Rejoin hyphenated linebreaks
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function tokenizeCorpusText(text: string): string[] {
  const norm = normalizeCorpusText(text);
  if (!norm) return [];
  const matches = norm.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) || [];
  return matches.map(t => t.toLowerCase());
}

export class FullCorpusIngester {
  public static async ingestCorpus(pdfPath: string): Promise<IngestionProgress> {
    const startTime = Date.now();
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`Mahabharata PDF not found at path: ${pdfPath}`);
    }

    console.log(`[Full Corpus Ingester] Reading 6,808-page PDF from: ${pdfPath}`);
    const dataBuffer = fs.readFileSync(pdfPath);

    // 1. Extract text page-by-page
    console.log('[Full Corpus Ingester] Phase 1: Extracting all 6,808 pages...');
    const pageMap: Map<number, string> = new Map();

    await pdf(dataBuffer, {
      pagerender: (pageData: any) => {
        const pageNum = pageData.pageIndex + 1;
        return pageData.getTextContent().then((textContent: any) => {
          const raw = textContent.items.map((it: any) => it.str).join(' ');
          const normalized = normalizeCorpusText(raw);
          pageMap.set(pageNum, normalized);
          return normalized;
        });
      }
    });

    console.log(`[Full Corpus Ingester] Extraction complete. Total pages parsed: ${pageMap.size}`);

    // 2. Ensure canonical source record exists
    let sourceRes = await pool.query(`
      SELECT id FROM mahabharata_sources WHERE source_type = 'pdf_volume' LIMIT 1;
    `);
    let sourceId: string;
    if (sourceRes.rows.length === 0) {
      const ins = await pool.query(`
        INSERT INTO mahabharata_sources (title, volume_parva, source_type)
        VALUES ('The Complete Mahabharata Volume 1-12 (Translation by Ramesh Menon)', 'All 18 Parvas (Complete 12-Volume Edition)', 'pdf_volume')
        RETURNING id;
      `);
      sourceId = ins.rows[0].id;
    } else {
      sourceId = sourceRes.rows[0].id;
    }

    // 2b. Check for already ingested pages to enable resuming
    const existingRes = await pool.query(`
      SELECT section FROM mahabharata_chunks WHERE source_type = 'pdf_volume';
    `);
    const ingestedPages = new Set<number>();
    for (const row of existingRes.rows) {
      const match = row.section?.match(/Page\s+(\d+)/i);
      if (match) {
        ingestedPages.add(parseInt(match[1], 10));
      }
    }
    console.log(`[Full Corpus Ingester] Resume check: ${ingestedPages.size} pages already ingested in PostgreSQL.`);

    // 3. Batch processing & embedding generation
    console.log('[Full Corpus Ingester] Phase 2: Ingesting chunks & generating 768-dim embeddings...');
    const BATCH_SIZE = 32;
    let currentBatch: { pageNum: number; text: string; parva: string; characters: string[] }[] = [];
    let currentParva = 'Adi Parva';
    let nonEmptyCount = ingestedPages.size;
    let ingestedCount = ingestedPages.size;

    for (let pageNum = 1; pageNum <= 6808; pageNum++) {
      const text = pageMap.get(pageNum) || '';
      if (!text || text.length === 0) {
        continue;
      }

      // Detect Parva transition
      for (const pName of PARVA_NAMES) {
        const regex = new RegExp(`\\b${pName.replace(' ', '\\s+')}\\b`, 'i');
        if (regex.test(text.slice(0, 300))) {
          currentParva = pName;
          break;
        }
      }

      // Skip pages already present in database
      if (ingestedPages.has(pageNum)) {
        continue;
      }

      nonEmptyCount++;

      // Detect characters
      const charsOnPage = MAJOR_CHARACTERS.filter(c => text.includes(c));

      currentBatch.push({
        pageNum,
        text,
        parva: currentParva,
        characters: charsOnPage,
      });

      if (currentBatch.length >= BATCH_SIZE || pageNum === 6808) {
        await this.flushBatch(sourceId, currentBatch);
        ingestedCount += currentBatch.length;
        console.log(`[Full Corpus Ingester] Ingested ${ingestedCount}/6808 pages (Current: Page ${pageNum}, Parva: ${currentParva})...`);
        currentBatch = [];
      }
    }

    const durationMs = Date.now() - startTime;
    console.log(`[Full Corpus Ingester] Ingestion Complete in ${(durationMs / 1000).toFixed(1)}s!`);
    console.log(`- Total Pages: 6808`);
    console.log(`- Non-empty Pages: ${nonEmptyCount}`);
    console.log(`- Ingested Chunks: ${ingestedCount}`);

    return {
      totalPages: 6808,
      nonEmptyPages: nonEmptyCount,
      ingestedChunks: ingestedCount,
      failedChunks: 0,
      durationMs,
    };
  }

  private static async flushBatch(
    sourceId: string,
    batch: { pageNum: number; text: string; parva: string; characters: string[] }[]
  ): Promise<void> {
    if (batch.length === 0) return;

    // Generate embeddings for the batch (concise page topic + opening text)
    const textsToEmbed = batch.map(b => `${b.parva}, Page ${b.pageNum}: ${b.text.slice(0, 250)}`);
    const embeddings = await LocalEmbeddingProvider.generateEmbeddings(textsToEmbed);

    // Resilient retry loop for cloud PostgreSQL poolers
    let attempts = 0;
    const maxAttempts = 4;

    while (attempts < maxAttempts) {
      attempts++;
      let client;
      try {
        client = await pool.connect();
        client.on('error', (clientErr: any) => {
          console.warn('[Full Corpus Ingester Client Socket Error]:', clientErr.message);
        });
        await client.query('BEGIN');

        for (let i = 0; i < batch.length; i++) {
          const item = batch[i];
          const emb = embeddings[i];
          const embString = `[${emb.join(',')}]`;
          const snippet = item.text.slice(0, 200) + '...';

          await client.query(`
            INSERT INTO mahabharata_chunks (
              source_id, source_type, parva, chapter, section, verse_range,
              characters, themes, original_text, translation, context_summary,
              relevance_for_guidance, source_reference, embedding
            ) VALUES (
              $1, 'pdf_volume', $2, NULL, $3, $4,
              $5, $6, NULL, $7, $8,
              NULL, $9, $10::vector
            );
          `, [
            sourceId,
            item.parva,
            `Page ${item.pageNum}`,
            `Page ${item.pageNum}`,
            item.characters,
            ['dharma', 'epic', 'history', 'philosophy'],
            item.text,
            snippet,
            `Mahabharata Page ${item.pageNum}`,
            embString,
          ]);
        }

        await client.query('COMMIT');
        client.release();
        return; // Success
      } catch (err: any) {
        if (client) {
          try { await client.query('ROLLBACK'); } catch {}
          client.release();
        }
        console.warn(`[Full Corpus Ingester] Batch flush attempt ${attempts} failed: ${err.message}. Retrying in 2s...`);
        if (attempts >= maxAttempts) {
          throw err;
        }
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
}
