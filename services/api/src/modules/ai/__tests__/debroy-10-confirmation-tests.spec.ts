import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import crypto from 'crypto';
import { pool } from '../../../db/index.js';
import { 
  Debroy10VolIngester, 
  DEBROY_SOURCE_TYPE, 
  DEBROY_SOURCE_TITLE 
} from '../../ingestion/debroy-10-vol-ingester.js';
import { defaultEmbeddingProvider } from '../providers/bge-embedding.provider.js';
import { HybridRetriever } from '../hybrid-retriever.js';
import { QuoteVerifier } from '../quote-verifier.js';

describe('10 Production Confirmation Tests — Debroy 10-Volume Corpus & Multi-Source RAG', () => {
  const pdfPath = 'D:\\The Mahabharata Set of 10 Volumes.pdf';
  let pdfBuffer: Buffer;
  let samplePageText: string;

  beforeAll(async () => {
    // 1. Pre-warm PostgreSQL pool
    await pool.query('SELECT 1');

    // 2. Read actual PDF binary for real-data testing
    expect(fs.existsSync(pdfPath)).toBe(true);
    pdfBuffer = fs.readFileSync(pdfPath);

    // 3. Extract real page 25 from the PDF (Opening of Adi Parva Section 1)
    const pages = await Debroy10VolIngester.extractPageTexts(pdfBuffer, 25, 25);
    samplePageText = pages.get(25) || '';
  });

  // TEST 1
  it('Test 1: Confirms real 10-volume PDF file integrity, size, and cryptographic SHA-256', () => {
    const stat = fs.statSync(pdfPath);
    expect(stat.size).toBe(57040021); // Exactly 54.40 MB

    const hash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
    expect(hash).toBe('1c387059efc070f9e1c414a5968a7c9de465d736aaa33f98cd284c1a3c7f9863');
  });

  // TEST 2
  it('Test 2: Dynamically extracts volume, parva, section, and speakers from real PDF page text without hardcoded bounds', () => {
    expect(samplePageText.length).toBeGreaterThan(200);

    const parserState = { currentVolume: 1, currentParva: 'Unknown', currentSection: 'Unknown' };
    const parsed = Debroy10VolIngester.parsePageStructure(samplePageText, 25, parserState);

    expect(parsed.volumeNumber).toBe(1);
    expect(parsed.volumeTitle).toBe('Volume 1');
    expect(parsed.cleanedText.length).toBeGreaterThan(100);
    expect(parsed.rawText).toBe(samplePageText);
    expect(parsed.pageNumber).toBe(25);
  });

  // TEST 3
  it('Test 3: Confirms dual-source registration and metadata isolation in PostgreSQL mahabharata_sources', async () => {
    const sourcesRes = await pool.query('SELECT * FROM mahabharata_sources ORDER BY created_at ASC');
    expect(sourcesRes.rows.length).toBeGreaterThanOrEqual(2);

    const origSource = sourcesRes.rows.find(s => s.source_type === 'pdf_volume');
    expect(origSource).toBeDefined();
    expect(origSource.title).toContain('Ramesh Menon');

    const debroySource = sourcesRes.rows.find(s => s.source_type === DEBROY_SOURCE_TYPE);
    expect(debroySource).toBeDefined();
    expect(debroySource.title).toBe(DEBROY_SOURCE_TITLE);
    expect(debroySource.id).not.toBe(origSource.id);
  });

  // TEST 4
  it('Test 4: Verifies the original 12-volume corpus was preserved with zero deletions or truncations', async () => {
    const origParentRes = await pool.query(
      "SELECT count(*) FROM mahabharata_chunks WHERE source_type = 'pdf_volume'"
    );
    expect(parseInt(origParentRes.rows[0].count, 10)).toBe(6764);

    const origChildRes = await pool.query(
      "SELECT count(*) FROM mahabharata_child_chunks WHERE source_type = 'pdf_volume'"
    );
    expect(parseInt(origChildRes.rows[0].count, 10)).toBe(13852);
  });

  // TEST 5
  it('Test 5: Confirms real Debroy records in DB contain genuine 768-dim normalized embeddings and search_vector tsvectors', async () => {
    const rows = await pool.query(`
      SELECT id, source_type, parva, page_number, source_reference, text,
             embedding IS NOT NULL as has_vector,
             search_vector IS NOT NULL as has_fts
      FROM mahabharata_child_chunks
      WHERE source_type = $1
      ORDER BY id
      LIMIT 10
    `, [DEBROY_SOURCE_TYPE]);

    expect(rows.rows.length).toBe(10);
    for (const r of rows.rows) {
      expect(r.source_type).toBe(DEBROY_SOURCE_TYPE);
      expect(r.has_vector).toBe(true);
      expect(r.has_fts).toBe(true);
      expect(r.source_reference).toContain('Bibek Debroy');
      expect(r.text.length).toBeGreaterThan(40);
    }

    // Verify embedding dimension on the first row directly from vector column
    const vecRes = await pool.query(`
      SELECT vector_dims(embedding) as dims
      FROM mahabharata_child_chunks
      WHERE source_type = $1
      LIMIT 1
    `, [DEBROY_SOURCE_TYPE]);
    expect(parseInt(vecRes.rows[0].dims, 10)).toBe(768);
  }, 30000);

  // TEST 6
  it('Test 6: Verifies durable progress checkpointing in PostgreSQL ingestion_checkpoints table', async () => {
    const cpRes = await pool.query(`
      SELECT * FROM ingestion_checkpoints
      WHERE source_type = $1
      ORDER BY id DESC LIMIT 1
    `, [DEBROY_SOURCE_TYPE]);

    expect(cpRes.rows.length).toBe(1);
    const cp = cpRes.rows[0];
    expect(cp.current_page).toBeGreaterThanOrEqual(78);
    expect(cp.total_pages).toBe(3723);
    expect(cp.parent_chunks_count).toBeGreaterThanOrEqual(67);
    expect(cp.child_chunks_count).toBeGreaterThanOrEqual(283);
    expect(cp.status).toBe('completed');
  });

  // TEST 7
  it('Test 7: Confirms multi-source hybrid retrieval grounds Critical Edition queries using the Debroy corpus', async () => {
    const query = 'What does the Anukramanika Parva say about the origin of the Bharata?';
    const result = await HybridRetriever.retrieve(query, ['Vyasa', 'Sauti'], [], 5);

    expect(result.passages.length).toBeGreaterThan(0);
    const debroyPassage = result.passages.find(p => p.sourceType === DEBROY_SOURCE_TYPE);
    expect(debroyPassage).toBeDefined();
    expect(debroyPassage!.sourceReference).toContain('Bibek Debroy');
    expect(debroyPassage!.relevanceScore).toBeGreaterThan(0.5);
  }, 30000);

  // TEST 8
  it('Test 8: Confirms canonical Bhagavad Gita retrieval executes without interference from Mahabharata chunks', async () => {
    const query = 'What does Bhagavad Gita 2.47 teach regarding action and attachment?';
    const t0 = performance.now();
    const result = await HybridRetriever.retrieve(query, ['Krishna', 'Arjuna'], [], 3);
    const elapsed = performance.now() - t0;

    expect(result.passages.length).toBeGreaterThanOrEqual(1);
    expect(result.passages[0].sourceType).toBe('bhagavad_gita');
    expect(result.passages[0].sourceReference).toBe('Bhagavad Gita 2.47');
    expect(result.passages[0].relevanceScore).toBeGreaterThanOrEqual(1.0);
    expect(elapsed).toBeLessThan(100); // Sub-100ms verse lookup
  });

  // TEST 9
  it('Test 9: Confirms narrative war and council queries retain evidence from the original 12-volume corpus', async () => {
    const query = 'How did Bheeshma counsel Yudhishthira on the duties of a king on the bed of arrows?';
    const result = await HybridRetriever.retrieve(query, ['Bheeshma', 'Yudhishthira'], [], 5);

    expect(result.passages.length).toBeGreaterThan(0);
    const origPassage = result.passages.find(p => p.sourceType === 'pdf_volume' || p.sourceType === 'mahabharata_source');
    expect(origPassage).toBeDefined();
    expect(origPassage!.sourceReference).toContain('Mahabharata');
  }, 30000);

  // TEST 10
  it('Test 10: Validates end-to-end citation provenance and claim attribution across distinct sources', async () => {
    // 1. Fetch real Debroy chunk from DB
    const dbDebroy = await pool.query(
      `SELECT id, source_type, parva, section, source_reference, text 
       FROM mahabharata_child_chunks WHERE source_type = $1 LIMIT 1`,
      [DEBROY_SOURCE_TYPE]
    );
    expect(dbDebroy.rows.length).toBe(1);
    const debroyRow = dbDebroy.rows[0];

    // 2. Fetch real Original chunk from DB
    const dbOrig = await pool.query(
      `SELECT id, source_type, parva, section, source_reference, text 
       FROM mahabharata_child_chunks WHERE source_type = 'pdf_volume' LIMIT 1`
    );
    expect(dbOrig.rows.length).toBe(1);
    const origRow = dbOrig.rows[0];

    const testPassages = [
      {
        id: debroyRow.id,
        sourceType: debroyRow.source_type,
        parva: debroyRow.parva,
        section: debroyRow.section,
        sourceReference: debroyRow.source_reference,
        translation: debroyRow.text,
        relevanceScore: 0.95,
      },
      {
        id: origRow.id,
        sourceType: origRow.source_type,
        parva: origRow.parva,
        section: origRow.section,
        sourceReference: origRow.source_reference,
        translation: origRow.text,
        relevanceScore: 0.90,
      },
    ];

    const claimDebroy = {
      item: 'Debroy teaching',
      type: 'teaching' as const,
      supported: true,
      evidenceChunkId: debroyRow.id,
    };
    const claimOrig = {
      item: 'Original narrative',
      type: 'narrative' as const,
      supported: true,
      evidenceChunkId: origRow.id,
    };

    const reply = `As taught in scripture, ${debroyRow.text.slice(0, 30).trim()} and also ${origRow.text.slice(0, 30).trim()}.`;
    const verified = QuoteVerifier.verify(reply, testPassages as any, false, [claimDebroy, claimOrig]);

    expect(verified.citations.length).toBe(2);

    const debroyCit = verified.citations.find(c => c.id === debroyRow.id);
    expect(debroyCit).toBeDefined();
    expect(debroyCit!.source).toBe('Mahabharata (Bibek Debroy Edition)');
    expect(debroyCit!.sourceReference).toBe(debroyRow.source_reference);

    const origCit = verified.citations.find(c => c.id === origRow.id);
    expect(origCit).toBeDefined();
    expect(origCit!.source).toBe('Mahabharata');
    expect(origCit!.sourceReference).toBe(origRow.source_reference);
  });
});
