import { ConversationTurn } from './conversation-state-tracker.js';

export interface RepetitionCheckResult {
  hasRepetition: boolean;
  repetitionScore: number; // 0.0 to 1.0
  sanitizedContent: string;
  removedRedundancies: string[];
  majorMetaphors: string[];
  poeticConstraintApplied: boolean;
}

export interface AntiRepetitionOptions {
  personaEstablished?: boolean;
  crisisTurnCount?: number;
}

export class AntiRepetitionGuard {
  private static readonly METAPHOR_REPLACEMENTS: Record<string, string> = {
    chariot: 'situation', battlefield: 'conflict', storm: 'difficulty', wind: 'mind', reins: 'control',
    garment: 'body', lamp: 'clarity', ocean: 'depth', fire: 'anger', lotus: 'growth', journey: 'process', river: 'change',
    seed: 'beginning', seeds: 'efforts', wave: 'feeling', waves: 'feelings',
  };
  private static readonly STOCK_INTRODUCTIONS = [
    /^(?:as i (?:mentioned|explained|said) earlier,?)\s*/i,
    /^(?:in the (?:epic )?mahabharata,?)\s*/i,
    /^(?:come,? sit beside me(?:\.|\.\.\.|,)?)\s*/i,
    /^(?:let me tell you about)\s*/i,
    /^(?:arjuna was (?:one of the greatest|a great) warrior(?:s)?(?:\.|\.\.\.|,)?)\s*/i,
    /^(?:karna was known for his loyalty(?:\.|\.\.\.|,)?)\s*/i,
  ];

  private static readonly REPEATED_IDENTITY_INTRODUCTIONS = [
    /^(?:i am (?:lord )?krishna,?\s*(?:your companion on this chariot of life|your friend and guide)[.!,]?\s*)/i,
    /^(?:i am (?:lord )?krishna[.!,]?\s*)/i,
    /^(?:as (?:lord )?krishna,?\s*(?:your companion on this chariot of life)?[.!,]?\s*)/i,
    /^(?:i am your companion on this chariot of life[.!,]?\s*)/i,
  ];

