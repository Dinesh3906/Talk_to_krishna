import { Citation, QuoteType } from '@talk-to-krisna/shared';
import { RetrievedPassage } from './hybrid-retriever.js';
import type { GroundingClaimCheck } from './grounding-validator.js';
import { CanonicalGitaHelper } from './canonical-gita-helper.js';

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

    // 1b. Check bare verse references in generatedText against canonical verses and claims (Defect 2)
    const verseRefs = CanonicalGitaHelper.extractVerseReferences(verifiedContent);
    const rejectedVerseRefs = new Set<string>();
    for (const vr of verseRefs) {
      const claimCheck = CanonicalGitaHelper.validateVerseClaim(vr.chapter, vr.verse, vr.sentence);
      if (!claimCheck.supported) {
        hasUngroundedScriptureClaim = true;
        rejectedVerseRefs.add(`Bhagavad Gita ${vr.chapter}.${vr.verse}`.toLowerCase());
      }
    }

    // Check if any verse claim in groundingClaims was marked unsupported
    for (const claim of groundingClaims) {
      if (claim.type === 'verse' && !claim.supported) {
        hasUngroundedScriptureClaim = true;
      }
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

      const isRejected = rejectedVerseRefs.has(ref) ||
        (passage.chapter && passage.verseRange && rejectedVerseRefs.has(`bhagavad gita ${passage.chapter}.${passage.verseRange}`));

      // The validator's claim-to-evidence link is the citation contract. Requiring
      // another textual mention of "Gita" dropped valid citations for grounded
      // paraphrases that identified Krishna's teaching without naming the book again.
      if (claimSupportsPassage && !isRejected) {
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
          citationSource = passage.sourceEdition || 'Bhagavad Gita';
        } else if (passage.sourceType === 'debroy_10_vol') {
          citationSource = 'Mahabharata (Bibek Debroy Edition)';
        }

        citations.push({
          id: passage.id,
          evidenceId: passage.id,
          evidenceSourceType: passage.sourceType,
          parentChunkId: passage.parentChunkId,
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
