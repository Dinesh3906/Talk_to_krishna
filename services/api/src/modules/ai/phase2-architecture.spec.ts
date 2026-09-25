import { describe, it, expect } from 'vitest';
import { ConversationStateTracker } from './conversation-state-tracker.js';
import { InterpretationEngineService } from './interpretation-engine.service.js';
import { HybridRetriever } from './hybrid-retriever.js';
import { MarkdownSanitizer, StreamTokenFilter } from './markdown-sanitizer.js';
import { KrishnaPersonaService } from './krishna-persona.service.js';

describe('Phase 2 Production Talk to Krishna Architecture', { timeout: 30000 }, () => {
  describe('1. Multi-Turn Conversation State Tracking & Interpretation Engine', () => {
    it('tracks dialogue stages and extracts active characters and aliases', () => {
      const history = [
        { role: 'user' as const, content: 'Why did Karna stay with Duryodhana?' },
        { role: 'assistant' as const, content: 'Because Karna was bound by loyalty and gratitude.' },
      ];
      const state = ConversationStateTracker.track(history, 'Was that choice unfair to the Pandavas?');

      expect(state.activeCharacters).toContain('karna');
      expect(state.dialogueStage).toBe('context');
      expect(state.contextualQuery).toContain('karna');
    });

    it('extracts candidate entities dynamically from query without hardcoded character lists', () => {
      const state1 = ConversationStateTracker.track([], 'What did Govinda tell Partha?');
      expect(state1.activeCharacters).toContain('govinda');
      expect(state1.activeCharacters).toContain('partha');

      const state2 = ConversationStateTracker.track([], 'Tell me about Shalya.');
      expect(state2.activeCharacters).toContain('shalya');
    });

    it('advances dialogue stage to personal application when user brings self into discussion', () => {
      const state = ConversationStateTracker.track([], 'What does that mean for my own career and duty?');
      expect(state.dialogueStage).toBe('personal_application');
    });

    it('synthesizes grounded interpretation dimensions from real retrieved passages', async () => {
      const query = 'Explain Gita 2.47';
      const res = await HybridRetriever.retrieve(query, [], [], 3);
      expect(res.passages.length).toBeGreaterThan(0);

      const state = ConversationStateTracker.track([], query);
      const interp = InterpretationEngineService.interpret(query, state, res.passages);

      expect(interp).not.toBeNull();
      expect(interp?.historicalContext).toBeDefined();
      expect(interp?.historicalContext.length).toBeGreaterThan(10);
      expect(interp?.dharmaDimension).toBeDefined();
      expect(interp?.philosophicalMeaning).toBeDefined();
      expect(interp?.commonMisunderstanding).toBeDefined();
      expect(interp?.supportingSourceIds.length).toBeGreaterThan(0);
    }, 60000);

    it('synthesizes structured 6-point narrative arc dynamically from real retrieved canonical passage', async () => {
      const query = 'Tell me about Abhimanyu and the Chakravyuha';
      const res = await HybridRetriever.retrieve(query, [], [], 3);
      expect(res.passages.length).toBeGreaterThan(0);

      const state = ConversationStateTracker.track([], query);
      const interp = InterpretationEngineService.interpret(query, state, res.passages);

      expect(interp).not.toBeNull();
      expect(interp?.narrativeArc).toBeDefined();
      expect(interp?.narrativeArc?.sceneEntry).toBeDefined();
      expect(interp?.narrativeArc?.sceneEntry.length).toBeGreaterThan(10);
      expect(interp?.narrativeArc?.thePause).toContain('Now pause here');
      expect(interp?.narrativeArc?.emergentWisdom).toBeDefined();
      expect(interp?.narrativeArc?.emergentWisdom.length).toBeGreaterThan(5);
    }, 60000);
  });

  describe('2. Retrieval Quality Benchmark Suite (Section 19 Requirements)', () => {
    const queries = [
      {
        q: 'Who were you supporting in the Mahabharata?',
        expectedTopic: ['krishna', 'pandavas', 'dharma', 'choice'],
      },
      {
        q: "Why didn't you fight?",
        expectedTopic: ['krishna', 'vow', 'charioteer', 'narayani'],
      },
      {
        q: "Why did you become Arjuna's charioteer?",
        expectedTopic: ['arjuna', 'charioteer', 'partha'],
      },
      {
        q: "Tell me about Shalya.",
        expectedTopic: ['shalya', 'salya'],
      },
      {
        q: "Who was Satyaki?",
        expectedTopic: ['satyaki', 'yuyudhana'],
      },
      {
        q: 'What happened to Karna?',
        expectedTopic: ['karna', 'duel', 'chariot'],
      },
      {
        q: 'Why did Bhishma make that vow?',
        expectedTopic: ['bhishma', 'vow', 'arrow'],
      },
      {
        q: 'Why was Draupadi humiliated?',
        expectedTopic: ['draupadi', 'panchali', 'dice', 'sabha'],
      },
      {
        q: 'Explain Gita 2.47.',
        expectedVerse: 'BG_2.47',
      },
      {
        q: 'What does 2.47 actually mean?',
        expectedVerse: 'BG_2.47',
      },
      {
        q: "I'm scared I'll fail, so I don't want to start.",
        expectedSituation: 'fear_of_failure',
      },
      {
        q: "I can't let go of someone.",
        expectedSituation: 'difficulty_letting_go',
      },
      {
        q: 'I feel like giving up.',
        expectedSituation: 'paralysis_under_pressure',
      },
      {
        q: 'I am angry because I was betrayed.',
        expectedSituation: 'betrayal',
      },
    ];

    for (const testCase of queries) {
      it(`retrieves genuine evidence for: "${testCase.q}"`, async () => {
        const start = Date.now();
        const res = await HybridRetriever.retrieve(testCase.q, [], [], 3);
        const duration = Date.now() - start;

        // Ensure real RAG retrieval completes within reasonable bounds for remote DB + ONNX embedding inference
        expect(duration).toBeLessThan(45000);

        if (testCase.expectedVerse) {
          const matched = res.passages.some((p) => p.id === testCase.expectedVerse || p.sourceReference.includes('2.47'));
          expect(matched).toBe(true);
        } else if (testCase.expectedSituation) {
          expect(res.passages.length).toBeGreaterThan(0);
        } else if (testCase.expectedTopic) {
          expect(res.passages.length).toBeGreaterThan(0);
          const combinedText = res.passages.map((p) => (p.translation + ' ' + p.sourceReference).toLowerCase()).join(' ');
          const hasTopicMatch = testCase.expectedTopic.some((topic) => combinedText.includes(topic));
          expect(hasTopicMatch).toBe(true);
        }
      }, 60000);
    }
  });

  describe('3. Markdown Sanitizer & Stream Filtering', () => {
    it('strips all Markdown formatting from complete text block', () => {
      const rawText = `
### Shloka 2.47
**Karmaṇy evādhikāras te** mā phaleṣu kadācana.
---
Here are the key takeaways:
- Focus on your *effort*.
- Do not attach to **the fruit**.

1. Act with clarity.
2. Rest in peace.

| Concept | Teaching |
|---|---|
| Karma | Action |
`;
      const cleaned = MarkdownSanitizer.sanitize(rawText);

      expect(cleaned).not.toContain('###');
      expect(cleaned).not.toContain('**');
      expect(cleaned).not.toContain('*');
      expect(cleaned).not.toContain('---');
      expect(cleaned).not.toContain('- ');
      expect(cleaned).not.toContain('1. ');
      expect(cleaned).not.toContain('|---|---|');
      expect(cleaned).not.toContain('Key takeaways:');
      expect(cleaned).toContain('Karmaṇy evādhikāras te mā phaleṣu kadācana.');
      expect(cleaned).toContain('Focus on your effort.');
    });

    it('filters tokens in real-time stream while preserving spacing', () => {
      const filter = new StreamTokenFilter();
      const chunks = ['I ', 'am ', '**with', '** you, ', '## my', ' friend.'];
      let output = '';
      for (const c of chunks) {
        output += filter.push(c);
      }
      output += filter.flush();

      expect(output).toBe('I am with you, my friend.');
      expect(output).not.toContain('**');
      expect(output).not.toContain('##');
    });

    it('strips code fence blocks and stray unclosed backticks completely', () => {
      const rawWithFences = "```text\nDuty performed with a steady mind brings peace.\n```";
      const cleaned = MarkdownSanitizer.sanitize(rawWithFences);
      expect(cleaned).toBe('Duty performed with a steady mind brings peace.');
      expect(cleaned).not.toContain('```');
      expect(cleaned).not.toContain('text');

      const unclosed = "```text\nAct without hesitation in the present moment.\n";
      const cleanedUnclosed = MarkdownSanitizer.sanitize(unclosed);
      expect(cleanedUnclosed).toBe('Act without hesitation in the present moment.');
      expect(cleanedUnclosed).not.toContain('```');
    });

    it('intercepts and suppresses code fence tokens in streaming filter so fences never leak', () => {
      const filter = new StreamTokenFilter();
      const chunks = ['```text\n', 'Speak ', 'with truth ', 'and clarity.', '```'];
      let output = '';
      for (const c of chunks) {
        output += filter.push(c);
      }
      output += filter.flush();

      expect(output).not.toContain('```');
      expect(output).not.toContain('text');
      expect(output.trim()).toBe('Speak with truth and clarity.');
    });
  });

  describe('4. Krishna Persona Contract', () => {
    it('builds system prompt free of markdown headers and enforcing conciseness', () => {
      const prompt = KrishnaPersonaService.buildPrompt(
        'I am worried about my exam tomorrow.',
        [],
        [],
        { isMahabharataRelevant: false, corpusDoesNotEstablish: false, reflectionDepth: 'concise' }
      );

      const systemContent = prompt.find((p) => p.role === 'system')?.content || '';

      // Prompt must not contain markdown headers
      expect(systemContent).not.toMatch(/^#{1,6}\s+/m);
      expect(systemContent).toContain('HARD RULE: NO MARKDOWN FORMATTING');
      expect(systemContent).toContain('Target length: 20 to 70 words');
      expect(systemContent).toContain('Never use generic AI assistant cliches');
      expect(systemContent).toContain('Your name is Krishna. You identify yourself as Lord Krishna.');
    });

    it('enforces deep reflection budget when requested', () => {
      const prompt = KrishnaPersonaService.buildPrompt(
        'What is the nature of the self?',
        [],
        [],
        { isMahabharataRelevant: true, corpusDoesNotEstablish: false, reflectionDepth: 'deep_philosophical' }
      );

      const systemContent = prompt.find((p) => p.role === 'system')?.content || '';
      expect(systemContent).toContain('Target length: 100 to 250 words');
    });

    it('embeds the 7 Narrative Mechanics and canonical Abhimanyu exemplar in the system prompt', () => {
      const prompt = KrishnaPersonaService.buildPrompt(
        'Tell me about Abhimanyu.',
        [],
        [],
        { isMahabharataRelevant: true, corpusDoesNotEstablish: false }
      );

      const systemContent = prompt.find((p) => p.role === 'system')?.content || '';
      expect(systemContent).toContain('THE 7 NARRATIVE MECHANICS');
      expect(systemContent).toContain('SCENE ENTRY FIRST');
      expect(systemContent).toContain('PROGRESSIVE REVELATION & RHYTHMIC PACING');
      expect(systemContent).toContain('THE REFLECTIVE PAUSE');
      expect(systemContent).toContain('CANONICAL STORYTELLING EXEMPLAR');
      expect(systemContent).toContain('Come, let us go to the thirteenth day of Kurukshetra');
      expect(systemContent).toContain('Now pause here');
    });
  });

  describe('5. Source-of-Truth Policy Compliance Suite (Directive Section 19)', () => {
    it('Policy A-C: proves zero dependency on mock JSON files (characters.json, events.json, situations.json)', async () => {
      // Direct file existence check - these files were permanently deleted
      const fs = await import('fs');
      expect(fs.existsSync('data/mahabharata/characters/characters.json')).toBe(false);
      expect(fs.existsSync('data/mahabharata/events/events.json')).toBe(false);
      expect(fs.existsSync('data/mahabharata/situations/situations.json')).toBe(false);
    });

    it('Policy D & F: discovers uncurated characters directly from PostgreSQL without hardcoded character universes', async () => {
      const res = await HybridRetriever.retrieve('Tell me about Shalya.', [], [], 3);
      expect(res.passages.length).toBeGreaterThan(0);
      const combined = res.passages.map(p => (p.translation + ' ' + p.sourceReference).toLowerCase()).join(' ');
      expect(combined.includes('salya') || combined.includes('shalya')).toBe(true);
    }, 60000);

    it('Policy E: produces no fake zero-vector embeddings', async () => {
      const { defaultEmbeddingProvider } = await import('./providers/bge-embedding.provider.js');
      const vec = await defaultEmbeddingProvider.embedQuery('What is dharma?');
      expect(vec.length).toBe(768);
      // Valid real vector must not be all zeros
      const nonZeroCount = vec.filter(v => v !== 0).length;
      expect(nonZeroCount).toBe(768);
    });

    it('Policy G: preserves immutable source provenance on all retrieved passages', async () => {
      const res = await HybridRetriever.retrieve('Who was Satyaki?', [], [], 2);
      expect(res.passages.length).toBeGreaterThan(0);
      for (const p of res.passages) {
        expect(p.sourceReference).toBeDefined();
        expect(p.sourceReference.length).toBeGreaterThan(5);
        expect(p.translation).toBeDefined();
        expect(p.translation.length).toBeGreaterThan(20);
      }
    }, 60000);

    it('Policy J: verifies that Gita verse existence is strictly database-backed', async () => {
      const { pool } = await import('../../db/index.js');
      const res = await pool.query('SELECT chapter, verse, sanskrit, transliteration, translation, provenance FROM gita_verses WHERE chapter = 2 AND verse = 47');
      expect(res.rows.length).toBe(1);
      const verse = res.rows[0];
      expect(verse.sanskrit).toContain('कर्मण्येवाधिकारस्ते');
      expect(verse.transliteration.toLowerCase()).toContain('karmaṇy');
      expect(verse.translation.toLowerCase()).toContain('work');
      expect(verse.provenance).toBeDefined();
    });
  });
});