  /**
   * Evaluates candidate assistant text against a sliding window of recent assistant messages
   * to suppress repetitive introductions, repeated identity claims, circular lectures, and clichés.
   */
  public static filter(
    newContent: string,
    history: ConversationTurn[],
    isFollowUp: boolean,
    options?: AntiRepetitionOptions
  ): RepetitionCheckResult {
    let sanitized = newContent.trim();
    const removedRedundancies: string[] = [];
    sanitized = sanitized.replace(/cosmic chariot(?:\s+of\s+(?:existence|life))?/gi, 'journey of life');
    sanitized = sanitized.replace(/great wheel of destiny/gi, 'unfolding of circumstances');
    const recentMetaphors = new Set(previousAssistantTurnsFrom(history).flatMap(turn => this.detectMetaphors(turn.content)));
    const seenMetaphors = new Set<string>();
    let poeticConstraintApplied = false;

    // Rolling metaphor registry, based on the last five assistant turns. Keep a useful
    // image when it is fresh; flatten repeated or additional images into direct language.
    for (const metaphor of this.detectMetaphors(sanitized)) {
      if (metaphor === 'battlefield' && /\b(?:arjuna|kurukshetra|pandava|kaurava|warrior|bhishma|drona)\b/i.test(sanitized)) {
        continue;
      }
      if (metaphor === 'reins' && /\b(?:horses|charioteer|senses|mind)\b/i.test(sanitized)) {
        continue;
      }
      if (metaphor === 'chariot' && /\b(?:reins|horses|charioteer|kurukshetra|arjuna)\b/i.test(sanitized)) {
        continue;
      }
      if (recentMetaphors.has(metaphor) || (seenMetaphors.size > 0 && !seenMetaphors.has(metaphor))) {
        const replacement = this.METAPHOR_REPLACEMENTS[metaphor];
        sanitized = sanitized.replace(new RegExp(`\\b${metaphor}\\b`, 'gi'), replacement);
        removedRedundancies.push(`${metaphor} (poetic restraint)`);
        poeticConstraintApplied = true;
      } else {
        seenMetaphors.add(metaphor);
      }
    }

    const hasPriorAssistant = history.some(h => h.role === 'assistant');
    const shouldSuppressIdentity = options?.personaEstablished || isFollowUp || hasPriorAssistant;

    // 1. Strip repeated identity introductions if Krishna is already established in the chat
    if (shouldSuppressIdentity) {
      for (const idPattern of this.REPEATED_IDENTITY_INTRODUCTIONS) {
        if (idPattern.test(sanitized)) {
          const matched = sanitized.match(idPattern)?.[0] || '';
          sanitized = sanitized.replace(idPattern, '').trim();
          removedRedundancies.push(matched.trim());
          break;
        }
      }
    }

    const addressPatterns: Record<string, RegExp> = {
      parth: /\bparth\b/i, partha: /\bpartha\b/i, sakha: /\bsakha\b/i,
      'my friend': /\bmy friend\b/i, 'dear one': /\bdear one\b/i,
    };
    const anyPriorAddressUsed = previousAssistantTurnsFrom(history).some(turn =>
      Object.values(addressPatterns).some(pattern => pattern.test(turn.content))
    );
    if (shouldSuppressIdentity || anyPriorAddressUsed) {
      const openingAddressRegex = /^(?:my friend|dear one|parth|partha|sakha)[,!:.]?\s*/i;
      if (openingAddressRegex.test(sanitized)) {
        const matched = sanitized.match(openingAddressRegex)?.[0] || '';
        sanitized = sanitized.replace(openingAddressRegex, '').trim();
        removedRedundancies.push(`${matched.trim()} (repeated form of address)`);
      }
    }

    // 2. Remove generic stock repetitive conversational intros
    for (const stockPattern of this.STOCK_INTRODUCTIONS) {
      if (stockPattern.test(sanitized)) {
        const matched = sanitized.match(stockPattern)?.[0] || '';
        sanitized = sanitized.replace(stockPattern, '').trim();
        removedRedundancies.push(matched.trim());
      }
    }

    // Capitalize first letter if stripped intro made it lowercase
    if (sanitized.length > 0) {
      sanitized = sanitized.charAt(0).toUpperCase() + sanitized.slice(1);
    }

    // 3. Neutralize pompous / theatrical clichés unconditionally
    if (/cosmic chariot(?:\s+of\s+(?:existence|life))?/i.test(sanitized)) {
      sanitized = sanitized.replace(/cosmic chariot(?:\s+of\s+(?:existence|life))?/gi, 'journey of life');
      removedRedundancies.push('cosmic chariot (theatrical cliché)');
    }
    if (/great wheel of destiny/i.test(sanitized)) {
      sanitized = sanitized.replace(/great wheel of destiny/gi, 'unfolding of circumstances');
      removedRedundancies.push('great wheel of destiny (theatrical cliché)');
    }

    // 4. Multi-turn sliding window inspection (sliding window of last 6 assistant turns)
    const previousAssistantTurns = history.filter(h => h.role === 'assistant').slice(-6);
    if (previousAssistantTurns.length === 0) {
      return {
        hasRepetition: removedRedundancies.length > 0,
        repetitionScore: 0.0,
        sanitizedContent: sanitized,
        removedRedundancies,
        majorMetaphors: Array.from(seenMetaphors),
        poeticConstraintApplied,
      };
    }

    // Collect all sentences across previous turns
    const allPastSentences: string[] = [];
    const pastFullText = previousAssistantTurns.map(t => t.content.toLowerCase()).join(' ');

    for (const turn of previousAssistantTurns) {
      const sents = turn.content
        .split(/[.!?]+/)
        .map(s => s.trim().toLowerCase())
        .filter(s => s.length > 15);
      allPastSentences.push(...sents);
    }

    // 5. Repetitive Metaphor & Stock Template suppression across turns
    if (pastFullText.includes('chariot of life') && sanitized.toLowerCase().includes('chariot of life')) {
      sanitized = sanitized.replace(/chariot of life/gi, 'journey of life');
      removedRedundancies.push('chariot of life (repetitive metaphor)');
    }
    if (pastFullText.includes('wheel of destiny') && sanitized.toLowerCase().includes('wheel of destiny')) {
      sanitized = sanitized.replace(/wheel of destiny/gi, 'unfolding of circumstances');
      removedRedundancies.push('wheel of destiny (repetitive metaphor)');
    }
    if (/\b(?:seeds?|planted)\b/i.test(pastFullText) && /\b(?:seeds?|planting|planted)\b/i.test(sanitized)) {
      sanitized = sanitized.replace(/\b(?:plant(?:ing|ed)?\s+(?:a\s+)?seeds?|seeds?\s+growing\s+into\s+change|seeds?\s+of\s+change)\b/gi, 'first honest effort');
      removedRedundancies.push('seed metaphor (repetitive metaphor)');
    }
    if (/\b(?:rivers?|waves?)\b/i.test(pastFullText) && /\b(?:restless river|turbulent river|waves? of (?:the ocean|emotion|restlessness))\b/i.test(sanitized)) {
      sanitized = sanitized.replace(/\b(?:restless river|turbulent river|waves? of (?:the ocean|emotion|restlessness))\b/gi, 'surging emotions');
      removedRedundancies.push('river/wave metaphor (repetitive metaphor)');
    }
    if (/\b(?:breathe|breath|small steps?)\b/i.test(pastFullText) && /\b(?:take a (?:slow |deep )?breath|pause,?\s*and take (?:a |one )?small step)\b/i.test(sanitized)) {
      sanitized = sanitized.replace(/\b(?:take a (?:slow |deep )?breath,?\s*(?:pause,?\s*)?(?:and |then )?take (?:one |a )?small step|pause and take a small step)\b/gi, 'focus directly on the task before you');
      removedRedundancies.push('breath and small step formula (repetitive template)');
    }

    // 5. Compare current sentences against all past assistant sentences in the sliding window
    const currentSentences = sanitized.split(/(?<=[.!?])\s+/);
    const nonRedundantSentences: string[] = [];
    let repeatedCount = 0;

    for (const sent of currentSentences) {
      const sentLower = sent.toLowerCase().trim();
      if (sentLower.length < 15) {
        nonRedundantSentences.push(sent);
        continue;
      }

      // Check if this sentence was already uttered almost verbatim in previous turns
      const isDuplicate = allPastSentences.some(last => {
        if (last === sentLower) return true;
        // Jaccard word similarity on sentence level
        const wordsA = new Set(sentLower.split(/\s+/));
        const wordsB = new Set(last.split(/\s+/));
        let intersection = 0;
        for (const w of wordsA) {
          if (wordsB.has(w)) intersection++;
        }
        const union = new Set([...wordsA, ...wordsB]).size;
        return (intersection / union) > 0.72;
      });

      if (isDuplicate && (isFollowUp || hasPriorAssistant)) {
        repeatedCount++;
        removedRedundancies.push(sent);
      } else {
        nonRedundantSentences.push(sent);
      }
    }

    const repetitionScore = currentSentences.length > 0 ? repeatedCount / currentSentences.length : 0;
    let finalContent = nonRedundantSentences.join(' ').trim();

    if (!finalContent && sanitized) {
      finalContent = sanitized;
    }

    // Ensure first character is uppercase
    if (finalContent.length > 0) {
      finalContent = finalContent.charAt(0).toUpperCase() + finalContent.slice(1);
    }

    return {
      hasRepetition: repeatedCount > 0 || removedRedundancies.length > 0,
      repetitionScore,
      sanitizedContent: finalContent,
      removedRedundancies,
      majorMetaphors: Array.from(seenMetaphors),
      poeticConstraintApplied,
    };
  }

  private static detectMetaphors(text: string): string[] {
    const lower = text.toLowerCase();
    return Object.keys(this.METAPHOR_REPLACEMENTS)
      .filter(term => new RegExp(`\\b${term}\\b`, 'i').test(lower))
      .sort((a, b) => lower.indexOf(a) - lower.indexOf(b));
  }
}

function previousAssistantTurnsFrom(history: ConversationTurn[]): ConversationTurn[] {
  return history.filter(turn => turn.role === 'assistant').slice(-5);
}
