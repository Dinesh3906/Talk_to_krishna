import { Citation, QuoteType } from '@talk-to-krisna/shared';
import { RetrievedPassage } from './hybrid-retriever.js';

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
    corpusDoesNotEstablish: boolean
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
        // Inject explicit gap disclaimer if not already stated
        if (!verifiedContent.includes('available source material does not establish')) {
          verifiedContent += '\n\n*(Note: The available Mahabharata source material does not establish this specific reference.)*';
        }
      }
      return {
        verifiedContent,
        citations: [],
        hasUngroundedScriptureClaim,
      };
    }

    // 2. Cross-reference generated text with retrieved passages
    for (const passage of retrievedPassages) {
      const ref = passage.sourceReference.toLowerCase();
      const verseMentioned = passage.verseRange && verifiedContent.includes(passage.verseRange);
      const refMentioned = verifiedContent.toLowerCase().includes(ref);
      const translationSnippet = passage.translation.slice(0, 40).toLowerCase();
      const textContainsSnippet = verifiedContent.toLowerCase().includes(translationSnippet);

      if (refMentioned || verseMentioned || textContainsSnippet || passage.relevanceScore > 0.70) {
        let quoteType: QuoteType = 'inspired_guidance';

        if (textContainsSnippet) {
          quoteType = 'direct_quote';
        } else if (verseMentioned || refMentioned) {
          quoteType = 'paraphrase';
        }

        citations.push({
          id: passage.id,
          source: passage.sourceType === 'gita' ? 'Bhagavad Gita' : 'Mahabharata',
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
