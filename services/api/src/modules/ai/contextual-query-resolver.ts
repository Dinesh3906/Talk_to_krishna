import { ReferenceResolutionResult } from './reference-resolver.js';

export interface ContextualQueryPlan {
  ragRequired: boolean;
  contextualQuery: string;
  entitiesForRetrieval: string[];
  reason: string;
}

export class ContextualQueryResolver {
  private static readonly STOP_WORDS = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'did', 'does', 'do',
    'will', 'would', 'could', 'should', 'can', 'in', 'on', 'at', 'to', 'for',
    'with', 'by', 'from', 'of', 'and', 'or', 'but', 'so', 'then', 'that', 'this',
    'it', 'he', 'she', 'they', 'them', 'him', 'her', 'his'
  ]);

  /**
   * Resolves conversational references into a high-precision retrieval query for RAG,
   * or gates RAG when conversational memory / banter is the appropriate source.
   */
  public static resolve(
    userMessage: string,
    resolution: ReferenceResolutionResult,
    activeTopic?: string | null,
    activeEntities: string[] = []
  ): ContextualQueryPlan {
    const text = userMessage.trim();
    const lower = text.toLowerCase();

    // 1. Historical Recall: GATED from RAG. Handled by ChatMemoryRetriever.
    if (resolution.isHistoricalRecall) {
      return {
        ragRequired: false,
        contextualQuery: '',
        entitiesForRetrieval: [],
        reason: 'Historical chat recall requested; querying conversation memory instead of scripture corpus.'
      };
    }

    // 2. Casual Banter & Personal Expressions: GATED from RAG
    if (
      /^(hi|hello|hey|good\s*(morning|afternoon|evening)|namaste|pranam)\b/i.test(lower) ||
      /\b(how are you|how('s| is) it going|tell me a (?:funny )?joke|make me (?:laugh|smile)|i('m| am) (?:just )?bored)\b/i.test(lower) ||
      /\b(what (?:is|'s) your favorite food|who are you|just talk to me)\b/i.test(lower)
    ) {
      return {
        ragRequired: false,
        contextualQuery: '',
        entitiesForRetrieval: [],
        reason: 'Casual conversation or greeting; no scripture retrieval needed.'
      };
    }

    // 3. Resolve Target Character
    const character = resolution.referentCharacter || (activeEntities.length > 0 ? activeEntities[0] : undefined);
    const entitiesForRetrieval = character ? [character] : [...activeEntities];

    // 4. Clean Query Tokens
    const words = text
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !this.STOP_WORDS.has(w.toLowerCase()));

    // 5. Expand Elliptical / Follow-up queries
    let queryTerms: string[] = [];

    if (character && !lower.includes(character.toLowerCase())) {
      queryTerms.push(character);
    }

    // Add relevant thematic focus
    if (/\bloyal|loyalty|friendship\b/i.test(lower)) {
      queryTerms.push('loyalty', 'friendship', 'Duryodhana');
    } else if (/\bidentity|birth|son of kunti|real mother|secret\b/i.test(lower)) {
      queryTerms.push('birth', 'identity', 'Kunti', 'secret');
    } else if (/\bhesitat|refus|dilemma|refuse to fight\b/i.test(lower)) {
      queryTerms.push('hesitation', 'dilemma', 'grief', 'bow');
    } else if (/\bchariot|wheel|stuck\b/i.test(lower)) {
      queryTerms.push('chariot', 'wheel', 'curse');
    } else if (/\bwho told|revealed\b/i.test(lower)) {
      queryTerms.push('revealed', 'Kunti', 'Krishna');
    } else if (/\bmistake|flaw|error\b/i.test(lower)) {
      queryTerms.push('conflict', 'duty', 'attachment');
    }

    for (const w of words) {
      if (!queryTerms.some(qt => qt.toLowerCase() === w.toLowerCase())) {
        queryTerms.push(w);
      }
    }

    if (queryTerms.length === 0 && character) {
      queryTerms.push(character);
      if (activeTopic) {
        queryTerms.push(activeTopic);
      }
    }

    const contextualQuery = queryTerms.join(' ').trim() || text;

    return {
      ragRequired: true,
      contextualQuery,
      entitiesForRetrieval,
      reason: 'Contextual RAG query generated with resolved character and thematic intent.'
    };
  }
}
