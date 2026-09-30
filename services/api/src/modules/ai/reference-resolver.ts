import { ConversationTurn } from './conversation-state-tracker.js';

export interface ReferenceResolutionResult {
  resolvedText: string;
  resolvedReferences: Record<string, string>;
  referentCharacter?: string;
  referentTopic?: string;
  isHistoricalRecall: boolean;
  isTopicReturn: boolean;
  isTopicShift: boolean;
  isFollowUp: boolean;
  isShortFollowUp: boolean;
  restoredTopic?: string;
  targetCharacterForRecall?: string;
}

export class ReferenceResolver {
  private static readonly PRONOUN_REGEX = /\b(he|him|his|she|her|they|them|that|this|it)\b/i;

  private static readonly HISTORICAL_RECALL_PATTERNS = [
    /\bwhat did (?:i|we) (?:ask|discuss|talk about|say)\b/i,
    /\bwhat were we (?:talking about|discussing)\b/i,
    /\bwhat did you say about\b/i,
    /\bdo you remember what (?:i|we) (?:asked|said|discussed)\b/i,
    /\bwhat was (?:my|the) (?:first|earlier|previous) question\b/i,
    /\bearlier (?:in this chat|you said|we talked|we discussed)\b/i,
    /\bwhat did i ask (?:you )?(?:earlier|before|at the beginning)\b/i,
    /\band what about (?:arjuna|karna|bhishma|krishna|yudhishthira|drona)\b/i,
    /\bremind me what (?:we|i)\b/i,
  ];

  private static readonly TOPIC_RETURN_PATTERNS = [
    /\b(?:coming|going|getting|turning) back to\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
    /\breturning to\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
    /\bback to\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
    /\bas (?:i|we) (?:were|was) (?:saying|discussing|talking)(?: about)?\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
    /\blet'?s return to\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
    /\breturning our focus to\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
  ];

  private static readonly EPIC_CHARACTERS = [
    'Arjuna', 'Karna', 'Bhishma', 'Drona', 'Yudhishthira', 'Bhima', 'Nakula', 'Sahadeva',
    'Duryodhana', 'Dushasana', 'Dhritarashtra', 'Gandhari', 'Kunti', 'Draupadi', 'Ashwatthama',
    'Abhimanyu', 'Shakuni', 'Vidura', 'Sanjaya', 'Vyasa', 'Balarama', 'Krishna', 'Ghatotkacha'
  ];

