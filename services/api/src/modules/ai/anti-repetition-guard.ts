import { ConversationTurn } from './conversation-state-tracker.js';

export interface RepetitionCheckResult {
  hasRepetition: boolean;
  repetitionScore: number; // 0.0 to 1.0
  sanitizedContent: string;
  removedRedundancies: string[];
}

export class AntiRepetitionGuard {
  private static readonly STOCK_INTRODUCTIONS = [
    /^(?:as i (?:mentioned|explained|said) earlier,?)\s*/i,
    /^(?:in the epic mahabharata,?)\s*/i,
    /^(?:come,? sit beside me(?:\.|\.\.\.|,)?)\s*/i,
    /^(?:let me tell you about)\s*/i,
    /^(?:arjuna was (?:one of the greatest|a great) warrior(?:s)?(?:\.|\.\.\.|,)?)\s*/i,
    /^(?:karna was known for his loyalty(?:\.|\.\.\.|,)?)\s*/i,
  ];

  /**
   * Evaluates candidate assistant text against previous assistant messages
   * to suppress repetitive paragraphs, introductions, and circular lectures.
   */
  public static filter(
    newContent: string,
    history: ConversationTurn[],
    isFollowUp: boolean
  ): RepetitionCheckResult {
    let sanitized = newContent.trim();
    const removedRedundancies: string[] = [];

    // 1. Remove generic stock repetitive conversational intros
    for (const stockPattern of this.STOCK_INTRODUCTIONS) {
      if (stockPattern.test(sanitized)) {
        const matched = sanitized.match(stockPattern)?.[0] || '';
        sanitized = sanitized.replace(stockPattern, '').trim();
        removedRedundancies.push(matched);
      }
    }

    // Capitalize first letter if stripped intro made it lowercase
    if (sanitized.length > 0) {
      sanitized = sanitized.charAt(0).toUpperCase() + sanitized.slice(1);
    }

    // 2. Compare sentences against previous assistant message
    const previousAssistantTurns = history.filter(h => h.role === 'assistant').slice(-2);
    if (previousAssistantTurns.length === 0) {
      return {
        hasRepetition: false,
        repetitionScore: 0.0,
        sanitizedContent: sanitized,
        removedRedundancies,
      };
    }

    const lastAssistantText = previousAssistantTurns[previousAssistantTurns.length - 1].content.toLowerCase();
    const lastSentences = lastAssistantText
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 15);

    const currentSentences = sanitized.split(/(?<=[.!?])\s+/);
    const nonRedundantSentences: string[] = [];
    let repeatedCount = 0;

    for (const sent of currentSentences) {
      const sentLower = sent.toLowerCase().trim();
      if (sentLower.length < 15) {
        nonRedundantSentences.push(sent);
        continue;
      }

      // Check if this sentence was already uttered almost verbatim in previous turn
      const isDuplicate = lastSentences.some(last => {
        if (last === sentLower) return true;
        // Jaccard word similarity on sentence level
        const wordsA = new Set(sentLower.split(/\s+/));
        const wordsB = new Set(last.split(/\s+/));
        let intersection = 0;
        for (const w of wordsA) {
          if (wordsB.has(w)) intersection++;
        }
        const union = new Set([...wordsA, ...wordsB]).size;
        return (intersection / union) > 0.75;
      });

      if (isDuplicate && isFollowUp) {
        repeatedCount++;
        removedRedundancies.push(sent);
      } else {
        nonRedundantSentences.push(sent);
      }
    }

    const repetitionScore = currentSentences.length > 0 ? repeatedCount / currentSentences.length : 0;
    const finalContent = nonRedundantSentences.join(' ').trim() || sanitized;

    return {
      hasRepetition: repeatedCount > 0,
      repetitionScore,
      sanitizedContent: finalContent,
      removedRedundancies,
    };
  }
}
