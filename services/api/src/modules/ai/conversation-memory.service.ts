import { eq, and, desc, asc, ilike } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { conversationStates, conversationSegments, messages } from '../../db/schema.js';
import { ConversationTurn } from './conversation-state-tracker.js';

export interface PersistentConversationState {
  id: string;
  conversationId: string;
  userId: string;
  activeTopic: string;
  activeSubtopic: string;
  activeEntities: string[];
  activeStory: string;
  unresolvedQuestions: string[];
  discussedQuestions: string[];
  establishedFacts: string[];
  philosophicalThemes: string[];
  userIntent: string;
  recentSummary: string;
  conversationSummary: string;
  turnCount: number;
  lastUserMessage?: string | null;
  lastAssistantMessage?: string | null;
}

export class ConversationMemoryService {
  /**
   * Retrieves or initializes persistent conversation state for a conversation.
   */
  public static async getState(
    conversationId: string,
    userId: string
  ): Promise<PersistentConversationState> {
    const existing = await db.query.conversationStates.findFirst({
      where: and(
        eq(conversationStates.conversationId, conversationId),
        eq(conversationStates.userId, userId)
      ),
    });

    if (existing) {
      return {
        id: existing.id,
        conversationId: existing.conversationId,
        userId: existing.userId,
        activeTopic: existing.activeTopic || 'General Reflection',
        activeSubtopic: existing.activeSubtopic || '',
        activeEntities: existing.activeEntities || [],
        activeStory: existing.activeStory || '',
        unresolvedQuestions: existing.unresolvedQuestions || [],
        discussedQuestions: existing.discussedQuestions || [],
        establishedFacts: existing.establishedFacts || [],
        philosophicalThemes: existing.philosophicalThemes || [],
        userIntent: existing.userIntent || 'general_guidance',
        recentSummary: existing.recentSummary || '',
        conversationSummary: existing.conversationSummary || '',
        turnCount: existing.turnCount || 0,
        lastUserMessage: existing.lastUserMessage,
        lastAssistantMessage: existing.lastAssistantMessage,
      };
    }

    // Initialize state row
    const [created] = await db
      .insert(conversationStates)
      .values({
        conversationId,
        userId,
        activeTopic: 'General Reflection',
        activeSubtopic: '',
        activeEntities: [],
        activeStory: '',
        unresolvedQuestions: [],
        discussedQuestions: [],
        establishedFacts: [],
        philosophicalThemes: [],
        userIntent: 'general_guidance',
        recentSummary: '',
        conversationSummary: '',
        turnCount: 0,
      })
      .returning();

    return {
      id: created.id,
      conversationId: created.conversationId,
      userId: created.userId,
      activeTopic: created.activeTopic || 'General Reflection',
      activeSubtopic: created.activeSubtopic || '',
      activeEntities: created.activeEntities || [],
      activeStory: created.activeStory || '',
      unresolvedQuestions: created.unresolvedQuestions || [],
      discussedQuestions: created.discussedQuestions || [],
      establishedFacts: created.establishedFacts || [],
      philosophicalThemes: created.philosophicalThemes || [],
      userIntent: created.userIntent || 'general_guidance',
      recentSummary: created.recentSummary || '',
      conversationSummary: created.conversationSummary || '',
      turnCount: created.turnCount || 0,
      lastUserMessage: created.lastUserMessage,
      lastAssistantMessage: created.lastAssistantMessage,
    };
  }

