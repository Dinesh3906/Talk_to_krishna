import { ResponseMode, ResponseDepth, ResponsePlan } from '@talk-to-krisna/shared';
import { ReferenceResolutionResult } from './reference-resolver.js';
import { ConversationTurn } from './conversation-state-tracker.js';

export interface PlanContext {
  userMessage: string;
  history: ConversationTurn[];
  activeTopic: string;
  activeEntities: string[];
  establishedFacts: string[];
  referenceResolution: ReferenceResolutionResult;
  intentCategory: string;
  emotionalState: string;
  isCasualBanter: boolean;
  isStoryRequest: boolean;
  isMahabharataRelevant: boolean;
  historicalMemory?: {
    found: boolean;
    honestStatement: string;
  };
}

export class ResponsePlanner {
  /**
   * Plans the response depth, mode, new information requirements, and anti-repetition boundaries.
   */
  public static plan(ctx: PlanContext): ResponsePlan {
    const { userMessage, history, referenceResolution } = ctx;
    const lower = userMessage.toLowerCase().trim();
    const isFirstTurn = history.length === 0;

    // 1. Determine Response Mode
    let responseMode: ResponseMode = 'philosophical_inquiry';
    let responseDepth: ResponseDepth = 'moderate';
    let targetTokens = 250;
    let storyRequired = false;
    let lessonRequired = true;
    let ragRequired = ctx.isMahabharataRelevant;
    let continuityAcknowledgement: string | undefined;

    if (referenceResolution.isHistoricalRecall) {
      responseMode = 'historical_recall';
      responseDepth = 'short';
      targetTokens = 120;
      ragRequired = false;
      lessonRequired = false;
      continuityAcknowledgement = 'Yes, let us look back at our earlier discussion.';
    } else if (referenceResolution.isTopicReturn) {
      responseMode = 'direct_followup';
      responseDepth = 'moderate';
      targetTokens = 180;
      continuityAcknowledgement = `Returning to ${referenceResolution.restoredTopic || ctx.activeTopic}...`;
    } else if (referenceResolution.isTopicShift) {
      responseMode = 'topic_shift';
      responseDepth = 'moderate';
      targetTokens = 200;
      continuityAcknowledgement = undefined;
    } else if (ctx.isCasualBanter) {
      responseMode = 'casual_conversation';
      responseDepth = 'very_short';
      targetTokens = 80;
      ragRequired = false;
      storyRequired = false;
      lessonRequired = false;
    } else if (
      ctx.intentCategory === 'emotional_distress' ||
      ctx.emotionalState === 'grief' ||
      ctx.emotionalState === 'loneliness' ||
      ctx.emotionalState === 'fear'
    ) {
      responseMode = 'emotional_guidance';
      responseDepth = 'moderate';
      targetTokens = 180;
      lessonRequired = false;
    } else if (ctx.isStoryRequest) {
      responseMode = 'story';
      responseDepth = 'detailed';
      targetTokens = 320;
      storyRequired = true;
    } else if (referenceResolution.isShortFollowUp) {
      responseMode = 'direct_followup';
      responseDepth = 'short';
      targetTokens = 110;
      continuityAcknowledgement = 'Yes, and that is precisely where the dilemma deepens.';
    } else if (referenceResolution.isFollowUp) {
      responseMode = 'direct_followup';
      responseDepth = 'short';
      targetTokens = 150;
      continuityAcknowledgement = 'That is an important distinction.';
    } else if (isFirstTurn && ctx.isMahabharataRelevant) {
      responseMode = 'explanation';
      responseDepth = 'detailed';
      targetTokens = 300;
    } else if (/\b(explain everything|tell me all|in detail|deep dive)\b/i.test(lower)) {
      responseMode = 'philosophical';
      responseDepth = 'comprehensive';
      targetTokens = 380;
    }

    // 2. Identify Established Facts to Avoid Repeating
    const previousInformationToAvoidRepeating: string[] = [];
    if (!isFirstTurn && history.length > 0) {
      // Collect topics/facts already explained in recent assistant messages
      const recentAssistantTurns = history.filter(h => h.role === 'assistant').slice(-2);
      for (const turn of recentAssistantTurns) {
        if (/arjuna was (?:one of )?the greatest/i.test(turn.content)) {
          previousInformationToAvoidRepeating.push('Do NOT re-introduce Arjuna as a great warrior.');
        }
        if (/karna was loyal to duryodhana because/i.test(turn.content)) {
          previousInformationToAvoidRepeating.push('Do NOT re-explain why Karna was crowned King of Anga.');
        }
        if (/bhishma took a vow/i.test(turn.content)) {
          previousInformationToAvoidRepeating.push('Do NOT re-explain Bhishma’s terrible vow of celibacy.');
        }
      }
      if (ctx.establishedFacts.length > 0) {
        previousInformationToAvoidRepeating.push(...ctx.establishedFacts.slice(-3));
      }
    }

    // 3. Identify New Information Required
    const newInformationRequired: string[] = [];
    if (referenceResolution.isHistoricalRecall) {
      newInformationRequired.push('Directly and accurately state what the user asked earlier in this chat.');
    } else if (referenceResolution.isShortFollowUp) {
      newInformationRequired.push('Directly answer the user’s specific question without re-explaining background context.');
    } else if (referenceResolution.isFollowUp) {
      newInformationRequired.push('Address the specific tension or question raised in this turn while assuming shared background.');
    } else if (referenceResolution.isTopicReturn) {
      newInformationRequired.push(`Address the specific question about ${referenceResolution.restoredTopic} building on previous discussion.`);
    }

    return {
      intent: ctx.intentCategory,
      responseMode,
      responseDepth,
      activeTopic: ctx.activeTopic,
      topicShift: referenceResolution.isTopicShift,
      topicReturn: referenceResolution.isTopicReturn,
      resolvedReferences: referenceResolution.resolvedReferences,
      relevantMemory: ctx.historicalMemory?.found ? [ctx.historicalMemory.honestStatement] : [],
      ragRequired,
      ragQuery: ctx.userMessage,
      newInformationRequired,
      previousInformationToAvoidRepeating,
      storyRequired,
      lessonRequired,
      targetTokens,
      continuityAcknowledgement,
    };
  }
}
