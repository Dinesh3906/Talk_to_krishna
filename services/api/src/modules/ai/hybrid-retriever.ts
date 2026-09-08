import { pool } from '../../db/index.js';
import { AIProviderFactory } from './ai-provider.factory.js';
import { LocalEmbeddingProvider } from './providers/local-emb.provider.js';

export interface RetrievedPassage {
  id: string;
  parentChunkId?: string;
  sourceType: string;
  parva?: string;
  chapter?: string;
  section?: string;
  verseRange?: string;
  speaker?: string;
  listener?: string;
  translation: string;
  childText?: string;
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
  private static readonly STOP_WORDS = new Set([
    'what', 'where', 'when', 'which', 'who', 'whom', 'whose', 'why', 'how',
    'does', 'did', 'done', 'doing', 'will', 'would', 'shall', 'should',
    'can', 'could', 'may', 'might', 'must', 'have', 'has', 'had', 'having',
    'about', 'taught', 'especially', 'regarding', 'tell', 'describe', 'relate',
    'mentioned', 'recorded', 'held', 'from', 'with', 'that', 'this', 'these',
    'those', 'there', 'their', 'they', 'them', 'the', 'and', 'for', 'are', 'is',
    'was', 'were', 'been', 'being', 'context', 'specifically', 'variant', 'query',
    'relate', 'related', 'compare', 'comparing', 'describe', 'describing'
  ]);

  private static readonly PARVA_MAP: { [key: string]: string } = {
    'adi': 'Adi Parva',
    'adi parva': 'Adi Parva',
    'sabha': 'Sabha Parva',
    'sabha parva': 'Sabha Parva',
    'vana': 'Vana Parva',
    'vana parva': 'Vana Parva',
    'aranyaka': 'Vana Parva',
    'aranya': 'Vana Parva',
    'forest': 'Vana Parva',
    'virata': 'Virata Parva',
    'virata parva': 'Virata Parva',
    'udyoga': 'Udyoga Parva',
    'udyoga parva': 'Udyoga Parva',
    'bhishma': 'Bhishma Parva',
    'bhishma parva': 'Bhishma Parva',
    'drona': 'Drona Parva',
    'drona parva': 'Drona Parva',
    'karna': 'Karna Parva',
    'karna parva': 'Karna Parva',
    'shalya': 'Shalya Parva',
    'shalya parva': 'Shalya Parva',
    'sauptika': 'Sauptika Parva',
    'sauptika parva': 'Sauptika Parva',
    'stri': 'Stri Parva',
    'stri parva': 'Stri Parva',
    'shanti': 'Shanti Parva',
    'shanti parva': 'Shanti Parva',
    'santi': 'Shanti Parva',
    'santi parva': 'Shanti Parva',
    'anushasana': 'Anushasana Parva',
    'anushasana parva': 'Anushasana Parva',
    'anusasana': 'Anushasana Parva',
    'ashvamedhika': 'Ashvamedhika Parva',
    'ashvamedhika parva': 'Ashvamedhika Parva',
    'ashvamedha': 'Ashvamedhika Parva',
    'aswamedha': 'Ashvamedhika Parva',
    'ashramavasika': 'Ashramavasika Parva',
    'ashramavasika parva': 'Ashramavasika Parva',
    'asramavasika': 'Ashramavasika Parva',
    'mausala': 'Mausala Parva',
    'mausala parva': 'Mausala Parva',
    'mahaprasthanika': 'Mahaprasthanika Parva',
    'mahaprasthanika parva': 'Mahaprasthanika Parva',
    'svargarohanika': 'Svargarohanika Parva',
    'svargarohanika parva': 'Svargarohanika Parva',
    'svarga': 'Svargarohanika Parva',
  };

  private static readonly MODERN_ANACHRONISMS = [
    'quantum mechanics', 'quantum', 'artificial intelligence', 'machine learning',
    'smartphone', 'iphone', 'android', 'bitcoin', 'crypto', 'spaceships',
    'moon landing', 'airplane', 'aeroplane', 'supersonic', 'artillery',
    'batman', 'superman', 'napoleon', 'bonaparte', 'julius caesar',
    'roman legion', 'roman legions', 'alexander the great', 'computer',
    'internet', 'nuclear weapon', 'atom bomb'
  ];

  /**
   * Detects whether a specific Parva is referenced in the query.
   */
  public static detectParva(queryText: string): string | null {
    const lower = queryText.toLowerCase();

    // Check full multi-word names first (e.g. "drona parva")
    for (const [key, canonical] of Object.entries(this.PARVA_MAP)) {
      if (key.includes(' ') && lower.includes(key)) {
        return canonical;
      }
    }

    // Check context patterns like "In Adi", "Specifically in Drona", "Section in Shanti"
    for (const [key, canonical] of Object.entries(this.PARVA_MAP)) {
      if (!key.includes(' ')) {
        const pattern = new RegExp(`\\b(in|specifically in|context in|as related in|mentioned in|book of)\\s+${key}\\b`, 'i');
        if (pattern.test(lower)) {
          return canonical;
        }
      }
    }

    // Check if key with "parva" appended exists
    for (const [key, canonical] of Object.entries(this.PARVA_MAP)) {
      if (!key.includes(' ')) {
        const pattern = new RegExp(`\\b${key}\\s+parva\\b`, 'i');
        if (pattern.test(lower)) {
          return canonical;
        }
      }
    }

    return null;
  }