  /**
   * Resolves pronouns, ellipses, and conversational intent using recent turns and active state.
   */
  public static resolve(
    userMessage: string,
    history: ConversationTurn[],
    activeState?: {
      activeTopic?: string | null;
      activeEntities?: string[];
      lastDiscussedCharacter?: string;
      establishedFacts?: string[];
      topicHistory?: Array<{ topic: string; entities: string[] }>;
    }
  ): ReferenceResolutionResult {
    const text = userMessage.trim();
    const lower = text.toLowerCase();
    const resolvedReferences: Record<string, string> = {};

    // 1. Detect Historical Recall
    let isHistoricalRecall = this.HISTORICAL_RECALL_PATTERNS.some(p => p.test(lower));
    let targetCharacterForRecall: string | undefined;

    // Check if user asks "What did I ask you about Arjuna at the beginning?" or "And what about Arjuna?"
    for (const char of this.EPIC_CHARACTERS) {
      if (new RegExp(`\\b${char}\\b`, 'i').test(lower)) {
        if (isHistoricalRecall || /\b(?:earlier|before|previously|at the beginning)\b/i.test(lower)) {
          isHistoricalRecall = true;
          targetCharacterForRecall = char;
          break;
        }
      }
    }

    if (!targetCharacterForRecall && isHistoricalRecall && activeState?.lastDiscussedCharacter) {
      targetCharacterForRecall = activeState.lastDiscussedCharacter;
    }

    // 2. Detect Topic Return ("Coming back to Arjuna...", "Returning to Karna...")
    let isTopicReturn = false;
    let restoredTopic: string | undefined;

    for (const pat of this.TOPIC_RETURN_PATTERNS) {
      const match = lower.match(pat);
      if (match && match[1]) {
        const candidate = match[1].trim();
        const matchedChar = this.EPIC_CHARACTERS.find(c => c.toLowerCase() === candidate.toLowerCase());
        isTopicReturn = true;
        restoredTopic = matchedChar || candidate.charAt(0).toUpperCase() + candidate.slice(1);
        resolvedReferences['restored_target'] = restoredTopic;
        break;
      }
    }

    // 3. Pronoun detection & subject/object differentiation
    const hasPronoun = this.PRONOUN_REGEX.test(lower);
    const hasSubjectPronoun = /\b(why was he|why did he|wasn't he|is he|does he|he was|he did|why was she|why did she|she was)\b/i.test(lower);

    // 4. Find Most Salient Active Entity / Character
    let referentCharacter: string | undefined;

    // If the message contains a subject pronoun and an active discussed character exists,
    // the pronoun refers to that prior active character (e.g. "Why was he loyal to Duryodhana?" -> he = Karna)
    if (hasSubjectPronoun && activeState?.lastDiscussedCharacter) {
      referentCharacter = activeState.lastDiscussedCharacter;
    } else {
      // Direct explicit character mentioned as primary subject
      for (const char of this.EPIC_CHARACTERS) {
        if (new RegExp(`\\b${char}\\b`, 'i').test(lower)) {
          // If char is Krishna, only set as referent if asking about Krishna directly (e.g. "Tell me about Krishna")
          if (char.toLowerCase() === 'krishna') {
            if (/\b(?:about krishna|who is krishna|tell me about krishna|krishna's (?:role|life|birth))\b/i.test(lower)) {
              referentCharacter = 'Krishna';
              break;
            }
          } else {
            referentCharacter = char;
            break;
          }
        }
      }
    }

    // If still not found, inherit from active state or immediate prior turns
    if (!referentCharacter) {
      if (activeState?.lastDiscussedCharacter) {
        referentCharacter = activeState.lastDiscussedCharacter;
      } else if (activeState?.activeEntities && activeState.activeEntities.length > 0) {
        const nonKrishna = activeState.activeEntities.find(e => e.toLowerCase() !== 'krishna');
        if (nonKrishna) {
          referentCharacter = nonKrishna.charAt(0).toUpperCase() + nonKrishna.slice(1);
        } else {
          referentCharacter = activeState.activeEntities[0].charAt(0).toUpperCase() + activeState.activeEntities[0].slice(1);
        }
      } else if (history.length > 0) {
        // Inspect backwards through recent turns
        for (let i = history.length - 1; i >= 0; i--) {
          const turn = history[i];
          for (const char of this.EPIC_CHARACTERS) {
            if (new RegExp(`\\b${char}\\b`, 'i').test(turn.content)) {
              referentCharacter = char;
              break;
            }
          }
          if (referentCharacter) break;
        }
      }
    }

    // 5. Populate resolved references
    let resolvedText = text;
    if (hasPronoun && referentCharacter) {
      if (/\b(he|him|his)\b/i.test(lower)) {
        resolvedReferences['he/him/his'] = referentCharacter;
      }
      if (/\b(she|her)\b/i.test(lower)) {
        resolvedReferences['she/her'] = referentCharacter;
      }
      if (/\b(they|them)\b/i.test(lower)) {
        resolvedReferences['they/them'] = referentCharacter;
      }
      if (/\b(that|this)\b/i.test(lower)) {
        resolvedReferences['this/that'] = activeState?.activeTopic || `${referentCharacter}'s dilemma`;
      }
    }

    // 6. Short follow-up detection ("Why?", "What happened after that?", "Who told him?")
    const isShortFollowUp =
      text.split(/\s+/).length <= 7 &&
      (
        /^(why|how|why so|then why|and then|what happened next|what happened after that|who told him|what about him|what about her)\??$/i.test(text) ||
        /^what happened (?:after that|next|then)\??$/i.test(text) ||
        /^but wasn'?t he\b/i.test(lower) ||
        /^then why didn'?t\b/i.test(lower)
      );

    const isFollowUp =
      history.length > 0 &&
      (
        hasPronoun ||
        isShortFollowUp ||
        /^(so are you saying|are you saying|what if|why should i|isn't that|what about|then what|and then|why did he|why did she|tell me more|what would you)\b/i.test(lower) ||
        /\b(what if (your advice|it doesn't work|i disagree|that fails))\b/i.test(lower)
      );

    // 7. Detect Topic Shift
    let isTopicShift = false;
    if (
      !isTopicReturn &&
      !isHistoricalRecall &&
      !isFollowUp &&
      referentCharacter &&
      activeState?.lastDiscussedCharacter &&
      referentCharacter.toLowerCase() !== activeState.lastDiscussedCharacter.toLowerCase() &&
      new RegExp(`\\b${referentCharacter}\\b`, 'i').test(lower)
    ) {
      isTopicShift = true;
    }

    return {
      resolvedText,
      resolvedReferences,
      referentCharacter: isTopicReturn ? restoredTopic : referentCharacter,
      referentTopic: isTopicReturn ? restoredTopic : (activeState?.activeTopic || referentCharacter),
      isHistoricalRecall,
      isTopicReturn,
      isTopicShift,
      isFollowUp,
      isShortFollowUp,
      restoredTopic,
      targetCharacterForRecall,
    };
  }
}
