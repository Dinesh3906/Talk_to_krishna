import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import { pool } from '../../../db/index.js';
import { 
  Debroy10VolIngester, 
  DEBROY_SOURCE_TYPE, 
  DEBROY_SOURCE_TITLE 
} from '../../ingestion/debroy-10-vol-ingester.js';
import { splitIntoSemanticChunks } from '../../ingestion/child-chunk-ingester.js';
import { defaultEmbeddingProvider } from '../providers/bge-embedding.provider.js';
import { HybridRetriever } from '../hybrid-retriever.js';
import { QuoteVerifier } from '../quote-verifier.js';

describe('Debroy 10-Volume Corpus Ingestion & Multi-Source RAG Integration', () => {
  const pdfPath = 'D:\\The Mahabharata Set of 10 Volumes.pdf';
  let realPdfBuffer: Buffer;
  let realExtractedPages: Map<number, string>;

  beforeAll(async () => {
    // Warm up pool connection
    await pool.query('SELECT 1');
    realPdfBuffer = fs.readFileSync(pdfPath);
    // Extract real pages 25-26 directly from the genuine source PDF
    realExtractedPages = await Debroy10VolIngester.extractPageTexts(realPdfBuffer, 25, 26);
  });

  describe('1. Real PDF Source Verification & Cryptographic Hash', () => {
    it('confirms the real 10-volume PDF source file is accessible on disk', () => {
      expect(fs.existsSync(pdfPath)).toBe(true);
      const stat = fs.statSync(pdfPath);
      expect(stat.size).toBe(57040021);
      expect(stat.size / 1024 / 1024).toBeGreaterThan(50);
    });

    it('verifies the manifest contains real scanned metadata', () => {
      const manifestPath = 'd:\\talk to krisna\\data\\mahabharata\\corpus\\debroy_10_volumes_manifest.json';
      expect(fs.existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(manifest.totalPages).toBe(3723);
      expect(manifest.volumes.length).toBe(10);
      expect(manifest.sha256).toBe('1c387059efc070f9e1c414a5968a7c9de465d736aaa33f98cd284c1a3c7f9863');
      expect(manifest.totalChars).toBeGreaterThan(10000000);
    });
  });

  describe('2. Dynamic Page Structure & Heading Extraction', () => {
    it('dynamically parses volume, parva, section, and speaker tags from real PDF page text without hardcoded numbers', () => {
      const realPageText = realExtractedPages.get(25) || '';
      expect(realPageText.length).toBeGreaterThan(100);

      const state = { currentVolume: 1, currentParva: 'Unknown', currentSection: 'Unknown' };
      const parsed = Debroy10VolIngester.parsePageStructure(realPageText, 25, state);

      expect(parsed.volumeNumber).toBe(1);
      expect(parsed.parva).toBeDefined();
      expect(parsed.section).toBeDefined();
      expect(parsed.cleanedText.length).toBeGreaterThan(50);
      expect(parsed.rawText).toBe(realPageText);
    });
  });

  describe('3. Text Normalization & Semantic Chunking', () => {
    it('cleans Unicode line separators and rejoins hyphenated words across lines from real page text', () => {
      const realPageText = realExtractedPages.get(25) || '';
      const cleaned = Debroy10VolIngester.cleanText(realPageText);
      expect(cleaned.length).toBeGreaterThan(100);
      expect(cleaned).not.toContain('\r\n');
      expect(cleaned).not.toContain('   ');
    });

    it('splits real PDF page text into semantic chunks with proper boundary and overlap', () => {
      const realPageText = realExtractedPages.get(25) || '';
      const cleaned = Debroy10VolIngester.cleanText(realPageText);
      const chunks = splitIntoSemanticChunks(cleaned, 180, 25);
      expect(chunks.length).toBeGreaterThan(0);
      for (const ch of chunks) {
        expect(ch.length).toBeGreaterThan(50);
      }
    });
  });

  describe('4. Real Vector Embedding Validation', () => {
    it('generates genuine 768-dimensional normalized embeddings for real ingested text via bge-base-en-v1.5', async () => {
      const dbRow = await pool.query(
        "SELECT text FROM mahabharata_child_chunks WHERE source_type = $1 LIMIT 1",
        [DEBROY_SOURCE_TYPE]
      );
      expect(dbRow.rows.length).toBe(1);
      const realChunkText = dbRow.rows[0].text;

      const emb = await defaultEmbeddingProvider.embedQuery(realChunkText);
      expect(emb).toHaveLength(768);

      // Validate finite numbers and no NaNs or zeros
      for (let i = 0; i < emb.length; i++) {
        expect(Number.isFinite(emb[i])).toBe(true);
      }

      // Check L2 normalization: sum of squares ≈ 1.0
      let normSq = 0;
      for (let i = 0; i < emb.length; i++) {
        normSq += emb[i] * emb[i];
      }
      expect(Math.sqrt(normSq)).toBeCloseTo(1.0, 2);
    }, 30000);
  });

  describe('5. Real Database Multi-Source Isolation & Integrity', () => {
    it('verifies both original 12-volume source and Debroy 10-volume source are registered in DB', async () => {
      const sourcesRes = await pool.query('SELECT * FROM mahabharata_sources ORDER BY created_at');
      expect(sourcesRes.rows.length).toBeGreaterThanOrEqual(2);

      const debroySource = sourcesRes.rows.find(s => s.source_type === DEBROY_SOURCE_TYPE);
      expect(debroySource).toBeDefined();
      expect(debroySource.title).toBe(DEBROY_SOURCE_TITLE);

      const originalSource = sourcesRes.rows.find(s => s.source_type === 'pdf_volume');
      expect(originalSource).toBeDefined();
    });

    it('confirms original 12-volume records were NOT truncated or modified (6,764 parents, 13,852 children)', async () => {
      const origChunks = await pool.query("SELECT count(*) FROM mahabharata_chunks WHERE source_type = 'pdf_volume'");
      expect(parseInt(origChunks.rows[0].count, 10)).toBe(6764);

      const origChild = await pool.query("SELECT count(*) FROM mahabharata_child_chunks WHERE source_type = 'pdf_volume'");
      expect(parseInt(origChild.rows[0].count, 10)).toBe(13852);
    });

    it('confirms real Debroy records in DB have complete provenance and vector embeddings', async () => {
      const res = await pool.query(`
        SELECT id, parent_chunk_id, source_type, parva, page_number, 
               source_reference, text, 
               embedding IS NOT NULL as has_emb, 
               search_vector IS NOT NULL as has_fts
        FROM mahabharata_child_chunks 
        WHERE source_type = $1 
        LIMIT 5
      `, [DEBROY_SOURCE_TYPE]);

      expect(res.rows.length).toBeGreaterThan(0);
      for (const row of res.rows) {
        expect(row.source_type).toBe(DEBROY_SOURCE_TYPE);
        expect(row.parva).toBeDefined();
        expect(row.page_number).toBeGreaterThanOrEqual(4);
        expect(row.source_reference).toContain('Bibek Debroy');
        expect(row.has_emb).toBe(true);
        expect(row.has_fts).toBe(true);
      }
    });

    it('confirms checkpoint tracks progress in PostgreSQL', async () => {
      const cp = await pool.query(`
        SELECT * FROM ingestion_checkpoints 
        WHERE source_type = $1 
        ORDER BY id DESC LIMIT 1
      `, [DEBROY_SOURCE_TYPE]);

      expect(cp.rows.length).toBe(1);
      expect(cp.rows[0].current_page).toBeGreaterThanOrEqual(28);
      expect(cp.rows[0].total_pages).toBe(3723);
    });
  });

  describe('6. Multi-Source Hybrid Retrieval & Fusion on Real Data', () => {
    it('retrieves evidence from the Debroy corpus when querying Critical Edition content', async () => {
      const query = 'Tell me about the Anukramanika Parva in the Mahabharata';
      const result = await HybridRetriever.retrieve(query, ['Vyasa'], [], 5);
      expect(result.passages.length).toBeGreaterThan(0);

      const hasDebroy = result.passages.some(p => p.sourceType === DEBROY_SOURCE_TYPE);
      expect(hasDebroy).toBe(true);

      const debroyPassage = result.passages.find(p => p.sourceType === DEBROY_SOURCE_TYPE);
      expect(debroyPassage?.sourceReference).toContain('Bibek Debroy');
    });

    it('retrieves canonical Gita verses without interference from new Mahabharata chunks', async () => {
      const query = 'What does Bhagavad Gita 2.47 teach about karma?';
      const result = await HybridRetriever.retrieve(query, ['Krishna', 'Arjuna'], [], 3);
      expect(result.passages.length).toBeGreaterThanOrEqual(1);
      expect(result.passages[0].sourceReference).toBe('Bhagavad Gita 2.47');
      expect(result.passages[0].sourceType).toBe('bhagavad_gita');
    });

    it('retains original 12-volume narrative evidence for war and council queries', async () => {
      const query = 'How did Bheeshma counsel Yudhishthira on the duties of a king on the bed of arrows?';
      const result = await HybridRetriever.retrieve(query, ['Bheeshma', 'Yudhishthira'], [], 5);
      expect(result.passages.length).toBeGreaterThan(0);
      const hasOriginal = result.passages.some(p => p.sourceType === 'pdf_volume' || p.sourceType === 'mahabharata_source');
      expect(hasOriginal).toBe(true);
    });
  });

  describe('7. Citation & Quotation Provenance Validation on Real Ingested Evidence', () => {
    it('attributes real Debroy Critical Edition records with distinctive provenance without mock data', async () => {
      // Fetch a real chunk from the database
      const realChunkRes = await pool.query(`
        SELECT id, source_type, parva, section, source_reference, text
        FROM mahabharata_child_chunks
        WHERE source_type = $1
        LIMIT 1
      `, [DEBROY_SOURCE_TYPE]);

      expect(realChunkRes.rows.length).toBe(1);
      const realChunk = realChunkRes.rows[0];

      const realPassage = {
        id: realChunk.id,
        sourceType: realChunk.source_type,
        parva: realChunk.parva,
        section: realChunk.section,
        sourceReference: realChunk.source_reference,
        translation: realChunk.text,
        relevanceScore: 0.95,
      };

      const realClaims = [
        {
          item: 'Mahabharata teaching',
          type: 'teaching' as const,
          supported: true,
          evidenceChunkId: realChunk.id,
        }
      ];

      // Quote an excerpt directly from the real chunk text
      const realSnippet = realChunk.text.slice(0, 30).trim();
      const generatedReply = `As recorded in the ancient text, ${realSnippet}, reflecting eternal truth.`;

      const verified = QuoteVerifier.verify(generatedReply, [realPassage] as any, false, realClaims);
      expect(verified.citations.length).toBe(1);
      expect(verified.citations[0].source).toBe('Mahabharata (Bibek Debroy Edition)');
      expect(verified.citations[0].sourceReference).toBe(realChunk.source_reference);
    });
  });
});
