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
  | 'done'
  | 'error';

export interface StreamChunk {
  type: StreamChunkType;
  messageId?: string;
  conversationId?: string;
  token?: string;
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
