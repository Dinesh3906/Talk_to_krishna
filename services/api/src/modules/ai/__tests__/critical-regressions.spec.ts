import { describe, it, expect } from 'vitest';
import { ReferenceResolver } from '../reference-resolver.js';
import { ContextualQueryResolver } from '../contextual-query-resolver.js';
import { ResponsePlanner } from '../response-planner.js';
import { AntiRepetitionGuard } from '../anti-repetition-guard.js';
import { ConversationTurn } from '../conversation-state-tracker.js';

describe('Talk to Krishna — Critical Regression Tests', () => {
  // =========================================================================
  // Section 45: CRITICAL REGRESSION TEST 1
  // =========================================================================
  describe('Regression Test 1 (Section 45) — Multi-Turn Flow & Continuity', () => {
    const history: ConversationTurn[] = [];

    it('Turn 1: "Why did Arjuna hesitate?" -> Detailed foundational explanation', () => {
      const userMessage = 'Why did Arjuna hesitate?';
      const resolution = ReferenceResolver.resolve(userMessage, history, {
        activeTopic: 'General Reflection',
        activeEntities: [],
      });

      expect(resolution.referentCharacter).toBe('Arjuna');
      expect(resolution.isHistoricalRecall).toBe(false);

      const queryPlan = ContextualQueryResolver.resolve(userMessage, resolution, 'Arjuna', ['Arjuna']);
      expect(queryPlan.ragRequired).toBe(true);
      expect(queryPlan.contextualQuery).toContain('Arjuna');

      const plan = ResponsePlanner.plan({
        userMessage,
        history,
        activeTopic: 'Arjuna',
        activeEntities: ['arjuna'],
        establishedFacts: [],
        referenceResolution: resolution,
        intentCategory: 'philosophical_inquiry',
        emotionalState: 'neutral',
        isCasualBanter: false,
        isStoryRequest: false,
        isMahabharataRelevant: true,
      });

      expect(plan.responseMode).toBe('explanation');
      expect(plan.responseDepth).toBe('detailed');
      expect(plan.targetTokens).toBeGreaterThanOrEqual(250);

      // Record Turn 1
      history.push({ role: 'user', content: userMessage });
      history.push({
        role: 'assistant',
        content: 'Arjuna hesitated before Kurukshetra not from physical fear or lack of valor, but because of a profound moral conflict between his warrior duty (Kshatriya dharma) and his intense personal attachment (sneha) to his revered elders Bhishma and Drona.'
      });
    });

    it('Turn 2: "But wasn\'t he a great warrior?" -> Continuation, not repetition', () => {
      const userMessage = "But wasn't he a great warrior?";
      const resolution = ReferenceResolver.resolve(userMessage, history, {
        activeTopic: 'Arjuna',
        activeEntities: ['arjuna'],
        lastDiscussedCharacter: 'Arjuna',
      });

      expect(resolution.isFollowUp).toBe(true);
      expect(resolution.resolvedReferences['he/him/his']).toBe('Arjuna');

      const plan = ResponsePlanner.plan({
        userMessage,
        history,
        activeTopic: 'Arjuna',
        activeEntities: ['arjuna'],
        establishedFacts: ['Arjuna hesitation was moral, not physical.'],
        referenceResolution: resolution,
        intentCategory: 'philosophical_inquiry',
        emotionalState: 'neutral',
        isCasualBanter: false,
        isStoryRequest: false,
        isMahabharataRelevant: true,
      });

      expect(plan.responseMode).toBe('direct_followup');
      expect(plan.responseDepth).toBe('short');
      expect(plan.targetTokens).toBeLessThan(180);

      // Verify anti-repetition check catches duplicate introductions
      const candidateWithBoilerplate = 'Arjuna was one of the greatest warriors in the world. But his battle was within.';
      const filtered = AntiRepetitionGuard.filter(candidateWithBoilerplate, history, true);
      expect(filtered.sanitizedContent).not.toMatch(/arjuna was one of the greatest warriors/i);

      // Record Turn 2
      history.push({ role: 'user', content: userMessage });
      history.push({
        role: 'assistant',
        content: 'Yes, and that is precisely why his hesitation is so momentous. His skill was supreme, but martial excellence cannot solve a crisis of conscience. He knew how to fight; he did not know whether it was righteous to fight those he loved.'
      });
    });

    it('Turn 3: "Then why did Krishna not fight for him?" -> Continuation with guidance', () => {
      const userMessage = "Then why did Krishna not fight for him?";
      const resolution = ReferenceResolver.resolve(userMessage, history, {
        activeTopic: 'Arjuna',
        activeEntities: ['arjuna'],
        lastDiscussedCharacter: 'Arjuna',
      });

      expect(resolution.isFollowUp).toBe(true);
      expect(resolution.resolvedReferences['he/him/his']).toBe('Arjuna');

      const plan = ResponsePlanner.plan({
        userMessage,
        history,
        activeTopic: 'Arjuna',
        activeEntities: ['arjuna'],
        establishedFacts: ['Arjuna hesitation was moral, not physical.'],
        referenceResolution: resolution,
        intentCategory: 'philosophical_inquiry',
        emotionalState: 'neutral',
        isCasualBanter: false,
        isStoryRequest: false,
        isMahabharataRelevant: true,
      });

      expect(plan.responseMode).toBe('direct_followup');
      expect(plan.responseDepth).toBe('short');

      history.push({ role: 'user', content: userMessage });
      history.push({
        role: 'assistant',
        content: 'Because Krishna’s role was charioteer and guide, not a substitute for Arjuna’s own agency. If Krishna had fought the war for him, Arjuna would never have attained self-knowledge. Life requires that each soul face their own dharma.'
      });
    });

    it('Turn 4: "What about Bhishma?" -> Clean Topic Shift without baggage', () => {
      const userMessage = 'What about Bhishma?';
      const resolution = ReferenceResolver.resolve(userMessage, history, {
        activeTopic: 'Arjuna',
        activeEntities: ['arjuna'],
        lastDiscussedCharacter: 'Arjuna',
      });

      expect(resolution.referentCharacter).toBe('Bhishma');

      const plan = ResponsePlanner.plan({
        userMessage,
        history,
        activeTopic: 'Bhishma',
        activeEntities: ['bhishma'],
        establishedFacts: [],
        referenceResolution: resolution,
        intentCategory: 'philosophical_inquiry',
        emotionalState: 'neutral',
        isCasualBanter: false,
        isStoryRequest: false,
        isMahabharataRelevant: true,
      });

      expect(plan.activeTopic).toBe('Bhishma');

      history.push({ role: 'user', content: userMessage });
      history.push({
        role: 'assistant',
        content: 'Bhishma stood trapped in a different dilemma. Bound by his terrible vow of unyielding loyalty to the Hastinapura throne, he fought on the side of adharma despite knowing the Pandavas were righteous.'
      });
    });

    it('Turn 5: "Coming back to Arjuna, what was his biggest mistake?" -> Topic restoration', () => {
      const userMessage = 'Coming back to Arjuna, what was his biggest mistake?';
      const resolution = ReferenceResolver.resolve(userMessage, history, {
        activeTopic: 'Bhishma',
        activeEntities: ['bhishma'],
        lastDiscussedCharacter: 'Bhishma',
      });

      expect(resolution.isTopicReturn).toBe(true);
      expect(resolution.restoredTopic).toBe('Arjuna');

      const plan = ResponsePlanner.plan({
        userMessage,
        history,
        activeTopic: 'Arjuna',
        activeEntities: ['arjuna'],
        establishedFacts: [],
        referenceResolution: resolution,
        intentCategory: 'philosophical_inquiry',
        emotionalState: 'neutral',
        isCasualBanter: false,
        isStoryRequest: false,
        isMahabharataRelevant: true,
      });

      expect(plan.topicReturn).toBe(true);
      expect(plan.continuityAcknowledgement).toContain('Arjuna');

      history.push({ role: 'user', content: userMessage });
      history.push({
        role: 'assistant',
        content: 'Returning to Arjuna, his greatest error at the start was confusing grief with righteousness, projecting his personal attachment onto cosmic duty.'
      });
    });

    it('Turn 6: "What did I ask you about Arjuna earlier?" -> Grounded historical recall', () => {
      const userMessage = 'What did I ask you about Arjuna earlier?';
      const resolution = ReferenceResolver.resolve(userMessage, history, {
        activeTopic: 'Arjuna',
        activeEntities: ['arjuna'],
        lastDiscussedCharacter: 'Arjuna',
      });

      expect(resolution.isHistoricalRecall).toBe(true);
      expect(resolution.targetCharacterForRecall).toBe('Arjuna');

      const queryPlan = ContextualQueryResolver.resolve(userMessage, resolution, 'Arjuna', ['Arjuna']);
      expect(queryPlan.ragRequired).toBe(false); // Scripture RAG is gated!

      const plan = ResponsePlanner.plan({
        userMessage,
        history,
        activeTopic: 'Arjuna',
        activeEntities: ['arjuna'],
        establishedFacts: [],
        referenceResolution: resolution,
        intentCategory: 'general_guidance',
        emotionalState: 'neutral',
        isCasualBanter: false,
        isStoryRequest: false,
        isMahabharataRelevant: false,
        historicalMemory: {
          found: true,
          honestStatement: 'Earlier in this chat, you asked why Arjuna hesitated before the war, whether he was a great warrior, and why Krishna did not fight for him.',
        }
      });

      expect(plan.responseMode).toBe('historical_recall');
      expect(plan.relevantMemory.length).toBeGreaterThan(0);
      expect(plan.relevantMemory[0]).toContain('hesitated');
    });
  });

  // =========================================================================
  // Section 46: CRITICAL REGRESSION TEST 2 — Karna Reference Chain
  // =========================================================================
  describe('Regression Test 2 (Section 46) — Karna Anaphora & Context Chain', () => {
    const karnaHistory: ConversationTurn[] = [];

    it('T1: "Tell me about Karna." -> Introduces Karna', () => {
      const userMessage = 'Tell me about Karna.';
      const res = ReferenceResolver.resolve(userMessage, karnaHistory);
      expect(res.referentCharacter).toBe('Karna');

      karnaHistory.push({ role: 'user', content: userMessage });
      karnaHistory.push({
        role: 'assistant',
        content: 'Karna is one of the most tragic and brilliant figures of the Mahabharata. Born to Kunti and the Sun god Surya, cast away as an infant, and raised by charioteer parents Adhiratha and Radha, he was a peerless archer whose life was defined by generosity and unyielding loyalty.'
      });
    });

    it('T2: "Why was he loyal to Duryodhana?" -> Resolves "he" to Karna', () => {
      const userMessage = 'Why was he loyal to Duryodhana?';
      const res = ReferenceResolver.resolve(userMessage, karnaHistory, {
        activeTopic: 'Karna',
        activeEntities: ['karna'],
        lastDiscussedCharacter: 'Karna',
      });

      expect(res.isFollowUp).toBe(true);
      expect(res.resolvedReferences['he/him/his']).toBe('Karna');

      const queryPlan = ContextualQueryResolver.resolve(userMessage, res, 'Karna', ['Karna']);
      expect(queryPlan.contextualQuery).toContain('Karna');
      expect(queryPlan.contextualQuery).toContain('Duryodhana');

      karnaHistory.push({ role: 'user', content: userMessage });
      karnaHistory.push({
        role: 'assistant',
        content: 'When Karna was publicly mocked and denied entry to the martial tournament because of his perceived low birth, Duryodhana crowned him King of Anga on the spot, granting him dignity when society denied it.'
      });
    });

    it('T3: "Wasn\'t he aware of his real identity?" -> Resolves "he" and "his"', () => {
      const userMessage = "Wasn't he aware of his real identity?";
      const res = ReferenceResolver.resolve(userMessage, karnaHistory, {
        activeTopic: 'Karna',
        activeEntities: ['karna'],
        lastDiscussedCharacter: 'Karna',
      });

      expect(res.isFollowUp).toBe(true);
      expect(res.resolvedReferences['he/him/his']).toBe('Karna');

      const queryPlan = ContextualQueryResolver.resolve(userMessage, res, 'Karna', ['Karna']);
      expect(queryPlan.contextualQuery).toContain('Karna');
      expect(queryPlan.contextualQuery).toMatch(/identity|birth/i);

      karnaHistory.push({ role: 'user', content: userMessage });
      karnaHistory.push({
        role: 'assistant',
        content: 'For most of his life, he did not know. The truth of his divine birth was kept hidden from him until just before the Kurukshetra war.'
      });
    });

    it('T4: "What happened after that?" -> Follow-up on revelation event', () => {
      const userMessage = 'What happened after that?';
      const res = ReferenceResolver.resolve(userMessage, karnaHistory, {
        activeTopic: 'Karna identity revelation',
        activeEntities: ['karna'],
        lastDiscussedCharacter: 'Karna',
      });

      expect(res.isShortFollowUp).toBe(true);
      expect(res.isFollowUp).toBe(true);
      expect(res.referentCharacter).toBe('Karna');

      karnaHistory.push({ role: 'user', content: userMessage });
      karnaHistory.push({
        role: 'assistant',
        content: 'Krishna approached Karna privately in Udyoga Parva, revealing that he was the eldest Pandava and offering him the imperial throne of Hastinapura. Yet Karna refused to abandon Duryodhana in his hour of greatest need.'
      });
    });

    it('T5: "Who told him?" -> Resolves "him" to Karna', () => {
      const userMessage = 'Who told him?';
      const res = ReferenceResolver.resolve(userMessage, karnaHistory, {
        activeTopic: 'Karna identity',
        activeEntities: ['karna'],
        lastDiscussedCharacter: 'Karna',
      });

      expect(res.isShortFollowUp).toBe(true);
      expect(res.resolvedReferences['he/him/his']).toBe('Karna');

      karnaHistory.push({ role: 'user', content: userMessage });
      karnaHistory.push({
        role: 'assistant',
        content: 'First Krishna revealed it to him, and soon after, his birth mother Kunti came to the banks of the Ganga to plead with him to join his brothers.'
      });
    });

    it('T6: "What can we learn from this?" -> Philosophical meaning without repeating biography', () => {
      const userMessage = 'What can we learn from this?';
      const res = ReferenceResolver.resolve(userMessage, karnaHistory, {
        activeTopic: 'Karna loyalty vs truth',
        activeEntities: ['karna'],
        lastDiscussedCharacter: 'Karna',
      });

      expect(res.isFollowUp).toBe(true);

      const plan = ResponsePlanner.plan({
        userMessage,
        history: karnaHistory,
        activeTopic: 'Karna',
        activeEntities: ['karna'],
        establishedFacts: ['Karna refused crown out of gratitude to Duryodhana.'],
        referenceResolution: res,
        intentCategory: 'philosophical_inquiry',
        emotionalState: 'neutral',
        isCasualBanter: false,
        isStoryRequest: false,
        isMahabharataRelevant: true,
      });

      expect(plan.responseMode).toBe('direct_followup');
      expect(plan.previousInformationToAvoidRepeating.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Section 47: CRITICAL REGRESSION TEST 3 — Multi-Topic Switching & Recall
  // =========================================================================
  describe('Regression Test 3 (Section 47) — Multi-Topic Switching & Segmented Recall', () => {
    const multiHistory: ConversationTurn[] = [
      { role: 'user', content: 'Tell me about Arjuna.' },
      { role: 'assistant', content: 'Arjuna was the third Pandava and a peerless bowman who received the Gita.' },
      { role: 'user', content: 'Tell me about Karna.' },
      { role: 'assistant', content: 'Karna was the generous warrior crowned King of Anga.' },
      { role: 'user', content: 'Why was Karna loyal to Duryodhana?' },
      { role: 'assistant', content: 'Because Duryodhana stood by him when society scorned his lineage.' },
      { role: 'user', content: 'Tell me about Bhishma.' },
      { role: 'assistant', content: 'Bhishma was the grand sire who took a vow of lifelong celibacy.' },
    ];

    it('T5: "What did we discuss about Karna?" -> Selects Karna segment, not latest Bhishma topic', () => {
      const userMessage = 'What did we discuss about Karna?';
      const res = ReferenceResolver.resolve(userMessage, multiHistory, {
        activeTopic: 'Bhishma',
        activeEntities: ['bhishma'],
        lastDiscussedCharacter: 'Bhishma',
      });

      expect(res.isHistoricalRecall).toBe(true);
      expect(res.targetCharacterForRecall).toBe('Karna');
      expect(res.targetCharacterForRecall).not.toBe('Bhishma');
    });

    it('T6: "And what about Arjuna?" -> Selects Arjuna segment, not Karna or Bhishma', () => {
      const userMessage = 'And what about Arjuna?';
      const res = ReferenceResolver.resolve(userMessage, multiHistory, {
        activeTopic: 'Karna',
        activeEntities: ['karna'],
        lastDiscussedCharacter: 'Karna',
      });

      expect(res.isHistoricalRecall).toBe(true);
      expect(res.targetCharacterForRecall).toBe('Arjuna');
      expect(res.targetCharacterForRecall).not.toBe('Karna');
    });
  });

  // =========================================================================
  // Section 48: CRITICAL REGRESSION TEST 4 — 100+ Turn Long Conversation
  // =========================================================================
  describe('Regression Test 4 (Section 48) — 100+ Turn Scalable Dialogue Continuity', () => {
    it('Accurately resolves context across 100 simulated turns without context breakdown', () => {
      const longHistory: ConversationTurn[] = [];
      const topics = ['Arjuna', 'Karna', 'Bhishma', 'Drona', 'Yudhishthira', 'Draupadi', 'Krishna'];

      for (let i = 1; i <= 100; i++) {
        const topicIndex = (i - 1) % topics.length;
        const currentEntity = topics[topicIndex];

        if (i % 5 === 1) {
          // New topic turn
          const msg = `Tell me about ${currentEntity}.`;
          const res = ReferenceResolver.resolve(msg, longHistory.slice(-12));
          expect(res.referentCharacter).toBe(currentEntity);
          longHistory.push({ role: 'user', content: msg });
          longHistory.push({ role: 'assistant', content: `Here is the deeper context of ${currentEntity} and their ethical choices.` });
        } else if (i % 5 === 2) {
          // Pronoun follow-up
          const msg = 'Why did he make that choice?';
          const res = ReferenceResolver.resolve(msg, longHistory.slice(-12), {
            activeTopic: currentEntity,
            activeEntities: [currentEntity.toLowerCase()],
            lastDiscussedCharacter: currentEntity,
          });
          expect(res.isFollowUp).toBe(true);
          expect(res.resolvedReferences['he/him/his']).toBe(currentEntity);
          longHistory.push({ role: 'user', content: msg });
          longHistory.push({ role: 'assistant', content: `His choice stemmed from duty and consequence.` });
        } else if (i % 5 === 3) {
          // Short follow-up
          const msg = 'Why?';
          const res = ReferenceResolver.resolve(msg, longHistory.slice(-12), {
            activeTopic: currentEntity,
            activeEntities: [currentEntity.toLowerCase()],
            lastDiscussedCharacter: currentEntity,
          });
          expect(res.isShortFollowUp).toBe(true);
          longHistory.push({ role: 'user', content: msg });
          longHistory.push({ role: 'assistant', content: 'Because human attachment clouds clarity.' });
        } else if (i % 5 === 4) {
          // Casual check
          const msg = 'How are you feeling today?';
          const res = ReferenceResolver.resolve(msg, longHistory.slice(-12));
          const queryPlan = ContextualQueryResolver.resolve(msg, res, currentEntity, [currentEntity]);
          expect(queryPlan.ragRequired).toBe(false);
          longHistory.push({ role: 'user', content: msg });
          longHistory.push({ role: 'assistant', content: 'I am always at peace, present with you as your companion.' });
        } else {
          // Historical recall across previous turns
          const target = topics[(topicIndex + 2) % topics.length];
          const msg = `What did I ask you earlier about ${target}?`;
          const res = ReferenceResolver.resolve(msg, longHistory.slice(-12));
          expect(res.isHistoricalRecall).toBe(true);
          expect(res.targetCharacterForRecall).toBe(target);
          longHistory.push({ role: 'user', content: msg });
          longHistory.push({ role: 'assistant', content: `Earlier you asked about ${target}.` });
        }
      }

      expect(longHistory.length).toBe(200); // 100 user + 100 assistant turns
    });
  });
});
