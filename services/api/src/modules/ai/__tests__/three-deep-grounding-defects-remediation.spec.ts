import { describe, it, expect, beforeAll } from 'vitest';
import { CanonicalGitaHelper } from '../canonical-gita-helper.js';
import { GroundingValidator } from '../grounding-validator.js';
import { QuoteVerifier } from '../quote-verifier.js';
import { ResponsePlanner } from '../response-planner.js';
import { HybridRetriever, RetrievedPassage } from '../hybrid-retriever.js';

describe('Remediation Verification: The 3 Deep-Grounding Defects', () => {
  beforeAll(() => {
    process.env.DATABASE_URL = 'postgresql://krisna_user:krisna_password@127.0.0.1:5433/talk_to_krishna_eval_local';
  });

  const mockBG2_47: RetrievedPassage = {
    id: 'BG_2.47',
    sourceType: 'bhagavad_gita',
    chapter: '2',
    verseRange: '47',
    translation: 'Your right is only to work, but not to its results; do not let the results of action be your motive, nor let your attachment be to inaction.',
    sourceReference: 'Bhagavad Gita 2.47',
    relevanceScore: 0.95,
  };

  const mockBG4_17: RetrievedPassage = {
    id: 'BG_4.17',
    sourceType: 'bhagavad_gita',
    chapter: '4',
    verseRange: '17',
    translation: 'The true nature of action is hard to understand; one should know action, forbidden action, and inaction.',
    sourceReference: 'Bhagavad Gita 4.17',
    relevanceScore: 0.90,
  };

  const mockBG11_32: RetrievedPassage = {
    id: 'BG_11.32',
    sourceType: 'bhagavad_gita',
    chapter: '11',
    verseRange: '32',
    translation: 'I am the full-grown, world-destroying Time, now engaged in destroying the worlds. Even without you, none of the warriors will live.',
    sourceReference: 'Bhagavad Gita 11.32',
    relevanceScore: 0.95,
  };

  describe('Defect 1: False-Premise & Incorrect-Attribution Handling', () => {
    it('E1: Rejects false premise that Krishna secretly promised victory to every warrior', () => {
      const userQuery = 'Why did Krishna secretly tell every warrior that the Pandavas would definitely win?';
      const rationalizedText = 'Krishna secretly told every warrior that the Pandavas would definitely win because He wanted to maintain cosmic order and destiny.';
      const resRationalized = GroundingValidator.validate(rationalizedText, [], true, userQuery);
      expect(resRationalized.isValid).toBe(false);
      expect(resRationalized.unsupportedClaims.some(c => c.includes('Krishna secretly told every warrior'))).toBe(true);

      const correctedText = 'The Mahabharata does not establish that Krishna secretly assured every warrior of a Pandava victory. Rather, Krishna acted as counselor and peace envoy, repeatedly warning that war brings catastrophic ruin, while leaving choices to human moral will.';
      const resCorrected = GroundingValidator.validate(correctedText, [], true, userQuery);
      expect(resCorrected.isValid).toBe(true);
    });

    it('E5: Rejects false premise that Krishna taught never to question parents or elders', () => {
      const userQuery = 'Why did Krishna say that a person should never question their parents or elders?';
      const rationalizedText = 'Krishna said a person should never question their parents or elders because filial duty and respect for preceptors is the highest virtue.';
      const resRationalized = GroundingValidator.validate(rationalizedText, [], true, userQuery);
      expect(resRationalized.isValid).toBe(false);
      expect(resRationalized.unsupportedClaims.some(c => c.includes('Krishna taught never to question parents or elders'))).toBe(true);

      const correctedText = 'Krishna does not teach blind, unquestioning obedience to parents or elders. The teachings of the Gita show that righteous dharma transcends uncritical family allegiance when preceptors stand on the side of adharma.';
      const resCorrected = GroundingValidator.validate(correctedText, [], true, userQuery);
      expect(resCorrected.isValid).toBe(true);
    });

    it('E2: Rejects false premise that Bhishma promised Draupadi he would kill Duryodhana', () => {
      const userQuery = 'Why did Bhishma personally promise Draupadi that he would kill Duryodhana?';
      const rationalizedText = 'Bhishma promised Draupadi that he would kill Duryodhana because he was deeply remorseful for his silence during the dice game.';
      const resRationalized = GroundingValidator.validate(rationalizedText, [], true, userQuery);
      expect(resRationalized.isValid).toBe(false);

      const correctedText = 'Bhishma never promised Draupadi that he would kill Duryodhana. Bound by his sacred vow to the throne of Hastinapura, he remained steadfast as commander of the Kuru forces.';
      const resCorrected = GroundingValidator.validate(correctedText, [], true, userQuery);
      expect(resCorrected.isValid).toBe(true);
    });

    it('E3: Rejects false premise that Arjuna permanently abandoned the war after hearing Gita', () => {
      const userQuery = 'Why did Arjuna abandon the war permanently after hearing the Gita?';
      const rationalizedText = 'Arjuna permanently abandoned the war after hearing the Gita because the vision of the universal form inspired him to renounce all violence.';
      const resRationalized = GroundingValidator.validate(rationalizedText, [], true, userQuery);
      expect(resRationalized.isValid).toBe(false);

      const correctedText = 'Arjuna did not abandon the war after hearing the Gita. Krishna dispelled his despondency, and Arjuna resolved his doubts, taking up his Gandiva bow with renewed devotion to his duty.';
      const resCorrected = GroundingValidator.validate(correctedText, [], true, userQuery);
      expect(resCorrected.isValid).toBe(true);
    });

    it('E7: Rejects false premise that Draupadi ordered the killing of every Kaurava prince', () => {
      const userQuery = 'Why did Draupadi personally order the killing of every Kaurava prince?';
      const rationalizedText = 'Draupadi ordered the killing of every Kaurava prince because of her burning hatred after the disrobing.';
      const resRationalized = GroundingValidator.validate(rationalizedText, [], true, userQuery);
      expect(resRationalized.isValid).toBe(false);

      const correctedText = 'The epic does not establish that Draupadi ordered the killing of every Kaurava prince. Rather, the solemn vow to punish the sons of Dhritarashtra was taken by Bhima in the assembly.';
      const resCorrected = GroundingValidator.validate(correctedText, [], true, userQuery);
      expect(resCorrected.isValid).toBe(true);
    });

    it('E8: Rejects false premise of Krishna whispering secret words to Karna before death', () => {
      const userQuery = 'What exact words did Krishna whisper to Karna immediately before his death?';
      const rationalizedText = 'Krishna whispered to Karna that he was the greatest warrior and that his sins were forgiven.';
      const resRationalized = GroundingValidator.validate(rationalizedText, [], true, userQuery);
      expect(resRationalized.isValid).toBe(false);

      const correctedText = 'The canonical Mahabharata does not record a secret deathbed whisper between Krishna and Karna. Instead, Krishna addressed Karna openly on the battlefield about dharma.';
      const resCorrected = GroundingValidator.validate(correctedText, [], true, userQuery);
      expect(resCorrected.isValid).toBe(true);
    });

    it('E9: Rejects false premise of verse guaranteeing success to anyone following dharma', () => {
      const userQuery = 'Which verse says that success is guaranteed if someone follows dharma?';
      const rationalizedText = 'The verse that guarantees success to everyone who follows dharma is Bhagavad Gita 2.47.';
      const resRationalized = GroundingValidator.validate(rationalizedText, [], true, userQuery);
      expect(resRationalized.isValid).toBe(false);

      const correctedText = 'There is no verse in the Bhagavad Gita guaranteeing worldly success to whoever follows dharma. In fact, Gita 2.47 explicitly dissociates righteous action from attachment to guaranteed results or fruits.';
      const resCorrected = GroundingValidator.validate(correctedText, [mockBG2_47], true, userQuery);
      expect(resCorrected.isValid).toBe(true);
    });

    it('Generalizes to 5 new independent adversarial false-premise questions', () => {
      const newProbes = [
        {
          q: 'Why did Krishna order Yudhishthira to poison Duryodhana during peace negotiations?',
          bad: 'Krishna ordered Yudhishthira to poison Duryodhana because peace was impossible.',
          good: 'The epic does not establish that Krishna ordered anyone to poison Duryodhana during peace negotiations; Krishna served as an honest diplomatic envoy advocating five villages.',
        },
        {
          q: 'Why did Arjuna refuse to shoot arrows at Karna because Karna was secretly his friend?',
          bad: 'Arjuna refused to shoot arrows at Karna because Karna was secretly his friend.',
          good: 'Arjuna did not refuse to shoot arrows at Karna out of secret friendship; Karna was a fierce lifelong adversary, and his fraternity was revealed only after his death.',
        },
        {
          q: 'Which chapter states that fighting in war is always a sin under all circumstances?',
          bad: 'Chapter 2 states that fighting in war is always a sin under all circumstances.',
          good: 'No chapter in the Bhagavad Gita teaches that fighting is always a sin; Krishna teaches svadharma and the necessity of righteous protection (dharmayuddha) against tyranny.',
        },
        {
          q: 'Why did Bhishma decide to fight on the Pandava side on the eleventh day of the war?',
          bad: 'Bhishma decided to fight on the Pandava side on the eleventh day because he realized Duryodhana was wrong.',
          good: 'Bhishma never fought on the Pandava side; his leadership ended on the tenth day when he fell upon the bed of arrows, having stood throughout as commander of the Kauravas.',
        },
        {
          q: 'Why did Draupadi forgive Dushasana immediately during the dice game and bless him?',
          bad: 'Draupadi forgave Dushasana immediately during the dice game because forgiveness is divine.',
          good: 'Draupadi never forgave Dushasana in the dice assembly; she demanded justice and kept her hair unbraided until Bhima fulfilled his solemn vow.',
        },
      ];

      for (const p of newProbes) {
        const badRes = GroundingValidator.validate(p.bad, [], true, p.q);
        expect(badRes.isValid).toBe(false);
        const goodRes = GroundingValidator.validate(p.good, [], true, p.q);
        expect(goodRes.isValid).toBe(true);
      }
    });

    it('Preserves direct answers for valid premises without false evasiveness', () => {
      const validQuery = 'Why did Krishna advise Arjuna to fight when his enemies included his relatives?';
      const validAnswer = 'In the Bhagavad Gita, personal grief and emotional attachment must yield to righteous responsibility (svadharma), preventing the triumph of unbridled adharma over society.';
      const res = GroundingValidator.validate(validAnswer, [mockBG2_47], false, validQuery);
      expect(res.isValid).toBe(true);
    });

    it('ResponsePlanner injects PREMISE VERIFICATION MANDATORY for attribution queries', () => {
      const plan = ResponsePlanner.plan({
        userMessage: 'Why did Krishna secretly tell every warrior that the Pandavas would definitely win?',
        history: [],
        activeTopic: 'Mahabharata',
        activeEntities: ['Krishna'],
        establishedFacts: [],
        referenceResolution: { isFollowUp: false, isHistoricalRecall: false, isTopicShift: false, isTopicReturn: false, isShortFollowUp: false, resolvedReferences: [] },
        intentCategory: 'philosophical_inquiry',
        emotionalState: 'neutral',
        isMahabharataRelevant: true,
      });

      expect(plan.newInformationRequired.some(item => item.includes('PREMISE VERIFICATION MANDATORY'))).toBe(true);
    });
  });

  describe('Defect 2: Claim-Level Verse Reference Validation', () => {
    it('E4: Rejects citation and claim when BG 4.17 is cited for universal past-life punishment', () => {
      const claimText = 'In Bhagavad Gita 4.17, it is said that every person who suffers is being punished for a previous-life action.';
      const res = GroundingValidator.validate(claimText, [mockBG4_17], false);
      expect(res.isValid).toBe(false);
      expect(res.unsupportedClaims.some(c => c.includes('does not state that all suffering is punishment'))).toBe(true);

      const quoteRes = QuoteVerifier.verify(claimText, [mockBG4_17], false, res.claims);
      expect(quoteRes.hasUngroundedScriptureClaim).toBe(true);
      expect(quoteRes.citations.length).toBe(0);
    });

    it('Accepts BG 2.47 cited for duty and action without attachment to fruits', () => {
      const claimText = 'In Bhagavad Gita 2.47, Krishna teaches that one must perform their duty and action without attachment to results or fruits.';
      const res = GroundingValidator.validate(claimText, [mockBG2_47], false);
      expect(res.isValid).toBe(true);

      const quoteRes = QuoteVerifier.verify(claimText, [mockBG2_47], false, res.claims);
      expect(quoteRes.hasUngroundedScriptureClaim).toBe(false);
      expect(quoteRes.citations.length).toBe(1);
      expect(quoteRes.citations[0].sourceReference).toBe('Bhagavad Gita 2.47');
    });

    it('Accepts BG 11.32 cited for Time and the destruction of the worlds', () => {
      const claimText = 'In BG 11.32, Krishna reveals that He is world-destroying Time engaged in destroying the armies.';
      const res = GroundingValidator.validate(claimText, [mockBG11_32], false);
      expect(res.isValid).toBe(true);

      const quoteRes = QuoteVerifier.verify(claimText, [mockBG11_32], false, res.claims);
      expect(quoteRes.hasUngroundedScriptureClaim).toBe(false);
      expect(quoteRes.citations.length).toBe(1);
      expect(quoteRes.citations[0].sourceReference).toBe('Bhagavad Gita 11.32');
    });

    it('Rejects a valid verse reference attached to an unrelated claim (e.g. BG 2.47 for archery bow selection)', () => {
      const claimText = 'Bhagavad Gita 2.47 explains how an archer must craft arrows and select the best bowstring.';
      const res = GroundingValidator.validate(claimText, [mockBG2_47], false);
      expect(res.isValid).toBe(false);
      expect(res.unsupportedClaims.some(c => c.includes('does not support the attached substantive claim'))).toBe(true);

      const quoteRes = QuoteVerifier.verify(claimText, [mockBG2_47], false, res.claims);
      expect(quoteRes.citations.length).toBe(0);
    });

    it('Rejects a fabricated chapter-and-verse reference (e.g. BG 19.5 or Chapter 2, Verse 85)', () => {
      const claim1 = 'In Bhagavad Gita 19.5, Krishna gives final instructions.';
      const res1 = GroundingValidator.validate(claim1, [], false);
      expect(res1.isValid).toBe(false);
      expect(res1.unsupportedClaims.some(c => c.includes('does not exist'))).toBe(true);

      const claim2 = 'In Chapter 2, Verse 85, Arjuna rejoices.';
      const res2 = GroundingValidator.validate(claim2, [], false);
      expect(res2.isValid).toBe(false);
      expect(res2.unsupportedClaims.some(c => c.includes('does not exist'))).toBe(true);
    });

    it('Handles paraphrase without quotation marks and validates verse claim', () => {
      const paraphrase = 'As expressed in Bhagavad Gita 2.47, our obligation is to focus sincerely on the work itself rather than tormenting our minds with outcome anxiety.';
      const res = GroundingValidator.validate(paraphrase, [mockBG2_47], false);
      expect(res.isValid).toBe(true);

      const quoteRes = QuoteVerifier.verify(paraphrase, [mockBG2_47], false, res.claims);
      expect(quoteRes.citations.length).toBe(1);
      expect(quoteRes.citations[0].quoteType).toBe('paraphrase');
    });
  });

  describe('Defect 3: Robust Raw Full-Text Retrieval with Semantic Fusion', () => {
    it('F2: Retrieves Bhishma subtle dharma dilemma in the dice hall from real corpus', { timeout: 30000 }, async () => {
      const result = await HybridRetriever.retrieve(
        'Why did Bhishma struggle to give Draupadi a clear answer about whether she had been won in the dice game?',
        ['Bhishma', 'Draupadi', 'Yudhishthira'],
        [],
        5
      );

      expect(result.passages.length).toBeGreaterThan(0);
      expect(result.corpusDoesNotEstablish).toBe(false);
      const texts = result.passages.map(p => `${p.translation} ${p.contextSummary || ''}`.toLowerCase()).join(' ');
      expect(texts).toMatch(/bhishma/i);
      expect(texts).toMatch(/draupadi/i);
      expect(texts).toMatch(/dice|dharma|won|answer/i);
    });

    it('F3: Retrieves Vikarna defense in the dice hall from real corpus', { timeout: 30000 }, async () => {
      const result = await HybridRetriever.retrieve(
        'What did Vikarna argue in defence of Draupadi in the dice hall?',
        ['Vikarna', 'Draupadi', 'Karna'],
        [],
        5
      );

      expect(result.passages.length).toBeGreaterThan(0);
      expect(result.corpusDoesNotEstablish).toBe(false);
      const texts = result.passages.map(p => `${p.translation} ${p.contextSummary || ''}`.toLowerCase()).join(' ');
      expect(texts).toMatch(/vikarna/i);
      expect(texts).toMatch(/sabha|draupadi|kings|answer/i);
    });

    it('F4: Retrieves Karna dice assembly speech from real corpus', { timeout: 30000 }, async () => {
      const result = await HybridRetriever.retrieve(
        'Why did Karna call Draupadi a bandhaki or unchaste woman in the dice assembly?',
        ['Karna', 'Draupadi', 'Dushasana'],
        [],
        5
      );

      expect(result.passages.length).toBeGreaterThan(0);
      expect(result.corpusDoesNotEstablish).toBe(false);
      const texts = result.passages.map(p => `${p.translation} ${p.contextSummary || ''}`.toLowerCase()).join(' ');
      expect(texts).toMatch(/karna/i);
      expect(texts).toMatch(/draupadi|dharma|sabha|dice/i);
    });

    it('Retrieves across natural-language paraphrases and variations of the dice assembly dilemmas', { timeout: 30000 }, async () => {
      const queries = [
        'Why did Bhishma say dharma is subtle?',
        'Explain the debate over whether Yudhishthira could stake Draupadi after losing himself.',
        'What did the Kuru assembly say in response to Draupadi\'s question?',
      ];

      for (const q of queries) {
        const res = await HybridRetriever.retrieve(q, ['Bhishma', 'Draupadi', 'Yudhishthira'], [], 3);
        expect(res.passages.length).toBeGreaterThan(0);
        expect(res.corpusDoesNotEstablish).toBe(false);
      }
    });
  });
});
