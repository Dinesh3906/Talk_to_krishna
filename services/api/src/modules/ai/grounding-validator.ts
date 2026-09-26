import { RetrievedPassage } from './hybrid-retriever.js';

export interface GroundingClaimCheck {
  item: string;
  type: 'character' | 'quote' | 'autobiography' | 'event';
  supported: boolean;
  evidenceChunkId?: string;
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
    'arjuna', 'arjun', 'karna', 'gandhari', 'draupadi', 'bhishma', 'bheeshma',
    'yudhishthira', 'yudhisthir', 'kunti', 'vidura', 'bhima', 'bheem',
    'duryodhana', 'duryodhan', 'drona', 'ashwatthama', 'abhimanyu',
    'vyasa', 'sanjaya', 'dhritarashtra', 'shakuni', 'nakula', 'sahadeva',
    'shikhandi', 'ghatotkacha', 'balarama', 'subhadra', 'shantanu', 'pandu',
    'kripa', 'dushasana', 'jayadratha', 'ekalavya', 'barbarika'
  ];

  private static readonly EPIC_EVENTS = [
    'chakravyuha', 'dice game', 'disrobing', 'vastraharan', 'night raid',
    'sauptika', 'exile', 'lac palace', 'lakshagriha', 'vishvarupa', 'visvarupa'
  ];

  private static readonly CHARACTER_ALIASES: Record<string, string[]> = {
    yudhishthira: ['yudhishthira', 'yudhishtira', 'yudhisthir', 'dharmaraja', 'son of dharma'],
    yudhisthir: ['yudhishthira', 'yudhishtira', 'yudhisthir', 'dharmaraja', 'son of dharma'],
    arjuna: ['arjuna', 'arjun', 'partha', 'dhananjaya', 'phalguna', 'vibhatsu'],
    arjun: ['arjuna', 'arjun', 'partha', 'dhananjaya'],
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
    const lowerEstablished = establishedEntities.map(e => e.toLowerCase());

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
      evidenceTexts.push(p.translation.toLowerCase());
    }

    for (const charName of this.EPIC_CHARACTERS) {
      const regex = new RegExp(`\\b${charName}\\b`, 'i');
      if (regex.test(lowerText)) {
        if (!mentionedCharacters.includes(charName)) {
          mentionedCharacters.push(charName);
        }

        // Check if explicitly asked by the seeker in userQuery
        const askedByUser = regex.test(lowerQuery);

        // Aliases to look for in retrieved passages
        const aliases = this.CHARACTER_ALIASES[charName] || [charName];

        // Check if already established in earlier turns of the conversation
        const isEstablishedInConversation = aliases.some(alias => 
          lowerEstablished.includes(alias) || lowerEstablished.includes(charName)
        );

        // Check if supported by retrieved evidence
        let supportedChunkId: string | undefined;
        for (const p of retrievedPassages) {
          const trans = p.translation.toLowerCase();
          const orig = (p.originalText || '').toLowerCase();
          const ctx = (p.contextSummary || '').toLowerCase();
          const ref = (p.sourceReference || '').toLowerCase();
          const pChars = (p.characters || []).map(c => c.toLowerCase());

          const matchesAnyAlias = aliases.some(alias => 
            pChars.includes(alias) ||
            trans.includes(alias) ||
            orig.includes(alias) ||
            ctx.includes(alias) ||
            ref.includes(alias)
          );

          if (matchesAnyAlias) {
            supportedChunkId = p.id;
            break;
          }
        }

        if (supportedChunkId || askedByUser || isEstablishedInConversation) {
          supportedCharacters.push(charName);
          claims.push({
            item: charName,
            type: 'character',
            supported: true,
            evidenceChunkId: supportedChunkId || (askedByUser ? 'user_prompt_entity' : 'conversation_established_entity'),
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
      
      const isAttributedSpeech = /(?:said|spoke|told|declared|replied|cried|stated|says|verse|gita|shloka|words of|proclaimed)\s*(?:to\s+\w+\s*)?:?\s*$/i.test(precedingText);
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

      for (const p of retrievedPassages) {
        const trans = p.translation.toLowerCase();
        const orig = (p.originalText || '').toLowerCase();
        if (trans.includes(cleanQuote) || orig.includes(cleanQuote)) {
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
        // Verify if retrieved passages explicitly show Krishna in dialogue or presence with this character
        let krishnaEstablishedWithEntity = false;
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

    // Calculate overall validity
    const unsupportedClaims = claims.filter(c => !c.supported).map(c => c.reason || c.item);
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
