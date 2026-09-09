import { pool } from '../../db/index.js';
import { LocalEmbeddingProvider } from '../ai/providers/local-emb.provider.js';

const MAJOR_CHARACTERS = [
  'Krishna', 'Arjuna', 'Yudhishthira', 'Bhima', 'Draupadi', 'Nakula', 'Sahadeva',
  'Karna', 'Duryodhana', 'Dushasana', 'Bhishma', 'Drona', 'Vidura', 'Dhritarashtra',
  'Gandhari', 'Kunti', 'Sanjaya', 'Shakuni', 'Ashwatthama', 'Kripa', 'Vyasa',
  'Janamejaya', 'Vaisampayana', 'Suta', 'Balarama', 'Abhimanyu', 'Satyaki', 'Subhadra'
];

export interface ChildChunkProgress {
  parentPages: number;
  totalChildChunks: number;
  durationMs: number;
}

export function splitIntoSemanticChunks(text: string, targetWords = 180, overlapWords = 25): string[] {
  if (!text || text.trim().length === 0) return [];

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= targetWords + overlapWords) {
    return [text.trim()];
  }

  // Segment by natural sentence boundaries
  const sentenceRegex = /[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g;
  const rawSentences = text.match(sentenceRegex) || [text];
  const sentences = rawSentences.map(s => s.trim()).filter(Boolean);

  // If text has no sentence boundaries (e.g. hymns/chants or lists), fallback to word-based window
  if (sentences.length <= 1) {
    const wordChunks: string[] = [];
    const step = Math.max(1, targetWords - overlapWords);
    for (let i = 0; i < words.length; i += step) {
      const chunk = words.slice(i, i + targetWords).join(' ');
      if (chunk) wordChunks.push(chunk);
      if (i + targetWords >= words.length) break;
    }
    return wordChunks.length > 0 ? wordChunks : [text.trim()];
  }

  const chunks: string[] = [];
  let currentWords: string[] = [];
  let currentChunkSentences: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const sWords = s.split(/\s+/).filter(Boolean);

    currentChunkSentences.push(s);
    currentWords.push(...sWords);

    if (currentWords.length >= targetWords) {
      chunks.push(currentChunkSentences.join(' '));

      // Overlap: retain last sentence(s) that total ~overlapWords
      // Crucial: overlap must NOT retain all sentences in the chunk (j > 0)
      const overlapWordList: string[] = [];
      const overlapSentenceList: string[] = [];
      for (let j = currentChunkSentences.length - 1; j > 0; j--) {
        const sw = currentChunkSentences[j].split(/\s+/).filter(Boolean);
        if (overlapWordList.length + sw.length <= overlapWords || overlapSentenceList.length === 0) {
          overlapSentenceList.unshift(currentChunkSentences[j]);
          overlapWordList.unshift(...sw);
        } else {
          break;
        }
      }

      currentChunkSentences = [...overlapSentenceList];
      currentWords = [...overlapWordList];
    }
  }

  if (currentWords.length > overlapWords && currentChunkSentences.length > 0) {
    const remainingText = currentChunkSentences.join(' ');
    if (chunks.length > 0 && currentWords.length < 40) {
      chunks[chunks.length - 1] += ' ' + remainingText;
    } else {
      chunks.push(remainingText);
    }
  }

  return chunks.length > 0 ? chunks : [text.trim()];
}

export class ChildChunkIngester {
  public static async ingestAllChildChunks(): Promise<ChildChunkProgress> {
    const startTime = Date.now();
    console.log('[ChildChunkIngester] ====================================================');
    console.log('[ChildChunkIngester] STARTING PARENT-CHILD SEMANTIC RE-INGESTION');
    console.log('[ChildChunkIngester] ====================================================');

    // 1. Fetch all 6,764 canonical parent chunks
    console.log('[ChildChunkIngester] Step 1: Loading all canonical parent pages from mahabharata_chunks...');
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
    console.log(`[ChildChunkIngester] Loaded ${parents.length} parent chunks from PostgreSQL.`);

    // 2. Clear previous child chunks
    console.log('[ChildChunkIngester] Step 2: Preparing mahabharata_child_chunks table...');
    await pool.query('TRUNCATE TABLE mahabharata_child_chunks CASCADE;');

    // 3. Generate child chunks and batch-embed
    console.log('[ChildChunkIngester] Step 3: Generating semantic child chunks & 768-dim embeddings...');
    const BATCH_SIZE = 32;
    let currentBatch: {
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
    }[] = [];

    let totalChildCount = 0;

    for (let pIdx = 0; pIdx < parents.length; pIdx++) {
      const parent = parents[pIdx];
      const match = (parent.section || parent.source_reference || '').match(/Page\s+(\d+)/i);
      const pageNum = match ? parseInt(match[1], 10) : pIdx + 1;

      const semanticChunks = splitIntoSemanticChunks(parent.translation, 180, 25);

      for (let cIdx = 0; cIdx < semanticChunks.length; cIdx++) {
        const chunkText = semanticChunks[cIdx];
        const charsInChunk = MAJOR_CHARACTERS.filter(c => chunkText.includes(c));

        currentBatch.push({
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

        if (currentBatch.length >= BATCH_SIZE) {
          await this.flushBatch(currentBatch);
          totalChildCount += currentBatch.length;
          currentBatch = [];

          if (totalChildCount % 512 === 0) {
            const elapsedSec = (Date.now() - startTime) / 1000;
            const rate = (totalChildCount / elapsedSec).toFixed(1);
            console.log(`[ChildChunkIngester] Embedded ${totalChildCount} child chunks (${rate} chunks/sec | Parent ${pIdx + 1}/${parents.length})...`);
          }
        }
      }
    }

    if (currentBatch.length > 0) {
      await this.flushBatch(currentBatch);
      totalChildCount += currentBatch.length;
      currentBatch = [];
    }

    const durationMs = Date.now() - startTime;
    console.log('[ChildChunkIngester] ====================================================');
    console.log(`PARENT-CHILD INGESTION COMPLETE in ${(durationMs / 1000).toFixed(1)}s!`);
    console.log(`- Canonical Parent Pages: ${parents.length}`);
    console.log(`- Total Child Chunks: ${totalChildCount}`);
    console.log(`- Average Chunks Per Page: ${(totalChildCount / parents.length).toFixed(2)}`);
    console.log('====================================================');

    return {
      parentPages: parents.length,
      totalChildChunks: totalChildCount,
      durationMs,
    };
  }

  private static async flushBatch(
    batch: {
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
    }[]
  ): Promise<void> {
    if (batch.length === 0) return;

    // Build rich, full-text embedding prompt for each child chunk (no 250-char truncation!)
    const textsToEmbed = batch.map(b => `${b.parva || 'Mahabharata'}, Page ${b.pageNumber}: ${b.text}`);
    const embeddings = await LocalEmbeddingProvider.generateEmbeddings(textsToEmbed);

    const client = await pool.connect();
    client.on('error', (err: any) => {
      console.warn('[ChildChunkIngester Client Socket Error]:', err.message);
    });
    try {
      await client.query('BEGIN');

      for (let i = 0; i < batch.length; i++) {
        const item = batch[i];
        const emb = embeddings[i];
        const embString = `[${emb.join(',')}]`;

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
  }
}
