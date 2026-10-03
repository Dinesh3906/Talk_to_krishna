import { describe, it, expect } from 'vitest';
import { ConversationTurn } from '../conversation-state-tracker.js';
import { ReferenceResolver } from '../reference-resolver.js';
import { ContextualQueryResolver } from '../contextual-query-resolver.js';
import { ResponsePlanner } from '../response-planner.js';
import { AntiRepetitionGuard } from '../anti-repetition-guard.js';
import { HybridRetriever } from '../hybrid-retriever.js';
import { KrishnaPersonaService } from '../krishna-persona.service.js';
import { ConversationMemoryService } from '../conversation-memory.service.js';

describe('Talk to Krishna — Production Continuity & RAG Intelligence Suite (Tests A–F)', () => {

  // =========================================================================
  // TEST A: Same emotion, changing context
  // The user remains sad/distressed but introduces new information each turn.
  // Expected: State tracks emotional trajectory; query and response evolve.
  // =========================================================================
  describe('Test A — Same emotion, changing context', () => {
    const history: ConversationTurn[] = [];

    it('Turn 1: Academic failure -> initial disappointment', () => {
      const userMessage = 'I failed my important exam today and feel completely broken.';
      const res = ReferenceResolver.resolve(userMessage, history);
      const queryPlan = ContextualQueryResolver.resolve(
        userMessage,
        res,
        'Academic Exam Failure',
        [],
        {
          emotionalState: 'grief',
          emotionalTrajectory: ['grief'],
          history,
        }
      );

      expect(queryPlan.ragRequired).toBe(true);
      expect(queryPlan.contextualQuery.toLowerCase()).toContain('exam');

      const plan = ResponsePlanner.plan({
        userMessage,
        history,
        activeTopic: 'Exam Failure',
        activeEntities: [],
        establishedFacts: [],
        referenceResolution: res,
        intentCategory: 'emotional_distress',
        emotionalState: 'grief',
        isCasualBanter: false,
        isStoryRequest: false,
        isMahabharataRelevant: true,
      });

      expect(plan.responseMode).toBe('emotional_guidance');
      history.push({ role: 'user', content: userMessage });
      history.push({
        role: 'assistant',
        content: 'When you pour your effort into something and the outcome falls short, the disappointment is genuinely painful. Let the sadness be acknowledged first before judging your worth.',
      });
    });

    it('Turn 2: Introduces parental expectations -> Query incorporates family expectations', () => {
      const userMessage = 'My parents expected so much more from me and sacrificed everything.';
      const res = ReferenceResolver.resolve(userMessage, history);
      const queryPlan = ContextualQueryResolver.resolve(
        userMessage,
        res,
        'Exam Failure',
        [],
        {
          emotionalState: 'grief',
          emotionalTrajectory: ['grief', 'family_pressure'],
          history,
        }
      );

      // Contextual query must incorporate family/parental pressure + duty/svadharma from prior context
      expect(queryPlan.contextualQuery.toLowerCase()).toMatch(/family|parent|expectation|duty|svadharma/);

      const plan = ResponsePlanner.plan({
        userMessage,
        history,
        activeTopic: 'Parental Expectations',
        activeEntities: [],
        establishedFacts: ['User failed important exam.'],
        referenceResolution: res,
        intentCategory: 'emotional_distress',
        emotionalState: 'grief',
        isCasualBanter: false,
        isStoryRequest: false,
        isMahabharataRelevant: true,
      });

      expect(plan.responseMode).toBe('direct_followup');
      expect(plan.previousInformationToAvoidRepeating).toContain('User failed important exam.');
      history.push({ role: 'user', content: userMessage });
      history.push({
        role: 'assistant',
        content: 'Carrying the weight of those who sacrificed for you is heavier than the test itself. Their love is real, but your path must not become imprisoned by their fear.',
      });
    });

    it('Turn 3: Introduces self-worth doubt -> Query focuses on identity and self-worth', () => {
      const userMessage = 'Maybe I am simply not good enough to succeed at anything.';
      const res = ReferenceResolver.resolve(userMessage, history);
      const queryPlan = ContextualQueryResolver.resolve(
        userMessage,
        res,
        'Self Worth Doubt',
        [],
        {
          emotionalState: 'grief',
          emotionalTrajectory: ['grief', 'family_pressure', 'self_worth_doubt'],
          history,
        }
      );

      expect(queryPlan.contextualQuery.toLowerCase()).toMatch(/self-worth|identity|doubt|effort/);

      const plan = ResponsePlanner.plan({
        userMessage,
        history,
        activeTopic: 'Self-Worth Doubt',
        activeEntities: [],
        establishedFacts: ['User failed exam.', 'Parents had high expectations.'],
        referenceResolution: res,
        intentCategory: 'emotional_distress',
        emotionalState: 'grief',
        isCasualBanter: false,
        isStoryRequest: false,
        isMahabharataRelevant: true,
      });

      expect(plan.responseMode).toBe('direct_followup');
      expect(plan.newInformationRequired.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // TEST B: Same topic, different emotional state
  // Topic is Arjuna's dilemma, but emotional tone shifts from hesitation to anger to peace.
  // =========================================================================
  describe('Test B — Same topic, different emotional state', () => {
    const history: ConversationTurn[] = [];

    it('Turn 1: Hesitation / moral grief -> Foundational explanation', () => {
      const userMessage = 'Why did Arjuna drop his bow and refuse to fight?';
      const res = ReferenceResolver.resolve(userMessage, history, {
        activeTopic: 'Arjuna Hesitation',
        activeEntities: ['arjuna'],
      });
      const plan = ResponsePlanner.plan({
        userMessage,
        history,
        activeTopic: 'Arjuna Hesitation',
        activeEntities: ['arjuna'],
        establishedFacts: [],
        referenceResolution: res,
        intentCategory: 'philosophical_inquiry',
        emotionalState: 'neutral',
        isCasualBanter: false,
        isStoryRequest: false,
        isMahabharataRelevant: true,
      });

      expect(plan.responseMode).toBe('explanation');
      history.push({ role: 'user', content: userMessage });
      history.push({
        role: 'assistant',
        content: 'Arjuna dropped his Gandiva bow because his heart was overwhelmed by grief at slaying his kinsmen and revered preceptors.',
      });
    });

    it('Turn 2: Challenge / anger -> Shifts to direct follow-up without restarting', () => {
      const userMessage = 'Was Krishna unfair to push him into a bloody war when he wanted peace?';
      const res = ReferenceResolver.resolve(userMessage, history, {
        activeTopic: 'Arjuna Hesitation',
        activeEntities: ['arjuna'],
        lastDiscussedCharacter: 'Arjuna',
      });
      const plan = ResponsePlanner.plan({
        userMessage,
        history,
        activeTopic: 'Krishna War Ethics',
        activeEntities: ['arjuna', 'krishna'],
        establishedFacts: ['Arjuna dropped bow due to sorrow.'],
        referenceResolution: res,
        intentCategory: 'philosophical_inquiry',
        emotionalState: 'confusion',
        isCasualBanter: false,
        isStoryRequest: false,
        isMahabharataRelevant: true,
      });

      expect(plan.responseMode).toBe('direct_followup');
      expect(plan.responseDepth).toBe('short');
      history.push({ role: 'user', content: userMessage });
      history.push({
        role: 'assistant',
        content: 'Krishna did not push for violence; every peaceful embassy had already been exhausted. When unrighteousness threatens total destruction, running away in the name of false compassion is abdication of duty.',
      });
    });

    it('Turn 3: Peaceful clarity -> Direct follow-up acknowledging resolution', () => {
      const userMessage = 'I see now. Duty must be done without attachment to the outcome.';
      const res = ReferenceResolver.resolve(userMessage, history, {
        activeTopic: 'Arjuna Hesitation',
        activeEntities: ['arjuna'],
        lastDiscussedCharacter: 'Arjuna',
      });
      const plan = ResponsePlanner.plan({
        userMessage,
        history,
        activeTopic: 'Nishkama Karma Clarity',
        activeEntities: ['arjuna'],
        establishedFacts: ['War was last resort for dharma.'],
        referenceResolution: res,
        intentCategory: 'philosophical_inquiry',
        emotionalState: 'peace',
        isCasualBanter: false,
        isStoryRequest: false,
        isMahabharataRelevant: true,
      });

      expect(plan.responseMode).toBe('direct_followup');
    });
  });

  // =========================================================================
  // TEST C: Previously used character
  // A character was used earlier. The same story must not automatically repeat.
  // =========================================================================
  describe('Test C — Previously used character & recency decay', () => {
    it('Penalizes previously cited chunks and prevents retelling', async () => {
      const citedEpisode = 'Mahabharata (Karna Parva, Death of Karna)';

      // Check ResponsePlanner warns against retelling
      const plan = ResponsePlanner.plan({
        userMessage: 'Why was Karna known as the giver?',
        history: [
          { role: 'user', content: 'Tell me about Karna.' },
          { role: 'assistant', content: 'Karna was known for supreme loyalty to Duryodhana.' },
        ],
        activeTopic: 'Karna',
        activeEntities: ['karna'],
        establishedFacts: [],
        referenceResolution: {
          resolvedText: 'Karna',
          resolvedReferences: {},
          isHistoricalRecall: false,
          isTopicReturn: false,
          isTopicShift: false,
          isFollowUp: true,
          isShortFollowUp: false,
        },
        intentCategory: 'philosophical_inquiry',
        emotionalState: 'neutral',
        isCasualBanter: false,
        isStoryRequest: false,
        isMahabharataRelevant: true,
        previouslyCitedEpisodeIds: [citedEpisode],
      });

      const hasRetellWarning = plan.previousInformationToAvoidRepeating.some(w =>
        w.toLowerCase().includes('do not retell')
      );
      expect(hasRetellWarning).toBe(true);
      expect(plan.previousInformationToAvoidRepeating.some(w => w.includes(citedEpisode))).toBe(true);
    });
  });

  // =========================================================================
  // TEST D: Previously used teaching
  // A Gita principle was already explained. Do not explain from zero.
  // =========================================================================
  describe('Test D — Previously used teaching', () => {
    it('Prevents re-explaining foundational teaching from scratch', () => {
      const plan = ResponsePlanner.plan({
        userMessage: 'How do I apply detachment when my manager demands sales targets?',
        history: [
          { role: 'user', content: 'What is Gita 2.47?' },
          { role: 'assistant', content: 'Karmanye Vadhikaraste Ma Phaleshu Kadachana means you have a right to your duty, but not to the fruits.' },
        ],
        activeTopic: 'Detachment in Career',
        activeEntities: [],
        establishedFacts: ['Explained Gita 2.47 action without fruit.'],
        referenceResolution: {
          resolvedText: 'apply detachment',
          resolvedReferences: {},
          isHistoricalRecall: false,
          isTopicReturn: false,
          isTopicShift: false,
          isFollowUp: true,
          isShortFollowUp: false,
        },
        intentCategory: 'moral_dilemma',
        emotionalState: 'confusion',
        isCasualBanter: false,
        isStoryRequest: false,
        isMahabharataRelevant: true,
        previouslyUsedTeachings: ['Nishkama Karma', 'duty without fruits'],
      });

      const hasTeachingWarning = plan.previousInformationToAvoidRepeating.some(w =>
        w.toLowerCase().includes('do not re-explain') || w.toLowerCase().includes('build forward')
      );
      expect(hasTeachingWarning).toBe(true);
    });
  });

  // =========================================================================
  // TEST E: Long conversation (10+ turns)
  // No recurring introductory response across turns.
  // =========================================================================
  describe('Test E — Long conversation (10+ turns) persona continuity', () => {
    it('Suppresses repeated self-introductions across 10 turns', () => {
      const history: ConversationTurn[] = [
        { role: 'user', content: 'Who are you?' },
        { role: 'assistant', content: 'I am Krishna, your companion on this chariot of life.' },
      ];

      for (let turn = 2; turn <= 10; turn++) {
        history.push({ role: 'user', content: `Turn ${turn} question about life and duty.` });

        // Simulate model generating a candidate response that attempts to re-introduce identity
        const candidateWithRecurringIntro =
          'I am Krishna, your companion on this chariot of life. In this turn, let us examine the subtle nature of dharma.';

        const filtered = AntiRepetitionGuard.filter(
          candidateWithRecurringIntro,
          history,
          true,
          { personaEstablished: true }
        );

        // Verification: Introduction MUST be stripped on every follow-up turn
        expect(filtered.sanitizedContent).not.toMatch(/i am (?:lord )?krishna/i);
        expect(filtered.sanitizedContent).not.toMatch(/chariot of life/i);

        history.push({ role: 'assistant', content: filtered.sanitizedContent });
      }

      expect(history.length).toBe(20);
    });
  });

  // =========================================================================
  // TEST F: Crisis conversation (5+ turns)
  // Safety remains active while language continues naturally without duplicate hotline blocks.
  // =========================================================================
  describe('Test F — Crisis conversation (5+ turns) safety continuity', () => {
    const crisisMessages = [
      'I want to die, nothing makes sense anymore.',
      'Nothing matters anymore and nobody cares.',
      'I do not think I can keep going another day.',
      'Everyone would be happier without me.',
      'I am just so tired of existing.',
    ];

    const history: ConversationTurn[] = [];

    it('Maintains crisis safety mode on all turns with fresh language and non-repetitive hotlines', () => {
      crisisMessages.forEach((msg, idx) => {
        const crisisTurnCount = idx + 1;
        const res = ReferenceResolver.resolve(msg, history);
        const plan = ResponsePlanner.plan({
          userMessage: msg,
          history,
          activeTopic: 'Crisis Support',
          activeEntities: [],
          establishedFacts: [],
          referenceResolution: res,
          intentCategory: 'crisis_safety',
          emotionalState: 'grief',
          isCasualBanter: false,
          isStoryRequest: false,
          isMahabharataRelevant: false,
          crisisTurnCount,
        });

        // 1. Safety mode must be active on every single turn
        expect(plan.responseMode).toBe('crisis_safety');

        // 2. On follow-up turns (>1), telephone numbers should be suppressed from LLM repetition
        if (crisisTurnCount > 1) {
          const hasSuppression = plan.previousInformationToAvoidRepeating.some(w =>
            w.toLowerCase().includes('helpline') || w.toLowerCase().includes('not repeat')
          );
          expect(hasSuppression).toBe(true);
        }

        const prompt = KrishnaPersonaService.buildPrompt(
          msg,
          history,
          [],
          {
            isMahabharataRelevant: false,
            corpusDoesNotEstablish: true,
            personaEstablished: history.length > 0,
            crisisTurnCount,
            responsePlan: plan,
          }
        );

        const systemMessage = prompt.find(m => m.role === 'system')?.content || '';

        if (crisisTurnCount === 1) {
          expect(systemMessage).toContain('988');
          expect(systemMessage).toContain('Tele-MANAS');
        } else {
          expect(systemMessage).toContain('CRISIS FOLLOW-UP PRESENCE');
          expect(systemMessage).toContain('DO NOT re-list all the phone numbers');
        }

        history.push({ role: 'user', content: msg });
        history.push({
          role: 'assistant',
          content: crisisTurnCount === 1
            ? 'Your life has sacred worth. Please reach out to 988 or Tele-MANAS right now.'
            : 'I hear how heavy and exhausted you feel right now. Stay right here with me; take this one breath together.',
        });
      });
    });
  });
});
