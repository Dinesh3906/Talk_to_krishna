import { pool } from '../../db/index.js';
import { AIProviderFactory } from './ai-provider.factory.js';

export interface RetrievedPassage {
  id: string;
  sourceType: string;
  parva?: string;
  chapter?: string;
  section?: string;
  verseRange?: string;
  speaker?: string;
  listener?: string;
  translation: string;
  originalText?: string;
  sourceReference: string;
  contextSummary?: string;
  relevanceForGuidance?: string;
  relevanceScore: number;
}

export interface HybridRetrievalResult {
  passages: RetrievedPassage[];
  corpusDoesNotEstablish: boolean;
  retrievalLatencyMs: number;
}

export class HybridRetriever {
  /**
   * Executes hybrid vector + full-text search against PostgreSQL + pgvector
   */
  public static async retrieve(
    queryText: string,
    extractedCharacters: string[] = [],
    extractedThemes: string[] = [],
    limit: number = 3
  ): Promise<HybridRetrievalResult> {
    const startTime = Date.now();
    const aiProvider = AIProviderFactory.getProvider();

    try {
      // 1. Generate query embedding
      const [queryEmbedding] = await aiProvider.generateEmbeddings([queryText]);
      const embeddingString = `[${queryEmbedding.join(',')}]`;

      // 2. Perform hybrid query with Reciprocal Rank Fusion & full-text search
      const sqlQuery = `
        WITH vector_matches AS (
          SELECT 
            id,
            1 - (embedding <=> $1::vector) AS vector_similarity
          FROM mahabharata_chunks
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> $1::vector ASC
          LIMIT 10
        ),
        fts_matches AS (
          SELECT
            id,
            ts_rank_cd(
              to_tsvector('english', translation || ' ' || coalesce(context_summary, '') || ' ' || coalesce(relevance_for_guidance, '')),
              plainto_tsquery('english', $2)
            ) AS keyword_rank
          FROM mahabharata_chunks
          WHERE to_tsvector('english', translation || ' ' || coalesce(context_summary, '') || ' ' || coalesce(relevance_for_guidance, '')) @@ plainto_tsquery('english', $2)
          LIMIT 10
        )
        SELECT 
          c.id,
          c.source_type,
          c.parva,
          c.chapter,
          c.section,
          c.verse_range,
          c.speaker,
          c.listener,
          c.translation,
          c.original_text,
          c.source_reference,
          c.context_summary,
          c.relevance_for_guidance,
          COALESCE(v.vector_similarity, 0.0) AS vec_score,
          COALESCE(f.keyword_rank, 0.0) AS fts_score,
          (
            (COALESCE(v.vector_similarity, 0.0) * 0.70) +
            (LEAST(COALESCE(f.keyword_rank, 0.0), 1.0) * 0.30)
          ) AS combined_score
        FROM mahabharata_chunks c
        LEFT JOIN vector_matches v ON c.id = v.id
        LEFT JOIN fts_matches f ON c.id = f.id
        WHERE v.id IS NOT NULL OR f.id IS NOT NULL
        ORDER BY combined_score DESC
        LIMIT $3;
      `;

      const { rows } = await pool.query(sqlQuery, [embeddingString, queryText, limit]);

      const latencyMs = Date.now() - startTime;

      if (rows.length === 0) {
        return {
          passages: [],
          corpusDoesNotEstablish: true,
          retrievalLatencyMs: latencyMs,
        };
      }

      const passages: RetrievedPassage[] = rows.map((r: any) => ({
        id: r.id,
        sourceType: r.source_type,
        parva: r.parva || undefined,
        chapter: r.chapter || undefined,
        section: r.section || undefined,
        verseRange: r.verse_range || undefined,
        speaker: r.speaker || undefined,
        listener: r.listener || undefined,
        translation: r.translation,
        originalText: r.original_text || undefined,
        sourceReference: r.source_reference,
        contextSummary: r.context_summary || undefined,
        relevanceForGuidance: r.relevance_for_guidance || undefined,
        relevanceScore: parseFloat(r.combined_score) || 0,
      }));

      const topScore = passages[0]?.relevanceScore || 0;
      // If top result is too weak (below 0.35), flag that the corpus does not conclusively establish this
      const corpusDoesNotEstablish = topScore < 0.35;

      return {
        passages,
        corpusDoesNotEstablish,
        retrievalLatencyMs: latencyMs,
      };
    } catch (err: any) {
      console.error('[HybridRetriever Error]:', err.message);
      // Return clean failure state
      return {
        passages: [],
        corpusDoesNotEstablish: true,
        retrievalLatencyMs: Date.now() - startTime,
      };
    }
  }
}