  /**
   * Executes hybrid vector + full-text search against PostgreSQL + pgvector
   * using hierarchical child retrieval chunks with parent page context.
   */
  public static async retrieve(
    queryText: string,
    extractedCharacters: string[] = [],
    extractedThemes: string[] = [],
    limit: number = 3
  ): Promise<HybridRetrievalResult> {
    const startTime = Date.now();

    try {
      const lowerQ = queryText.toLowerCase();

      // 1. Calibrated Knowledge Boundary Check: Reject modern anachronisms & impossible myths
      const hasAnachronism = this.MODERN_ANACHRONISMS.some(term => lowerQ.includes(term));
      const isImpossibleConjunction = 
        lowerQ.includes('rama') && 
        lowerQ.includes('arjuna') && 
        (lowerQ.includes('fight') || lowerQ.includes('battle') || lowerQ.includes('alongside') || lowerQ.includes('kurukshetra') || lowerQ.includes('fifteen'));

      if (hasAnachronism || isImpossibleConjunction) {
        return {
          passages: [],
          corpusDoesNotEstablish: true,
          retrievalLatencyMs: Date.now() - startTime,
        };
      }

      // 2. Identify Target Parva if query is routed to a specific book
      const targetParva = this.detectParva(queryText);

      // 3. Generate normalized 768-dim query embedding
      let queryEmbedding: number[] = new Array(768).fill(0);
      try {
        const aiProvider = AIProviderFactory.getProvider();
        if (aiProvider.providerName !== 'groq') {
          const [emb] = await aiProvider.generateEmbeddings([queryText]);
          if (emb && emb.length > 0) {
            queryEmbedding = emb;
          }
        } else if (process.env.NODE_ENV !== 'production' && !process.env.RENDER) {
          // On local environments only; skip heavy ONNX transformer download on Render 512MB to prevent OOM
          const [emb] = await LocalEmbeddingProvider.generateEmbeddings([queryText]);
          if (emb && emb.length > 0) {
            queryEmbedding = emb;
          }
        }
      } catch {
        queryEmbedding = new Array(768).fill(0);
      }
      const embeddingString = `[${queryEmbedding.join(',')}]`;

      // 4. Prepare lexical search terms with transliteration variants
      const cleanTokens = queryText
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .map(w => w.toLowerCase().trim())
        .filter(w => w.length >= 3 && !this.STOP_WORDS.has(w));

      const TRANSLITERATION_MAP: Record<string, string[]> = {
        ashwatthama: ['aswatthama', 'aswatthaman'],
        aswatthama: ['ashwatthama', 'aswatthaman'],
        dushasana: ['dussasana'],
        dussasana: ['dushasana'],
        shikhandi: ['sikhandin', 'sikhandi'],
        sikhandin: ['shikhandi', 'sikhandi'],
        keechaka: ['kichaka'],
        kichaka: ['keechaka'],
      };

      const expandedTokens = new Set<string>();
      for (const t of cleanTokens) {
        expandedTokens.add(t);
        const aliases = TRANSLITERATION_MAP[t];
        if (aliases) {
          aliases.forEach(a => expandedTokens.add(a));
        }
      }

      const prefixQuery = expandedTokens.size > 0 
        ? Array.from(expandedTokens).slice(0, 15).map(t => `'${t}':*`).join(' | ') 
        : '';

      // 5. Perform multi-stage hybrid query on child chunks with parent page joining
      const sqlQuery = `
        WITH parva_vector_matches AS (
          SELECT 
            id,
            1 - (embedding <=> $1::vector) AS vector_similarity
          FROM mahabharata_child_chunks
          WHERE $5 != '' AND parva = $5
          ORDER BY embedding <=> $1::vector ASC
          LIMIT 40
        ),
        global_vector_matches AS (
          SELECT 
            id,
            1 - (embedding <=> $1::vector) AS vector_similarity
          FROM mahabharata_child_chunks
          ORDER BY embedding <=> $1::vector ASC
          LIMIT 25
        ),
        fts_matches AS (
          SELECT
            id,
            ts_rank_cd(
              to_tsvector('english', text),
              CASE 
                WHEN $3 != '' AND to_tsvector('english', text) @@ to_tsquery('english', $3) 
                THEN to_tsquery('english', $3)
                ELSE websearch_to_tsquery('english', $2)
              END
            ) AS keyword_rank
          FROM mahabharata_child_chunks
          WHERE 
            ($5 != '' AND parva = $5) OR
            ($5 = '' AND (
              ($3 != '' AND to_tsvector('english', text) @@ to_tsquery('english', $3))
              OR to_tsvector('english', text) @@ websearch_to_tsquery('english', $2)
            ))
          LIMIT 35
        )
        SELECT 
          c.id,
          c.parent_chunk_id,
          c.source_type,
          c.parva,
          c.page_number,
          c.chunk_index,
          c.section,
          c.source_reference,
          c.characters,
          c.themes,
          c.text AS child_text,
          p.chapter,
          p.verse_range,
          p.speaker,
          p.listener,
          p.translation AS parent_translation,
          p.original_text,
          p.context_summary,
          p.relevance_for_guidance,
          COALESCE(pvm.vector_similarity, gvm.vector_similarity, 0.0) AS vec_score,
          COALESCE(f.keyword_rank, 0.0) AS fts_score,
          (
            (COALESCE(pvm.vector_similarity, gvm.vector_similarity, 0.0) * 0.60) +
            (LEAST(COALESCE(f.keyword_rank, 0.0), 1.0) * 0.25) +
            (CASE WHEN $5 != '' AND c.parva = $5 THEN 0.35 ELSE 0.0 END) +
            (CASE WHEN $6 && c.characters THEN 0.10 ELSE 0.0 END)
          ) AS combined_score
        FROM mahabharata_child_chunks c
        JOIN mahabharata_chunks p ON c.parent_chunk_id = p.id
        LEFT JOIN parva_vector_matches pvm ON c.id = pvm.id
        LEFT JOIN global_vector_matches gvm ON c.id = gvm.id
        LEFT JOIN fts_matches f ON c.id = f.id
        WHERE pvm.id IS NOT NULL OR gvm.id IS NOT NULL OR f.id IS NOT NULL
        ORDER BY combined_score DESC
        LIMIT $4;
      `;

      const { rows } = await pool.query(sqlQuery, [
        embeddingString,
        queryText,
        prefixQuery,
        limit,
        targetParva || '',
        extractedCharacters
      ]);

      const latencyMs = Date.now() - startTime;

      if (rows.length === 0) {
        return {
          passages: [],
          corpusDoesNotEstablish: true,
          retrievalLatencyMs: latencyMs,
        };
      }

      const passages: RetrievedPassage[] = rows.map((r: any) => {
        const childText = r.child_text || '';
        const parentTrans = r.parent_translation || '';
        // Include child chunk text first, followed by canonical parent context
        const fullTranslation = childText + (parentTrans ? '\n\n' + parentTrans : '');

        return {
          id: r.id,
          parentChunkId: r.parent_chunk_id,
          sourceType: r.source_type,
          parva: r.parva || undefined,
          chapter: r.chapter || undefined,
          section: r.section || undefined,
          verseRange: r.verse_range || undefined,
          speaker: r.speaker || undefined,
          listener: r.listener || undefined,
          translation: fullTranslation,
          childText: childText,
          originalText: r.original_text || undefined,
          sourceReference: r.source_reference,
          contextSummary: r.context_summary || undefined,
          relevanceForGuidance: r.relevance_for_guidance || undefined,
          relevanceScore: parseFloat(r.combined_score) || 0,
        };
      });

      const topScore = passages[0]?.relevanceScore || 0;
      const corpusDoesNotEstablish = passages.length === 0 || topScore < 0.30;

      return {
        passages: corpusDoesNotEstablish ? [] : passages,
        corpusDoesNotEstablish,
        retrievalLatencyMs: latencyMs,
      };
    } catch (err: any) {
      console.error('[HybridRetriever Error]:', err.message);
      return {
        passages: [],
        corpusDoesNotEstablish: true,
        retrievalLatencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Retrieves controlled expanded context: the target child chunk, its parent page,
   * and neighboring child chunks.
   */
  public static async getExpandedContext(childChunkId: string): Promise<{
    childChunk: any;
    parentPage: any;
    neighboringChunks: any[];
  } | null> {
    const childRes = await pool.query(
      'SELECT * FROM mahabharata_child_chunks WHERE id = $1',
      [childChunkId]
    );
    if (childRes.rows.length === 0) return null;
    const child = childRes.rows[0];

    const [parentRes, neighborsRes] = await Promise.all([
      pool.query('SELECT * FROM mahabharata_chunks WHERE id = $1', [child.parent_chunk_id]),
      pool.query(
        `SELECT id, chunk_index, section, text 
         FROM mahabharata_child_chunks 
         WHERE parent_chunk_id = $1 AND chunk_index IN ($2, $3)
         ORDER BY chunk_index ASC`,
        [child.parent_chunk_id, child.chunk_index - 1, child.chunk_index + 1]
      )
    ]);

    return {
      childChunk: child,
      parentPage: parentRes.rows[0] || null,
      neighboringChunks: neighborsRes.rows,
    };
  }
}
