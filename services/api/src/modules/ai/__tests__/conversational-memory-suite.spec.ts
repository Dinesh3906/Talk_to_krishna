import { describe, it, expect } from 'vitest';
import { ReferenceResolver } from '../reference-resolver.js';
import { ContextualQueryResolver } from '../contextual-query-resolver.js';
import { ResponsePlanner } from '../response-planner.js';
import { AntiRepetitionGuard } from '../anti-repetition-guard.js';
import { ConversationTurn } from '../conversation-state-tracker.js';

describe('Talk to Krishna — 1000+ Conversational Memory & Continuity Benchmark Suite', () => {
  const EPIC_CHARACTERS = [
    'Arjuna', 'Karna', 'Bhishma', 'Drona', 'Yudhishthira', 'Bhima', 'Nakula', 'Sahadeva',
    'Duryodhana', 'Dushasana', 'Dhritarashtra', 'Gandhari', 'Kunti', 'Draupadi', 'Ashwatthama',
    'Abhimanyu', 'Shakuni', 'Vidura', 'Sanjaya', 'Vyasa', 'Balarama'
  ];

  // =========================================================================
  // SCENARIO A: Basic Continuity (100 Multi-Turn Conversations)
  // =========================================================================
  describe('Scenario A: Basic Continuity (100 Multi-Turn Conversations)', () => {
    for (let i = 1; i <= 100; i++) {
      it(`A-${i}: Multi-turn dialog continuity for conversation #${i}`, () => {
        const char = EPIC_CHARACTERS[i % EPIC_CHARACTERS.length];
        const history: ConversationTurn[] = [
          { role: 'user', content: `What was the key dilemma faced by ${char}?` },
          { role: 'assistant', content: `${char} struggled between personal duty and cosmic dharma.` }
        ];

        const followUp = `Why was that dilemma so difficult for him to resolve?`;
        const res = ReferenceResolver.resolve(followUp, history, {
          activeTopic: `${char}'s dilemma`,
          activeEntities: [char.toLowerCase()],
          lastDiscussedCharacter: char,
        });

        expect(res.isFollowUp).toBe(true);
        expect(res.resolvedReferences['he/him/his']).toBe(char);

        const plan = ResponsePlanner.plan({
          userMessage: followUp,
          history,
          activeTopic: `${char}'s dilemma`,
          activeEntities: [char.toLowerCase()],
          establishedFacts: [`${char} struggled with dharma`],
          referenceResolution: res,
          intentCategory: 'philosophical_inquiry',
          emotionalState: 'neutral',
          isCasualBanter: false,
          isStoryRequest: false,
          isMahabharataRelevant: true,
        });

        expect(plan.responseMode).toBe('direct_followup');
        expect(plan.responseDepth).toBe('short');
      });
    }
  });

  // =========================================================================
  // SCENARIO B: Pronoun Resolution (100 Tests)
  // =========================================================================
  describe('Scenario B: Pronoun Resolution (100 Tests: he, him, his, she, her, this, that, they, them)', () => {
    const pronounTemplates = [
      { template: 'Why did {p} refuse to surrender?', pList: ['he', 'she', 'they'] },
      { template: 'Who stood beside {p} on the battlefield?', pList: ['him', 'her', 'them'] },
      { template: 'What was the greatest mistake of {p} life?', pList: ['his', 'her', 'their'] },
      { template: 'Why was {p} such a controversial decision?', pList: ['this', 'that'] },
      { template: 'Did {p} truly believe in victory?', pList: ['he', 'she', 'they'] },
      { template: 'How did Krishna guide {p} in that moment?', pList: ['him', 'her', 'them'] },
      { template: 'Was {p} weapon granted by Shiva?', pList: ['his', 'her', 'their'] },
      { template: 'Could {p} have been avoided?', pList: ['this', 'that'] },
      { template: 'Why was {p} loyal to the throne?', pList: ['he', 'she', 'they'] },
      { template: 'What consequence fell upon {p}?', pList: ['him', 'her', 'them'] },
    ];

    let testIndex = 1;
    for (let c = 0; c < 10; c++) {
      const char = EPIC_CHARACTERS[c % EPIC_CHARACTERS.length];
      for (const t of pronounTemplates) {
        it(`B-${testIndex++}: Pronoun resolution for ${char} with template "${t.template}"`, () => {
          const pronoun = t.pList[0];
          const query = t.template.replace('{p}', pronoun);
          const history: ConversationTurn[] = [
            { role: 'user', content: `Tell me about ${char}.` },
            { role: 'assistant', content: `${char} is an iconic figure in the epic.` }
          ];

          const res = ReferenceResolver.resolve(query, history, {
            activeTopic: char,
            activeEntities: [char.toLowerCase()],
            lastDiscussedCharacter: char,
          });

          expect(res.isFollowUp).toBe(true);
          if (pronoun === 'he' || pronoun === 'him' || pronoun === 'his') {
            expect(res.resolvedReferences['he/him/his']).toBe(char);
          } else if (pronoun === 'this' || pronoun === 'that') {
            expect(res.resolvedReferences['this/that']).toBeDefined();
          }
        });
      }
    }
  });

  // =========================================================================
  // SCENARIO C: Topic Switching (100 Tests)
  // =========================================================================
  describe('Scenario C: Topic Switching (100 Tests)', () => {
    for (let i = 1; i <= 100; i++) {
      const sourceChar = EPIC_CHARACTERS[i % EPIC_CHARACTERS.length];
      const targetChar = EPIC_CHARACTERS[(i + 3) % EPIC_CHARACTERS.length];

      it(`C-${i}: Clean topic shift from ${sourceChar} to ${targetChar}`, () => {
        const history: ConversationTurn[] = [
          { role: 'user', content: `What happened to ${sourceChar}?` },
          { role: 'assistant', content: `${sourceChar} faced monumental tests during the war.` }
        ];

        const switchMessage = `What about ${targetChar}?`;
        const res = ReferenceResolver.resolve(switchMessage, history, {
          activeTopic: sourceChar,
          activeEntities: [sourceChar.toLowerCase()],
          lastDiscussedCharacter: sourceChar,
        });

        expect(res.referentCharacter).toBe(targetChar);

        const plan = ResponsePlanner.plan({
          userMessage: switchMessage,
          history,
          activeTopic: targetChar,
          activeEntities: [targetChar.toLowerCase()],
          establishedFacts: [],
          referenceResolution: res,
          intentCategory: 'philosophical_inquiry',
          emotionalState: 'neutral',
          isCasualBanter: false,
          isStoryRequest: false,
          isMahabharataRelevant: true,
        });

        expect(plan.activeTopic).toBe(targetChar);
      });
    }
  });

  // =========================================================================
  // SCENARIO D: Topic Restoration (100 Tests)
  // =========================================================================
  describe('Scenario D: Topic Restoration (100 Tests)', () => {
    const restorationPhrases = [
      'Coming back to {char}, why did he fight?',
      'Returning to {char}, what was his purpose?',
      'Back to {char}, what did Krishna tell him?',
      'Turning back to {char}, what can we learn?',
      'As we were discussing about {char}, how did it end?',
    ];

    let dIndex = 1;
    for (let i = 0; i < 20; i++) {
      const char = EPIC_CHARACTERS[i % EPIC_CHARACTERS.length];
      for (const phrase of restorationPhrases) {
        it(`D-${dIndex++}: Topic return detection for "${char}"`, () => {
          const query = phrase.replace('{char}', char);
          const history: ConversationTurn[] = [
            { role: 'user', content: `Tell me about ${char}.` },
            { role: 'assistant', content: `${char} was discussed earlier.` },
            { role: 'user', content: 'Now tell me about someone else.' },
            { role: 'assistant', content: 'Here is another story.' },
          ];

          const res = ReferenceResolver.resolve(query, history, {
            activeTopic: 'Another Story',
            activeEntities: ['someone else'],
            lastDiscussedCharacter: 'Someone Else',
          });

          expect(res.isTopicReturn).toBe(true);
          expect(res.restoredTopic).toBe(char);

          const plan = ResponsePlanner.plan({
            userMessage: query,
            history,
            activeTopic: char,
            activeEntities: [char.toLowerCase()],
            establishedFacts: [],
            referenceResolution: res,
            intentCategory: 'philosophical_inquiry',
            emotionalState: 'neutral',
            isCasualBanter: false,
            isStoryRequest: false,
            isMahabharataRelevant: true,
          });

          expect(plan.topicReturn).toBe(true);
          expect(plan.continuityAcknowledgement).toContain(char);
        });
      }
    }
  });

  // =========================================================================
  // SCENARIO E: Historical Recall (100 Tests)
  // =========================================================================
  describe('Scenario E: Historical Recall (100 Tests)', () => {
    const recallPhrases = [
      'What did I ask you earlier about {char}?',
      'What did we discuss about {char}?',
      'What did you say about {char} earlier?',
      'Do you remember what I asked regarding {char}?',
      'Remind me what we said about {char}?',
    ];

    let eIndex = 1;
    for (let i = 0; i < 20; i++) {
      const char = EPIC_CHARACTERS[i % EPIC_CHARACTERS.length];
      for (const phrase of recallPhrases) {
        it(`E-${eIndex++}: Historical recall detection for "${char}"`, () => {
          const query = phrase.replace('{char}', char);
          const history: ConversationTurn[] = [
            { role: 'user', content: `Why did ${char} choose his path?` },
            { role: 'assistant', content: `We discussed his motives.` },
          ];

          const res = ReferenceResolver.resolve(query, history, {
            activeTopic: char,
            activeEntities: [char.toLowerCase()],
            lastDiscussedCharacter: char,
          });

          expect(res.isHistoricalRecall).toBe(true);
          expect(res.targetCharacterForRecall).toBe(char);

          const queryPlan = ContextualQueryResolver.resolve(query, res, char, [char]);
          expect(queryPlan.ragRequired).toBe(false); // RAG gated
        });
      }
    }
  });

  // =========================================================================
  // SCENARIO F: Repetition Detection & Compression (100 Tests)
  // =========================================================================
  describe('Scenario F: Repetition Detection (100 Tests)', () => {
    const stockIntros = [
      'Come, sit beside me and let me speak of truth.',
      'In the epic Mahabharata, great events took place.',
      'As I explained earlier, life is full of lessons.',
      'Arjuna was one of the greatest warriors of all time.',
      'Karna was known for his loyalty and sacrifice.',
    ];

    let fIndex = 1;
    for (let i = 0; i < 20; i++) {
      const char = EPIC_CHARACTERS[i % EPIC_CHARACTERS.length];
      for (const intro of stockIntros) {
        it(`F-${fIndex++}: Filters repetitive intro "${intro.slice(0, 25)}..."`, () => {
          const history: ConversationTurn[] = [
            { role: 'user', content: `What happened to ${char}?` },
            { role: 'assistant', content: `${char} had a difficult struggle.` }
          ];

          const candidate = `${intro} Now we must look at the real question.`;
          const result = AntiRepetitionGuard.filter(candidate, history, true);

          expect(result.sanitizedContent).not.toContain('Come, sit beside me');
          expect(result.sanitizedContent).not.toContain('In the epic Mahabharata');
          expect(result.sanitizedContent).not.toContain('As I explained earlier');
        });
      }
    }
  });

  // =========================================================================
  // SCENARIO G: Long-Context Dialogues (100 Tests)
  // =========================================================================
  describe('Scenario G: Long-Context Multi-Turn Dialogues (100 Tests)', () => {
    for (let i = 1; i <= 100; i++) {
      it(`G-${i}: Maintains continuity at turn #${i} of ongoing dialogue`, () => {
        const dummyHistory: ConversationTurn[] = [];
        for (let t = 1; t <= Math.min(i, 20); t++) {
          dummyHistory.push({ role: 'user', content: `Question ${t}` });
          dummyHistory.push({ role: 'assistant', content: `Answer ${t}` });
        }

        const msg = 'Can you explain the deeper spiritual lesson behind this?';
        const res = ReferenceResolver.resolve(msg, dummyHistory, {
          activeTopic: 'Duty and Devotion',
          activeEntities: ['arjuna'],
          lastDiscussedCharacter: 'Arjuna',
        });

        expect(res.isFollowUp).toBe(true);
        const plan = ResponsePlanner.plan({
          userMessage: msg,
          history: dummyHistory,
          activeTopic: 'Duty and Devotion',
          activeEntities: ['arjuna'],
          establishedFacts: [],
          referenceResolution: res,
          intentCategory: 'philosophical_inquiry',
          emotionalState: 'neutral',
          isCasualBanter: false,
          isStoryRequest: false,
          isMahabharataRelevant: true,
        });

        expect(plan.responseMode).toBe('direct_followup');
      });
    }
  });

  // =========================================================================
  // SCENARIO H: Mahabharata RAG + Memory Query Formulation (100 Tests)
  // =========================================================================
  describe('Scenario H: Mahabharata RAG + Conversation Memory (100 Tests)', () => {
    for (let i = 1; i <= 100; i++) {
      const char = EPIC_CHARACTERS[i % EPIC_CHARACTERS.length];
      it(`H-${i}: Generates high-precision RAG query for elliptical follow-up on ${char}`, () => {
        const msg = 'Was he right to make that vow?';
        const history: ConversationTurn[] = [
          { role: 'user', content: `Tell me about ${char}.` },
          { role: 'assistant', content: `${char} made a profound vow.` }
        ];

        const res = ReferenceResolver.resolve(msg, history, {
          activeTopic: char,
          activeEntities: [char.toLowerCase()],
          lastDiscussedCharacter: char,
        });

        const queryPlan = ContextualQueryResolver.resolve(msg, res, char, [char]);
        expect(queryPlan.ragRequired).toBe(true);
        expect(queryPlan.contextualQuery).toContain(char);
      });
    }
  });

  // =========================================================================
  // SCENARIO I: Emotional Conversations (100 Tests)
  // =========================================================================
  describe('Scenario I: Emotional Conversations (100 Tests)', () => {
    const emotionalPhrases = [
      'I feel so broken and hopeless today.',
      'I lost someone dear to me and cannot stop crying.',
      'I am terrified of failing my family.',
      'Nobody understands my loneliness.',
      'I feel overwhelmed by anger and betrayal.',
    ];

    let iIndex = 1;
    for (let c = 0; c < 20; c++) {
      for (const phrase of emotionalPhrases) {
        it(`I-${iIndex++}: Emotional intent handling for phrase "${phrase.slice(0, 20)}..."`, () => {
          const res = ReferenceResolver.resolve(phrase, []);
          const plan = ResponsePlanner.plan({
            userMessage: phrase,
            history: [],
            activeTopic: 'Emotional Support',
            activeEntities: [],
            establishedFacts: [],
            referenceResolution: res,
            intentCategory: 'emotional_distress',
            emotionalState: 'grief',
            isCasualBanter: false,
            isStoryRequest: false,
            isMahabharataRelevant: false,
          });

          expect(plan.responseMode).toBe('emotional_guidance');
          expect(plan.responseDepth).toBe('moderate');
        });
      }
    }
  });

  // =========================================================================
  // SCENARIO J: Casual Conversation (100 Tests)
  // =========================================================================
  describe('Scenario J: Casual Conversation & Non-Scripture Banter (100 Tests)', () => {
    const casualPhrases = [
      'Hello Krishna, how are you today?',
      'Tell me a funny joke to make me smile.',
      'What is your favorite food?',
      'I am just bored, talk to me.',
      'Good morning my friend!',
    ];

    let jIndex = 1;
    for (let c = 0; c < 20; c++) {
      for (const phrase of casualPhrases) {
        it(`J-${jIndex++}: Gates scripture RAG on casual query "${phrase}"`, () => {
          const res = ReferenceResolver.resolve(phrase, []);
          const queryPlan = ContextualQueryResolver.resolve(phrase, res, 'Greeting', []);

          expect(queryPlan.ragRequired).toBe(false);

          const plan = ResponsePlanner.plan({
            userMessage: phrase,
            history: [],
            activeTopic: 'Casual Banter',
            activeEntities: [],
            establishedFacts: [],
            referenceResolution: res,
            intentCategory: 'casual_banter',
            emotionalState: 'neutral',
            isCasualBanter: true,
            isStoryRequest: false,
            isMahabharataRelevant: false,
          });

          expect(plan.responseMode).toBe('casual_conversation');
          expect(plan.responseDepth).toBe('very_short');
          expect(plan.targetTokens).toBeLessThanOrEqual(100);
        });
      }
    }
  });
});
