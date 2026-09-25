import { Router, Request, Response } from 'express';
import { pool } from '../../db/index.js';

const router = Router();

// GET all Parvas and chunk coverage directly from authoritative PostgreSQL database
router.get('/parvas', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        parva,
        count(*) as chunk_count,
        min(page_number) as start_page,
        max(page_number) as end_page
      FROM mahabharata_child_chunks 
      WHERE parva IS NOT NULL 
      GROUP BY parva 
      ORDER BY parva ASC;
    `);
    return res.status(200).json({ data: result.rows });
  } catch (err: any) {
    return res.status(500).json({
      error: { code: 'SOURCES_ERROR', message: `Failed to query Parvas from database: ${err.message}` },
    });
  }
});

// GET canonical Bhagavad Gita Verses directly from authoritative PostgreSQL database
router.get('/gita', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, chapter, verse, speaker, listener, sanskrit, transliteration,
        translation, source_edition, provenance, deep_meaning, krishna_teaching
      FROM gita_verses
      ORDER BY chapter ASC, verse ASC;
    `);
    return res.status(200).json({ 
      data: result.rows,
      meta: {
        verifiedVersesPresent: result.rows.length,
        totalGitaVerses: 700,
        coveragePercentage: ((result.rows.length / 700) * 100).toFixed(2),
      }
    });
  } catch (err: any) {
    return res.status(500).json({
      error: { code: 'SOURCES_ERROR', message: `Failed to query Bhagavad Gita from database: ${err.message}` },
    });
  }
});

// GET Comprehensive Source Corpus Coverage Audit (Policy Section 16)
router.get('/coverage', async (_req: Request, res: Response) => {
  try {
    const [mbStats, gitaStats, vectorStats] = await Promise.all([
      pool.query(`
        SELECT 
          count(*) as total_child_chunks,
          count(DISTINCT parent_chunk_id) as total_parent_pages,
          count(DISTINCT parva) as total_parvas,
          count(DISTINCT section) as total_sections
        FROM mahabharata_child_chunks;
      `),
      pool.query(`
        SELECT 
          count(*) as verified_verses,
          count(DISTINCT chapter) as chapters_covered,
          count(sanskrit) as sanskrit_present,
          count(translation) as translations_present
        FROM gita_verses;
      `),
      pool.query(`
        SELECT 
          count(*) as chunks_with_valid_vectors
        FROM mahabharata_child_chunks
        WHERE embedding IS NOT NULL;
      `),
    ]);

    const mb = mbStats.rows[0];
    const gita = gitaStats.rows[0];
    const vec = vectorStats.rows[0];

    return res.status(200).json({
      status: 'VERIFIED_CANONICAL_CORPUS',
      mahabharata: {
        totalChildChunks: parseInt(mb.total_child_chunks, 10),
        totalParentPages: parseInt(mb.total_parent_pages, 10),
        parvasCovered: parseInt(mb.total_parvas, 10),
        sectionsCovered: parseInt(mb.total_sections, 10),
        embeddingCoverage: `${vec.chunks_with_valid_vectors} / ${mb.total_child_chunks}`,
      },
      bhagavadGita: {
        verifiedVerses: parseInt(gita.verified_verses, 10),
        totalCanonicalVerses: 700,
        missingVerses: Math.max(0, 700 - parseInt(gita.verified_verses, 10)),
        chaptersCovered: parseInt(gita.chapters_covered, 10),
        sanskritPresent: parseInt(gita.sanskrit_present, 10),
        translationsPresent: parseInt(gita.translations_present, 10),
      },
      vectorIndex: {
        model: 'BAAI/bge-base-en-v1.5',
        dimension: 768,
        distanceMetric: 'cosine (<=>)',
        sourceIntegrity: 'PostgreSQL pgvector + GIN FTS',
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      error: { code: 'COVERAGE_ERROR', message: `Failed to compute coverage audit: ${err.message}` },
    });
  }
});

export default router;
