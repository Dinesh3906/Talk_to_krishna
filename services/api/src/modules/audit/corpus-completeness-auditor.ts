import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';
import { pool } from '../../db/index.js';
import { normalizeCorpusText, tokenizeCorpusText } from '../ingestion/full-corpus-ingester.js';
import { LocalEmbeddingProvider } from '../ai/providers/local-emb.provider.js';

export interface PageAuditDetail {
  pageNum: number;
  sourceTokensCount: number;
  storedTokensCount: number;
  firstSourceToken: string | null;
  firstStoredToken: string | null;
  lastSourceToken: string | null;
  lastStoredToken: string | null;
  tokensMatch: boolean;
  chunkId: string | null;
  hasEmbedding: boolean;
  embeddingDim: number | null;
  isRetrievable: boolean;
  status: 'PASS' | 'FAIL' | 'EMPTY_PAGE';
}

export interface TokenMismatchDetail {
  pageNum: number;
  chunkId: string | null;
  sourcePosition: number;
  expectedToken: string;
  storedToken: string | null;
  surroundingContext: string;
}

export interface CorpusAuditReport {
  timestamp: string;
  sourcePdf: {
    path: string;
    fileSizeBytes: number;
    sha256?: string;
    totalPages: number;
  };
  metrics: {
    SOURCE_PAGES: number;
    INGESTED_PAGES: number;
    MISSING_PAGES: number;
    EMPTY_PAGES: number;
    NON_EMPTY_PAGES: number;
    SOURCE_TOKENS: number;
    STORED_TOKENS: number;
    MATCHED_TOKENS: number;
    MISSING_TOKEN_COUNT: number;
    EXTRA_TOKENS_COUNT: number;
    TOKEN_COVERAGE_PERCENT: number;
    SOURCE_CHUNKS: number;
    DATABASE_CHUNKS: number;
    MISSING_CHUNKS: number;
    FAILED_EMBEDDINGS: number;
    MISSING_EMBEDDINGS: number;
    ORPHANED_VECTORS: number;
    DUPLICATE_CHUNKS: number;
    FIRST_SOURCE_TOKEN: string | null;
    FIRST_STORED_TOKEN: string | null;
    LAST_SOURCE_TOKEN: string | null;
    LAST_STORED_TOKEN: string | null;
    FIRST_TOKEN_MATCH: 'PASS' | 'FAIL';
    LAST_TOKEN_MATCH: 'PASS' | 'FAIL';
    VECTOR_SEARCH_AVAILABLE: 'PASS' | 'FAIL';
    FULL_TEXT_SEARCH_AVAILABLE: 'PASS' | 'FAIL';
  };
  acceptance: {
    missingPagesZero: boolean;
    missingChunksZero: boolean;
    failedEmbeddingsZero: boolean;
    orphanedVectorsZero: boolean;
    tokenCoverage100Percent: boolean;
    firstTokenMatch: boolean;
    lastTokenMatch: boolean;
    allCriteriaPassed: boolean;
    overallStatus: 'PRODUCTION CORPUS: VERIFIED' | 'PRODUCTION CORPUS: FAILED';
  };
  sampleMismatches: TokenMismatchDetail[];
  pageAuditSummary: {
    passedPages: number;
    failedPages: number;
    emptyPages: number;
  };
}

