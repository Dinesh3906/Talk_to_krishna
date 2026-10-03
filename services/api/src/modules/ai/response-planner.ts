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
  isCasualBanter?: boolean;
  isStoryRequest?: boolean;
  isMahabharataRelevant?: boolean;
  historicalMemory?: {
    found: boolean;
    honestStatement: string;
  };
  isCrisis?: boolean;
  turnCount?: number;
  crisisTurnCount?: number;
  previouslyCitedEpisodeIds?: string[];
  previouslyUsedTeachings?: string[];
  emotionalTrajectory?: string[];
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
    let ragRequired = Boolean(ctx.isMahabharataRelevant);
    let continuityAcknowledgement: string | undefined;

    const isCrisis =
      Boolean(ctx.isCrisis) ||
      ctx.intentCategory === 'crisis_safety' ||
      ctx.intentCategory === 'crisis_self_harm' ||
      /\b(want to die|kill myself|commit suicide|end my life|want to kill|kill someone|kill some one|nothing matters anymore|don't think i can keep going|cant keep going)\b/i.test(lower) ||
      /\b(ruined my life and i want revenge|take revenge by killing|don't know if i can control myself)\b/i.test(lower);

    if (isCrisis) {
      responseMode = 'crisis_safety';
      responseDepth = 'short';
      targetTokens = (ctx.crisisTurnCount && ctx.crisisTurnCount > 1) ? 120 : 150;
      ragRequired = false;
      storyRequired = false;
      lessonRequired = false;
    } else if (referenceResolution.isHistoricalRecall) {
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
    } else if (ctx.isStoryRequest) {
      responseMode = 'story';
      responseDepth = 'detailed';
      targetTokens = 320;
      storyRequired = true;
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
      const recentAssistantTurns = history.filter(h => h.role === 'assistant').slice(-3);
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
        if (/draupadi.*(vastraharana|disrobing|assembly|cheerharan)/i.test(turn.content)) {
          previousInformationToAvoidRepeating.push('Do NOT retell the story of Draupadi’s disrobing or assembly humiliation.');
        }
      }

      if (ctx.previouslyCitedEpisodeIds && ctx.previouslyCitedEpisodeIds.length > 0) {
        for (const ep of ctx.previouslyCitedEpisodeIds.slice(-3)) {
          previousInformationToAvoidRepeating.push(`Do NOT retell the plot/events of ${ep}. Focus on fresh insight or direct personal counsel.`);
        }
      }

      if (ctx.previouslyUsedTeachings && ctx.previouslyUsedTeachings.length > 0) {
        for (const th of ctx.previouslyUsedTeachings.slice(-2)) {
          previousInformationToAvoidRepeating.push(`Do NOT re-explain the concept of ${th} from scratch; build forward.`);
        }
      }

      if (isCrisis && ctx.crisisTurnCount && ctx.crisisTurnCount > 1) {
        previousInformationToAvoidRepeating.push('Do NOT repeat the list of helpline telephone numbers; the UI already maintains them.');
        previousInformationToAvoidRepeating.push('Do NOT repeat the exact sentences or breath questions used in previous turns.');
      }

      if (ctx.establishedFacts.length > 0) {
        previousInformationToAvoidRepeating.push(...ctx.establishedFacts.slice(-3));
      }
    }

    // 3. Identify New Information Required
    const newInformationRequired: string[] = [];
    if (isCrisis && ctx.crisisTurnCount && ctx.crisisTurnCount > 1) {
      newInformationRequired.push('Respond tenderly and specifically to the seeker’s exact words in this turn, providing quiet companionship in this very minute.');
    } else if (referenceResolution.isHistoricalRecall) {
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
