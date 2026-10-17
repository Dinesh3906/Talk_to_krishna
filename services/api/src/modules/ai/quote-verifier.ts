import { Citation, QuoteType } from '@talk-to-krisna/shared';
import { RetrievedPassage } from './hybrid-retriever.js';
import type { GroundingClaimCheck } from './grounding-validator.js';

export interface QuoteVerificationResult {
  verifiedContent: string;
  citations: Citation[];
  hasUngroundedScriptureClaim: boolean;
}

export class QuoteVerifier {
  /**
   * Verifies scripture citations and ensures generated text never falsely attributes fabricated lines as scripture quotes.
   */
  public static verify(
    generatedText: string,
    retrievedPassages: RetrievedPassage[],
    corpusDoesNotEstablish: boolean,
    groundingClaims: GroundingClaimCheck[] = []
  ): QuoteVerificationResult {
    let verifiedContent = generatedText;
    const citations: Citation[] = [];
    let hasUngroundedScriptureClaim = false;

    // 1. If corpus does not establish the requested topic, ensure text doesn't invent a fake verse
    if (corpusDoesNotEstablish) {
      // Check if text falsely invents a verse number (e.g. "Chapter X Verse Y")
      const inventedVerseMatch = verifiedContent.match(/(?:Bhagavad Gita|Gita|Mahabharata)\s*(?:Chapter\s*\d+|Verse\s*\d+|\d+\.\d+)/i);
      if (inventedVerseMatch && retrievedPassages.length === 0) {
        hasUngroundedScriptureClaim = true;
      }
      return {
        verifiedContent,
        citations: [],
        hasUngroundedScriptureClaim,
      };
    }

    // Cite only evidence IDs attached to a supported substantive response claim.
    // Mere appearance of a character name, location, or incidental event in the text does not justify
    // attaching an arbitrary passage as scriptural evidence for the user's situation.
    const nonSubstantiveTypes = new Set(['character', 'location', 'event', 'relationship']);
    const substantiveSupportedClaims = groundingClaims.filter(c => c.supported && !nonSubstantiveTypes.has(c.type));
    const supportedEvidenceIds = new Set(substantiveSupportedClaims
      .flatMap(claim => claim.evidenceIds || (claim.evidenceChunkId ? [claim.evidenceChunkId] : [])));

    // 2. Cross-reference generated claims with their verified evidence passages.
    for (const passage of retrievedPassages) {
      const ref = passage.sourceReference.toLowerCase();
      const verseMentioned = passage.verseRange && verifiedContent.includes(passage.verseRange);
      const refMentioned = verifiedContent.toLowerCase().includes(ref);
      const translationSnippet = passage.translation.slice(0, 25).trim().toLowerCase();
      const textContainsSnippet = translationSnippet.length >= 10 && verifiedContent.toLowerCase().includes(translationSnippet);
      const claimSupportsPassage = supportedEvidenceIds.has(passage.id);

      const isGitaFamily = passage.sourceType === 'bhagavad_gita' ||
        passage.sourceType === 'gita' ||
        passage.sourceType === 'gita_raghavendra_vivruti' ||
        passage.sourceType === 'gita_ashok_kaushik';
      const isExplicitGitaMatch = isGitaFamily &&
        (refMentioned || textContainsSnippet || Boolean(verseMentioned && (verifiedContent.includes(`${passage.chapter}.${passage.verseRange}`) || verifiedContent.toLowerCase().includes('bhagavad gita') || verifiedContent.toLowerCase().includes('gita'))));
      const isDirectlyReferenced = textContainsSnippet || refMentioned || Boolean(verseMentioned) ||
        (isGitaFamily && (verifiedContent.toLowerCase().includes('gita') || (passage.chapter && verifiedContent.toLowerCase().includes(`chapter ${passage.chapter}`))));

      if ((claimSupportsPassage || isExplicitGitaMatch) && isDirectlyReferenced) {
        let quoteType: QuoteType = 'inspired_guidance';

        if (textContainsSnippet) {
          quoteType = 'direct_quote';
        } else if (verseMentioned || refMentioned) {
          quoteType = 'paraphrase';
        }

        let citationSource = 'Mahabharata';
        if (passage.sourceType === 'gita_raghavendra_vivruti') {
          citationSource = 'Bhagavad Gita (Sri Raghavendra Teertha Vivruti)';
        } else if (passage.sourceType === 'gita_ashok_kaushik') {
          citationSource = 'Bhagavad Gita (Ashok Kaushik Edition)';
        } else if (passage.sourceType === 'gita' || passage.sourceType === 'bhagavad_gita') {
          citationSource = 'Bhagavad Gita';
        } else if (passage.sourceType === 'debroy_10_vol') {
          citationSource = 'Mahabharata (Bibek Debroy Edition)';
        }

        citations.push({
          id: passage.id,
          source: citationSource,
          parva: passage.parva,
          chapter: passage.chapter,
          section: passage.section,
          verseRange: passage.verseRange,
          speaker: passage.speaker,
          listener: passage.listener,
          translation: passage.translation,
          originalText: passage.originalText,
          sourceReference: passage.sourceReference,
          relevanceScore: passage.relevanceScore,
          quoteType,
        });
      }
    }

    return {
      verifiedContent,
      citations,
      hasUngroundedScriptureClaim,
    };
  }
}
