import { describe, expect, it } from 'vitest';
import { HybridRetriever } from '../hybrid-retriever.js';
import { QuoteVerifier } from '../quote-verifier.js';

const canonicalEdition = 'Canonical Shrimad Bhagavad Gita (Swami Sivananda English Translation & IAST Transliteration)';

describe('canonical Gita edition provenance', () => {
  it('retains the checked-in source edition when loading verse records', async () => {
    const verses = await HybridRetriever.getGitaVerses();
    const verse = verses.find(item => item.chapter === 2 && item.verse === 62);

    expect(verse?.sourceEdition).toBe(canonicalEdition);
    expect(verse?.sourceEdition?.length).toBeLessThanOrEqual(100);
  });

  it('persists the exact source edition in the existing citation source field', () => {
    const passage = {
      id: 'BG_2.62',
      sourceType: 'bhagavad_gita',
      sourceEdition: canonicalEdition,
      sourceReference: 'Bhagavad Gita 2.62',
      verseRange: '2.62',
      translation: 'While contemplating the objects of the senses, a person develops attachment to them.',
      relevanceScore: 1,
    };
    const supportedClaim = {
      item: 'teaching about contemplation and attachment',
      type: 'teaching' as const,
      supported: true,
      evidenceIds: [passage.id],
    };

    const result = QuoteVerifier.verify(
      'Bhagavad Gita 2.62 describes contemplation leading toward attachment.',
      [passage],
      false,
      [supportedClaim],
    );

    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].source).toBe(canonicalEdition);
    expect(result.citations[0].evidenceSourceType).toBe('bhagavad_gita');
  });
});
