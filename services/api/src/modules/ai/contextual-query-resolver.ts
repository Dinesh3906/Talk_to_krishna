import { ReferenceResolutionResult } from './reference-resolver.js';
import { ConversationTurn } from './conversation-state-tracker.js';

export interface ContextualQueryPlan {
  ragRequired: boolean;
  contextualQuery: string;
  entitiesForRetrieval: string[];
  reason: string;
}

export interface ContextualQueryState {
  emotionalState?: string;
  emotionalTrajectory?: string[];
  userIntent?: string;
  recentUserTopics?: string[];
  previouslyUsedThemes?: string[];
  history?: ConversationTurn[];
}

export class ContextualQueryResolver {
  private static readonly STOP_WORDS = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'did', 'does', 'do',
    'will', 'would', 'could', 'should', 'can', 'in', 'on', 'at', 'to', 'for',
    'with', 'by', 'from', 'of', 'and', 'or', 'but', 'so', 'then', 'that', 'this',
    'it', 'he', 'she', 'they', 'them', 'him', 'her', 'his', 'i', 'me', 'my'
  ]);

  /**
   * Resolves conversational references into a high-precision retrieval query for RAG,
   * incorporating multi-turn conversation history, emotional trajectory, and gating crisis/banter.
   */
  public static resolve(
    userMessage: string,
    resolution: ReferenceResolutionResult,
    activeTopic?: string | null,
    activeEntities: string[] = [],
    contextState?: ContextualQueryState
  ): ContextualQueryPlan {
    const text = userMessage.trim();
    const lower = text.toLowerCase();

    // 0. Acute Crisis / Imminent Danger: GATED from scripture RAG (PART 17)
    // During crisis, prioritize immediate human safety, de-escalation, and connection rather than scripture
    const isAcuteCrisis =
      /\b(want to die|kill myself|commit suicide|end my life|slit my wrist|overdose)\b/i.test(lower) ||
      /\b(nothing matters anymore|don't think i can keep going|cant keep going|can't keep going)\b/i.test(lower) ||
      /\b(want to kill|revenge by killing|murder him|murder her)\b/i.test(lower) ||
      contextState?.emotionalState === 'crisis_safety';

    if (isAcuteCrisis) {
      return {
        ragRequired: false,
        contextualQuery: '',
        entitiesForRetrieval: [],
        reason: 'Acute crisis situation requires immediate safety intervention, empathy, and real-world support; scripture retrieval is gated.'
      };
    }

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

    // 6. Multi-Turn Context Integration (PART 3)
    const history = contextState?.history || [];
    if (history.length > 0) {
      const previousUserMessages = history.filter(h => h.role === 'user').slice(-3);
      const combinedPriorUser = previousUserMessages.map(m => m.content).join(' ').toLowerCase();

      // Academic/Performance Failure + Parental Expectations / Family Pressure
      if (/\b(exam|test|grade|grades|study|studying|fail|failed|failure|academic|career|interview)\b/i.test(combinedPriorUser)) {
        if (/\b(parent|parents|father|mother|family|expect|expected|expectation|pressure|disappoint)\b/i.test(lower)) {
          queryTerms.push('family', 'expectations', 'parental', 'pressure', 'duty', 'svadharma');
        }
        if (/\b(not good enough|worth|worthless|capable|doubt|failure|am i bad)\b/i.test(lower)) {
          queryTerms.push('self-worth', 'identity', 'doubt', 'effort', 'action', 'svadharma');
        }
      }

      // Relationship Grief + Lingering Longing
      if (/\b(breakup|broke up|ex|girlfriend|boyfriend|partner|marriage|divorce|separated)\b/i.test(combinedPriorUser)) {
        if (/\b(miss|missing|still love|aches|empty|remember|can't forget)\b/i.test(lower)) {
          queryTerms.push('attachment', 'longing', 'heartbreak', 'impermanence', 'grief');
        }
      }
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
      reason: 'Contextual RAG query generated with multi-turn context, resolved character, and thematic intent.'
    };
  }
}

