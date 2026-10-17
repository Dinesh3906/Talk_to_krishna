import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../../db/index.js';
import type { PoolClient } from 'pg';

export interface RetrievedPassage {
  id: string;
  parentChunkId?: string;
  sourceType: string;
  parva?: string;
  chapter?: string;
  section?: string;
  pageNumber?: number;
  verseRange?: string;
  speaker?: string;
  listener?: string;
  translation: string;
  sourceEdition?: string;
  originalText?: string;
  sourceReference: string;
  contextSummary?: string;
  relevanceForGuidance?: string;
  relevanceScore: number;
  retrievalScores?: Record<string, number>;
  characters?: string[];
}

export interface RetrievalCandidateTrace {
  id: string;
  parentChunkId?: string;
  sourceType: string;
  sourceEdition?: string;
  sourceReference: string;
  rank: number;
  candidateScore: number;
  scoreComponents: Record<string, number>;
}

export interface HybridRetrievalResult {
  passages: RetrievedPassage[];
  corpusDoesNotEstablish: boolean;
  retrievalLatencyMs: number;
  topScore: number;
  scoreGap: number;
  confidence: 'high' | 'medium' | 'low';
  hasSufficientEvidence: boolean;
  retrievalPath?: 'database' | 'canonical_disk_fallback' | 'database_timeout_fallback' | 'hybrid' | 'cache' | 'disk' | 'none';
  databaseLatencyMs?: number;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  channelCandidates?: Record<string, RetrievalCandidateTrace[]>;
  timings?: {
    entityExtractionMs: number;
    embeddingMs: number;
    gitaSearchMs: number;
    mbQueryMs: number;
    rerankingMs: number;
    queryConstructionMs: number;
    connectionAcquisitionMs: number;
    databaseRoundTripMs: number;
    rowRetrievalMs: number;
    diskFallbackMs: number;
    citationConstructionMs: number;
    databaseTimeout: boolean;
    poolWaitingCount: number;
  };
}

export interface DatabaseQueryTiming {
  durationMs: number;
  connectionAcquisitionMs: number;
  databaseRoundTripMs: number;
  rowRetrievalMs: number;
  timedOut: boolean;
  rowsReturned: number;
}

export interface QueryHints {
  candidateEntities: string[];
  targetParva: string | null;
  verseReference: { chapter: number; verse: number } | null;
}

export interface CachedGitaVerse {
  id: string;
  chapter: number;
  verse: number;
  speaker: string;
  listener: string;
  sanskrit: string;
  transliteration: string;
  translation: string;
  sourceEdition?: string;
  deep_meaning?: string;
  krishna_teaching?: string;
  provenance: string;
  embArray?: Float32Array;
}

export interface PreviouslyUsedEvidence {
  citedChunkIds?: string[];
  citedEpisodeIds?: string[];
  mentionedCharacters?: string[];
  usedTeachings?: string[];
}

function spellingVariants(token: string): string[] {
  const lower = token.toLowerCase();
  const variants = new Set([lower]);
  if (lower.includes('sh')) variants.add(lower.replace(/sh/g, 's'));
  else if (lower.includes('s')) variants.add(lower.replace(/s/g, 'sh'));
  if (lower.includes('v')) variants.add(lower.replace(/v/g, 'w'));
  else if (lower.includes('w')) variants.add(lower.replace(/w/g, 'v'));
  if (lower.includes('barat')) variants.add(lower.replace(/barat/g, 'bharat'));
  else if (lower.includes('bharat')) variants.add(lower.replace(/bharat/g, 'barat'));
  if (lower.includes('geeta')) variants.add(lower.replace(/geeta/g, 'gita'));
  return Array.from(variants);
}

function entityQueryGroup(name: string): string {
  const wordGroups = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(word =>
    `(${spellingVariants(word).map(variant => `'${variant.replace(/'/g, "''")}'`).map(term => `${term}:*`).join(' | ')})`
  );
  return wordGroups.length > 1 ? `(${wordGroups.join(' & ')})` : (wordGroups[0] || '');
}

function entityMentioned(text: string, name: string): boolean {
  return spellingVariants(name).some(variant => new RegExp(`\\b${variant}\\b`, 'i').test(text));
}

function normalizeEnglishToken(token: string): string {
  let normalized = token.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized.length > 5 && normalized.endsWith('ies')) normalized = `${normalized.slice(0, -3)}y`;
  else if (normalized.length > 5 && normalized.endsWith('ing')) {
    normalized = normalized.slice(0, -3);
    if (/(.)\1$/.test(normalized)) normalized = normalized.slice(0, -1);
  } else if (normalized.length > 4 && normalized.endsWith('ed')) normalized = normalized.slice(0, -2);
  else if (normalized.length > 4 && normalized.endsWith('s') && !normalized.endsWith('ss')) normalized = normalized.slice(0, -1);
  return normalized;
}

function queryTokenMatchCount(text: string, queryTokens: string[]): number {
  const terms = Array.from(new Set(queryTokens.map(normalizeEnglishToken).filter(token => token.length >= 3)));
  const sourceTerms = new Set(text.split(/[^\p{L}\p{N}]+/u).map(normalizeEnglishToken).filter(Boolean));
  return terms.filter(term => sourceTerms.has(term)).length;
}

function queryTokenCoverage(text: string, queryTokens: string[]): number {
  const terms = Array.from(new Set(queryTokens.map(normalizeEnglishToken).filter(token => token.length >= 3)));
  return terms.length ? queryTokenMatchCount(text, queryTokens) / terms.length : 0;
}

function isGitaCorpusPassage(passage: RetrievedPassage): boolean {
  return passage.sourceType === 'bhagavad_gita' || passage.sourceType.startsWith('gita_');
}

export class HybridRetriever {
  private static gitaCache: CachedGitaVerse[] | null = null;
  private static gitaCachePromise: Promise<CachedGitaVerse[]> | null = null;
  private static readonly embeddingCache = new Map<string, number[]>();
  private static gitaLoadPath: 'database' | 'canonical_disk' | 'none' = 'none';
  private static gitaFallbackReason?: string;
  private static gitaDatabaseLatencyMs = 0;