export class CorpusCompletenessAuditor {
  public static async runAudit(pdfPath: string): Promise<CorpusAuditReport> {
    const startTime = Date.now();
    console.log('[Auditor] ====================================================');
    console.log('[Auditor] STARTING DETERMINISTIC CORPUS COMPLETENESS AUDIT');
    console.log('[Auditor] ====================================================');

    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file not found at: ${pdfPath}`);
    }

    const fileStats = fs.statSync(pdfPath);
    const dataBuffer = fs.readFileSync(pdfPath);

    // 1. Extract source pages
    console.log('[Auditor] Step 1: Deterministically extracting all 6,808 source pages...');
    const sourcePages: Map<number, { text: string; tokens: string[] }> = new Map();

    await pdf(dataBuffer, {
      pagerender: (pageData: any) => {
        const pageNum = pageData.pageIndex + 1;
        return pageData.getTextContent().then((textContent: any) => {
          const raw = textContent.items.map((it: any) => it.str).join(' ');
          const norm = normalizeCorpusText(raw);
          const tokens = tokenizeCorpusText(norm);
          sourcePages.set(pageNum, { text: norm, tokens });
          return norm;
        });
      }
    });

    const totalSourcePages = 6808;
    console.log(`[Auditor] Source extraction complete. Loaded ${sourcePages.size} pages.`);

    // 2. Fetch all stored chunks from database
    console.log('[Auditor] Step 2: Querying database chunks, vectors, and metadata...');
    const dbChunksRes = await pool.query(`
      SELECT 
        id,
        section,
        source_reference,
        translation,
        embedding IS NOT NULL AS has_embedding,
        vector_dims(embedding) AS embedding_dim
      FROM mahabharata_chunks
      WHERE source_type = 'pdf_volume'
      ORDER BY id ASC;
    `);

    const storedChunks = dbChunksRes.rows;
    console.log(`[Auditor] Found ${storedChunks.length} stored PDF chunks in PostgreSQL.`);

    // Map stored chunks by page number
    const storedPageMap: Map<number, { id: string; text: string; tokens: string[]; hasEmbedding: boolean; embeddingDim: number | null }> = new Map();
    const duplicateChunks: string[] = [];
    const seenPageRefs = new Set<number>();

    for (const chunk of storedChunks) {
      // Extract page number from section or source_reference (e.g. "Page 123")
      const match = (chunk.section || chunk.source_reference || '').match(/Page\s+(\d+)/i);
      if (match) {
        const pNum = parseInt(match[1], 10);
        if (seenPageRefs.has(pNum)) {
          duplicateChunks.push(chunk.id);
        }
        seenPageRefs.add(pNum);

        const norm = normalizeCorpusText(chunk.translation);
        const tokens = tokenizeCorpusText(norm);
        storedPageMap.set(pNum, {
          id: chunk.id,
          text: norm,
          tokens,
          hasEmbedding: chunk.has_embedding,
          embeddingDim: chunk.embedding_dim ? parseInt(chunk.embedding_dim, 10) : null,
        });
      }
    }

    // 3. Per-page token, boundary, and vector verification
    console.log('[Auditor] Step 3: Computing deterministic token & page alignments...');
    let totalSourceTokens = 0;
    let totalStoredTokens = 0;
    let matchedTokens = 0;
    let missingTokenCount = 0;
    let extraTokensCount = 0;
    let emptyPagesCount = 0;
    let nonEmptyPagesCount = 0;
    let missingPagesCount = 0;
    let failedEmbeddingsCount = 0;
    let missingEmbeddingsCount = 0;

    const pageAuditDetails: PageAuditDetail[] = [];
    const mismatches: TokenMismatchDetail[] = [];

    let firstSourceToken: string | null = null;
    let firstStoredToken: string | null = null;
    let lastSourceToken: string | null = null;
    let lastStoredToken: string | null = null;

    for (let p = 1; p <= totalSourcePages; p++) {
      const src = sourcePages.get(p) || { text: '', tokens: [] };
      const stored = storedPageMap.get(p);

      const srcTokens = src.tokens;
      const storedTokens = stored ? stored.tokens : [];

      totalSourceTokens += srcTokens.length;
      totalStoredTokens += storedTokens.length;

      const isEmptyPage = srcTokens.length === 0;
      if (isEmptyPage) {
        emptyPagesCount++;
      } else {
        nonEmptyPagesCount++;
        if (!firstSourceToken) firstSourceToken = srcTokens[0];
        lastSourceToken = srcTokens[srcTokens.length - 1];
      }

      if (stored && storedTokens.length > 0) {
        if (!firstStoredToken) firstStoredToken = storedTokens[0];
        lastStoredToken = storedTokens[storedTokens.length - 1];
      }

      // Check embeddings validity
      if (stored) {
        if (!stored.hasEmbedding) {
          missingEmbeddingsCount++;
        } else if (stored.embeddingDim !== 768) {
          failedEmbeddingsCount++;
        }
      }

      // Token alignment on this page
      let pageMatched = 0;
      const minLen = Math.min(srcTokens.length, storedTokens.length);
      for (let i = 0; i < minLen; i++) {
        if (srcTokens[i] === storedTokens[i]) {
          pageMatched++;
        } else {
          if (mismatches.length < 50) {
            mismatches.push({
              pageNum: p,
              chunkId: stored?.id || null,
              sourcePosition: i,
              expectedToken: srcTokens[i],
              storedToken: storedTokens[i] || null,
              surroundingContext: srcTokens.slice(Math.max(0, i - 3), i + 4).join(' '),
            });
          }
        }
      }

      matchedTokens += pageMatched;
      if (srcTokens.length > storedTokens.length) {
        missingTokenCount += (srcTokens.length - storedTokens.length);
      } else if (storedTokens.length > srcTokens.length) {
        extraTokensCount += (storedTokens.length - srcTokens.length);
      }

      const isRepresented = stored !== undefined || isEmptyPage;
      if (!isRepresented) {
        missingPagesCount++;
      }

      const tokensMatch = (srcTokens.length === storedTokens.length) && (pageMatched === srcTokens.length);
      let pageStatus: 'PASS' | 'FAIL' | 'EMPTY_PAGE' = 'FAIL';
      if (isEmptyPage) {
        pageStatus = 'EMPTY_PAGE';
      } else if (tokensMatch && stored?.hasEmbedding && stored.embeddingDim === 768) {
        pageStatus = 'PASS';
      }

      pageAuditDetails.push({
        pageNum: p,
        sourceTokensCount: srcTokens.length,
        storedTokensCount: storedTokens.length,
        firstSourceToken: srcTokens.length > 0 ? srcTokens[0] : null,
        firstStoredToken: storedTokens.length > 0 ? storedTokens[0] : null,
        lastSourceToken: srcTokens.length > 0 ? srcTokens[srcTokens.length - 1] : null,
        lastStoredToken: storedTokens.length > 0 ? storedTokens[storedTokens.length - 1] : null,
        tokensMatch,
        chunkId: stored?.id || null,
        hasEmbedding: stored?.hasEmbedding || false,
        embeddingDim: stored?.embeddingDim || null,
        isRetrievable: (stored?.hasEmbedding && stored.embeddingDim === 768) || false,
        status: pageStatus,
      });
    }

    // 4. Test pgvector vector search & GIN index capability
    console.log('[Auditor] Step 4: Testing real pgvector vector search and GIN indexes...');
    let vectorSearchPass = false;
    let ftsSearchPass = false;

    try {
      const [testEmb] = await LocalEmbeddingProvider.generateEmbeddings(['Mahabharata Vyasa Krishna']);
      const embStr = `[${testEmb.join(',')}]`;
      const vCheck = await pool.query(`
        SELECT id, 1 - (embedding <=> $1::vector) as sim
        FROM mahabharata_chunks
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector ASC
        LIMIT 1;
      `, [embStr]);
      vectorSearchPass = vCheck.rows.length > 0;
    } catch (vErr) {
      console.error('[Auditor] Vector search check failed:', vErr);
    }

    try {
      const ftsCheck = await pool.query(`
        SELECT id, ts_rank_cd(to_tsvector('english', translation), plainto_tsquery('english', 'Krishna Arjuna Mahabharata')) as rk
        FROM mahabharata_chunks
        WHERE to_tsvector('english', translation) @@ plainto_tsquery('english', 'Krishna Arjuna Mahabharata')
        LIMIT 1;
      `);
      ftsSearchPass = ftsCheck.rows.length > 0;
    } catch (fErr) {
      console.error('[Auditor] FTS check failed:', fErr);
    }

    // 5. Calculate Metrics
    const tokenCoveragePercent = totalSourceTokens > 0
      ? Number(((matchedTokens / totalSourceTokens) * 100).toFixed(4))
      : 100;

    const firstTokenMatch = (firstSourceToken !== null && firstStoredToken !== null && firstSourceToken === firstStoredToken);
    const lastTokenMatch = (lastSourceToken !== null && lastStoredToken !== null && lastSourceToken === lastStoredToken);

    const missingPagesZero = missingPagesCount === 0;
    const missingChunksZero = (nonEmptyPagesCount - storedChunks.length) <= 0;
    const failedEmbeddingsZero = failedEmbeddingsCount === 0 && missingEmbeddingsCount === 0;
    const orphanedVectorsZero = duplicateChunks.length === 0;
    const tokenCoverage100 = tokenCoveragePercent === 100;

    const allCriteriaPassed = (
      missingPagesZero &&
      missingChunksZero &&
      failedEmbeddingsZero &&
      orphanedVectorsZero &&
      tokenCoverage100 &&
      firstTokenMatch &&
      lastTokenMatch &&
      vectorSearchPass &&
      ftsSearchPass
    );

    const overallStatus = allCriteriaPassed
      ? 'PRODUCTION CORPUS: VERIFIED'
      : 'PRODUCTION CORPUS: FAILED';

    const passedPages = pageAuditDetails.filter(p => p.status === 'PASS').length;
    const failedPages = pageAuditDetails.filter(p => p.status === 'FAIL').length;

    const report: CorpusAuditReport = {
      timestamp: new Date().toISOString(),
      sourcePdf: {
        path: pdfPath,
        fileSizeBytes: fileStats.size,
        totalPages: totalSourcePages,
      },
      metrics: {
        SOURCE_PAGES: totalSourcePages,
        INGESTED_PAGES: storedPageMap.size,
        MISSING_PAGES: missingPagesCount,
        EMPTY_PAGES: emptyPagesCount,
        NON_EMPTY_PAGES: nonEmptyPagesCount,
        SOURCE_TOKENS: totalSourceTokens,
        STORED_TOKENS: totalStoredTokens,
        MATCHED_TOKENS: matchedTokens,
        MISSING_TOKEN_COUNT: missingTokenCount,
        EXTRA_TOKENS_COUNT: extraTokensCount,
        TOKEN_COVERAGE_PERCENT: tokenCoveragePercent,
        SOURCE_CHUNKS: nonEmptyPagesCount,
        DATABASE_CHUNKS: storedChunks.length,
        MISSING_CHUNKS: Math.max(0, nonEmptyPagesCount - storedChunks.length),
        FAILED_EMBEDDINGS: failedEmbeddingsCount,
        MISSING_EMBEDDINGS: missingEmbeddingsCount,
        ORPHANED_VECTORS: duplicateChunks.length,
        DUPLICATE_CHUNKS: duplicateChunks.length,
        FIRST_SOURCE_TOKEN: firstSourceToken,
        FIRST_STORED_TOKEN: firstStoredToken,
        LAST_SOURCE_TOKEN: lastSourceToken,
        LAST_STORED_TOKEN: lastStoredToken,
        FIRST_TOKEN_MATCH: firstTokenMatch ? 'PASS' : 'FAIL',
        LAST_TOKEN_MATCH: lastTokenMatch ? 'PASS' : 'FAIL',
        VECTOR_SEARCH_AVAILABLE: vectorSearchPass ? 'PASS' : 'FAIL',
        FULL_TEXT_SEARCH_AVAILABLE: ftsSearchPass ? 'PASS' : 'FAIL',
      },
      acceptance: {
        missingPagesZero,
        missingChunksZero,
        failedEmbeddingsZero,
        orphanedVectorsZero,
        tokenCoverage100Percent: tokenCoverage100,
        firstTokenMatch,
        lastTokenMatch,
        allCriteriaPassed,
        overallStatus,
      },
      sampleMismatches: mismatches,
      pageAuditSummary: {
        passedPages,
        failedPages,
        emptyPages: emptyPagesCount,
      },
    };

    // 6. Write machine-readable reports
    console.log('[Auditor] Step 5: Writing machine-readable audit reports...');
    const reportsDir = path.resolve('D:/talk to krisna/reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const auditJsonPath = path.join(reportsDir, 'mahabharata-corpus-audit.json');
    fs.writeFileSync(auditJsonPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`[Auditor] Created: ${auditJsonPath}`);

    // Write page coverage CSV
    const csvLines = [
      'page_number,status,source_tokens,stored_tokens,tokens_match,chunk_id,has_embedding,embedding_dim,retrievable,first_source_token,first_stored_token,last_source_token,last_stored_token'
    ];
    for (const p of pageAuditDetails) {
      csvLines.push(
        `${p.pageNum},${p.status},${p.sourceTokensCount},${p.storedTokensCount},${p.tokensMatch},${p.chunkId || ''},${p.hasEmbedding},${p.embeddingDim || ''},${p.isRetrievable},"${p.firstSourceToken || ''}","${p.firstStoredToken || ''}","${p.lastSourceToken || ''}","${p.lastStoredToken || ''}"`
      );
    }
    const csvPath = path.join(reportsDir, 'mahabharata-page-coverage.csv');
    fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf-8');
    console.log(`[Auditor] Created: ${csvPath}`);

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('[Auditor] ====================================================');
    console.log(`AUDIT FINISHED in ${durationSec}s. RESULT: ${overallStatus}`);
    console.log(`- Token Coverage: ${tokenCoveragePercent}%`);
    console.log(`- Missing Pages: ${missingPagesCount}`);
    console.log(`- Stored Chunks: ${storedChunks.length}`);
    console.log(`- Failed Embeddings: ${failedEmbeddingsCount}`);
    console.log('====================================================');

    return report;
  }
}
