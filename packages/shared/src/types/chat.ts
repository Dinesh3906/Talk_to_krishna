import { z } from 'zod';

export type SenderType = 'user' | 'krishna' | 'system';

export type IntentCategory =
  | 'emotional_distress'
  | 'moral_dilemma'
  | 'career_purpose'
  | 'relationship_grief'
  | 'factual_scripture'
  | 'philosophical_inquiry'
  | 'decision_making'
  | 'casual_banter'
  | 'general_guidance';

export type EmotionalState =
  | 'grief'
  | 'fear'
  | 'anger'
  | 'jealousy'
  | 'confusion'
  | 'loneliness'
  | 'attachment'
  | 'peace'
  | 'neutral';

export type ResponseMode =
  | 'direct_followup'
  | 'explanation'
  | 'story'
  | 'philosophical'
  | 'comparison'
  | 'clarification'
  | 'emotional_guidance'
  | 'summary'
  | 'historical_recall'
  | 'topic_shift'
  | 'casual_conversation'
  | 'emotional_conversation'
  | 'philosophical_inquiry'
  | 'moral_guidance'
  | 'narrative_storytelling'
  | 'casual_greeting'
  | 'crisis_safety';

export type ResponseDepth = 'very_short' | 'short' | 'moderate' | 'detailed' | 'comprehensive';

export interface TopicSegment {
  id: string;
  conversationId: string;
  segmentIndex: number;
  topic: string;
  subtopic?: string | null;
  startTurn: number;
  endTurn: number;
  entities: string[];
  summary: string;
  keyFacts: string[];
  keywords: string[];
  createdAt: string;
}

export interface ConversationStateDto {
  activeTopic: string | null;
  activeSubtopic: string | null;
  activeEntities: string[];
  activeStory: string | null;
  unresolvedQuestions: string[];
  discussedQuestions: string[];
  establishedFacts: string[];
  philosophicalThemes: string[];
  userIntent: string | null;
  recentSummary: string;
  conversationSummary: string;
  topicHistory: TopicSegment[];
  lastUserMessage?: string | null;
  lastAssistantMessage?: string | null;
  turnCount: number;
}

export interface ResponsePlan {
  intent: string;
  responseMode: ResponseMode;
  responseDepth: ResponseDepth;
  activeTopic: string;
  topicShift: boolean;
  topicReturn: boolean;
  resolvedReferences: Record<string, string>;
  relevantMemory: string[];
  ragRequired: boolean;
  ragQuery: string;
  newInformationRequired: string[];
  previousInformationToAvoidRepeating: string[];
  storyRequired: boolean;
  lessonRequired: boolean;
  targetTokens: number;
  continuityAcknowledgement?: string;
}

export type QuoteType = 'direct_quote' | 'paraphrase' | 'inspired_guidance';

export interface Citation {
  id?: string;
  source: string; // 'Mahabharata' | 'Bhagavad Gita'
  parva?: string;
  chapter?: string;
  section?: string;
  verseRange?: string;
  speaker?: string;
  listener?: string;
  translation: string;
  originalText?: string;
  sourceReference: string; // e.g. "Bhagavad Gita 2.47"
  contextSummary?: string;
  relevanceScore?: number;
  quoteType: QuoteType;
}

export interface Message {
  id: string;
  conversationId: string;
  sender: SenderType;
  content: string;
  intentCategory?: IntentCategory;
  emotionalState?: EmotionalState;
  citations: Citation[];
  reflectionQuestion?: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  summary?: string;
  createdAt: string;
  updatedAt: string;
  lastMessage?: Message;
  messageCount?: number;
}

export type StreamChunkType =
  | 'start'
  | 'token'
  | 'metadata'
  | 'citation'
  | 'reflection'
  | 'telemetry'
  | 'debug'
  | 'done'
  | 'replace'
  | 'error';

export interface StreamChunk {
  type: StreamChunkType;
  messageId?: string;
  conversationId?: string;
  token?: string;
  content?: string;
  metadata?: {
    intent?: IntentCategory;
    emotion?: EmotionalState;
    isMahabharataRelevant?: boolean;
    quoteType?: QuoteType;
  };
  citation?: Citation;
  reflectionQuestion?: string;
  telemetry?: {
    requestId: string;
    totalLatencyMs: number;
    retrievedChunkCount: number;
  };
  debug?: {
    intent?: string;
    activeTopic?: string;
    referenceResolution?: Record<string, any>;
    retrievedChatMemory?: any;
    ragQuery?: string;
    responseMode?: string;
    responseDepth?: string;
  };
  error?: string;
  errorCode?: string;
}

// Zod Schemas for Validation
export const SendMessageSchema = z.object({
  conversationId: z.string().uuid().optional(),
  content: z.string().min(1, 'Message cannot be empty').max(4000, 'Message exceeds 4000 characters'),
  preferredName: z.string().max(50).optional(),
});

export type SendMessageDto = z.infer<typeof SendMessageSchema>;

export const CreateConversationSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  initialMessage: z.string().min(1).max(4000).optional(),
});

export type CreateConversationDto = z.infer<typeof CreateConversationSchema>;
