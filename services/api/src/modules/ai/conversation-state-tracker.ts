export type DialogueStage = 'fact' | 'context' | 'why' | 'deep_meaning' | 'personal_application';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ConversationState {
  activeCharacters: string[];
  activeParva?: string;
  activeVerse?: { chapter: number; verse: number };
  dialogueStage: DialogueStage;
  currentTopic?: string;
  userEmotionalContext?: string;
  contextualQuery: string;
  unresolvedQuestions: string[];
  priorSourceIds: string[];
}

export class ConversationStateTracker {
  private static readonly STOP_WORDS = new Set([
    'the', 'a', 'an', 'what', 'why', 'who', 'how', 'when', 'where', 'which',
    'is', 'are', 'was', 'were', 'did', 'does', 'do', 'will', 'would', 'should',
    'can', 'could', 'tell', 'explain', 'give', 'show', 'mean', 'about', 'and',
    'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with', 'from', 'by', 'my', 'i',
    'you', 'your', 'me', 'he', 'she', 'they', 'it', 'this', 'that', 'these', 'those'
  ]);

  /**
   * Dynamically extracts candidate entities/proper nouns from text without any hardcoded character dictionary.
   */
  public static extractCandidateEntities(text: string): string[] {
    const candidates = new Set<string>();

    // 1. Phrasal subject extraction: "who was X", "tell me about X", "story of X", "why did X"
    const phraseMatches = text.matchAll(/\b(?:about|who (?:was|is)|tell me about|story of|why did|what did|between|with)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/gi);
    for (const match of phraseMatches) {
      if (match[1]) {
        const words = match[1].split(/\s+/).map((w) => w.replace(/[^a-zA-Z]/g, '').toLowerCase());
        for (const w of words) {
          if (w.length >= 3 && !this.STOP_WORDS.has(w)) {
            candidates.add(w);
          }
        }
      }
    }

    // 2. Capitalized words (proper nouns) in the text
    const rawWords = text.split(/\s+/);
    for (let i = 0; i < rawWords.length; i++) {
      const token = rawWords[i];
      const clean = token.replace(/[^a-zA-Z]/g, '');
      if (clean.length >= 3 && /^[A-Z][a-z]+$/.test(token.replace(/[.,!?:;'"“”]/g, ''))) {
        const lower = clean.toLowerCase();
        if (!this.STOP_WORDS.has(lower)) {
          // If first word in sentence, only add if not a common sentence-starter verb
          if (i === 0 && ['what', 'why', 'who', 'how', 'when', 'where', 'tell', 'explain', 'does', 'did', 'can', 'could'].includes(lower)) {
            continue;
          }
          candidates.add(lower);
        }
      }
    }

    return Array.from(candidates);
  }

  /**
   * Tracks and resolves multi-turn conversation state, updating active context,
   * detecting dialogue stage transitions, and rewriting follow-up queries.
   */
  public static track(
    history: ConversationTurn[],
    currentUserMessage: string
  ): ConversationState {
    const lowerUser = currentUserMessage.toLowerCase();

    // 1. Dynamic entity extraction from current message
    const currentEntities = new Set<string>(this.extractCandidateEntities(currentUserMessage));

    // In Talk to Krishna, 2nd person pronouns ("you", "your", "yourself") address Krishna
    if (/\b(you|your|yourself)\b/i.test(lowerUser)) {
      currentEntities.add('krishna');
    }

    // Extract verse reference from current message (e.g. "2.47", "Gita 2.47", "chapter 2 verse 47")
    const verseMatch = lowerUser.match(/(?:chapter\s*(\d+)\s*(?:verse|shloka|sloka)?\s*(\d+)|(?:gita|bg|bhagavad\s*gita)?\s*(\d+)\s*[:.]\s*(\d+))/i);
    let activeVerse: { chapter: number; verse: number } | undefined;
    if (verseMatch) {
      const ch = parseInt(verseMatch[1] || verseMatch[3], 10);
      const vs = parseInt(verseMatch[2] || verseMatch[4], 10);
      if (!isNaN(ch) && !isNaN(vs)) {
        activeVerse = { chapter: ch, verse: vs };
      }
    }

    // 2. Scan recent conversation history to inherit active entities if user asks a pronoun/elliptical follow-up
    const inheritedEntities = new Set<string>();
    let inheritedVerse: { chapter: number; verse: number } | undefined;

    const recentTurns = history.slice(-4);
    for (const turn of recentTurns) {
      const turnEntities = this.extractCandidateEntities(turn.content);
      for (const e of turnEntities) {
        inheritedEntities.add(e);
      }

      if (!inheritedVerse) {
        const vMatch = turn.content.toLowerCase().match(/(?:chapter\s*(\d+)\s*(?:verse|shloka|sloka)?\s*(\d+)|(?:gita|bg|bhagavad\s*gita)?\s*(\d+)\s*[:.]\s*(\d+))/i);
        if (vMatch) {
          const ch = parseInt(vMatch[1] || vMatch[3], 10);
          const vs = parseInt(vMatch[2] || vMatch[4], 10);
          if (!isNaN(ch) && !isNaN(vs)) {
            inheritedVerse = { chapter: ch, verse: vs };
          }
        }
      }
    }

    // Active entities prioritize current turn, but merge inherited if pronoun or follow-up is detected
    const isPronounOrFollowup =
      /\b(he|him|his|she|her|they|them|that|this|it|why|unfair|wrong|right|chariot|wheel|death|die|killed|choice)\b/i.test(lowerUser);

    const mergedEntities = new Set<string>(currentEntities);
    if (isPronounOrFollowup || currentEntities.size === 0) {
      for (const ent of inheritedEntities) {
        mergedEntities.add(ent);
      }
    }

    // 3. Determine Dialogue Stage Progression
    // FACT -> CONTEXT -> WHY -> DEEP_MEANING -> PERSONAL_APPLICATION
    let dialogueStage: DialogueStage = 'fact';

    if (
      /\b(i|me|my|mine|myself)\b.*\b(life|duty|career|work|decision|choice|situation|action|struggle|problem)\b/i.test(lowerUser) ||
      /\b(what should i|how should i|for me|what does that mean for me|help me)\b/i.test(lowerUser) ||
      /\b(i feel|i am|i keep|in my situation|how do i apply)\b/i.test(lowerUser)
    ) {
      dialogueStage = 'personal_application';
    } else if (
      /\b(meaning|philosophical|dharma|lesson|truth|principle|teach|deeper|essence)\b/i.test(lowerUser)
    ) {
      dialogueStage = 'deep_meaning';
    } else if (
      /\b(why|reason|motive|choose|stay|decision|justify|allow|cause|purpose)\b/i.test(lowerUser)
    ) {
      dialogueStage = 'why';
    } else if (
      /\b(unfair|wrong|right|justice|ethics|context|what happened|background|chariot|stuck)\b/i.test(lowerUser)
    ) {
      dialogueStage = 'context';
    }

    // 4. Formulate Contextual Query for Search
    // If the user asks an elliptical follow-up like "Was that choice unfair to the Pandavas?", expand with inherited entities
    let contextualQuery = currentUserMessage;
    const missingInherited = Array.from(inheritedEntities).filter((e) => !currentEntities.has(e));
    if (isPronounOrFollowup && missingInherited.length > 0) {
      const entityList = missingInherited.slice(0, 2).join(' ');
      contextualQuery = `${entityList} ${currentUserMessage}`;
    } else if (mergedEntities.size > 0 && currentEntities.size === 0) {
      const entityList = Array.from(mergedEntities).slice(0, 2).join(' ');
      contextualQuery = `${entityList} ${currentUserMessage}`;
    }

    return {
      activeCharacters: Array.from(mergedEntities),
      activeVerse: activeVerse || (isPronounOrFollowup ? inheritedVerse : undefined),
      dialogueStage,
      contextualQuery,
      unresolvedQuestions: [],
      priorSourceIds: [],
    };
  }
}