  /**
   * Fetches the true most recent turns (bounded to sliding window of 12 turns).
   */
  public static async getRecentTurns(
    conversationId: string,
    limit: number = 12
  ): Promise<ConversationTurn[]> {
    const rows = await db.query.messages.findMany({
      where: eq(messages.conversationId, conversationId),
      orderBy: [desc(messages.createdAt)],
      limit,
    });

    // Reverse to chronological order (asc)
    return rows.reverse().map(m => ({
      role: (m.sender === 'krishna' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: m.content,
    }));
  }

  /**
   * Updates state, working summary, and topic segments asynchronously after every turn.
   */
  public static async recordTurnAndUpdateMemory(params: {
    conversationId: string;
    userId: string;
    userMessage: string;
    assistantMessage: string;
    activeTopic: string;
    activeEntities: string[];
    isTopicShift: boolean;
    establishedFact?: string;
    philosophicalTheme?: string;
  }): Promise<void> {
    const {
      conversationId,
      userId,
      userMessage,
      assistantMessage,
      activeTopic,
      activeEntities,
      isTopicShift,
      establishedFact,
      philosophicalTheme,
    } = params;

    try {
      const currentState = await this.getState(conversationId, userId);
      const newTurnCount = currentState.turnCount + 1;

      // Incremental Facts & Themes
      const updatedFacts = [...currentState.establishedFacts];
      if (establishedFact && !updatedFacts.includes(establishedFact)) {
        updatedFacts.push(establishedFact);
      }

      const updatedThemes = [...currentState.philosophicalThemes];
      if (philosophicalTheme && !updatedThemes.includes(philosophicalTheme)) {
        updatedThemes.push(philosophicalTheme);
      }

      // Incremental Working Summary
      const summaryFragment = `Turn ${newTurnCount}: User asked about ${activeTopic || 'life'}. Krishna guided on ${philosophicalTheme || 'dharma and duty'}.`;
      const updatedRecentSummary = currentState.recentSummary
        ? `${currentState.recentSummary}\n- ${summaryFragment}`.split('\n').slice(-5).join('\n')
        : `- ${summaryFragment}`;

      // Update ConversationState in PostgreSQL
      await db
        .update(conversationStates)
        .set({
          activeTopic,
          activeEntities,
          establishedFacts: updatedFacts.slice(-15),
          philosophicalThemes: updatedThemes.slice(-10),
          recentSummary: updatedRecentSummary,
          turnCount: newTurnCount,
          lastUserMessage: userMessage,
          lastAssistantMessage: assistantMessage,
          updatedAt: new Date(),
        })
        .where(and(
          eq(conversationStates.conversationId, conversationId),
          eq(conversationStates.userId, userId)
        ));

      // Manage Topic Segments
      const latestSegment = await db.query.conversationSegments.findFirst({
        where: and(
          eq(conversationSegments.conversationId, conversationId),
          eq(conversationSegments.userId, userId)
        ),
        orderBy: [desc(conversationSegments.segmentIndex)],
      });

      if (!latestSegment || isTopicShift || latestSegment.topic.toLowerCase() !== activeTopic.toLowerCase()) {
        // Create new segment
        const newSegmentIndex = latestSegment ? latestSegment.segmentIndex + 1 : 1;
        await db.insert(conversationSegments).values({
          conversationId,
          userId,
          segmentIndex: newSegmentIndex,
          topic: activeTopic,
          subtopic: '',
          startTurn: newTurnCount,
          endTurn: newTurnCount,
          entities: activeEntities,
          summary: `Discussion on ${activeTopic}: User explored ${userMessage.slice(0, 80)}.`,
          keyFacts: establishedFact ? [establishedFact] : [],
          keywords: activeEntities,
        });
      } else {
        // Update existing segment
        const updatedFactsForSegment = [...(latestSegment.keyFacts || [])];
        if (establishedFact && !updatedFactsForSegment.includes(establishedFact)) {
          updatedFactsForSegment.push(establishedFact);
        }

        await db
          .update(conversationSegments)
          .set({
            endTurn: newTurnCount,
            entities: Array.from(new Set([...latestSegment.entities, ...activeEntities])),
            summary: `${latestSegment.summary} Follow-up explored ${userMessage.slice(0, 60)}.`,
            keyFacts: updatedFactsForSegment,
            updatedAt: new Date(),
          })
          .where(eq(conversationSegments.id, latestSegment.id));
      }
    } catch (err: any) {
      console.warn('[ConversationMemoryService] Error recording memory turn:', err.message);
    }
  }
}
