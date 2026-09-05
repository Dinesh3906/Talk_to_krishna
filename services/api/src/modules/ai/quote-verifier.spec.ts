import { describe, it, expect } from 'vitest';
import { QuoteVerifier } from './quote-verifier.js';
import { RetrievedPassage } from './hybrid-retriever.js';

describe('QuoteVerifier', () => {
  const samplePassage: RetrievedPassage = {
    id: 'sample-gita-2-47',
    sourceType: 'gita',
    parva: 'Bhishma Parva',
    chapter: '2',
    verseRange: '2.47',
    speaker: 'Krishna',
    listener: 'Arjuna',
    translation: 'You have a right only to perform your prescribed duty, but never to the fruits of your actions.',
    sourceReference: 'Bhagavad Gita 2.47',
    relevanceScore: 0.95,
  };

  it('should identify a direct quote match when source translation is present', () => {
    const text = 'Remember the eternal truth: "You have a right only to perform your prescribed duty, but never to the fruits of your actions." Focus only on your effort today.';
    const result = QuoteVerifier.verify(text, [samplePassage], false);

    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].sourceReference).toBe('Bhagavad Gita 2.47');
    expect(result.citations[0].quoteType).toBe('direct_quote');
    expect(result.hasUngroundedScriptureClaim).toBe(false);
  });

  it('should flag ungrounded scripture citations when corpus does not establish them', () => {
    const text = 'Krishna said in Bhagavad Gita Chapter 99 Verse 100 that you should always win.';
    const result = QuoteVerifier.verify(text, [], true);

    expect(result.hasUngroundedScriptureClaim).toBe(true);
    expect(result.verifiedContent).toContain('The available Mahabharata source material does not establish this');
  });
});
