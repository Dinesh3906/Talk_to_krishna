import { EmotionalState } from '@talk-to-krisna/shared';
import { ConversationTurn } from './conversation-state-tracker.js';

export type ConversationRiskLevel =
  | 'NONE'
  | 'LOW'
  | 'MODERATE'
  | 'PASSIVE_CONCERN'
  | 'ACTIVE_IDEATION'
  | 'INTENT'
  | 'MEANS_PRESENT'
  | 'IMMINENT'
  | 'VIOLENCE_IDEATION'
  | 'VIOLENCE_ESCALATION'
  | 'HIGH'
  | 'SAFETY_CLARIFIED_NON_SUICIDAL';

export interface EmotionalConversationState {
  surfaceMessage: string;
  primaryEmotion?: string;
  secondaryEmotions: string[];
  underlyingWound?: string;
  userNeed?: string;
  latestQuestion?: string;
  emotionalTrajectory: string[];
  riskLevel: ConversationRiskLevel;
  conversationStage: 'opening' | 'follow_up' | 'topic_return' | 'ongoing';
}

/** Lightweight interpretation from existing classification and conversation state. */
export class EmotionalInterpretation {
  static interpret(
    message: string,
    emotion: EmotionalState | string,
    history: ConversationTurn[],
    priorTrajectory: string[],
    riskLevel: ConversationRiskLevel,
    isTopicReturn = false,
  ): EmotionalConversationState {
    const lower = message.toLowerCase();
    const emotionTerms: Record<string, RegExp> = {
      grief: /\b(miss|lost|died|grief|heartbroken|empty|sad|lonely)\b/i,
      fear: /\b(afraid|fear|worried|anxious|panic|scared|what if)\b/i,
      shame: /\b(ashamed|embarrassed|failure|failed|disappoint|worthless|guilty)\b/i,
      anger: /\b(angry|furious|rage|revenge|hate|resent)\b/i,
      insecurity: /\b(ugly|height|appearance|inferior|rejected|judge me|not good enough)\b/i,
      exhaustion: /\b(exhausted|tired|can't keep|burned out|overwhelmed)\b/i,
      loneliness: /\b(alone|lonely|invisible|disappeared|unseen)\b/i,
    };
    const secondaryEmotions = Object.entries(emotionTerms)
      .filter(([, pattern]) => pattern.test(lower))
      .map(([name]) => name)
      .filter(name => name !== emotion)
      .slice(0, 3);
    const question = message.match(/[^.!?]*\?/)?.[0]?.trim();
    const hasQuestion = /\?|^(what|why|how|when|where|who|should|can|does|is|do)\b/i.test(message.trim());
    return {
      surfaceMessage: message,
      primaryEmotion: emotion === 'neutral' ? undefined : emotion,
      secondaryEmotions,
      underlyingWound: secondaryEmotions.length ? `Possible concerns: ${secondaryEmotions.join(', ')}` : undefined,
      userNeed: ['NONE', 'LOW', 'SAFETY_CLARIFIED_NON_SUICIDAL'].includes(riskLevel)
        ? (hasQuestion ? 'a direct answer to the latest question' : 'acknowledgment and a useful next response')
        : 'immediate safety and human support',
      latestQuestion: question || (hasQuestion ? message.trim() : undefined),
      emotionalTrajectory: [...priorTrajectory, emotion].slice(-10),
      riskLevel,
      conversationStage: isTopicReturn ? 'topic_return' : history.length === 0 ? 'opening' : history.some(t => t.role === 'assistant') ? 'follow_up' : 'ongoing',
    };
  }
}
