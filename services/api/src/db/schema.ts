import { pgTable, uuid, varchar, text, boolean, timestamp, integer, real, customType } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Custom pgvector type for Drizzle
export const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(768)';
  },
  toDriver(value: number[]): string {
    return JSON.stringify(value);
  },
  fromDriver(value: string): number[] {
    if (typeof value === 'string') {
      return JSON.parse(value);
    }
    return value;
  },
});

// Users Table
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).unique(),
  passwordHash: text('password_hash'),
  displayName: varchar('display_name', { length: 100 }),
  preferredName: varchar('preferred_name', { length: 50 }),
  isAnonymous: boolean('is_anonymous').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// User Profiles Table
export const userProfiles = pgTable('user_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  reflectionDepth: varchar('reflection_depth', { length: 30 }).notNull().default('balanced'),
  mahabharataDensity: varchar('mahabharata_density', { length: 30 }).notNull().default('contextual'),
  themePreference: varchar('theme_preference', { length: 20 }).notNull().default('dark'),
  enableLongTermMemory: boolean('enable_long_term_memory').notNull().default(false),
  preferredLanguage: varchar('preferred_language', { length: 20 }).notNull().default('en'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Conversations Table
export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull().default('New Reflection'),
  summary: text('summary'),
  isDeleted: boolean('is_deleted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Messages Table
export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  sender: varchar('sender', { length: 20 }).notNull(), // 'user' | 'krishna' | 'system'
  content: text('content').notNull(),
  intentCategory: varchar('intent_category', { length: 50 }),
  emotionalState: varchar('emotional_state', { length: 50 }),
  reflectionQuestion: text('reflection_question'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Mahabharata Sources Table
export const mahabharataSources = pgTable('mahabharata_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  volumeParva: varchar('volume_parva', { length: 100 }),
  sourceType: varchar('source_type', { length: 50 }).notNull(), // 'gita', 'episodes', 'pdf_volume'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Mahabharata Chunks Table (with Vector & Full-Text capabilities)
export const mahabharataChunks = pgTable('mahabharata_chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceId: uuid('source_id').references(() => mahabharataSources.id, { onDelete: 'set null' }),
  sourceType: varchar('source_type', { length: 50 }).notNull(),
  parva: varchar('parva', { length: 100 }),
  chapter: varchar('chapter', { length: 50 }),
  section: varchar('section', { length: 50 }),
  verseRange: varchar('verse_range', { length: 50 }),
  speaker: varchar('speaker', { length: 100 }),
  listener: varchar('listener', { length: 100 }),
  characters: text('characters').array(),
  themes: text('themes').array(),
  originalText: text('original_text'),
  translation: text('translation').notNull(),
  contextSummary: text('context_summary'),
  relevanceForGuidance: text('relevance_for_guidance'),
  sourceReference: varchar('source_reference', { length: 100 }).notNull(),
  embedding: vector('embedding'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Message Citations Table
export const messageCitations = pgTable('message_citations', {
  id: uuid('id').defaultRandom().primaryKey(),
  messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  chunkId: uuid('chunk_id').references(() => mahabharataChunks.id, { onDelete: 'set null' }),
  source: varchar('source', { length: 100 }).notNull(),
  parva: varchar('parva', { length: 100 }),
  chapter: varchar('chapter', { length: 50 }),
  section: varchar('section', { length: 50 }),
  verseRange: varchar('verse_range', { length: 50 }),
  speaker: varchar('speaker', { length: 100 }),
  listener: varchar('listener', { length: 100 }),
  translation: text('translation').notNull(),
  originalText: text('original_text'),
  sourceReference: varchar('source_reference', { length: 100 }).notNull(),
  relevanceScore: real('relevance_score'),
  quoteType: varchar('quote_type', { length: 50 }).notNull().default('inspired_guidance'), // 'direct_quote' | 'paraphrase' | 'inspired_guidance'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// User Memories Table (Opt-in user facts)
export const userMemories = pgTable('user_memories', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  factKey: varchar('fact_key', { length: 100 }).notNull(),
  factValue: text('fact_value').notNull(),
  sourceConversationId: uuid('source_conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// AI Request Telemetry Table (Strictly metadata, never logs private conversation text)
export const aiRequestTelemetry = pgTable('ai_request_telemetry', {
  id: uuid('id').defaultRandom().primaryKey(),
  requestId: varchar('request_id', { length: 100 }).notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  model: varchar('model', { length: 100 }).notNull(),
  provider: varchar('provider', { length: 50 }).notNull(),
  totalLatencyMs: integer('total_latency_ms').notNull(),
  retrievalLatencyMs: integer('retrieval_latency_ms').notNull().default(0),
  generationLatencyMs: integer('generation_latency_ms').notNull().default(0),
  retrievedChunkCount: integer('retrieved_chunk_count').notNull().default(0),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  citationCount: integer('citation_count').notNull().default(0),
  intentCategory: varchar('intent_category', { length: 50 }),
  emotionalState: varchar('emotional_state', { length: 50 }),
  mahabharataRelevant: boolean('mahabharata_relevant').notNull().default(false),
  hasError: boolean('has_error').notNull().default(false),
  errorCode: varchar('error_code', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
