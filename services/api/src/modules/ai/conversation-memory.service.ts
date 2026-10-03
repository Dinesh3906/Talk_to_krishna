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

  // Rich Production Conversation-State Tracking
  turnNumber: number;
  recentUserTopics: string[];
  currentTopic: string;
  emotionalState: string;
  emotionalTrajectory: string[];
  previouslyCitedChunkIds: string[];
  previouslyCitedEpisodeIds: string[];
  previouslyMentionedCharacters: string[];
  previouslyUsedTeachings: string[];
  previouslyUsedThemes: string[];
  recentResponseSummaries: string[];
  recentResponseOpenings: string[];
  lastRetrievedEvidence: string[];
  crisisState: boolean;
  crisisTurnCount: number;
  personaEstablished: boolean;
}

export class ConversationMemoryService {
  private static memorySessionCache = new Map<string, {
    state: PersistentConversationState;
    turns: ConversationTurn[];
  }>();

  public static getSession(conversationId: string, userId: string = 'default_user') {
    let session = this.memorySessionCache.get(conversationId);
    if (!session) {
      session = {
        state: {
          id: conversationId,
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
          turnNumber: 0,
          recentUserTopics: [],
          currentTopic: 'General Reflection',
          emotionalState: 'neutral',
          emotionalTrajectory: [],
          previouslyCitedChunkIds: [],
          previouslyCitedEpisodeIds: [],
          previouslyMentionedCharacters: [],
          previouslyUsedTeachings: [],
          previouslyUsedThemes: [],
          recentResponseSummaries: [],
          recentResponseOpenings: [],
          lastRetrievedEvidence: [],
          crisisState: false,
          crisisTurnCount: 0,
          personaEstablished: false,
        },
        turns: [],
      };
      this.memorySessionCache.set(conversationId, session);
    }
    return session;
  }

