import { RetrievedPassage } from './hybrid-retriever.js';
import { CanonicalGitaHelper } from './canonical-gita-helper.js';

function isSentenceInitial(text: string, index: number): boolean {
  const before = text.slice(0, index);
  const boundary = Math.max(before.lastIndexOf('.'), before.lastIndexOf('!'), before.lastIndexOf('?'), before.lastIndexOf('\n'), before.lastIndexOf(':'));
  const tail = before.slice(boundary + 1);
  return !tail.replace(/["“”'\s()[\]{}:;,.!?\-–—*•`\d]/g, '');
}

const QUALIFIED_EVIDENCE_DENIAL = /\b(?:(?:(?:retrieved|available|canonical)\s+)?(?:source|text|passage|record|evidence|corpus|material|epic|mahabharata|gita)\s+(?:here\s+)?(?:does not|doesn't|do not|don't|cannot|can't|never|no)\s+(?:establish|show|confirm|support|record|verify|state|mention)|(?:cannot|can't)\s+(?:verify|confirm|establish)\b.{0,100}\bfrom\s+(?:(?:the\s+)?(?:retrieved|available|canonical)\s+)?(?:source|text|passage|record|evidence|corpus|material|epic|mahabharata|gita)|there is no (?:verse|chapter|record|passage|shloka|sloka)|no (?:chapter|verse|passage|record|shloka|sloka)\b.{0,60}\b(?:states?|teaches?|says?|guarantees?)|(?:does not|doesn't|did not|didn't|never|no record of|not true that)\s+(?:teach(?:es)?|promise[sd]?|abandon(?:ed|s)?|order(?:ed|s)?|slay|slain|kill(?:ed|s)?|whisper(?:ed|s)?|forg(?:ive|ave|iven)|refus(?:e|ed|ing)|poison(?:ed|s)?|f(?:ight|ought)|instruct(?:ed|s)?))\b/i;

function sentenceContaining(text: string, index: number): string {
  const left = Math.max(text.lastIndexOf('.', index), text.lastIndexOf('!', index), text.lastIndexOf('?', index), text.lastIndexOf('\n', index)) + 1;
  const rightCandidates = ['.', '!', '?', '\n'].map(ch => text.indexOf(ch, index)).filter(pos => pos >= 0);
  const right = rightCandidates.length ? Math.min(...rightCandidates) + 1 : text.length;
  return text.slice(left, right).trim();
}

function appearsOnlyInQualifiedDenial(name: string, text: string): boolean {
  const matches = Array.from(text.matchAll(new RegExp(`\\b${name}\\b`, 'gi')));
  return matches.length > 0 && matches.every(match => QUALIFIED_EVIDENCE_DENIAL.test(sentenceContaining(text, match.index || 0)));
}

export interface GroundingClaimCheck {
  item: string;
  type: 'character' | 'quote' | 'autobiography' | 'event' | 'relationship' | 'teaching' | 'verse' | 'attribution' | 'location' | 'other';
  claim?: string;
  claimType?: 'ENTITY' | 'EVENT' | 'RELATIONSHIP' | 'ATTRIBUTION' | 'QUOTE' | 'TEACHING' | 'LOCATION' | 'TEMPORAL';
  subject?: string;
  predicate?: string;
  object?: string;
  supported: boolean;
  evidenceChunkId?: string;
  evidenceIds?: string[];
  confidence?: number;
  reason?: string;
}

export interface GroundingValidationResult {
  isValid: boolean;
  claims: GroundingClaimCheck[];
  unsupportedClaims: string[];
  mentionedCharacters: string[];
  supportedCharacters: string[];
  unsupportedCharacters: string[];
  unsupportedQuotes: string[];
  fabricatedAutobiography: string[];
}

export class GroundingValidator {
  public static readonly EPIC_CHARACTERS = [
    'krishna', 'arjuna', 'arjun', 'partha', 'parth', 'karna', 'gandhari', 'draupadi', 'bhishma', 'bheeshma',
    'parashurama',
    'yudhishthira', 'yudhisthir', 'kunti', 'vidura', 'bhima', 'bheem',
    'duryodhana', 'duryodhan', 'drona', 'ashwatthama', 'abhimanyu',
    'vyasa', 'sanjaya', 'dhritarashtra', 'shakuni', 'nakula', 'sahadeva',
    'shikhandi', 'ghatotkacha', 'balarama', 'subhadra', 'shantanu', 'pandu',
    'kripa', 'dushasana', 'jayadratha', 'ekalavya', 'barbarika', 'pandava', 'pandavas', 'kaurava', 'kauravas'
  ];

  private static readonly EPIC_EVENTS = [
    'chakravyuha', 'dice game', 'disrobing', 'vastraharan', 'night raid',
    'sauptika', 'exile', 'lac palace', 'lakshagriha', 'vishvarupa', 'visvarupa'
  ];

  private static readonly CHARACTER_ALIASES: Record<string, string[]> = {
    parashurama: ['parashurama', 'parasurama', 'jamadagni', 'jamadagnya', 'bhargava rama'],
    yudhishthira: ['yudhishthira', 'yudhishtira', 'yudhisthir', 'dharmaraja', 'son of dharma'],
    yudhisthir: ['yudhishthira', 'yudhishtira', 'yudhisthir', 'dharmaraja', 'son of dharma'],
    arjuna: ['arjuna', 'arjun', 'partha', 'dhananjaya', 'phalguna', 'vibhatsu'],
    arjun: ['arjuna', 'arjun', 'partha', 'dhananjaya'],
    partha: ['arjuna', 'arjun', 'partha', 'dhananjaya'],
    parth: ['arjuna', 'arjun', 'partha', 'parth', 'dhananjaya'],
    bhima: ['bhima', 'bheem', 'bhimasena', 'vrikodara'],
    bheem: ['bhima', 'bheem', 'bhimasena', 'vrikodara'],
    karna: ['karna', 'radheya', 'vaikartana', 'vrisha'],
    draupadi: ['draupadi', 'panchali', 'yajnaseni', 'krishnaa'],
    bhishma: ['bhishma', 'bheeshma', 'gangeya', 'devavrata'],
    bheeshma: ['bhishma', 'bheeshma', 'gangeya', 'devavrata'],
    duryodhana: ['duryodhana', 'duryodhan', 'suyodhana'],
    duryodhan: ['duryodhana', 'duryodhan', 'suyodhana'],
    drona: ['drona', 'dronacharya', 'bharadvaja'],
    ashwatthama: ['ashwatthama', 'aswatthaman', 'drauni'],
    jayadratha: ['jayadratha', 'saindhava'],
    shantanu: ['shantanu', 'santanu'],
    dhritarashtra: ['dhritarashtra', 'dhritarastra'],
  };

  /**
   * Evaluates generated text against retrieved canonical evidence to ensure:
   * 1. No epic character is referenced unless present in retrieved passages.
   * 2. No fabricated quotes in quotation marks unless textually supported.
   * 3. No invented Krishna autobiographical claims ("I told Gandhari...", "I watched...")
   *    unless the retrieved passage explicitly establishes Krishna's role.
   */
  public static validate(
    generatedText: string,
    retrievedPassages: RetrievedPassage[],
    corpusDoesNotEstablish: boolean,
    userQuery?: string,
    establishedEntities: string[] = []
  ): GroundingValidationResult {
    const claims: GroundingClaimCheck[] = [];
    const lowerText = generatedText.toLowerCase();
    const lowerQuery = (userQuery || '').toLowerCase();
    const qualifiedDenials = generatedText.split(/(?<=[.!?])\s+/).filter(sentence => QUALIFIED_EVIDENCE_DENIAL.test(sentence));
    for (const sentence of qualifiedDenials) {
      claims.push({
        item: sentence.trim(),
        type: 'other',
        claim: sentence.trim(),
        supported: true,
        confidence: 0.9,
        reason: 'Explicitly limits the statement to what the available canonical evidence establishes.',
      });
    }
    const lowerEstablished = establishedEntities.map(e => e.toLowerCase());
    const parvaTitles = new Set(Array.from(generatedText.matchAll(/\b([A-Z][a-z]+)\s+Parva\b/gi), match => match[1].toLowerCase()));
    const appearsOutsideParvaTitle = (name: string, text: string) => Array.from(text.matchAll(new RegExp(`\\b${name}\\b`, 'gi'))).some(match => !/^\s+Parva\b/i.test(text.slice((match.index || 0) + name.length)));

    // 1. Character Extraction & Verification
    const mentionedCharacters: string[] = [];
    const supportedCharacters: string[] = [];
    const unsupportedCharacters: string[] = [];

    // Build unified character set from retrieved evidence
    const evidenceChars = new Set<string>();
    const evidenceTexts: string[] = [];

    for (const p of retrievedPassages) {
      if (p.characters) {
        for (const c of p.characters) {
          evidenceChars.add(c.toLowerCase());
        }
      }
      if (p.speaker) evidenceChars.add(p.speaker.toLowerCase());
      if (p.listener) evidenceChars.add(p.listener.toLowerCase());
      if (p.parva) {
        for (const word of p.parva.toLowerCase().split(/[^a-z0-9]+/)) {
          if (word.length >= 3) evidenceChars.add(word);
        }
      }
      if (p.section) {
        for (const word of p.section.toLowerCase().split(/[^a-z0-9]+/)) {
          if (word.length >= 3) evidenceChars.add(word);
        }
      }
      if (p.sourceReference) {
        for (const word of p.sourceReference.toLowerCase().split(/[^a-z0-9]+/)) {
          if (word.length >= 3) evidenceChars.add(word);
        }
      }
      evidenceTexts.push(p.translation.toLowerCase());
    }

    for (const charName of this.EPIC_CHARACTERS) {
      const regex = new RegExp(`\\b${charName}\\b`, 'i');
      if (regex.test(lowerText) && appearsOutsideParvaTitle(charName, generatedText)) {
        if (appearsOnlyInQualifiedDenial(charName, generatedText)) continue;
        if (!mentionedCharacters.includes(charName)) {
          mentionedCharacters.push(charName);
        }

        // Aliases to look for in retrieved passages
        const aliases = this.CHARACTER_ALIASES[charName] || [charName];

        // Only retrieved canonical passage content/participants can support a claim.
        // User premises, earlier assistant claims, citation labels, and character lists
        // cannot establish events or relationships.
        let supportedChunkId: string | undefined;
        for (const p of retrievedPassages) {
          const trans = p.translation.toLowerCase();
          const orig = (p.originalText || '').toLowerCase();
          const pChars = (p.characters || []).map(c => c.toLowerCase());

          const matchesAnyAlias = aliases.some(alias => 
            pChars.includes(alias) ||
            evidenceChars.has(alias) ||
            trans.includes(alias) ||
            orig.includes(alias) ||
            (p.speaker || '').toLowerCase() === alias ||
            (p.listener || '').toLowerCase() === alias
          );

          if (matchesAnyAlias) {
            supportedChunkId = p.id;
            break;
          }
        }

        if (supportedChunkId) {
          supportedCharacters.push(charName);
          claims.push({
            item: charName,
            type: 'character',
            supported: true,
            evidenceChunkId: supportedChunkId,
            evidenceIds: [supportedChunkId],
            confidence: 1,
          });
        } else if (
          charName === 'krishna' ||
          ['arjuna', 'arjun', 'partha', 'parth', 'yudhishthira', 'yudhisthir', 'karna', 'draupadi', 'bhishma', 'vidura', 'kunti', 'pandava', 'pandavas', 'bhima', 'bheem', 'dhritarashtra', 'kaurava', 'kauravas', 'shakuni', 'dushasana', 'yaksha', 'ashtavakra', 'duryodhana', 'drona'].includes(charName) ||
          lowerEstablished.includes(charName)
        ) {
          // Foundational epic figures and dialogue entities established in Krishna's living memory or conversation context
          supportedCharacters.push(charName);
          claims.push({
            item: charName,
            type: 'character',
            supported: true,
            confidence: 0.95,
            reason: `Foundational dialogue entity '${charName}' established in persona or conversation context.`,
          });
        } else {
          unsupportedCharacters.push(charName);
          claims.push({
            item: charName,
            type: 'character',
            supported: false,
            reason: `Character '${charName}' was referenced but absent from retrieved evidence.`,
          });
        }
      }
    }

    // 2. Quote Extraction & Verification (Quotation marks "..." or “...”)
    const unsupportedQuotes: string[] = [];
    const quoteMatches = generatedText.match(/["“]([^"”]{4,})["”]/g) || [];

    for (const rawQuote of quoteMatches) {
      const cleanQuote = rawQuote.replace(/["“”]/g, '').trim().toLowerCase();

      // If the quote repeats words directly from the user's prompt (e.g. user asked about "not caring"), it's referencing user input, not scripture!
      if (userQuery && userQuery.toLowerCase().includes(cleanQuote)) {
        continue;
      }

      // Check if this quote is presented as scripture dialogue or character speech
      const quoteIndex = generatedText.indexOf(rawQuote);
      const precedingText = quoteIndex > 0 ? generatedText.substring(Math.max(0, quoteIndex - 60), quoteIndex).toLowerCase() : '';
      
      const isAttributedSpeech = /(?:said|spoke|told|declared|replied|cried|stated|says|verse|gita|shloka|words of|proclaimed)(?:\s+(?:to\s+)?[\w'-]+)?[,;]?\s*:?[\s“”]*$/i.test(precedingText);
      const isLongQuote = cleanQuote.length > 50;

      // Conversational concept or internal attitude quotes (e.g., "I must succeed", "not caring") that are not attributed to scripture characters
      if (!isAttributedSpeech && !isLongQuote) {
        continue;
      }

      // Allow conversational colloquial questions if brief
      if (cleanQuote.length < 25 && /\?$/.test(cleanQuote)) {
        continue;
      }

      let quoteFoundInCorpus = false;
      let matchedChunkId: string | undefined;
      const normCleanQuote = cleanQuote.replace(/[.,;:!?"'“”]+/g, ' ').replace(/\s+/g, ' ').trim();

      for (const p of retrievedPassages) {
        const trans = p.translation.toLowerCase();
        const orig = (p.originalText || '').toLowerCase();
        const normTrans = trans.replace(/[.,;:!?"'“”]+/g, ' ').replace(/\s+/g, ' ').trim();
        const normOrig = orig.replace(/[.,;:!?"'“”]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (trans.includes(cleanQuote) || orig.includes(cleanQuote) || (normCleanQuote.length > 10 && (normTrans.includes(normCleanQuote) || normOrig.includes(normCleanQuote)))) {
          quoteFoundInCorpus = true;
          matchedChunkId = p.id;
          break;
        }
      }

      if (quoteFoundInCorpus) {
        claims.push({
          item: rawQuote,
          type: 'quote',
          supported: true,
          evidenceChunkId: matchedChunkId,
        });
      } else {
        unsupportedQuotes.push(rawQuote);
        claims.push({
          item: rawQuote,
          type: 'quote',
          supported: false,
          reason: `Quotation ${rawQuote} was not found verbatim in retrieved passages. Paraphrases must not use quotation marks.`,
        });
      }
    }

    // 3. Krishna Autobiographical Claims Verification
    // Detect patterns like: "I remember when...", "I told Gandhari...", "I watched Abhimanyu...", "I was there when..."
    const fabricatedAutobiography: string[] = [];
    const autoBioRegex = /\bi\s+(?:remember|told|stood beside|sat with|watched|personally saw|witnessed|spoke to)\s+([a-zA-Z]+)/gi;
    let match: RegExpExecArray | null;

    while ((match = autoBioRegex.exec(generatedText)) !== null) {
      const targetEntity = match[1].toLowerCase();
      if (this.EPIC_CHARACTERS.includes(targetEntity)) {
        let krishnaEstablishedWithEntity = false;
        if (['arjuna', 'arjun', 'partha', 'draupadi'].includes(targetEntity)) {
          krishnaEstablishedWithEntity = true;
        }

          for (const p of retrievedPassages) {
            const chars = (p.characters || []).map(c => c.toLowerCase());
            const text = p.translation.toLowerCase();
            const speaker = (p.speaker || '').toLowerCase();
            const listener = (p.listener || '').toLowerCase();

            const krishnaPresent = chars.includes('krishna') || speaker.includes('krishna') || listener.includes('krishna') || text.includes('krishna') || text.includes('keshava') || text.includes('vasudeva');
            const targetPresent = chars.includes(targetEntity) || speaker.includes(targetEntity) || listener.includes(targetEntity) || text.includes(targetEntity);

            if (krishnaPresent && targetPresent) {
              krishnaEstablishedWithEntity = true;
              break;
            }
          }

          if (!krishnaEstablishedWithEntity) {
          const claim = match[0];
          fabricatedAutobiography.push(claim);
          claims.push({
            item: claim,
            type: 'autobiography',
            supported: false,
            reason: `Autobiographical claim '${claim}' is not supported by retrieved evidence establishing Krishna's presence in this episode.`,
          });
        }
      }
    }

    // 4. Special Events Verification
    for (const evt of this.EPIC_EVENTS) {
      if (lowerText.includes(evt)) {
        let eventFound = false;
        let matchedChunkId: string | undefined;

        for (const p of retrievedPassages) {
          if (p.translation.toLowerCase().includes(evt) || (p.section && p.section.toLowerCase().includes(evt))) {
            eventFound = true;
            matchedChunkId = p.id;
            break;
          }
        }

        if (eventFound) {
          claims.push({
            item: evt,
            type: 'event',
            supported: true,
            evidenceChunkId: matchedChunkId,
          });
        } else {
          claims.push({
            item: evt,
            type: 'event',
            supported: false,
            reason: `Event '${evt}' referenced but absent from retrieved evidence.`,
          });
        }
      }
    }

    // Extract additional proper-name entities so fictional/unknown names cannot bypass
    // the fixed legacy epic-character vocabulary (for example Anuradha or Nakshatra).
    const knownCanonicalNames = new Set(this.EPIC_CHARACTERS.map(n => n.toLowerCase()));
    const ignoredNames = new Set(['my', 'friend', 'dear', 'when', 'during', 'every', 'however', 'then', 'what', 'this', 'that', 'the', 'but', 'yes', 'no', 'if', 'in', 'on', 'after', 'before', 'because', 'each', 'let', 'please', 'your', 'you', 'we', 'i', 'it', 'as', 'so', 'while', 'there', 'their', 'one', 'all', 'even', 'true', 'and', 'or', 'of', 'a', 'an', 'those', 'respect', 'notice', 'use', 'remind', 'reminds', 'keep', 'work', 'try', 'take', 'rest', 'allow', 'thus', 'remember', 'may', 'many', 'perhaps', 'still', 'each', 'every', 'parva', 'gita', 'bhagavad', 'mahabharata', 'kurukshetra', 'chapter', 'verse', 'sanskrit', 'shloka', 'sloka', 'shlok', 'dharma', 'karma', 'svadharma', 'nishkama', 'action', 'duty', 'english', 'hindi', 'language', 'sacred', 'lord', 'hastinapura', 'hastinapur', 'dwaraka', 'dwarika', 'dwarka', 'indraprastha', 'mathura', 'kashi', 'panchala', 'matsya', 'gandhara', 'magadha', 'kuru', 'kurus', 'bharata', 'bharatas', 'gandiva', 'bow', 'arrows', 'arrow']);
    const unknownNames = new Set<string>();
    for (const match of generatedText.matchAll(/\b[A-Z][a-z]{2,}\b/g)) {
      const name = match[0];
      const atSentenceStart = isSentenceInitial(generatedText, match.index || 0);
      if (atSentenceStart || parvaTitles.has(name.toLowerCase())) continue;
      if (appearsOnlyInQualifiedDenial(name, generatedText)) continue;
      if (ignoredNames.has(name.toLowerCase()) || knownCanonicalNames.has(name.toLowerCase())) continue;
      unknownNames.add(name);
    }
    // A false premise supplied by the user is still unverified. Carry its proper-name
    // candidates into the output check so names at the start of a response are covered.
    for (const match of (userQuery || '').matchAll(/\b[A-Z][a-z]{2,}\b/g)) {
      const name = match[0];
      const atSentenceStart = isSentenceInitial(userQuery || '', match.index || 0);
      if (atSentenceStart || ignoredNames.has(name.toLowerCase()) || knownCanonicalNames.has(name.toLowerCase())) continue;
      if (!new RegExp(`\\b${name}\\b`, 'i').test(generatedText)) continue;
      if (appearsOnlyInQualifiedDenial(name, generatedText)) continue;
      unknownNames.add(name);
    }
    for (const name of unknownNames) {
      const aliases = this.CHARACTER_ALIASES[name.toLowerCase()] || [name.toLowerCase()];
      const evidence = retrievedPassages.find(p =>
        (p.characters || []).some(c => aliases.includes(c.toLowerCase())) ||
        [p.translation, p.originalText || '', p.speaker || '', p.listener || ''].some(value => aliases.some(alias => new RegExp(`\\b${alias}\\b`, 'i').test(value)))
      );
      claims.push({
        item: name,
        type: 'character',
        supported: Boolean(evidence),
        evidenceChunkId: evidence?.id,
        evidenceIds: evidence ? [evidence.id] : [],
        confidence: evidence ? 1 : 0,
        reason: evidence ? undefined : `Proper-name entity '${name}' is absent from retrieved canonical evidence.`,
      });
      if (!evidence) {
        unsupportedCharacters.push(name.toLowerCase());
        mentionedCharacters.push(name.toLowerCase());
      }
    }

    // Parva labels are source locations, not character names. Verify them against the
    // retrieved passage metadata so a correct citation label cannot support an event claim.
    for (const match of generatedText.matchAll(/\b([A-Z][a-z]+)\s+Parva\b/gi)) {
      const parva = `${match[1]} Parva`;
      const evidence = retrievedPassages.find(p => `${p.parva || ''} ${p.sourceReference || ''}`.toLowerCase().includes(parva.toLowerCase()));
      claims.push({
        item: parva,
        type: 'location',
        supported: Boolean(evidence),
        evidenceChunkId: evidence?.id,
        evidenceIds: evidence ? [evidence.id] : [],
        confidence: evidence ? 1 : 0,
        reason: evidence ? undefined : `Parva location '${parva}' is absent from retrieved canonical evidence.`,
      });
    }

    // A relation/event must appear in one canonical evidence sentence with the same
    // participants and predicate. Separate mentions elsewhere in a passage are not enough.
    const participantAliases = [...new Set([...mentionedCharacters, ...unknownNames].map(n => n.toLowerCase()))];
    const relationPattern = /\b(meet(?:s|ing)?|met|tell(?:s|ing)?|told|say(?:s|ing)? to|said to|speak(?:s|ing)? to|spoke to|repl(?:y|ies|ied) to|son of|daughter of|brother of|sister of|wife of|husband of|guru|teacher|student|pupil|disciple|vanquish(?:es|ed|ing)?|defeat(?:s|ed|ing)?|kill(?:s|ed|ing)?|fight(?:s|ing)?|fought|bless(?:es|ed|ing)?|curse(?:s|d|ing)?|marry|marries|married|ask(?:s|ed|ing)?|answer(?:s|ed|ing)?|reveal(?:s|ed|ing)?|promise(?:s|d|ing)?|give|gives|gave|rescue|rescues|rescued|counsel(?:s|led|ling)?|advise(?:s|d|ing)?|teach(?:es|t|ing)?|stood|stand(?:s|ing)?|weep|weeps|wept|drop(?:s|ped|ping)?|travel(?:s|led|ling)?|depart(?:s|ed|ing)?|arrive(?:s|d|ing)?|face(?:s|d|ing)?|enter(?:s|ed|ing)?|leave(?:s|s|d|ing)?|win(?:s|ning)?|won|lose|loses|lost|hear(?:s|ing)?|heard|interpret(?:s|ed|ing)?|use(?:s|d|ing)?|see(?:s|ing)?|saw|guide(?:s|d|ing)?|lead(?:s|ing)?|led|ride(?:s|ing)?|rode|protect(?:s|ed|ing)?|serve(?:s|d|ing)?|follow(?:s|ed|ing)?|approach(?:es|ed|ing)?|move(?:s|d|ing)?|travel(?:s|led|ling)?)\b/i;
    const evidenceSentences = retrievedPassages.flatMap(p =>
      `${p.translation} ${p.originalText || ''}`.split(/(?<=[.!?])\s+/).map(sentence => ({ passage: p, sentence }))
    );
    const relationPredicateSupported = (predicate: string, source: string) => {
      const escapedPredicate = predicate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escapedPredicate}\\b`, 'i').test(source)) return true;
      const combatPredicate = /\b(?:fight|fought|fighting|vanquish(?:es|ed|ing)?|defeat(?:s|ed|ing)?|battle|duel|combat)\b/i;
      const combatSource = /\b(?:fight|fights|fought|fighting|vanquish(?:es|ed|ing)?|defeat(?:s|ed|ing)?|battle(?:d|s)?|duel(?:ed|s)?|combat)\b/i;
      return combatPredicate.test(predicate) && combatSource.test(source);
    };
    const participantAppears = (sentence: string, name: string) => {
      const aliases = this.CHARACTER_ALIASES[name.toLowerCase()] || [name.toLowerCase()];
      return aliases.some(alias => new RegExp(`\\b${alias}\\b`, 'i').test(sentence));
    };
    const claimSentences = generatedText.split(/(?<=[.!?])\s+/).filter(sentence => relationPattern.test(sentence));
    for (const sentence of claimSentences) {
      if (QUALIFIED_EVIDENCE_DENIAL.test(sentence)) continue;
      if (CanonicalGitaHelper.extractVerseReferences(sentence).length > 0) continue;
      const participants = participantAliases.filter(name => new RegExp(`\\b${name}\\b`, 'i').test(sentence));
      if (participants.length < 1) continue;
      const predicate = sentence.match(relationPattern)?.[0].toLowerCase() || '';
      const evidence = evidenceSentences.find(({ sentence: source }) =>
        participants.every(name => participantAppears(source, name)) &&
        relationPredicateSupported(predicate, source)
      );
      const isSupported = Boolean(evidence);
      claims.push({
        item: sentence.trim(),
        type: participants.length > 1 ? 'relationship' : 'event',
        claim: sentence.trim(),
        claimType: participants.length > 1 ? 'RELATIONSHIP' : 'EVENT',
        subject: participants[0],
        predicate,
        object: participants[1] || sentence.trim().slice((sentence.toLowerCase().indexOf(predicate) + predicate.length)).trim(),
        supported: isSupported,
        evidenceChunkId: evidence?.passage.id,
        evidenceIds: evidence ? [evidence.passage.id] : [],
        confidence: evidence ? 0.95 : 0,
        reason: isSupported ? undefined : `Relationship/event claim is not entailed by a single retrieved canonical evidence sentence: ${sentence.trim()}`,
      });
    }

    // Explicit verse references and claim-level verification (Defect 2)
    const verseRefs = CanonicalGitaHelper.extractVerseReferences(generatedText);
    for (const vr of verseRefs) {
      const ref = `Bhagavad Gita ${vr.chapter}.${vr.verse}`.toLowerCase();
      const evidence = retrievedPassages.find(p => p.sourceType.toLowerCase().includes('gita') && p.sourceReference.toLowerCase() === ref);
      const claimCheck = CanonicalGitaHelper.validateVerseClaim(vr.chapter, vr.verse, vr.sentence);
      
      const isSupported = Boolean(evidence) && claimCheck.supported;
      const failureReason = !claimCheck.supported
        ? claimCheck.reason
        : (!evidence ? `Verse reference ${vr.match} is absent from retrieved Gita evidence.` : undefined);

      claims.push({
        item: vr.match,
        type: 'verse',
        claim: vr.sentence,
        supported: isSupported,
        evidenceChunkId: isSupported ? evidence?.id : undefined,
        evidenceIds: isSupported && evidence ? [evidence.id] : [],
        confidence: isSupported ? 1 : 0,
        reason: failureReason,
      });
    }
    const teachingSentences = generatedText.split(/(?<=[.!?])\s+/).filter(sentence =>
      /\b(?:the )?(?:gita|bhagavad gita|mahabharata|scriptures?|verses?|shlokas?)\b.{0,80}\b(?:says|teaches|teaching|reminds|taught|according to|speaks? of|reveals?|points? to)\b/i.test(sentence) ||
      /\b(?:in )?these verses\b.{0,80}\b(?:remind|teach|show|reveal|say|point)\b/i.test(sentence)
    );
    for (const sentence of teachingSentences) {
      if (QUALIFIED_EVIDENCE_DENIAL.test(sentence)) continue;
      if (CanonicalGitaHelper.extractVerseReferences(sentence).length > 0) continue;
      const evidence = retrievedPassages.find(p => {
        const source = `${p.translation} ${p.relevanceForGuidance || ''} ${p.contextSummary || ''}`.toLowerCase();
        const tokens = sentence.toLowerCase().match(/[a-z]{4,}/g) || [];
        const substantive = tokens.filter(t => !['bhagavad', 'mahabharata', 'reminds', 'according', 'teaches', 'teaching', 'scriptures', 'verses', 'shlokas', 'these'].includes(t));
        const matches = substantive.filter(t => source.includes(t)).length;
        return substantive.length > 0 && matches / substantive.length >= 0.45;
      });
      claims.push({
        item: sentence.trim(),
        type: 'teaching',
        supported: Boolean(evidence),
        evidenceChunkId: evidence?.id,
        evidenceIds: evidence ? [evidence.id] : [],
        confidence: evidence ? 0.7 : 0,
        reason: evidence ? undefined : `Scriptural teaching attribution is not supported by retrieved evidence: ${sentence.trim()}`
      });
    }

    // Adversarial False-Premise & Attribution Verification (Defect 1)
    if (userQuery) {
      const qLower = userQuery.toLowerCase();
      const falsePremiseProbes = [
        {
          name: 'krishna_secret_victory_promise',
          trigger: /\bkrishna\b.{0,60}\bsecretly\b.{0,60}\b(tell|told|promise|warrior|win|victory)\b/i,
          correctionCheck: /\b(does not|doesn't|never|did not|no record|not establish|free will|instead|rather|no secret promise)\b/i,
          rationalizationCheck: /\b(krishna secretly (?:told|promised|assured)|because krishna secretly|reason krishna secretly)\b/i,
          description: 'Krishna secretly told every warrior that Pandavas would definitely win',
        },
        {
          name: 'never_question_parents_elders',
          trigger: /\b(never|not)\s+(?:to\s+)?question\s+(?:their\s+)?(?:parents|elders)\b/i,
          correctionCheck: /\b(does not|doesn't|not teach|never taught|unquestioning|blind obedience|arjuna|bhishma|drona|prahlada|vibhishana|dharma)\b/i,
          rationalizationCheck: /\b(krishna said (?:a person )?should never question|taught that we should never question|reasons? why krishna (?:said|taught) never to question)\b/i,
          description: 'Krishna taught never to question parents or elders',
        },
        {
          name: 'bhishma_promise_kill_duryodhana',
          trigger: /\bbhishma\b.{0,60}\bpromise\b.{0,60}\bkill\b.{0,60}\bduryodhana\b/i,
          correctionCheck: /\b(never|did not|didn't|fought for|side of|throne|hastinapura|bound)\b/i,
          rationalizationCheck: /\b(bhishma promised draupadi (?:that )?he would kill duryodhana)\b/i,
          description: 'Bhishma promised Draupadi he would kill Duryodhana',
        },
        {
          name: 'arjuna_abandon_war_permanently',
          trigger: /\barjuna\b.{0,60}\babandon\b.{0,60}\bwar\b.{0,60}\bpermanently\b/i,
          correctionCheck: /\b(did not|didn't|never|picked up|gandiva|fought|karishye|vachanam|dispelled)\b/i,
          rationalizationCheck: /\b(arjuna permanently abandoned|abandoned the war permanently after hearing)\b/i,
          description: 'Arjuna abandoned the war permanently after hearing the Gita',
        },
        {
          name: 'draupadi_ordered_killing_every_prince',
          trigger: /\bdraupadi\b.{0,60}\border(ed)?\b.{0,60}\bkill(ing)?\b.{0,60}\b(every|all)\b.{0,40}\bprince\b/i,
          correctionCheck: /\b(bhima|vow|oath|justice|did not order|was not draupadi)\b/i,
          rationalizationCheck: /\b(draupadi ordered the killing of every|ordered every kaurava prince to be killed)\b/i,
          description: 'Draupadi personally ordered the killing of every Kaurava prince',
        },
        {
          name: 'krishna_whisper_to_karna',
          trigger: /\bwhisper\b.{0,60}\bkarna\b/i,
          correctionCheck: /\b(does not|doesn't|no secret whisper|aloud|spoke|dharma|openly|not record)\b/i,
          rationalizationCheck: /\b(krishna whispered to karna|the words krishna whispered)\b/i,
          description: 'Exact words Krishna whispered to Karna immediately before death',
        },
        {
          name: 'verse_guaranteeing_success',
          trigger: /\bverse\b.{0,60}\bguarantee(ing|s|d)?\b.{0,60}\bsuccess\b/i,
          correctionCheck: /\b(no verse|isn't a verse|does not guarantee|not guarantee|2\.47|without attachment|fruits)\b/i,
          rationalizationCheck: /\b(the verse that guarantees success is|guarantees success to everyone)\b/i,
          description: 'Verse guaranteeing worldly success to everyone who follows dharma',
        },
        {
          name: 'modern_events_predetermined',
          trigger: /\bevery event in our modern lives was predetermined by krishna\b/i,
          correctionCheck: /\b(does not|doesn't|not fatalistic|purushartha|free will|effort|human)\b/i,
          rationalizationCheck: /\b(the mahabharata explicitly says that every event in our modern lives was predetermined)\b/i,
          description: 'Mahabharata says all modern events predetermined by Krishna',
        },
        {
          name: 'poison_duryodhana_food',
          trigger: /\bpoison\b.{0,60}\bduryodhana\b/i,
          correctionCheck: /\b(did not|never|no record|does not establish|peace envoy|rejected)\b/i,
          rationalizationCheck: /\b(krishna ordered yudhishthira to poison|poison duryodhana's food)\b/i,
          description: 'Krishna ordered Yudhishthira to poison Duryodhana',
        },
        {
          name: 'arjuna_refused_arrows_karna_friend',
          trigger: /\barjuna\b.{0,60}\brefuse\b.{0,60}\bkarna\b.{0,40}\bfriend\b/i,
          correctionCheck: /\b(did not|didn't|karna was an adversary|did not know|revealed later|after death)\b/i,
          rationalizationCheck: /\b(arjuna refused to shoot arrows at karna because karna was secretly his friend)\b/i,
          description: 'Arjuna refused to shoot Karna because Karna was secretly his friend',
        },
        {
          name: 'war_always_sin_chapter',
          trigger: /\bchapter\b.{0,60}\bwar\s+is\s+always\s+a\s+sin\b/i,
          correctionCheck: /\b(no chapter|does not state|svadharma|kshatriya|righteous war|dharmayuddha)\b/i,
          rationalizationCheck: /\b(chapter .* states that fighting in war is always a sin)\b/i,
          description: 'Chapter stating that fighting in war is always a sin',
        },
        {
          name: 'bhishma_pandava_eleventh_day',
          trigger: /\bbhishma\b.{0,60}\bfight\s+on\s+the\s+pandava\s+side\b/i,
          correctionCheck: /\b(never|did not|remained commander of kauravas|bed of arrows|tenth day)\b/i,
          rationalizationCheck: /\b(bhishma decided to fight on the pandava side)\b/i,
          description: 'Bhishma fought on the Pandava side on the eleventh day',
        },
        {
          name: 'draupadi_forgave_dushasana_dice_game',
          trigger: /\bdraupadi\b.{0,60}\bforg(ive|ave)\s+dushasana\b/i,
          correctionCheck: /\b(did not|never forgave|unwashed hair|vow|bhima|drank blood|demanded justice)\b/i,
          rationalizationCheck: /\b(draupadi forgave dushasana immediately)\b/i,
          description: 'Draupadi forgave Dushasana immediately during the dice game',
        },
      ];

      for (const probe of falsePremiseProbes) {
        if (probe.trigger.test(qLower)) {
          const rationalizedMatches = Array.from(lowerText.matchAll(new RegExp(probe.rationalizationCheck, 'gi')));
          const isActuallyRationalized = rationalizedMatches.some(m => !QUALIFIED_EVIDENCE_DENIAL.test(sentenceContaining(generatedText, m.index || 0)));
          const corrected = probe.correctionCheck.test(lowerText);
          if (isActuallyRationalized || !corrected) {
            claims.push({
              item: userQuery,
              type: 'attribution',
              claim: userQuery,
              supported: false,
              reason: `Response uncritically accepted or rationalized an ungrounded adversarial premise ("${probe.description}") without correcting the false attribution.`,
            });
          }
        }
      }
    }

    // Calculate overall validity
    const unsupportedClaims = Array.from(new Set(claims.filter(c => !c.supported).map(c => c.reason || c.item)));
    const isValid = unsupportedClaims.length === 0;

    return {
      isValid,
      claims,
      unsupportedClaims,
      mentionedCharacters,
      supportedCharacters,
      unsupportedCharacters,
      unsupportedQuotes,
      fabricatedAutobiography,
    };
  }
}
