import { describe, it, expect } from 'vitest';
import { MarkdownSanitizer } from './markdown-sanitizer.js';
import { IntentClassifier } from './intent-classifier.js';
import { KrishnaPersonaService } from './krishna-persona.service.js';
import { QuoteVerifier } from './quote-verifier.js';
import { RetrievedPassage } from './hybrid-retriever.js';

describe('Scripture Teaching & Anti-Copyright-Refusal Safeguards', () => {
  it('1. IntentClassifier correctly classifies "Teach me mahabarat shlokas" as factual_scripture and mahabharataRelevant', () => {
    const classification = IntentClassifier.classify('Teach me mahabarat shlokas');
    expect(classification.mahabharataRelevant).toBe(true);
    expect(classification.intentCategory).toBe('factual_scripture');
    expect(classification.relevanceScore).toBe(1.0);
    expect(classification.extractedThemes).toContain('shloka');
  });

  it('2. IntentClassifier correctly classifies "teach me slokas" with phonetic spelling', () => {
    const classification = IntentClassifier.classify('teach me slokas');
    expect(classification.mahabharataRelevant).toBe(true);
    expect(classification.intentCategory).toBe('factual_scripture');
    expect(classification.extractedThemes).toContain('shloka');
  });

  it('3. KrishnaPersonaService system prompt contains mandatory anti-copyright and table ban rules', () => {
    const messages = KrishnaPersonaService.buildPrompt(
      'Teach me mahabarat shlokas',
      [],
      [],
      { isMahabharataRelevant: true, corpusDoesNotEstablish: false }
    );
    const systemPrompt = messages[0].content;

    expect(systemPrompt).toContain('SACRED SCRIPTURES & ZERO COPYRIGHT RESTRICTIONS');
    expect(systemPrompt).toContain('NEVER state or imply that verses, shlokas, or scriptures are "protected by copyright"');
    expect(systemPrompt).toContain('Never use markdown tables');
    expect(systemPrompt).toContain('Do NOT mention copyright');
  });

  it('4. MarkdownSanitizer cleanly eliminates table artifacts, horizontal rules, and numbered headers', () => {
    const badInput = `
## 1. What the Mahābhārata is about
The Mahābhārata is a vast epic.

---

| Theme | Key Takeaway |
|-------|--------------|
| **Duty (dharma)** | One must act according to one’s role. |
| **Karma and Free Will** | Actions have consequences. |

---

## 2. How to study the Mahābhārata
1. Choose a passage
2. Read it slowly
`;

    const cleaned = MarkdownSanitizer.sanitize(badInput);

    // No markdown headers
    expect(cleaned).not.toContain('##');
    // No horizontal rules
    expect(cleaned).not.toContain('---');
    // No table bars
    expect(cleaned).not.toContain('|');
    // No bold markdown
    expect(cleaned).not.toContain('**');
    // Clean conversational prose
    expect(cleaned).toContain('What the Mahābhārata is about');
    expect(cleaned).toContain('Duty (dharma): One must act according to one’s role.');
    expect(cleaned).toContain('Karma and Free Will: Actions have consequences.');
  });

  it('5. QuoteVerifier correctly recognizes bhagavad_gita source type', () => {
    const passages: RetrievedPassage[] = [
      {
        id: 'bg-2-47',
        sourceType: 'bhagavad_gita',
        chapter: '2',
        verseRange: '47',
        speaker: 'Lord Krishna',
        listener: 'Arjuna',
        translation: 'You have a right only to perform your prescribed duty, but never to the fruits of action.',
        sourceReference: 'Bhagavad Gita 2.47',
        relevanceScore: 0.95,
      },
    ];

    const result = QuoteVerifier.verify(
      'Remember, you have a right only to perform your prescribed duty, but never to the fruits of action.',
      passages,
      false
    );

    expect(result.citations.length).toBe(1);
    expect(result.citations[0].source).toBe('Bhagavad Gita');
    expect(result.citations[0].verseRange).toBe('47');
    expect(result.citations[0].quoteType).toBe('direct_quote');
  });

  it('6. KrishnaPersonaService activates Emotional Conversation Mode for emotional_distress', () => {
    const messages = KrishnaPersonaService.buildPrompt(
      'I feel completely hopeless and lost lately',
      [],
      [],
      {
        isMahabharataRelevant: true,
        corpusDoesNotEstablish: false,
        intentCategory: 'emotional_distress',
        emotionalState: 'grief',
      }
    );
    const systemPrompt = messages[0].content;

    expect(systemPrompt).toContain('TALK TO KRISHNA — EMOTIONAL RESPONSE OVERRIDE (ACTIVE FOR THIS MESSAGE)');
    expect(systemPrompt).toContain('Approximately 100–250 words');
    expect(systemPrompt).toContain('Recognize the person\'s emotional state');
    expect(systemPrompt).toContain('Give ONE central insight');
    expect(systemPrompt).toContain('Ask ONE meaningful question');
    expect(systemPrompt).toContain('DO NOT generate a comprehensive mental-health guide');
  });

  it('7. KrishnaPersonaService activates Emotional Conversation Mode for relationship_grief', () => {
    const messages = KrishnaPersonaService.buildPrompt(
      'I had a terrible breakup and my heart is broken',
      [],
      [],
      {
        isMahabharataRelevant: true,
        corpusDoesNotEstablish: false,
        intentCategory: 'relationship_grief',
        emotionalState: 'grief',
      }
    );
    const systemPrompt = messages[0].content;

    expect(systemPrompt).toContain('TALK TO KRISHNA — EMOTIONAL RESPONSE OVERRIDE (ACTIVE FOR THIS MESSAGE)');
    expect(systemPrompt).toContain('Recognize the person\'s emotional state');
  });

  it('8. KrishnaPersonaService does NOT activate Emotional Conversation Mode for casual or factual queries', () => {
    const messages = KrishnaPersonaService.buildPrompt(
      'Who was Karna?',
      [],
      [],
      {
        isMahabharataRelevant: true,
        corpusDoesNotEstablish: false,
        intentCategory: 'factual_scripture',
        emotionalState: 'neutral',
      }
    );
    const systemPrompt = messages[0].content;

    expect(systemPrompt).not.toContain('EMOTIONAL CONVERSATION MODE (ACTIVE FOR THIS MESSAGE)');
  });
});