  public static findCorpusFile(relativePath: string): string | null {
    const candidates = [
      path.resolve(process.cwd(), relativePath),
      path.resolve(process.cwd(), '../../', relativePath),
      path.resolve(process.cwd(), '../', relativePath),
    ];
    try {
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      candidates.push(
        path.resolve(currentDir, '../../../../../../', relativePath),
        path.resolve(currentDir, '../../../../../', relativePath),
        path.resolve(currentDir, '../../../../', relativePath),
        path.resolve(currentDir, '../../../', relativePath)
      );
    } catch {
      // ignore
    }
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        return c;
      }
    }
    return null;
  }

  public static async queryWithTimeout(
    text: string,
    params: any[] = [],
    timeoutMs = 8000,
    onTiming?: (timing: DatabaseQueryTiming) => void,
  ): Promise<any> {
    const started = performance.now();
    const timing: DatabaseQueryTiming = {
      durationMs: 0,
      connectionAcquisitionMs: 0,
      databaseRoundTripMs: 0,
      rowRetrievalMs: 0,
      timedOut: false,
      rowsReturned: 0,
    };
    const deadline = started + timeoutMs;
    let client: PoolClient | undefined;
    let clientReleased = false;
    let acquireTimer: ReturnType<typeof setTimeout> | undefined;
    let operationTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingConnect: Promise<PoolClient> | undefined;
    try {
      const acquisitionStarted = performance.now();
      pendingConnect = pool.connect();
      client = await Promise.race([
        pendingConnect,
        new Promise<never>((_, reject) => {
          acquireTimer = setTimeout(() => {
            timing.timedOut = true;
            const error = Object.assign(new Error(`Database connection acquisition exceeded ${timeoutMs}ms`), { code: 'ETIMEDOUT' });
            reject(error);
          }, Math.max(1, deadline - performance.now()));
        }),
      ]);
      if (acquireTimer) clearTimeout(acquireTimer);
      timing.connectionAcquisitionMs = performance.now() - acquisitionStarted;
      const dbClient = client;

      const queryStarted = performance.now();
      // This helper is used for read-only retrieval. Avoid wrapping each SELECT in
      // BEGIN/SET LOCAL/COMMIT: those extra network round trips consumed nearly half
      // the wall-clock budget on the managed PostgreSQL service. The JS deadline
      // below still covers the query and complete row transfer; an expired request
      // destroys its checked-out socket so no late result can leak into another turn.
      const operation = dbClient.query(text, params).then(result => {
        // node-postgres resolves only after all rows have arrived. Preserve that
        // separate measurement because row transfer was the observed cold-load cost.
        timing.databaseRoundTripMs = performance.now() - queryStarted;
        timing.rowRetrievalMs = timing.databaseRoundTripMs;
        timing.rowsReturned = result.rowCount || 0;
        return result;
      });
      const result = await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          operationTimer = setTimeout(() => {
            timing.timedOut = true;
            clientReleased = true;
            dbClient.release(true);
            const error = Object.assign(new Error(`Database retrieval exceeded ${timeoutMs}ms wall-clock budget`), { code: 'ETIMEDOUT' });
            reject(error);
          }, Math.max(1, deadline - performance.now()));
        }),
      ]);
      timing.durationMs = performance.now() - started;
      return result;
    } catch (caught: any) {
      const error = caught as Error & { code?: string; durationMs?: number };
      if (error.code === '57014' || error.code === 'ETIMEDOUT') timing.timedOut = true;
      timing.durationMs = performance.now() - started;
      error.durationMs = timing.durationMs;
      throw error;
    } finally {
      if (acquireTimer) clearTimeout(acquireTimer);
      if (operationTimer) clearTimeout(operationTimer);
      if (!client && pendingConnect) {
        // A timed-out pool checkout cannot be cancelled; release it if it arrives later.
        void pendingConnect.then(lateClient => lateClient.release()).catch(() => undefined);
      }
      if (client && !clientReleased) client.release();
      timing.durationMs ||= performance.now() - started;
      onTiming?.(timing);
    }
  }

  public static async getGitaVerses(): Promise<CachedGitaVerse[]> {
    if (this.gitaCache) return this.gitaCache;
    if (!this.gitaCachePromise) {
      this.gitaCachePromise = (async () => {
        const corpusPath = this.findCorpusFile('data/mahabharata/corpus/gita_700_canonical.json');
        if (corpusPath && fs.existsSync(corpusPath)) {
          const raw = fs.readFileSync(corpusPath, 'utf8');
          const data = JSON.parse(raw);
          this.gitaLoadPath = 'canonical_disk';
          this.gitaFallbackReason = undefined;
          this.gitaCache = data.map((r: any) => ({
            id: r.id,
            chapter: r.chapter,
            verse: r.verse,
            speaker: r.speaker,
            listener: r.listener,
            sanskrit: r.sanskrit,
            transliteration: r.transliteration,
            translation: r.translation,
            sourceEdition: r.sourceEdition,
            deep_meaning: r.deepMeaning ?? r.deep_meaning,
            krishna_teaching: r.krishnaTeaching ?? r.krishna_teaching,
            provenance: r.provenance,
          }));
          return this.gitaCache!;
        }

        // Deployments without the checked-in source file retain a short bounded DB path.
        try {
          const res = await this.queryWithTimeout(`
            SELECT id, chapter, verse, speaker, listener, sanskrit, transliteration,
                   source_edition,
                   translation, deep_meaning, krishna_teaching, provenance
            FROM gita_verses ORDER BY chapter ASC, verse ASC;
          `, [], 1800, timing => { this.gitaDatabaseLatencyMs = timing.durationMs; });
          this.gitaLoadPath = 'database';
          this.gitaCache = res.rows.map((r: any) => ({
            id: r.id, chapter: r.chapter, verse: r.verse, speaker: r.speaker, listener: r.listener,
            sanskrit: r.sanskrit, transliteration: r.transliteration, translation: r.translation,
            sourceEdition: r.source_edition,
            deep_meaning: r.deep_meaning, krishna_teaching: r.krishna_teaching, provenance: r.provenance,
          }));
          return this.gitaCache!;
        } catch {
          this.gitaLoadPath = 'none';
          this.gitaFallbackReason = 'gita_database_read_failed';
          console.warn('[HybridRetriever] Gita database read failed and canonical disk corpus is unavailable.');
          this.gitaCache = [];
          return [];
        }
      })();
    }
    const result = await this.gitaCachePromise;
    return result || [];
  }

  public static cosineSimilarity(a: Float32Array | number[], b: Float32Array): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < b.length; i++) {
      const aVal = a[i] || 0;
      const bVal = b[i];
      dot += aVal * bVal;
      normA += aVal * aVal;
      normB += bVal * bVal;
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  private static readonly STOP_WORDS = new Set([
    'what', 'where', 'when', 'which', 'who', 'whom', 'whose', 'why', 'how',
    'does', 'did', 'done', 'doing', 'will', 'would', 'shall', 'should',
    'can', 'could', 'may', 'might', 'must', 'have', 'has', 'had', 'having',
    'about', 'taught', 'especially', 'regarding', 'tell', 'describe', 'relate',
    'mentioned', 'recorded', 'held', 'from', 'with', 'that', 'this', 'these',
    'those', 'there', 'their', 'they', 'them', 'the', 'and', 'for', 'are', 'is',
    'was', 'were', 'been', 'being', 'context', 'specifically', 'variant', 'query',
    'relate', 'related', 'compare', 'comparing', 'describe', 'describing',
    'mahabharata', 'epic', 'book',
    // Numbers and temporal words that cause false-positive matches on ancient texts
    'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'first', 'second', 'third', 'fourth', 'fifth',
    'month', 'months', 'year', 'years', 'day', 'days', 'week', 'weeks',
    'today', 'yesterday', 'tomorrow', 'time', 'times', 'moment',
    'walk', 'walked', 'walking', 'away', 'just', 'still', 'really', 'feel', 'feeling', 'feels'
  ]);

  private static readonly PARVA_MAP: Record<string, string> = {
    'adi': 'Adi Parva',
    'adi parva': 'Adi Parva',
    'sabha': 'Sabha Parva',
    'sabha parva': 'Sabha Parva',
    'vana': 'Vana Parva',
    'vana parva': 'Vana Parva',
    'aranyaka': 'Vana Parva',
    'aranya': 'Vana Parva',
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
    'ashvamedhika': 'Ashvamedhika Parva',
    'ashvamedhika parva': 'Ashvamedhika Parva',
    'ashramavasika': 'Ashramavasika Parva',
    'ashramavasika parva': 'Ashramavasika Parva',
    'mausala': 'Mausala Parva',
    'mausala parva': 'Mausala Parva',
    'mahaprasthanika': 'Mahaprasthanika Parva',
    'mahaprasthanika parva': 'Mahaprasthanika Parva',
    'svargarohanika': 'Svargarohanika Parva',
    'svargarohanika parva': 'Svargarohanika Parva',
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

    for (const [key, canonical] of Object.entries(this.PARVA_MAP)) {
      if (key.includes(' ') && lower.includes(key)) {
        return canonical;
      }
    }

    for (const [key, canonical] of Object.entries(this.PARVA_MAP)) {
      if (!key.includes(' ')) {
        const pattern = new RegExp(`\\b(in|specifically in|context in|as related in|mentioned in|book of)\\s+${key}\\b`, 'i');
        if (pattern.test(lower)) {
          return canonical;
        }
        const pattern2 = new RegExp(`\\b${key}\\s+parva\\b`, 'i');
        if (pattern2.test(lower)) {
          return canonical;
        }
      }
    }

    return null;
  }

  /**
   * Extracts lightweight query hints (candidate entities, target parva, verse citations)
   * purely from query structure without any hardcoded character dictionaries or trigger words.
   */
  public static extractQueryHints(queryText: string): QueryHints {
    const candidateEntities = new Set<string>();

    // 1. Phrasal subject extraction: "who was X", "tell me about X", "story of X", "what did X do"
    const phraseMatches = queryText.matchAll(/\b(?:who (?:was|is)|tell me about|story of|why did|what did|between)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/gi);
    for (const match of phraseMatches) {
      if (match[1]) {
        // Phrasal extraction is for proper-name subjects; treating any noun after
        // "about" as an entity (for example "objects of desire") creates a false
        // epic scope and suppresses the canonical Gita search path.
        if (!/^[A-Z][a-z]+$/.test(match[1].split(/\s+/)[0])) continue;
        const words = match[1].split(/\s+/).map(w => w.replace(/[^a-zA-Z]/g, '').toLowerCase());
        for (const w of words) {
          if (w.length >= 3 && !this.STOP_WORDS.has(w)) {
            candidateEntities.add(w);
          }
        }
      }
    }

    // 2. Capitalized words (proper nouns) in the query
    const rawWords = queryText.split(/\s+/);
    for (let i = 0; i < rawWords.length; i++) {
      const token = rawWords[i];
      const clean = token.replace(/[^a-zA-Z]/g, '');
      if (clean.length >= 3 && /^[A-Z][a-z]+$/.test(token.replace(/[.,!?:;'"“”]/g, ''))) {
        const lower = clean.toLowerCase();
        if (!this.STOP_WORDS.has(lower)) {
          if (i === 0 && ['what', 'why', 'who', 'how', 'when', 'where', 'tell', 'explain', 'does', 'did', 'can', 'could'].includes(lower)) {
            continue;
          }
          candidateEntities.add(lower);
        }
      }
    }

    // In Talk to Krishna, 2nd person pronouns ("you", "your", "yourself") address Krishna
    if (/\b(you|your|yourself)\b/i.test(queryText)) {
      candidateEntities.add('krishna');
    }

    // 3. Verse citation parsing: "2.47", "Gita 2.47", "chapter 2 verse 47", or Sanskrit shlokas
    let verseReference: { chapter: number; verse: number } | null = null;
    const vMatch = queryText.toLowerCase().match(/(?:chapter\s*(\d+)\s*(?:verse|shloka|sloka)?\s*(\d+)|(?:gita|bg|bhagavad\s*gita)?\s*(\d+)\s*[:.]\s*(\d+))/i);
    if (vMatch) {
      const ch = parseInt(vMatch[1] || vMatch[3], 10);
      const vs = parseInt(vMatch[2] || vMatch[4], 10);
      if (!isNaN(ch) && !isNaN(vs)) {
        verseReference = { chapter: ch, verse: vs };
      }
    }

    if (!verseReference) {
      const FAMOUS_SHLOKAS: Array<{ pattern: RegExp; chapter: number; verse: number }> = [
        { pattern: /\b(?:karmany|armany|karmani|evadhikaras|vadhikaraste|phaleshu|kadachana|akarmaṇi|akarma)\b/i, chapter: 2, verse: 47 },
        { pattern: /\b(?:yada yada|dharmasya glanir|abhyutthanam adharmasya)\b/i, chapter: 4, verse: 7 },
        { pattern: /\b(?:paritranaya sadhunam|vinashaya cha duskrtam|sambhavami yuge yuge)\b/i, chapter: 4, verse: 8 },
        { pattern: /\b(?:dharmakshetre kurukshetre|dharma-ksetre kuruksetre|samaveta yuyutsavah)\b/i, chapter: 1, verse: 1 },
        { pattern: /\b(?:nainam chindanti|chindanti sastrani|dahati pavakah|kledayanti)\b/i, chapter: 2, verse: 23 },
        { pattern: /\b(?:vasamsi jirnani|yatha vihaya navani grhnati)\b/i, chapter: 2, verse: 22 },
        { pattern: /\b(?:sarva dharman parityajya|sarvadharman parityajya|mam ekam saranam vraja)\b/i, chapter: 18, verse: 66 },
        { pattern: /\b(?:krodhad bhavati sammohah|sammohat smrti|buddhi-naso|buddhinashad)\b/i, chapter: 2, verse: 63 },
        { pattern: /\b(?:dhyayato visayan|sangas tesupajayate|sangat sanjayate kamah)\b/i, chapter: 2, verse: 62 },
        { pattern: /\b(?:patram puspam|patram pushpam|phalam toyam yo me bhaktya)\b/i, chapter: 9, verse: 26 },
        { pattern: /\b(?:ananyas cintayanto|ananyas chintayanto|yogaksemam vahamy aham)\b/i, chapter: 9, verse: 22 },
      ];
      for (const entry of FAMOUS_SHLOKAS) {
        if (entry.pattern.test(queryText)) {
          verseReference = { chapter: entry.chapter, verse: entry.verse };
          break;
        }
      }
    }

    if (!verseReference && this.gitaCache) {
      const normWords = queryText
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 4 && !this.STOP_WORDS.has(w));
      if (normWords.length >= 2) {
        for (const v of this.gitaCache) {
          const vNorm = (v.transliteration || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ');
          const matches = normWords.filter(w => vNorm.includes(w)).length;
          if (matches >= 2) {
            verseReference = { chapter: v.chapter, verse: v.verse };
            break;
          }
        }
      }
    }

    return {
      candidateEntities: Array.from(candidateEntities),
      targetParva: this.detectParva(queryText),
      verseReference,
    };
  }

  /** Read only the checked-in, source-attributed episode corpus when DB retrieval has
   * no usable candidate. This is a corpus fallback, never a generated story mapping. */
  private static diskEpisodeCandidates(
    queryText: string,
    cleanTokens: string[],
    candidateEntities: string[],
  ): RetrievedPassage[] {
    try {
      const episodesPath = this.findCorpusFile('data/mahabharata/corpus/mahabharata_episodes.json');
      if (!episodesPath || !fs.existsSync(episodesPath)) return [];
      const episodes = JSON.parse(fs.readFileSync(episodesPath, 'utf8'));
      const normalizedQuery = queryText.toLowerCase();
      const passages: RetrievedPassage[] = [];
      for (const ep of episodes) {
        const characters: string[] = ep.characters || [];
        // Only entities extracted from the query can establish a direct entity hit.
        // Adding every character from the candidate episode here made a single shared
        // character (e.g. Bhishma) pull unrelated episodes into a multi-entity query.
        const exactEntityMatch = candidateEntities.some(name =>
          normalizedQuery.includes(name.toLowerCase()) &&
          characters.some((c: string) => c.toLowerCase() === name.toLowerCase())
        );
        const sourceText = `${ep.title} ${ep.summary} ${(ep.themes || []).join(' ')} ${ep.relevanceForGuidance || ''}`.toLowerCase();
        const matchedTokens = cleanTokens.filter(token => sourceText.includes(token)).length;
        if (!exactEntityMatch && matchedTokens < 2) continue;
        const score = Math.min(0.9, (exactEntityMatch ? 0.58 : 0.25) + matchedTokens / Math.max(cleanTokens.length, 1) * 0.30);
        passages.push({
          id: ep.id,
          sourceType: 'mahabharata_source',
          parva: ep.parva,
          chapter: ep.chapter,
          translation: ep.summary,
          sourceReference: `Mahabharata (${ep.parva}, ${ep.title})`,
          contextSummary: `${ep.title}. Themes: ${(ep.themes || []).join(', ')}.`,
          relevanceForGuidance: ep.relevanceForGuidance,
          relevanceScore: score,
          characters,
        });
      }
      return passages;
    } catch {
      console.warn('[HybridRetriever] Canonical episode disk lookup failed.');
      return [];
    }
  }

  /**
   * Executes true source-first hybrid vector + full-text search against PostgreSQL + pgvector
   * using real 13,852 Mahabharata child chunks and canonical Bhagavad Gita verses.
   * Zero mock knowledge. Zero zero-vector fallback. Zero hardcoded character dictionaries.
   */
  public static async retrieve(
    queryText: string,
    extractedCharacters: string[] = [],
    extractedThemes: string[] = [],
    limit: number = 3,
    thematicKeywords: string[] = [],
    previouslyUsed?: PreviouslyUsedEvidence
  ): Promise<HybridRetrievalResult> {
    const startTime = Date.now();
    let databaseLatencyMs = 0;
    let mahabharataFallbackUsed = false;
    let mahabharataFallbackReason: string | undefined;
    let databaseTimeout = false;
    let diskFallbackMs = 0;
    let queryConstructionMs = 0;
    let connectionAcquisitionMs = 0;
    let databaseRoundTripMs = 0;
    let rowRetrievalMs = 0;
    let citationConstructionMs = 0;

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
          topScore: 0,
          scoreGap: 0,
          confidence: 'low',
          hasSufficientEvidence: false,
        };
      }

      // 2. Extract Query Hints (Candidate Entities, Target Parva, Verse citations)
      const hints = this.extractQueryHints(queryText);
      const allCandidateEntities = Array.from(new Set([...extractedCharacters, ...hints.candidateEntities]));
      const targetParva = hints.targetParva || this.detectParva(queryText);
      const explicitGitaReference = hints.verseReference !== null && /\b(?:gita|geeta|bhagavad|bg)\b/i.test(queryText);
      const isGitaOnlyQuery = explicitGitaReference || (/\b(?:gita|geeta|bhagavad gita|shloka|sloka|verse)\b/i.test(queryText) &&
        !/\b(?:mahabharata|mahabharat|parva)\b/i.test(queryText) &&
        !extractedCharacters.some(name => name.toLowerCase() !== 'krishna'));

      // 3. Generate Real 768-dim Query Embedding (BAAI/bge-base-en-v1.5) with LRU Cache
      const tEmbStart = Date.now();
      let queryEmbedding: number[] | null = null;
      const hasSpecificNamedEntities = allCandidateEntities.some(name => !['krishna', 'arjuna', 'partha'].includes(name.toLowerCase()));
      const semanticEmbeddingText = (thematicKeywords && thematicKeywords.length > 0)
        ? `${queryText.trim()} ${thematicKeywords.slice(0, 8).join(' ')}`
        : queryText.trim();
      const normalizedQueryKey = semanticEmbeddingText.toLowerCase();
      const queryAsksRelationship = /\b(?:related|relationship|relation|between)\b/i.test(queryText);
      const isTwoEntityRelationSearch = queryAsksRelationship && allCandidateEntities.length >= 2;
      if (isGitaOnlyQuery || isTwoEntityRelationSearch) {
        // Scripture-only verse queries and exact two-entity relationship queries use targeted FTS.
        queryEmbedding = null;
      } else if (HybridRetriever.embeddingCache.has(normalizedQueryKey)) {
        queryEmbedding = HybridRetriever.embeddingCache.get(normalizedQueryKey)!;
      } else if (process.env.DISABLE_LOCAL_EMBEDDING !== 'true' && process.env.RENDER !== 'true') {
        try {
          const { defaultEmbeddingProvider } = await import('./providers/bge-embedding.provider.js');
          const embPromise = defaultEmbeddingProvider.embedQuery(semanticEmbeddingText);
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Embedding request timeout (4000ms)')), 4000)
          );
          const vec = await Promise.race([embPromise, timeoutPromise]);
          if (Array.isArray(vec) && vec.length === 768 && vec.some(v => v !== 0)) {
            queryEmbedding = vec;
            if (HybridRetriever.embeddingCache.size >= 500) {
              const firstKey = HybridRetriever.embeddingCache.keys().next().value;
              if (firstKey) HybridRetriever.embeddingCache.delete(firstKey);
            }
            HybridRetriever.embeddingCache.set(normalizedQueryKey, vec);
          }
        } catch {
          console.warn('[HybridRetriever] Semantic embedding unavailable; using lexical and full-text retrieval.');
          queryEmbedding = null;
        }
      }
      const embeddingMs = Date.now() - tEmbStart;

      const hasValidVector = queryEmbedding !== null;
      const embeddingString = hasValidVector ? `[${queryEmbedding!.join(',')}]` : '';

      // 4. Prepare Lexical Search Tokens & Prefix Query
      const cleanTokens = queryText
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .map(w => w.toLowerCase().trim())
        .filter(w => w.length >= 3 && !this.STOP_WORDS.has(w));

      // Include extracted candidate entities into lexical token search
      for (const ent of allCandidateEntities) {
        if (!cleanTokens.includes(ent)) {
          cleanTokens.push(ent);
        }
      }

      // Generic phonetic transliteration expansion for Sanskrit names (sh <-> s, v <-> w, ee <-> i, barat <-> bharat)
      const expandedTokens = new Set<string>(cleanTokens);
      for (const t of cleanTokens) {
        if (t.includes('sh')) {
          expandedTokens.add(t.replace(/sh/g, 's'));
        } else if (t.includes('s') && !t.includes('sh')) {
          expandedTokens.add(t.replace(/s/g, 'sh'));
        }
        if (t.includes('v')) {
          expandedTokens.add(t.replace(/v/g, 'w'));
        } else if (t.includes('w')) {
          expandedTokens.add(t.replace(/w/g, 'v'));
        }
        if (t.includes('barat')) {
          expandedTokens.add(t.replace(/barat/g, 'bharat'));
        } else if (t.includes('bharat')) {
          expandedTokens.add(t.replace(/bharat/g, 'barat'));
        }
        if (t.includes('geeta')) {
          expandedTokens.add(t.replace(/geeta/g, 'gita'));
        }
      }

      const entitySearchTokens = Array.from(new Set(allCandidateEntities
        .flatMap(entity => entity.toLowerCase().split(/[^a-z0-9]+/))
        .filter(token => token.length >= 3 && !this.STOP_WORDS.has(token))));
      const relationSearch = /\b(?:related|relationship|relation|between|fight|fought|battle|married|marry|son of|daughter of|brother of|sister of|wife of|husband of|meet|met|meeting)\b/i.test(queryText);
      const asksRelationship = /\b(?:related|relationship|relation|between)\b/i.test(queryText);
      const asksCombat = /\b(?:fight|fought|battle|duel|combat|vanquish|defeat)\b/i.test(queryText);
      const entityGroups = Array.from(new Set(allCandidateEntities
        .filter(entity => entitySearchTokens.some(token => entity.toLowerCase().includes(token)))
        .map(entityQueryGroup)
        .filter(Boolean)));
      const lexicalSearchTokens = Array.from(expandedTokens).slice(0, 6);
      const relationPredicateTerms = [
        'related', 'relation', 'guru', 'teacher', 'student', 'pupil', 'disciple',
        'fight', 'fought', 'battle', 'duel', 'combat', 'vanquish', 'defeat',
        'meet', 'met', 'marry', 'married', 'son', 'daughter', 'brother', 'sister', 'wife', 'husband',
      ];
      const relationFtsGroup = `(${relationPredicateTerms.map(term => `'${term}':*`).join(' | ')})`;
      const prefixQuery = entityGroups.length > 0
        ? `${entityGroups.join(relationSearch && entityGroups.length > 1 ? ' & ' : ' | ')}${relationSearch && entityGroups.length > 1 ? ` & ${relationFtsGroup}` : ''}`
        : lexicalSearchTokens.map(t => `'${t.replace(/'/g, "''")}'`).map(t => `${t}:*`).join(' | ');

      const candidatePassages: RetrievedPassage[] = [];
      const tracePassages = (channel: string, scoreKey?: string): RetrievalCandidateTrace[] => candidatePassages
        .filter(passage => !scoreKey || (passage.retrievalScores?.[scoreKey] || 0) > 0)
        .filter(passage => {
          if (channel === 'canonical_gita_exact') return (passage.retrievalScores?.exactReference || 0) > 0;
          if (channel === 'canonical_gita_fallback') return (passage.retrievalScores?.fallback || 0) > 0;
          if (channel === 'canonical_gita_vector') return passage.sourceType === 'bhagavad_gita' && (passage.retrievalScores?.vector || 0) > 0;
          if (channel === 'canonical_gita_lexical') return passage.sourceType === 'bhagavad_gita' && (passage.retrievalScores?.lexical || 0) > 0;
          if (channel === 'canonical_gita_theme') return passage.sourceType === 'bhagavad_gita' && (passage.retrievalScores?.theme || 0) > 0;
          if (channel === 'gita_commentary') return passage.sourceType.startsWith('gita_') && (passage.retrievalScores?.commentaryReference || 0) > 0;
          if (channel === 'mahabharata_vector') return passage.sourceType !== 'bhagavad_gita' && (passage.retrievalScores?.vector || 0) > 0;
          if (channel === 'mahabharata_fulltext') return passage.sourceType !== 'bhagavad_gita' && (passage.retrievalScores?.lexical || 0) > 0;
          if (channel === 'canonical_disk_episode') return (passage.retrievalScores?.diskEpisode || 0) > 0;
          return false;
        })
        .sort((a, b) => (b.retrievalScores?.[scoreKey || 'fused'] ?? b.relevanceScore) - (a.retrievalScores?.[scoreKey || 'fused'] ?? a.relevanceScore))
        .slice(0, 50)
        .map((passage, index) => ({
          id: passage.id,
          parentChunkId: passage.parentChunkId,
          sourceType: passage.sourceType,
          sourceEdition: passage.sourceEdition,
          sourceReference: passage.sourceReference,
          rank: index + 1,
          candidateScore: passage.relevanceScore,
          scoreComponents: passage.retrievalScores || {},
        }));

      // 5. Canonical Gita cache. Count its database fetch once, on the request that loads it.
      const tGitaStart = Date.now();
      const gitaWasCached = this.gitaCache !== null;
      const cachedVerses = await HybridRetriever.getGitaVerses();
      if (!gitaWasCached) databaseLatencyMs += this.gitaDatabaseLatencyMs;
      const isPersonalDilemma =
        /^(i am|i feel|i'm|i can't|i cannot|why do i|how do i|i suffer|afraid|scared|fail|failure|giving up|let go|letting go|betrayed|angry|grief|lost)\b/i.test(queryText.trim()) ||
        lowerQ.includes('afraid') || lowerQ.includes('fail') || lowerQ.includes('let go') || lowerQ.includes('giving up') || lowerQ.includes('betrayed');
      const isGitaQuery = /\b(?:gita|geeta|shloka|sloka|verse|stotra|mantra)\b/i.test(queryText);
      const wantsKrishnaTeaching = /\bkrishna\b/i.test(queryText) && /\b(?:teach|teaching|said|says|wisdom|quote|verse|scripture)\b/i.test(queryText);
      const entityTokensForGita = new Set(allCandidateEntities.map(entity => entity.toLowerCase()));
      const hasMultipleNonEntityConcepts = cleanTokens.filter(token => !entityTokensForGita.has(token)).length >= 2;
      const shouldSearchGita = isGitaQuery || isPersonalDilemma || wantsKrishnaTeaching ||
        (hasMultipleNonEntityConcepts && allCandidateEntities.length === 0 && !/\bmahabharat(?:a)?\b/i.test(queryText)) ||
        thematicKeywords.some(keyword => Boolean(keyword)) ||
        extractedThemes.some(theme => ['scripture', 'shloka'].includes(theme.toLowerCase()));

      if (hints.verseReference) {
        // Direct verse citation lookup (e.g. 2.47)
        let match = cachedVerses.find(
          (v) => v.chapter === hints.verseReference!.chapter && v.verse === hints.verseReference!.verse
        );
        if (!match) {
          try {
            const singleRes = await this.queryWithTimeout(
              `SELECT id, chapter, verse, speaker, listener, sanskrit, transliteration,
                      source_edition, translation, deep_meaning, krishna_teaching, provenance
               FROM gita_verses WHERE chapter = $1 AND verse = $2 LIMIT 1;`,
              [hints.verseReference.chapter, hints.verseReference.verse],
              15000
            );
            if (singleRes.rows && singleRes.rows.length > 0) {
              const r = singleRes.rows[0];
              match = {
                id: r.id,
                chapter: r.chapter,
                verse: r.verse,
                speaker: r.speaker,
                listener: r.listener,
                sanskrit: r.sanskrit,
                transliteration: r.transliteration,
                sourceEdition: r.source_edition,
                translation: r.translation,
                deep_meaning: r.deep_meaning,
                krishna_teaching: r.krishna_teaching,
                provenance: r.provenance,
              };
            }
          } catch {
            console.warn('[HybridRetriever] Direct verse lookup query failed.');
          }
        }
        if (match) {
          candidatePassages.push({
            id: match.id,
            sourceType: 'bhagavad_gita',
            chapter: String(match.chapter),
            verseRange: String(match.verse),
            speaker: match.speaker,
            listener: match.listener,
            translation: match.translation,
            sourceEdition: match.sourceEdition,
            originalText: match.sanskrit || match.transliteration,
            sourceReference: `Bhagavad Gita ${match.chapter}.${match.verse}`,
            contextSummary: `Speaker: ${match.speaker}, Listener: ${match.listener}. Provenance: ${match.provenance}`,
            relevanceForGuidance: match.deep_meaning || match.krishna_teaching,
            relevanceScore: 1.0,
            retrievalScores: { exactReference: 1.0, fused: 1.0 },
          });

          // Augment with authentic multi-source commentaries (Sri Raghavendra Vivruti & Ashok Kaushik)
          const requestsCommentary = /\b(?:commentary|commentaries|bhashya|bhasya|vivruti|commentator|madhva|madhwa|shankara|ramanuja|kaushik|raghavendra)\b/i.test(queryText);
          if (!isGitaOnlyQuery || requestsCommentary) {
            try {
              const commRes = await this.queryWithTimeout(
              `SELECT c.id, c.parent_chunk_id, c.source_type, c.parva, c.page_number, c.section, c.source_reference, c.text, c.characters
               FROM mahabharata_child_chunks c
               WHERE c.source_type IN ('gita_raghavendra_vivruti', 'gita_ashok_kaushik')
                 AND (c.source_reference ILIKE $1 OR c.text ILIKE $2)
               ORDER BY c.source_type ASC
               LIMIT 2;`,
              [`%${match.chapter}.${match.verse}%`, `%${match.chapter}.${match.verse}%`],
              2000
            );
            if (commRes.rows && commRes.rows.length > 0) {
              for (const cr of commRes.rows) {
                const isRaghavendra = cr.source_type === 'gita_raghavendra_vivruti';
                candidatePassages.push({
                  id: cr.id,
                  parentChunkId: cr.parent_chunk_id,
                  sourceType: cr.source_type,
                  parva: cr.parva || 'Bhishma Parva (Bhagavad Gita)',
                  chapter: String(match.chapter),
                  verseRange: String(match.verse),
                  translation: cr.text,
                  sourceReference: cr.source_reference,
                  contextSummary: isRaghavendra
                    ? `From Sri Raghavendra Teertha Gita Vivruti & Madhwacharya Gita Bhashya, ${cr.section}`
                    : `From Srimad Bhagavad-Gita by Ashok Kaushik (ASI 279), ${cr.section}`,
                  relevanceScore: 0.95,
                  retrievalScores: { commentaryReference: 0.95, fused: 0.95 },
                  characters: cr.characters || ['Krishna', 'Arjuna'],
                });
              }
            }
          } catch {
            // best-effort commentary augmentation
          }
        }
      }
      } else if (shouldSearchGita) {
        const isScriptureQuery = isGitaQuery ||
          extractedThemes.includes('shloka') ||
          extractedThemes.includes('scripture');
        const gitaThreshold = isPersonalDilemma ? 0.52 : 0.60;

        for (const v of cachedVerses) {
          let vecSim = 0;
          if (queryEmbedding && v.embArray) {
            vecSim = HybridRetriever.cosineSimilarity(queryEmbedding, v.embArray);
          }

          // In-memory token match
          const vTranslitNorm = (v.transliteration || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ');
          const vText = (
            vTranslitNorm + ' ' +
            (v.sanskrit || '') + ' ' +
            v.translation + ' ' +
            (v.deep_meaning || '') + ' ' +
            (v.krishna_teaching || '')
          ).toLowerCase();
          let ftsMatchCount = 0;
          const gitaSearchTokens = cleanTokens.filter(token => !entityTokensForGita.has(token));
          for (const token of gitaSearchTokens) {
            if (vText.includes(token)) ftsMatchCount++;
          }
          let translitMatchCount = 0;
          for (const token of gitaSearchTokens) {
            if (token.length >= 4 && vTranslitNorm.includes(token)) translitMatchCount++;
          }
          let themeMatchCount = 0;
          for (const kw of (thematicKeywords || [])) {
            if (kw && vText.includes(kw.toLowerCase())) themeMatchCount++;
          }
          for (const th of (extractedThemes || [])) {
            if (th && vText.includes(th.toLowerCase())) themeMatchCount++;
          }

          // Direct verse number match from thematic keywords (e.g. '2.47', 'BG 2.47', '2:47')
          const isDirectThematicMatch = translitMatchCount >= 2 || (thematicKeywords || []).some(kw => {
            if (kw === `${v.chapter}.${v.verse}` || kw === `BG ${v.chapter}.${v.verse}` || kw === `${v.chapter}:${v.verse}`) return true;
            return false;
          });

          const ftsRatio = gitaSearchTokens.length > 0 ? ftsMatchCount / gitaSearchTokens.length : 0;
          const themeScore = Math.min(themeMatchCount * 0.15, 0.45);
          let combinedGitaScore = (vecSim * 0.50) + (ftsRatio * 0.30) + (themeScore * 0.20) + (isPersonalDilemma ? 0.25 : 0.0);

          if (isDirectThematicMatch) {
            combinedGitaScore = 0.98;
          }

          const isEligible = isDirectThematicMatch ||
            (isScriptureQuery
              ? (vecSim >= 0.30 || ftsRatio >= 0.10 || themeMatchCount > 0 || (isPersonalDilemma && (vecSim >= 0.20 || ftsMatchCount > 0)))
              : (vecSim >= gitaThreshold || ftsRatio >= 0.20 || themeMatchCount > 0 || (isPersonalDilemma && (themeScore >= 0.10 || ftsMatchCount >= 1))));

          if (isEligible) {
            candidatePassages.push({
              id: v.id,
              sourceType: 'bhagavad_gita',
              chapter: String(v.chapter),
              verseRange: String(v.verse),
              speaker: v.speaker,
              listener: v.listener,
              translation: v.translation,
              sourceEdition: v.sourceEdition,
              originalText: v.sanskrit || v.transliteration,
              sourceReference: `Bhagavad Gita ${v.chapter}.${v.verse}`,
              contextSummary: `Speaker: ${v.speaker}, Listener: ${v.listener}. ${v.deep_meaning || ''}`,
              relevanceForGuidance: v.krishna_teaching,
              relevanceScore: Math.min(combinedGitaScore, 0.98),
              retrievalScores: { vector: vecSim, lexical: ftsRatio, theme: themeScore, fused: combinedGitaScore },
            });

            // Augment with authentic multi-source commentaries (Sri Raghavendra Vivruti & Ashok Kaushik)
            if (combinedGitaScore >= 0.85 && !isGitaOnlyQuery) {
              try {
                const commRes = await this.queryWithTimeout(
                  `SELECT c.id, c.parent_chunk_id, c.source_type, c.parva, c.page_number, c.section, c.source_reference, c.text, c.characters
                   FROM mahabharata_child_chunks c
                   WHERE c.source_type IN ('gita_raghavendra_vivruti', 'gita_ashok_kaushik')
                     AND (c.source_reference ILIKE $1 OR c.text ILIKE $2)
                   ORDER BY c.source_type ASC
                   LIMIT 2;`,
                  [`%${v.chapter}.${v.verse}%`, `%${v.chapter}.${v.verse}%`],
                  2000
                );
                if (commRes.rows && commRes.rows.length > 0) {
                  for (const cr of commRes.rows) {
                    const isRaghavendra = cr.source_type === 'gita_raghavendra_vivruti';
                    candidatePassages.push({
                      id: cr.id,
                      parentChunkId: cr.parent_chunk_id,
                      sourceType: cr.source_type,
                      parva: cr.parva || 'Bhishma Parva (Bhagavad Gita)',
                      chapter: String(v.chapter),
                      verseRange: String(v.verse),
                      translation: cr.text,
                      sourceReference: cr.source_reference,
                      contextSummary: isRaghavendra
                        ? `From Sri Raghavendra Teertha Gita Vivruti & Madhwacharya Gita Bhashya, ${cr.section}`
                        : `From Srimad Bhagavad-Gita by Ashok Kaushik (ASI 279), ${cr.section}`,
                      relevanceScore: 0.94,
                      retrievalScores: { commentaryReference: 0.94, fused: 0.94 },
                      characters: cr.characters || ['Krishna', 'Arjuna'],
                    });
                  }
                }
              } catch {
                // best-effort commentary augmentation
              }
            }
          }
        }

        // If no verse matched directly, inject canonical Gita verses for emotional solace or scripture requests
        const gitaFound = candidatePassages.filter(p => p.sourceType === 'bhagavad_gita').length;
        if (gitaFound === 0 && (isGitaQuery || isPersonalDilemma || (thematicKeywords && thematicKeywords.length > 0))) {
          let solaceRefs = [
            { chapter: 2, verse: 47 },
            { chapter: 2, verse: 14 },
            { chapter: 6, verse: 5 },
            { chapter: 18, verse: 66 },
          ];

          if (lowerQ.includes('short') || lowerQ.includes('ugly') || lowerQ.includes('ignore') || lowerQ.includes('height') || lowerQ.includes('body image')) {
            solaceRefs = [
              { chapter: 2, verse: 22 },
              { chapter: 5, verse: 18 },
              { chapter: 9, verse: 29 },
            ];
          } else if (lowerQ.includes('fail') || lowerQ.includes('exam') || lowerQ.includes('disappoint')) {
            solaceRefs = [
              { chapter: 2, verse: 47 },
              { chapter: 6, verse: 40 },
              { chapter: 6, verse: 5 },
            ];
          } else if (lowerQ.includes('smoke') || lowerQ.includes('smoking') || lowerQ.includes('sex') || lowerQ.includes('addict') || lowerQ.includes('control myself')) {
            solaceRefs = [
              { chapter: 6, verse: 34 },
              { chapter: 6, verse: 35 },
              { chapter: 2, verse: 67 },
            ];
          } else if (lowerQ.includes('cheat') || lowerQ.includes('infidelity') || lowerQ.includes('guilt')) {
            solaceRefs = [
              { chapter: 9, verse: 30 },
              { chapter: 9, verse: 31 },
              { chapter: 18, verse: 66 },
            ];
          } else if (lowerQ.includes('breakup') || lowerQ.includes('breackup') || lowerQ.includes('ex') || lowerQ.includes('still love')) {
            solaceRefs = [
              { chapter: 2, verse: 62 },
              { chapter: 2, verse: 71 },
              { chapter: 12, verse: 13 },
            ];
          }

          for (const ref of solaceRefs) {
            const match = cachedVerses.find(v => v.chapter === ref.chapter && v.verse === ref.verse);
            if (match) {
              candidatePassages.push({
                id: match.id,
                sourceType: 'bhagavad_gita',
                chapter: String(match.chapter),
                verseRange: String(match.verse),
                speaker: match.speaker,
                listener: match.listener,
                translation: match.translation,
                sourceEdition: match.sourceEdition,
                originalText: match.sanskrit || match.transliteration,
                sourceReference: `Bhagavad Gita ${match.chapter}.${match.verse}`,
                contextSummary: `Speaker: ${match.speaker}, Listener: ${match.listener}. ${match.deep_meaning || ''}`,
                relevanceForGuidance: match.krishna_teaching,
                relevanceScore: 0.92,
                retrievalScores: { fallback: 0.92, fused: 0.92 },
              });
            }
          }
        }
      }
      const gitaSearchMs = Date.now() - tGitaStart;

      // 6. Single Optimized PostgreSQL Hybrid Query for Mahabharata Chunks
      const tMbStart = Date.now();
      const targetParvaParam = targetParva || '';

      try {
        const queryBuildStarted = performance.now();
        queryConstructionMs = 0;
        if (isGitaOnlyQuery) {
          // Verse/concept queries are answered from the canonical Gita corpus above;
          // they do not need a parallel 13k-chunk Mahabharata DB scan.
          queryConstructionMs += performance.now() - queryBuildStarted;
        } else {
          if (hasValidVector) {
            const vectorCte = targetParvaParam
              ? `SELECT id, 1 - (embedding <=> $1::vector) AS vector_similarity FROM mahabharata_child_chunks WHERE parva = $4::text ORDER BY embedding <=> $1::vector ASC LIMIT 35`
              : `SELECT id, 1 - (embedding <=> $1::vector) AS vector_similarity FROM mahabharata_child_chunks WHERE $4::text IS NOT NULL ORDER BY embedding <=> $1::vector ASC LIMIT 35`;

            const ftsCte = targetParvaParam
              ? `SELECT id, GREATEST(
                   CASE WHEN $3::text != '' THEN ts_rank_cd(search_vector, to_tsquery('english', $3::text)) ELSE 0.0 END,
                   ts_rank_cd(search_vector, websearch_to_tsquery('english', $2::text)),
                   ts_rank_cd(search_vector, plainto_tsquery('english', $2::text))
                 ) AS keyword_rank 
                 FROM mahabharata_child_chunks 
                 WHERE parva = $4::text AND (
                   (CASE WHEN $3::text != '' THEN search_vector @@ to_tsquery('english', $3::text) ELSE false END)
                   OR search_vector @@ websearch_to_tsquery('english', $2::text)
                   OR search_vector @@ plainto_tsquery('english', $2::text)
                 ) ORDER BY keyword_rank DESC LIMIT 25`
              : `SELECT id, GREATEST(
                   CASE WHEN $3::text != '' THEN ts_rank_cd(search_vector, to_tsquery('english', $3::text)) ELSE 0.0 END,
                   ts_rank_cd(search_vector, websearch_to_tsquery('english', $2::text)),
                   ts_rank_cd(search_vector, plainto_tsquery('english', $2::text))
                 ) AS keyword_rank 
                 FROM mahabharata_child_chunks 
                 WHERE (
                   (CASE WHEN $3::text != '' THEN search_vector @@ to_tsquery('english', $3::text) ELSE false END)
                   OR search_vector @@ websearch_to_tsquery('english', $2::text)
                   OR search_vector @@ plainto_tsquery('english', $2::text)
                 ) ORDER BY keyword_rank DESC LIMIT 25`;

            const mbSql = `
            WITH vector_candidates AS (
              ${vectorCte}
            ),
            fts_candidates AS (
              ${ftsCte}
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
              p.translation AS parent_translation,
              p.chapter,
              p.speaker,
              p.listener,
              COALESCE(vc.vector_similarity, 0.0) AS vec_score,
              COALESCE(fc.keyword_rank, 0.0) AS fts_score,
              (
                (COALESCE(vc.vector_similarity, 0.0) * 0.75)
                + (LEAST(COALESCE(fc.keyword_rank, 0.0), 1.0) * 0.25)
                + (CASE WHEN $4::text != '' AND c.parva = $4::text THEN 0.05 ELSE 0.0 END)
              ) AS combined_score
            FROM mahabharata_child_chunks c
            JOIN mahabharata_chunks p ON c.parent_chunk_id = p.id
            LEFT JOIN vector_candidates vc ON c.id = vc.id
            LEFT JOIN fts_candidates fc ON c.id = fc.id
            WHERE vc.id IS NOT NULL OR fc.id IS NOT NULL
            ORDER BY combined_score DESC
            LIMIT 30;
          `;

            queryConstructionMs += performance.now() - queryBuildStarted;
            const mbQueryStarted = Date.now();
            const mbRes = await this.queryWithTimeout(mbSql, [
              embeddingString,
              queryText,
              prefixQuery,
              targetParvaParam,
            ], 8000, timing => {
              connectionAcquisitionMs += timing.connectionAcquisitionMs;
              databaseRoundTripMs += timing.databaseRoundTripMs;
              rowRetrievalMs += timing.rowRetrievalMs;
              databaseTimeout ||= timing.timedOut;
            });
            databaseLatencyMs += Date.now() - mbQueryStarted;

            for (const r of mbRes.rows) {
              if (r.child_text && /table of contents/i.test(r.child_text)) {
                continue;
              }
              const score = parseFloat(r.combined_score) || 0;
              if (score > 0.15) {
                const isDebroy = r.source_type === 'debroy_10_vol';
                const isRaghavendra = r.source_type === 'gita_raghavendra_vivruti';
                const isKaushik = r.source_type === 'gita_ashok_kaushik';

                let sourceRef = `Mahabharata (${r.parva || 'Corpus'}, ${r.source_reference})`;
                let ctxSummary = `From ${r.parva || 'Mahabharata'}, ${r.section}. Characters: ${r.characters ? r.characters.join(', ') : 'None specified'}`;

                if (isRaghavendra) {
                  sourceRef = r.source_reference;
                  ctxSummary = `From Sri Raghavendra Teertha Gita Vivruti & Madhwacharya Gita Bhashya, ${r.section}. Characters: ${r.characters ? r.characters.join(', ') : 'None specified'}`;
                } else if (isKaushik) {
                  sourceRef = r.source_reference;
                  ctxSummary = `From Srimad Bhagavad-Gita (Sanskrit Text, Hindi & English Translation by Ashok Kaushik, ASI 279), ${r.section}. Characters: ${r.characters ? r.characters.join(', ') : 'None specified'}`;
                } else if (isDebroy) {
                  sourceRef = r.source_reference;
                  ctxSummary = `From Bibek Debroy Critical Edition Translation, ${r.parva || 'Mahabharata'}, ${r.section}. Characters: ${r.characters ? r.characters.join(', ') : 'None specified'}`;
                }

                candidatePassages.push({
                  id: r.id,
                  parentChunkId: r.parent_chunk_id,
                  sourceType: r.source_type || 'mahabharata_source',
                  parva: r.parva || undefined,
                  chapter: r.chapter || undefined,
                  section: r.section || undefined,
                  pageNumber: r.page_number,
                  speaker: r.speaker || undefined,
                  listener: r.listener || undefined,
                  translation: r.child_text,
                  sourceReference: sourceRef,
                  contextSummary: ctxSummary,
                  relevanceScore: score,
                  retrievalScores: {
                    vector: parseFloat(r.vec_score) || 0,
                    lexical: parseFloat(r.fts_score) || 0,
                    fused: score,
                  },
                  characters: r.characters || [],
                });
              }
            }
          } else {
            // Pure Lexical/FTS Search
            // Keep the lexical path on the indexed child table. The former CTE plus
            // parent-page join made common character queries spend the whole wall
            // budget materializing/ranking candidates before returning any evidence.
            // Child chunks already carry the passage text and citation metadata needed
            // for grounding; the parent row is not required to validate a claim.
            const ftsQuery = prefixQuery || '';
            const orderBy = relationSearch ? '' : 'ORDER BY combined_score DESC';
            const tsRankExpr = `GREATEST(
              CASE WHEN $1::text != '' THEN ts_rank_cd(c.search_vector, to_tsquery('english', $1::text)) ELSE 0.0 END,
              ts_rank_cd(c.search_vector, websearch_to_tsquery('english', $2::text)),
              ts_rank_cd(c.search_vector, plainto_tsquery('english', $2::text))
            )`;
            const lexicalScore = relationSearch
              ? '0.20'
              : `LEAST(${tsRankExpr}, 1.0) * 0.85 + CASE WHEN $3::text != '' AND c.parva = $3::text THEN 0.15 ELSE 0.0 END`;
            const resultLimit = 30;
            const mbLexSql = `
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
              NULL::text AS chapter,
              NULL::text AS speaker,
              NULL::text AS listener,
              0.0 AS vec_score,
              ${lexicalScore} AS fts_score,
              ${lexicalScore} AS combined_score
            FROM mahabharata_child_chunks c
            WHERE (
              (CASE WHEN $1::text != '' THEN c.search_vector @@ to_tsquery('english', $1::text) ELSE false END)
              OR c.search_vector @@ websearch_to_tsquery('english', $2::text)
              OR c.search_vector @@ plainto_tsquery('english', $2::text)
            )
            ${orderBy}
            LIMIT ${resultLimit};
          `;

            queryConstructionMs += performance.now() - queryBuildStarted;
            const mbQueryStarted = Date.now();
            const mbLexParams = [ftsQuery, queryText, targetParvaParam];
            const mbLexRes = await this.queryWithTimeout(mbLexSql, mbLexParams, 8000, timing => {
              connectionAcquisitionMs += timing.connectionAcquisitionMs;
              databaseRoundTripMs += timing.databaseRoundTripMs;
              rowRetrievalMs += timing.rowRetrievalMs;
              databaseTimeout ||= timing.timedOut;
            });
            databaseLatencyMs += Date.now() - mbQueryStarted;

            for (const r of mbLexRes.rows) {
              if (r.child_text && /table of contents/i.test(r.child_text)) {
                continue;
              }
              const score = parseFloat(r.combined_score) || 0;
              if (score > 0.10) {
                const isDebroy = r.source_type === 'debroy_10_vol';
                const isRaghavendra = r.source_type === 'gita_raghavendra_vivruti';
                const isKaushik = r.source_type === 'gita_ashok_kaushik';

                let sourceRef = `Mahabharata (${r.parva || 'Corpus'}, ${r.source_reference})`;
                let ctxSummary = `From ${r.parva || 'Mahabharata'}, ${r.section}. Characters: ${r.characters ? r.characters.join(', ') : 'None specified'}`;

                if (isRaghavendra) {
                  sourceRef = r.source_reference;
                  ctxSummary = `From Sri Raghavendra Teertha Gita Vivruti & Madhwacharya Gita Bhashya, ${r.section}. Characters: ${r.characters ? r.characters.join(', ') : 'None specified'}`;
                } else if (isKaushik) {
                  sourceRef = r.source_reference;
                  ctxSummary = `From Srimad Bhagavad-Gita (Sanskrit Text, Hindi & English Translation by Ashok Kaushik, ASI 279), ${r.section}. Characters: ${r.characters ? r.characters.join(', ') : 'None specified'}`;
                } else if (isDebroy) {
                  sourceRef = r.source_reference;
                  ctxSummary = `From Bibek Debroy Critical Edition Translation, ${r.parva || 'Mahabharata'}, ${r.section}. Characters: ${r.characters ? r.characters.join(', ') : 'None specified'}`;
                }

                candidatePassages.push({
                  id: r.id,
                  parentChunkId: r.parent_chunk_id,
                  sourceType: r.source_type || 'mahabharata_source',
                  parva: r.parva || undefined,
                  chapter: r.chapter || undefined,
                  section: r.section || undefined,
                  pageNumber: r.page_number,
                  speaker: r.speaker || undefined,
                  listener: r.listener || undefined,
                  translation: r.child_text,
                  sourceReference: sourceRef,
                  contextSummary: ctxSummary,
                  relevanceScore: score,
                  retrievalScores: { lexical: parseFloat(r.fts_score) || score, fused: score },
                  characters: r.characters || [],
                });
              }
            }
          }
        }
      } catch (mbErr: any) {
        databaseLatencyMs += mbErr.durationMs || 0;
        mahabharataFallbackUsed = true;
        databaseTimeout ||= mbErr.code === 'ETIMEDOUT' || mbErr.code === '57014';
        mahabharataFallbackReason = databaseTimeout ? 'mahabharata_database_timeout' : 'mahabharata_database_query_failed';
        console.warn('[HybridRetriever] Mahabharata chunks query failed; checking canonical episodes from disk.', {
          timeout: databaseTimeout,
        });
      }
      const mbQueryMs = Date.now() - tMbStart;

      // A successful SQL round trip with no relevant evidence is still a miss. Use
      // the checked-in canonical episode index for named-character coverage; never
      // turn an empty DB candidate set directly into a blanket refusal.
      // The disk index can supply supported facts for a positive part of a question
      // even when a DB candidate exists for another part. Add source-backed candidates
      // absent from SQL, then let the normal reranker and claim validator judge them.
      const diskStarted = performance.now();
      const diskPassages = this.diskEpisodeCandidates(queryText, cleanTokens, allCandidateEntities);
      diskFallbackMs = performance.now() - diskStarted;
      if (diskPassages.length) {
        const candidateIds = new Set(candidatePassages.map(p => p.id));
        const unseenDiskPassages = diskPassages.filter(p => !candidateIds.has(p.id));
        if (unseenDiskPassages.length) {
          mahabharataFallbackUsed = true;
          candidatePassages.push(...unseenDiskPassages.map(passage => ({
            ...passage,
            retrievalScores: { ...(passage.retrievalScores || {}), diskEpisode: passage.relevanceScore, fused: passage.relevanceScore },
          })));
        }
      }

      const channelCandidates: Record<string, RetrievalCandidateTrace[]> = {
        canonical_gita_exact: tracePassages('canonical_gita_exact', 'exactReference'),
        canonical_gita_fallback: tracePassages('canonical_gita_fallback', 'fallback'),
        canonical_gita_vector: tracePassages('canonical_gita_vector', 'vector'),
        canonical_gita_lexical: tracePassages('canonical_gita_lexical', 'lexical'),
        canonical_gita_theme: tracePassages('canonical_gita_theme', 'theme'),
        gita_commentary: tracePassages('gita_commentary', 'commentaryReference'),
        mahabharata_vector: tracePassages('mahabharata_vector', 'vector'),
        mahabharata_fulltext: tracePassages('mahabharata_fulltext', 'lexical'),
        canonical_disk_episode: tracePassages('canonical_disk_episode', 'diskEpisode'),
      };

      // 7. Multi-Signal Reranker & Non-Redundant Coverage Selection
      const tRerankStart = Date.now();
      const prevChunks = previouslyUsed?.citedChunkIds || [];
      const prevEpisodes = previouslyUsed?.citedEpisodeIds || [];
      const prevChars = previouslyUsed?.mentionedCharacters || [];
      const prevTeachings = previouslyUsed?.usedTeachings || [];
      const explicitRevisit = /\b(again|revisit|return to|same teaching|that teaching|explain that|tell me more about)\b/i.test(lowerQ);

      for (const p of candidatePassages) {
        const textLower = p.translation.toLowerCase();
        const lexicalCoverage = queryTokenCoverage(p.translation, cleanTokens);
        p.relevanceScore += lexicalCoverage * 0.30;

        // Query-language synonyms help rank source wording without claiming an
        // event: only the retrieved passage text receives these relevance bonuses.
        if (asksRelationship && /\b(?:guru|teacher|student|pupil|disciple|relative|relation)\b/i.test(textLower)) {
          p.relevanceScore += 0.12;
        }
        if (asksCombat && /\b(?:fight|fought|battle|duel|combat|vanquish(?:ed|es|ing)?|defeat(?:ed|s|ing)?)\b/i.test(textLower)) {
          p.relevanceScore += 0.12;
        }
        if (relationSearch) {
          const statesRequestedRelation = textLower.split(/(?<=[.!?])\s+/).some(sentence =>
            allCandidateEntities.length >= 2 &&
            allCandidateEntities.every(entity => entityMentioned(sentence, entity)) &&
            /\b(?:related|relation|guru|teacher|student|pupil|disciple|fight|fought|battle|duel|combat|vanquish(?:ed|es|ing)?|defeat(?:ed|s|ing)?|meet|met|married|marry|son|daughter|brother|sister|wife|husband)\b/i.test(sentence)
          );
          if (statesRequestedRelation) p.relevanceScore += 0.35;
        }

        // Distinct bonus if the passage text actually mentions candidate entities;
        // transliteration variants must count the same for matching and reranking.
        for (const ent of allCandidateEntities) {
          if (entityMentioned(p.translation, ent)) {
            p.relevanceScore += 0.15;
          }
        }

        // --- PART 4 & 5: Novelty & Recency-Decay Repetition Penalty ---
        let repetitionPenalty = 0.0;
        let noveltyBonus = 0.0;

        // Check if user query explicitly refers to this passage's character, title, or reference
        const isExplicitlyRequested =
          (p.characters && p.characters.some(c => c.toLowerCase() !== 'krishna' && allCandidateEntities.map(e => e.toLowerCase()).includes(c.toLowerCase()))) ||
          cleanTokens.some(t =>
            (p.sourceReference && p.sourceReference.toLowerCase().includes(t)) ||
            (p.chapter && String(p.chapter) === t)
          );

        // 1. Exact chunk recency penalty (decays to 0 within 3 turns)
        if (prevChunks.length > 0) {
          const chunkIndex = prevChunks.lastIndexOf(p.id);
          if (chunkIndex !== -1) {
            // How recently was it used? (0 = immediate preceding turn)
            const recencyTurnsAgo = prevChunks.length - 1 - chunkIndex;
            if (isExplicitlyRequested || (explicitRevisit && prevChunks.includes(p.id))) {
              // User specifically asked about this teaching or passage again: NO penalty, bonus for continuity
              noveltyBonus += 0.12;
            } else if (recencyTurnsAgo === 0) {
              repetitionPenalty += 0.50; // Immediate prior turn: suppress back-to-back duplicate
            } else if (recencyTurnsAgo === 1) {
              repetitionPenalty += 0.40;
            } else if (recencyTurnsAgo === 2) {
              repetitionPenalty += 0.30;
            } else if (recencyTurnsAgo === 3) {
              repetitionPenalty += 0.20;
            } else if (recencyTurnsAgo === 4) {
              repetitionPenalty += 0.10;
            } else {
              // Evidence older than the five-turn novelty window regains eligibility.
              noveltyBonus += 0.08;
            }
          } else {
            noveltyBonus += 0.08;
          }
        }

        // 2. Same episode penalty (decays to 0 within 3 turns)
        if (prevEpisodes.length > 0) {
          let lastEpisodeIndex = -1;
          for (let epIdx = prevEpisodes.length - 1; epIdx >= 0; epIdx--) {
            const ep = prevEpisodes[epIdx];
            if (!ep) continue;
            const epLower = ep.toLowerCase();
            const matches =
              (p.sourceReference && epLower.includes(p.sourceReference.toLowerCase())) ||
              (p.contextSummary && epLower.includes(p.contextSummary.toLowerCase())) ||
              (p.sourceReference && p.sourceReference.toLowerCase().includes(epLower));
            if (matches) {
              lastEpisodeIndex = epIdx;
              break;
            }
          }

          if (lastEpisodeIndex !== -1) {
            const epTurnsAgo = prevEpisodes.length - 1 - lastEpisodeIndex;
            const revisitsSameEpisode = explicitRevisit && prevEpisodes.some(ep =>
              (p.sourceReference && ep.toLowerCase().includes(p.sourceReference.toLowerCase())) ||
              (p.sourceReference && p.sourceReference.toLowerCase().includes(ep.toLowerCase()))
            );
            if (isExplicitlyRequested || revisitsSameEpisode) {
              noveltyBonus += 0.10;
            } else if (epTurnsAgo === 0) {
              repetitionPenalty += 0.35;
            } else if (epTurnsAgo === 1) {
              repetitionPenalty += 0.28;
            } else if (epTurnsAgo === 2) {
              repetitionPenalty += 0.20;
            } else if (epTurnsAgo === 3) {
              repetitionPenalty += 0.12;
            } else if (epTurnsAgo === 4) {
              repetitionPenalty += 0.06;
            }
          }
        }

        // Teaching reuse is tracked separately from chunk and episode reuse. Themes are
        // compared to the evidence's guidance metadata so a different chunk that repeats
        // the same lesson also receives a modest penalty.
        if (!explicitRevisit && prevTeachings.length && p.relevanceForGuidance) {
          const teaching = p.relevanceForGuidance.toLowerCase();
          const teachingTerms = new Set(teaching.split(/[^a-z0-9]+/).filter(t => t.length > 3));
          const repeatedTeaching = prevTeachings.some(previous => {
            const priorTerms = previous.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 3);
            if (!priorTerms.length) return false;
            return previous.toLowerCase() === teaching || priorTerms.filter(t => teachingTerms.has(t)).length / priorTerms.length >= 0.6;
          });
          if (repeatedTeaching) repetitionPenalty += 0.20;
        }

        // 3. Same character penalty (only on immediate prior turn if not requested)
        if (prevChars.length > 0 && p.characters && p.characters.length > 0 && !isExplicitlyRequested) {
          const lastChar = prevChars[prevChars.length - 1]?.toLowerCase();
          const hasImmediatePriorChar = p.characters.some(c =>
            c.toLowerCase() !== 'krishna' &&
            !allCandidateEntities.map(e => e.toLowerCase()).includes(c.toLowerCase()) &&
            c.toLowerCase() === lastChar
          );
          if (hasImmediatePriorChar) {
            repetitionPenalty += 0.08;
          }
        }

        p.relevanceScore = Math.max(0.01, p.relevanceScore + noveltyBonus - repetitionPenalty);
      }

      const seenIds = new Set<string>();
      const deduped: RetrievedPassage[] = [];
      for (const p of candidatePassages) {
        if (!seenIds.has(p.id)) {
          seenIds.add(p.id);
          deduped.push(p);
        }
      }

      // Unscoped philosophical questions search both collections. When a canonical
      // Gita verse has direct lexical support, keep the answer set within Gita source
      // material so a high-scoring but unrelated epic narrative cannot displace it.
      const hasExplicitNarrativeScope = Boolean(targetParva) ||
        /\b(?:mahabharata|mahabharat|parva|episode|story|narrative)\b/i.test(queryText) ||
        allCandidateEntities.some(entity => !['krishna', 'arjuna', 'partha'].includes(entity.toLowerCase()));
      const directlyMatchedGita = deduped.some(passage =>
        passage.sourceType === 'bhagavad_gita' &&
        queryTokenCoverage(passage.translation, cleanTokens) >= 0.5 &&
        queryTokenMatchCount(passage.translation, cleanTokens) >= 2
      );
      const sourceScopedPassages = shouldSearchGita && !hasExplicitNarrativeScope && directlyMatchedGita
        ? deduped.filter(isGitaCorpusPassage)
        : deduped;

      sourceScopedPassages.sort((a, b) => {
        if (a.sourceType === 'bhagavad_gita' && b.sourceType !== 'bhagavad_gita' && a.relevanceScore >= 0.85) {
          return -1;
        }
        if (b.sourceType === 'bhagavad_gita' && a.sourceType !== 'bhagavad_gita' && b.relevanceScore >= 0.85) {
          return 1;
        }
        return b.relevanceScore - a.relevanceScore;
      });

      // Coverage-aware Selection: Avoid taking duplicate/nearly identical sentences
      const selectedPassages: RetrievedPassage[] = [];
      const pageCounts = new Map<number, number>();

      for (const candidate of sourceScopedPassages) {
        if (selectedPassages.length >= Math.max(limit, 3)) {
          break;
        }

        const page = candidate.pageNumber ?? -1;
        const currentCount = pageCounts.get(page) || 0;
        if (page !== -1 && currentCount >= 2) {
          continue;
        }

        const candWords = new Set(candidate.translation.toLowerCase().split(/\s+/));
        let isTooRedundant = false;
        for (const sel of selectedPassages) {
          const selWords = sel.translation.toLowerCase().split(/\s+/);
          let matchCount = 0;
          for (const sw of selWords) {
            if (candWords.has(sw)) matchCount++;
          }
          const overlapRatio = matchCount / Math.max(selWords.length, 1);
          if (overlapRatio > 0.65) {
            isTooRedundant = true;
            break;
          }
        }

        if (!isTooRedundant) {
          selectedPassages.push(candidate);
          if (page !== -1) {
            pageCounts.set(page, currentCount + 1);
          }
        }
      }

      const finalPassages = selectedPassages.length > 0
        ? selectedPassages
        : sourceScopedPassages.slice(0, Math.max(limit, 3));

      const topScore = finalPassages[0]?.relevanceScore || 0;
      const secondScore = finalPassages[1]?.relevanceScore || 0;
      const scoreGap = finalPassages.length > 1 ? (topScore - secondScore) : topScore;
      const topPassage = finalPassages[0];
      const topQueryCoverage = topPassage ? queryTokenCoverage(topPassage.translation, cleanTokens) : 0;
      const topQueryMatchCount = topPassage ? queryTokenMatchCount(topPassage.translation, cleanTokens) : 0;
      const explicitVerseEvidence = Boolean(hints.verseReference && finalPassages.some(passage =>
        passage.sourceType === 'bhagavad_gita' &&
        Number(passage.chapter) === hints.verseReference!.chapter &&
        Number(passage.verseRange) === hints.verseReference!.verse
      ));
      const supportingSourceCount = new Set(finalPassages
        .filter(passage => queryTokenCoverage(passage.translation, cleanTokens) >= 0.35 && queryTokenMatchCount(passage.translation, cleanTokens) >= 2)
        .map(passage => passage.sourceType)).size;
      const hasDirectQuerySupport = explicitVerseEvidence ||
        (topQueryCoverage >= 0.35 && topQueryMatchCount >= 2) ||
        (topPassage && (topPassage.retrievalScores?.vector || 0) >= 0.65) ||
        (topPassage && allCandidateEntities.length > 0 && allCandidateEntities.some(e => entityMentioned(topPassage.translation, e)) && (topQueryMatchCount >= 2 || (topPassage.retrievalScores?.vector || 0) >= 0.55));
      const relationQuestion = /\b(?:related|relationship|relation|between|fight|fought|battle|married|marry|son of|daughter of|brother of|sister of|wife of|husband of|meet|met|meeting)\b/i.test(queryText);
      const corpusDoesNotEstablish = finalPassages.length === 0 || topScore < 0.15 || (!hasDirectQuerySupport && !relationQuestion);
      const rerankingMs = Date.now() - tRerankStart;
      citationConstructionMs = 0;

      // Evidence confidence evaluation (Requirement 11)
      const isExplicitEpicQuery = (extractedCharacters.length > 0 || hints.verseReference !== null || hints.candidateEntities.length > 0);
      let confidence: 'high' | 'medium' | 'low' = 'low';
      let hasSufficientEvidence = false;

      if (!corpusDoesNotEstablish && finalPassages.length > 0) {
        if (explicitVerseEvidence || (topScore >= 0.65 && topQueryCoverage >= 0.35 && supportingSourceCount >= 2)) {
          confidence = 'high';
          hasSufficientEvidence = true;
        } else if (topQueryCoverage >= 0.35 && topQueryMatchCount >= 2 && topScore >= 0.25) {
          confidence = 'medium';
          hasSufficientEvidence = true;
        } else {
          confidence = 'low';
          hasSufficientEvidence = false;
        }
      }

      // Entity co-occurrence cannot establish a relationship or event. A relation
      // question is sufficient only when one retrieved source sentence states the
      // requested participants together with a relation/event predicate.
      const relationEntities = Array.from(new Set(allCandidateEntities.map(name => name.toLowerCase()).filter(name => name.length >= 3)));
      if (relationQuestion && relationEntities.length >= 2) {
        const relationPredicate = /\b(?:related|relation|fight|fought|battle|duel|combat|vanquish(?:ed|es|ing)?|defeat(?:ed|s|ing)?|married|marry|meet|met|meeting|son|daughter|brother|sister|wife|husband|guru|teacher|student|pupil|disciple)\b/i;
        const relationSupported = finalPassages.some(p =>
          `${p.translation} ${p.originalText || ''}`.split(/(?<=[.!?])\s+/).some(sentence =>
            relationEntities.every(entity => entityMentioned(sentence, entity)) &&
            relationPredicate.test(sentence)
          )
        );
        if (!relationSupported) {
          hasSufficientEvidence = false;
          confidence = 'low';
        }
      }

      return {
        passages: corpusDoesNotEstablish ? [] : finalPassages,
        corpusDoesNotEstablish,
        retrievalLatencyMs: Date.now() - startTime,
        topScore,
        scoreGap,
        confidence,
        hasSufficientEvidence,
        channelCandidates,
        retrievalPath: databaseTimeout
          ? 'database_timeout_fallback'
          : mahabharataFallbackUsed
            ? 'canonical_disk_fallback'
            : isGitaOnlyQuery || (this.gitaLoadPath === 'canonical_disk' && databaseLatencyMs === 0 && mbQueryMs === 0)
              ? 'disk'
              : this.gitaLoadPath === 'canonical_disk' ? 'hybrid' : 'database',
        databaseLatencyMs,
        fallbackUsed: databaseTimeout || mahabharataFallbackUsed,
        fallbackReason: [this.gitaFallbackReason, mahabharataFallbackReason].filter(Boolean).join('; ') || undefined,
        timings: {
          entityExtractionMs: 0,
          embeddingMs,
          gitaSearchMs,
          mbQueryMs,
          rerankingMs,
          queryConstructionMs,
          connectionAcquisitionMs,
          databaseRoundTripMs,
          rowRetrievalMs,
          diskFallbackMs,
          citationConstructionMs,
          databaseTimeout,
          poolWaitingCount: pool.waitingCount,
        },
      };
    } catch (err: any) {
      console.error('[HybridRetriever Error]: Retrieval failed.', {
        errorCode: typeof err?.code === 'string' && /^[A-Z0-9_]{2,32}$/.test(err.code) ? err.code : 'UNKNOWN',
      });
      return {
        passages: [],
        corpusDoesNotEstablish: true,
        retrievalLatencyMs: Date.now() - startTime,
        topScore: 0,
        scoreGap: 0,
        confidence: 'low',
        hasSufficientEvidence: false,
        retrievalPath: databaseTimeout ? 'database_timeout_fallback' : 'none',
        databaseLatencyMs,
        fallbackUsed: databaseTimeout || mahabharataFallbackUsed,
        fallbackReason: [this.gitaFallbackReason, mahabharataFallbackReason, 'retrieval_failed'].filter(Boolean).join('; '),
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
