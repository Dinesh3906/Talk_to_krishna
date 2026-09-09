import { describe, it, expect } from 'vitest';
import { IntentClassifier } from './intent-classifier.js';

describe('IntentClassifier', () => {
  it('should classify casual mundane conversation without forcing Mahabharata relevance', () => {
    const result = IntentClassifier.classify('What should I eat for breakfast?');
    expect(result.intentCategory).toBe('casual_banter');
    expect(result.mahabharataRelevant).toBe(false);
    expect(result.relevanceScore).toBeLessThan(0.2);
  });

  it('should classify greetings without injecting scripture', () => {
    const result = IntentClassifier.classify('Hey Krishna, how are you?');
    expect(result.intentCategory).toBe('casual_banter');
    expect(result.mahabharataRelevant).toBe(false);
  });

  it('should recognize relationship heartbreak as grief and attachment', () => {
    const result = IntentClassifier.classify('I just had a breakup and feel so empty');
    expect(result.intentCategory).toBe('relationship_grief');
    expect(result.emotionalState).toBe('grief');
    expect(result.mahabharataRelevant).toBe(true);
    expect(result.extractedThemes).toContain('attachment');
  });

  it('should recognize exam failure and fear of disappointing family', () => {
    const result = IntentClassifier.classify('I failed my exam and my parents will be disappointed in me');
    expect(result.intentCategory).toBe('career_purpose');
    expect(result.emotionalState).toBe('fear');
    expect(result.mahabharataRelevant).toBe(true);
    expect(result.extractedThemes).toContain('duty');
  });

  it('should recognize anger and revenge impulses', () => {
    const result = IntentClassifier.classify('I am furious and I want revenge against my former business partner');
    expect(result.intentCategory).toBe('emotional_distress');
    expect(result.emotionalState).toBe('anger');
    expect(result.mahabharataRelevant).toBe(true);
    expect(result.extractedThemes).toContain('anger');
  });

  it('should recognize direct factual questions about characters', () => {
    const result = IntentClassifier.classify('Who was Karna?');
    expect(result.intentCategory).toBe('factual_scripture');
    expect(result.mahabharataRelevant).toBe(true);
    expect(result.extractedCharacters).toContain('Karna');
  });

  it('should recognize emotional distress when directly addressing Krishna', () => {
    const result = IntentClassifier.classify("Krishna.. I'm not feeling good");
    expect(result.intentCategory).toBe('emotional_distress');
    expect(result.emotionalState).toBe('grief');
    expect(result.extractedCharacters).not.toContain('Krishna');
  });

  it('should classify sacred greetings like Pranam Krishna as casual_banter', () => {
    const result = IntentClassifier.classify('Pranam Krishna');
    expect(result.intentCategory).toBe('casual_banter');
    expect(result.mahabharataRelevant).toBe(false);
  });
});