  /**
   * Retrieves or initializes persistent conversation state for a conversation.
   */
  public static async getState(
    conversationId: string,
    userId: string
  ): Promise<PersistentConversationState> {
    try {
      const existing = await db.query.conversationStates.findFirst({
        where: and(
          eq(conversationStates.conversationId, conversationId),
          eq(conversationStates.userId, userId)
        ),
      });

      if (existing) {
        const session = this.getSession(conversationId, userId);
        const state: PersistentConversationState = {
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

          turnNumber: existing.turnCount || session.state.turnNumber || 0,
          recentUserTopics: session.state.recentUserTopics || [],
          currentTopic: existing.activeTopic || session.state.currentTopic || 'General Reflection',
          emotionalState: session.state.emotionalState || 'neutral',
          emotionalTrajectory: session.state.emotionalTrajectory || [],
          previouslyCitedChunkIds: session.state.previouslyCitedChunkIds || [],
          previouslyCitedEpisodeIds: session.state.previouslyCitedEpisodeIds || [],
          previouslyMentionedCharacters: session.state.previouslyMentionedCharacters || [],
          previouslyUsedTeachings: session.state.previouslyUsedTeachings || [],
          previouslyUsedThemes: existing.philosophicalThemes || session.state.previouslyUsedThemes || [],
          recentResponseSummaries: session.state.recentResponseSummaries || [],
          recentResponseOpenings: session.state.recentResponseOpenings || [],
          lastRetrievedEvidence: session.state.lastRetrievedEvidence || [],
          crisisState: session.state.crisisState || false,
          crisisTurnCount: session.state.crisisTurnCount || 0,
          personaEstablished: (existing.turnCount && existing.turnCount > 0) || session.state.personaEstablished || false,
        };
        session.state = state;
        return state;
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

      const session = this.getSession(conversationId, userId);
      const state: PersistentConversationState = {
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

        turnNumber: 0,
        recentUserTopics: [],
        currentTopic: created.activeTopic || 'General Reflection',
        emotionalState: 'neutral',
        emotionalTrajectory: [],
        previouslyCitedChunkIds: [],
        previouslyCitedEpisodeIds: [],
        previouslyMentionedCharacters: [],
        previouslyUsedTeachings: [],
        previouslyUsedThemes: [],
        recentResponseSummaries: [],
        recentResponseOpenings: [],
        lastRetrievedEvidence: [],
        crisisState: false,
        crisisTurnCount: 0,
        personaEstablished: false,
      };
      session.state = state;
      return state;
    } catch (err: any) {
      console.warn('[ConversationMemoryService] Database unavailable, using in-memory state:', err.message);
      return this.getSession(conversationId, userId).state;
    }
  }

  /**
   * Fetches the true most recent turns (bounded to sliding window of 12 turns).
   */
  public static async getRecentTurns(
    conversationId: string,
    limit: number = 12
  ): Promise<ConversationTurn[]> {
    try {
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
    } catch (err: any) {
      console.warn('[ConversationMemoryService] Database unavailable, using in-memory turns:', err.message);
      const session = this.getSession(conversationId);
      return session.turns.slice(-limit);
    }
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
    emotionalState?: string;
    userIntent?: string;
    citedChunkIds?: string[];
    citedEpisodeIds?: string[];
    mentionedCharacters?: string[];
    usedTeachings?: string[];
    retrievedEvidenceReferences?: string[];
    isCrisis?: boolean;
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
      emotionalState,
      userIntent,
      citedChunkIds,
      citedEpisodeIds,
      mentionedCharacters,
      usedTeachings,
      retrievedEvidenceReferences,
      isCrisis,
    } = params;

    try {
      const currentState = await this.getState(conversationId, userId);
      const newTurnCount = currentState.turnCount + 1;

      // Incremental Facts & Themes
      let updatedFacts = [...currentState.establishedFacts];
      if (establishedFact) {
        if (establishedFact.startsWith('Clarification:')) {
          // If the user clarifies a past topic, prune obsolete older statements with overlapping keywords
          const clarificationContent = establishedFact.replace('Clarification:', '').toLowerCase();
          const keySubjects = ['job', 'fired', 'quit', 'resigned', 'cofounder', 'money', 'exam', 'partner', 'parents'];
          updatedFacts = updatedFacts.filter(f => {
            if (!f.startsWith('User shared:')) return true;
            const pastShared = f.replace('User shared:', '').toLowerCase();
            const overlap = keySubjects.some(k => clarificationContent.includes(k) && pastShared.includes(k));
            return !overlap;
          });
          updatedFacts.push(establishedFact);
        } else if (!updatedFacts.includes(establishedFact)) {
          updatedFacts.push(establishedFact);
        }
      }

      const updatedThemes = [...currentState.philosophicalThemes];
      if (philosophicalTheme && !updatedThemes.includes(philosophicalTheme)) {
        updatedThemes.push(philosophicalTheme);
      }

      // Incremental Working Summary (retain up to 8 recent milestone turns)
      const summaryFragment = `Turn ${newTurnCount}: User asked about ${activeTopic || 'life'}. Krishna guided on ${philosophicalTheme || 'dharma and duty'}.`;
      const updatedRecentSummary = currentState.recentSummary
        ? `${currentState.recentSummary}\n- ${summaryFragment}`.split('\n').slice(-8).join('\n')
        : `- ${summaryFragment}`;

      // Update in-memory session state immediately
      const session = this.getSession(conversationId, userId);
      session.turns.push({ role: 'user', content: userMessage });
      session.turns.push({ role: 'assistant', content: assistantMessage });
      session.state.turnCount = newTurnCount;
      session.state.turnNumber = newTurnCount;
      session.state.personaEstablished = true;
      session.state.activeTopic = activeTopic;
      session.state.currentTopic = activeTopic;
      session.state.activeEntities = activeEntities;
      session.state.establishedFacts = updatedFacts.slice(-15);
      session.state.philosophicalThemes = updatedThemes.slice(-10);
      session.state.recentSummary = updatedRecentSummary;
      session.state.lastUserMessage = userMessage;
      session.state.lastAssistantMessage = assistantMessage;

      // Update extended state tracking
      if (activeTopic) {
        const otherTopics = session.state.recentUserTopics.filter(t => t.toLowerCase() !== activeTopic.toLowerCase());
        session.state.recentUserTopics = [...otherTopics, activeTopic].slice(-8);
      }
      if (emotionalState) {
        session.state.emotionalState = emotionalState;
        session.state.emotionalTrajectory = [...session.state.emotionalTrajectory, emotionalState].slice(-10);
      }
      if (userIntent) {
        session.state.userIntent = userIntent;
      }
      if (citedChunkIds && citedChunkIds.length > 0) {
        session.state.previouslyCitedChunkIds = Array.from(new Set([...session.state.previouslyCitedChunkIds, ...citedChunkIds])).slice(-25);
      }
      if (citedEpisodeIds && citedEpisodeIds.length > 0) {
        session.state.previouslyCitedEpisodeIds = Array.from(new Set([...session.state.previouslyCitedEpisodeIds, ...citedEpisodeIds])).slice(-25);
      }
      if (mentionedCharacters && mentionedCharacters.length > 0) {
        session.state.previouslyMentionedCharacters = Array.from(new Set([...session.state.previouslyMentionedCharacters, ...mentionedCharacters])).slice(-25);
      }
      if (usedTeachings && usedTeachings.length > 0) {
        session.state.previouslyUsedTeachings = Array.from(new Set([...session.state.previouslyUsedTeachings, ...usedTeachings])).slice(-15);
      }
      if (retrievedEvidenceReferences && retrievedEvidenceReferences.length > 0) {
        session.state.lastRetrievedEvidence = retrievedEvidenceReferences.slice(0, 5);
      }
      if (isCrisis) {
        session.state.crisisState = true;
        session.state.crisisTurnCount = (session.state.crisisTurnCount || 0) + 1;
      } else {
        session.state.crisisState = false;
        session.state.crisisTurnCount = 0;
      }

      const opening = assistantMessage.split(/[.!?\n]/)[0]?.trim();
      if (opening && opening.length > 5) {
        session.state.recentResponseOpenings = [...session.state.recentResponseOpenings, opening].slice(-8);
      }
      session.state.recentResponseSummaries = [...session.state.recentResponseSummaries, summaryFragment].slice(-8);

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
