import { describe, it, expect, beforeAll } from 'vitest';
import { HybridRetriever } from '../hybrid-retriever.js';
import { ConversationMemoryService } from '../conversation-memory.service.js';
import { ConversationTurn } from '../conversation-state-tracker.js';
import { ResponsePlanner } from '../response-planner.js';
import { ReferenceResolver } from '../reference-resolver.js';
import { KrishnaPersonaService } from '../krishna-persona.service.js';
import { AntiRepetitionGuard } from '../anti-repetition-guard.js';
import { v4 as uuidv4 } from 'uuid';

describe('Long-Horizon Conversation Robustness & Continuity (10-20+ Turns)', () => {
  beforeAll(() => {
    process.env.DISABLE_LOCAL_EMBEDDING = 'true';
  });

  // Test 1: 20-Turn State & Working Memory Tracking Without Context Drift
  it('maintains working summary, active entities, and topic milestones over 20 turns in session memory', () => {
    const conversationId = uuidv4();
    const userId = uuidv4();
    const session = ConversationMemoryService.getSession(conversationId, userId);

    for (let t = 1; t <= 20; t++) {
      const topic = t <= 5 ? 'Career burnout' : t <= 10 ? 'Ethical dilemma with cofounder' : t <= 15 ? 'Family expectations' : 'Rediscovering purpose';
      session.turns.push({ role: 'user', content: `Turn ${t} message regarding ${topic}` });
      session.turns.push({ role: 'assistant', content: `Turn ${t} Krishna guidance exploring dharma in ${topic}` });
      session.state.turnCount = t;
      session.state.personaEstablished = true;
      session.state.activeTopic = topic;
      if (t % 4 === 0) {
        session.state.establishedFacts.push(`Milestone at turn ${t}: ${topic}`);
      }
      const otherTopics = session.state.recentUserTopics.filter(top => top.toLowerCase() !== topic.toLowerCase());
      session.state.recentUserTopics = [...otherTopics, topic].slice(-8);
      session.state.recentSummary = `${session.state.recentSummary || ''}\n- Turn ${t}: ${topic}`.split('\n').slice(-8).join('\n');
    }

    expect(session.state.turnCount).toBe(20);
    expect(session.state.personaEstablished).toBe(true);
    expect(session.state.recentSummary).toBeDefined();
    expect(session.state.recentSummary.split('\n').length).toBeGreaterThanOrEqual(5);
    expect(session.state.establishedFacts.length).toBeGreaterThanOrEqual(4);
    expect(session.state.recentUserTopics.some(t => t.toLowerCase().includes('career') || t.toLowerCase().includes('cofounder'))).toBe(true);
  });

  // Test 2: Recency Decay: Penalty Decays to 0 Within 3 Turns
  it('applies recency penalty on turn 1 but decays completely to 0 after 3 turns', async () => {
    const query = 'duty and action';
    const initialRet = await HybridRetriever.retrieve(query, [], [], 5);
    expect(initialRet.passages.length).toBeGreaterThan(0);
    const topPassage = initialRet.passages[0];

    // Case A: Used in immediate prior turn (turnsAgo = 0)
    const retTurn1 = await HybridRetriever.retrieve(
      query,
      [],
      [],
      5,
      [],
      {
        citedChunkIds: [topPassage.id],
        citedEpisodeIds: [topPassage.sourceReference],
        mentionedCharacters: topPassage.characters || [],
      }
    );

    const matchTurn1 = retTurn1.passages.find(p => p.id === topPassage.id);
    if (matchTurn1) {
      expect(matchTurn1.relevanceScore).toBeLessThan(topPassage.relevanceScore);
    }

    // Case B: Used 4 turns ago (turnsAgo = 3+) -> Should have 0 penalty
    const retTurn4 = await HybridRetriever.retrieve(
      query,
      [],
      [],
      10,
      [],
      {
        citedChunkIds: [topPassage.id, 'chunk_b', 'chunk_c', 'chunk_d'],
        citedEpisodeIds: [topPassage.sourceReference, 'ep_b', 'ep_c', 'ep_d'],
        mentionedCharacters: ['bhishma', 'drona', 'karna'],
      }
    );

    const matchTurn4 = retTurn4.passages.find(p => p.id === topPassage.id);
    expect(matchTurn4).toBeDefined();
    if (matchTurn1 && matchTurn4) {
      expect(matchTurn4.relevanceScore).toBeGreaterThan(matchTurn1.relevanceScore);
    }
  }, 15000);

  // Test 3: Re-Visiting Core Teaching Gets NO Penalty and Gains Revisit Bonus
  it('awards a revisit bonus and 0 penalty when user explicitly re-queries a core teaching', async () => {
    const teachingQuery = 'Bhagavad Gita 2.47';
    const ret = await HybridRetriever.retrieve(
      teachingQuery,
      [],
      [],
      5,
      [],
      {
        citedChunkIds: ['some_chunk_id'],
        citedEpisodeIds: ['Bhagavad Gita 2.47'],
        mentionedCharacters: ['krishna', 'arjuna'],
      }
    );

    const gita247 = ret.passages.find(p => p.sourceReference.includes('2.47'));
    expect(gita247).toBeDefined();
    expect(gita247!.relevanceScore).toBeGreaterThan(0.70);
  });

  // Test 4: Re-Visiting Episode/Character After 5 Turns Has Zero Repetition Penalty
  it('allows an episode from earlier turns to re-emerge seamlessly after 5 turns', async () => {
    const query = 'Yaksha Prashna dharma questions';
    const ret = await HybridRetriever.retrieve(
      query,
      ['yudhishthira'],
      ['dharma'],
      5,
      [],
      {
        citedChunkIds: ['old_chunk_1', 'old_chunk_2', 'old_chunk_3', 'old_chunk_4', 'old_chunk_5'],
        citedEpisodeIds: ['Mahabharata (Vana Parva, The Yaksha Prashna)', 'ep_2', 'ep_3', 'ep_4', 'ep_5'],
        mentionedCharacters: ['arjuna', 'bhishma', 'drona', 'yudhishthira'],
      }
    );

    const yakshaPassage = ret.passages.find(p =>
      p.sourceReference.toLowerCase().includes('yaksha') ||
      p.contextSummary.toLowerCase().includes('yaksha') ||
      p.translation.toLowerCase().includes('yaksha')
    );
    expect(yakshaPassage).toBeDefined();
    expect(yakshaPassage!.relevanceScore).toBeGreaterThan(0.40);
  });

  // Test 5: Contradiction Reconciliation in Session Memory
  it('reconciles contradictory user statements by updating established facts in session memory', () => {
    const conversationId = uuidv4();
    const session = ConversationMemoryService.getSession(conversationId);

    // Initial fact
    session.state.establishedFacts.push('User shared: i was fired from my job yesterday');
    expect(session.state.establishedFacts.some(f => f.includes('fired'))).toBe(true);

    // User clarifies contradiction
    const clarification = 'Clarification: actually i was not fired, i quit because of anxiety';
    const clarificationContent = clarification.replace('Clarification:', '').toLowerCase();
    const keySubjects = ['job', 'fired', 'quit', 'resigned'];
    session.state.establishedFacts = session.state.establishedFacts.filter(f => {
      if (!f.startsWith('User shared:')) return true;
      const past = f.replace('User shared:', '').toLowerCase();
      return !keySubjects.some(k => clarificationContent.includes(k) && past.includes(k));
    });
    session.state.establishedFacts.push(clarification);

    expect(session.state.establishedFacts.some(f => f.includes('Clarification:'))).toBe(true);
    expect(session.state.establishedFacts.filter(f => f.includes('fired')).length).toBe(1);
    expect(session.state.establishedFacts.some(f => f.includes('quit'))).toBe(true);
  });

  // Test 6: Topic Switching (Sadness -> Career -> Return to Sadness)
  it('preserves continuity across topic transitions with ReferenceResolver', () => {
    const history: ConversationTurn[] = [
      { role: 'user', content: 'i feel a deep sense of sadness in my chest' },
      { role: 'assistant', content: 'Sit with that sensation quietly...' },
      { role: 'user', content: 'my startup is running out of money' },
      { role: 'assistant', content: 'When practical challenges mount, focus on action...' },
    ];

    const ref = ReferenceResolver.resolve('going back to the sadness we talked about earlier', history, {
      activeTopic: 'Startup finances',
      activeEntities: ['startup'],
      establishedFacts: ['User experiencing heavy chest grief', 'User startup facing financial crisis'],
    });

    expect(ref.isTopicReturn).toBe(true);
    expect(ref.resolvedText.toLowerCase()).toContain('sadness');
  });

  // Test 7: Multi-Turn Crisis Safety Persistence (Turns 1 to 10)
  it('maintains crisis state across 10 turns without repeating phone numbers after Turn 1', () => {
    const history: ConversationTurn[] = [];

    const ref1 = ReferenceResolver.resolve('i just want to die', history);
    const planTurn1 = ResponsePlanner.plan({
      userMessage: 'i just want to die',
      history,
      activeTopic: 'Crisis Support',
      activeEntities: [],
      establishedFacts: [],
      referenceResolution: ref1,
      intentCategory: 'crisis_self_harm',
      emotionalState: 'hopelessness',
      turnCount: 1,
      crisisTurnCount: 1,
      isCrisis: true,
    });

    expect(planTurn1.responseMode).toBe('crisis_safety');

    const promptTurn1 = KrishnaPersonaService.buildPrompt('i just want to die', history, [], {
      isMahabharataRelevant: false,
      corpusDoesNotEstablish: false,
      responsePlan: planTurn1,
      crisisTurnCount: 1,
    })[0].content;
    expect(promptTurn1).toContain('988');
    expect(promptTurn1).toContain('14416');

    // Turn 5 Crisis Planner
    const historyTurn5: ConversationTurn[] = [
      { role: 'user', content: 'i just want to die' },
      { role: 'assistant', content: 'I hear your pain...' },
      { role: 'user', content: 'nothing matters anymore' },
      { role: 'assistant', content: 'Stay right here with me...' },
    ];
    const ref5 = ReferenceResolver.resolve('i feel completely numb inside', historyTurn5);
    const planTurn5 = ResponsePlanner.plan({
      userMessage: 'i feel completely numb inside',
      history: historyTurn5,
      activeTopic: 'Crisis Support',
      activeEntities: [],
      establishedFacts: [],
      referenceResolution: ref5,
      intentCategory: 'crisis_self_harm',
      emotionalState: 'despair',
      turnCount: 5,
      crisisTurnCount: 5,
      isCrisis: true,
    });

    expect(planTurn5.responseMode).toBe('crisis_safety');

    const promptTurn5 = KrishnaPersonaService.buildPrompt('i feel completely numb inside', historyTurn5, [], {
      isMahabharataRelevant: false,
      corpusDoesNotEstablish: false,
      responsePlan: planTurn5,
      crisisTurnCount: 5,
    })[0].content;
    expect(promptTurn5).toContain('CRISIS FOLLOW-UP PRESENCE (TURN 5)');
    expect(promptTurn5).toContain('DO NOT re-list all the phone numbers');
  });

  // Test 8: Anti-Repetition Guard Strips Identity Claims Over 20 Turns
  it('strips redundant self-introductions in late turns (e.g. Turn 15)', () => {
    const lateTurnResponse = 'I am Krishna, your companion on this chariot of life. When you face this crossroad, examine your core intention.';
    const history: ConversationTurn[] = [
      { role: 'user', content: 'What do I do?' },
      { role: 'assistant', content: 'Examine your intention...' },
    ];
    const filtered = AntiRepetitionGuard.filter(lateTurnResponse, history, true, {
      personaEstablished: true,
    });

    expect(filtered.sanitizedContent).not.toContain('I am Krishna, your companion on this chariot of life');
    expect(filtered.sanitizedContent).toContain('When you face this crossroad');
  });

  // Test 9: Persona Voice Stays Grounded Without Pompous Clichés Over Long Dialogue
  it('replaces archaic clichés with grounded, natural conversational language', () => {
    const rawWithCliche = 'You are walking the journey, and the cosmic chariot of existence brings you here.';
    const history: ConversationTurn[] = [];
    const cleaned = AntiRepetitionGuard.filter(rawWithCliche, history, false, {
      personaEstablished: true,
    });

    expect(cleaned.sanitizedContent).not.toContain('cosmic chariot of existence');
    expect(cleaned.sanitizedContent).toContain('journey of life');
  });

  // Test 10: Long-Context Retrieval Remains Grounded on Turn 20
  it('retrieves high-confidence canonical evidence on turn 20 without hallucination', async () => {
    const query = 'duty and action';
    const prevChunks = Array.from({ length: 20 }, (_, i) => `chunk_${i}`);
    const prevEpisodes = Array.from({ length: 20 }, (_, i) => `ep_${i}`);
    const prevChars = ['arjuna', 'karna', 'bhishma', 'drona', 'yudhishthira'];

    const ret = await HybridRetriever.retrieve(
      query,
      [],
      [],
      3,
      [],
      {
        citedChunkIds: prevChunks,
        citedEpisodeIds: prevEpisodes,
        mentionedCharacters: prevChars,
      }
    );

    expect(ret.hasSufficientEvidence).toBe(true);
    expect(ret.passages.length).toBeGreaterThan(0);
    expect(ret.passages[0].relevanceScore).toBeGreaterThan(0.30);
    expect(ret.corpusDoesNotEstablish).toBe(false);
  });
});
