export interface CanonicalEvidence {
  id: string;
  sourceType?: string;
  sourceReference: string;
  text: string;
  characters?: string[];
  verseRange?: string;
  speaker?: string;
  listener?: string;
}

export interface ContentEvaluation {
  pass: boolean;
  claimCount: number;
  supportedClaimCount: number;
  unsupportedClaimCount: number;
  claims: Array<{ claim: string; type: 'entity' | 'event' | 'relationship' | 'quote' | 'verse' | 'teaching'; supported: boolean; evidenceIds: string[]; confidence: number; reason?: string }>;
  fabricatedEventCount: number;
  fabricatedRelationshipCount: number;
  fabricatedQuoteCount: number;
  unsupportedClaims: Array<{ claim: string; type: 'entity' | 'event' | 'relationship' | 'quote' | 'verse' | 'teaching'; reason: string }>;
  unsupportedPremiseRejected: boolean | null;
  positiveQuestionAnswered: boolean | null;
  exactQuotePolicyPass: boolean;
  citationsRelevant: boolean;
}

const RELATION = /\b(related|relate|relationship|relation|guru|teacher|student|pupil|disciple|meet(?:s|ing)?|met|tell(?:s|ing)?|told|say(?:s|ing)? to|said to|speak(?:s|ing)? to|spoke to|vanquish(?:es|ed|ing)?|defeat(?:s|ed|ing)?|fight(?:s|ing)?|fought|kill(?:s|ed|ing)?|lead(?:s|ing)?|led|hear(?:s|ing)?|heard|interpret(?:s|ed|ing)?|use(?:s|d|ing)?|guide(?:s|d|ing)?|serve(?:s|d|ing)?|protect(?:s|ed|ing)?|comfort(?:s|ed|ing)?|explain(?:s|ed|ing)?|counsel(?:s|ed|ing)?|teach(?:es|t|ing)?|defend(?:s|ed|ing)?|marry|married|son of|daughter of|brother of|wife of|husband of)\b/i;
const NEGATED_OR_QUALIFIED = /\b(?:does not record|do not record|does not establish|do not establish|can't confirm|cannot confirm|can't verify|cannot verify|am not aware|is not aware|are not aware|not established|not supported|no canonical record|no evidence|did not|never met|not in the retrieved|not in the canonical)\b/i;
const REFUSAL = /\b(?:can't verify|cannot verify|can't confirm|cannot confirm|no canonical (?:record|evidence)|not established by|not supported by|does not establish (?:the |that )?(?:meeting|relationship|event|claim)|do not establish (?:the |that )?(?:meeting|relationship|event|claim)|(?:am|is|are) not aware of (?:any |an? )?(?:canonical )?(?:record|evidence|episode|meeting|relationship)|don't want to invent|do not want to invent)\b/i;

function escaped(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nameSpellings(name: string): string[] {
  const lower = name.toLowerCase();
  const spellings = new Set([lower]);
  if (lower.includes('sh')) spellings.add(lower.replace(/sh/g, 's'));
  else if (lower.includes('s')) spellings.add(lower.replace(/s/g, 'sh'));
  return Array.from(spellings);
}

function namePresent(text: string, name: string): boolean {
  return nameSpellings(name).some(spelling => new RegExp(`\\b${escaped(spelling)}\\b`, 'i').test(text));
}

function uniquePromptNames(prompt: string, response: string): string[] {
  const ignored = new Set(['Gita', 'Bhagavad', 'Mahabharata', 'Kurukshetra', 'Chapter', 'Verse', 'Tell', 'What', 'Was', 'Who', 'Can', 'Does', 'Did', 'Which', 'Use', 'Return', 'Earlier', 'Coming', 'Actually', 'I']);
  const names = new Set<string>();
  for (const match of prompt.matchAll(/\b[A-Z][a-z]{2,}\b/g)) {
    if (!ignored.has(match[0]) && new RegExp(`\\b${escaped(match[0])}\\b`, 'i').test(response)) names.add(match[0]);
  }
  return Array.from(names);
}

type IndependentClaim = ContentEvaluation['claims'][number];

function normalizedPredicateForms(predicate: string): string[] {
  const raw = predicate.toLowerCase();
  const roots: Record<string, string[]> = {
    met: ['meet'], meeting: ['meet'], meets: ['meet'], fought: ['fight'], fighting: ['fight'], fights: ['fight'],
    heard: ['hear'], hearing: ['hear'], hears: ['hear'], led: ['lead'], leading: ['lead'], leads: ['lead'],
    told: ['tell'], telling: ['tell'], tells: ['tell'], used: ['use'], using: ['use'], uses: ['use'],
    guided: ['guide', 'counsel', 'advise', 'explain', 'teach'], guiding: ['guide', 'counsel', 'advise', 'explain', 'teach'], guides: ['guide', 'counsel', 'advise', 'explain', 'teach'], served: ['serve'], serving: ['serve'], serves: ['serve'],
    protected: ['protect'], protecting: ['protect'], protects: ['protect'], comforted: ['comfort'], comforting: ['comfort'], comforts: ['comfort'],
    explained: ['explain'], explaining: ['explain'], explains: ['explain'], taught: ['teach'], teaching: ['teach'], teaches: ['teach'],
    counsel: ['counsel', 'explain', 'comfort', 'teach', 'advise'], counsels: ['counsel', 'explain', 'comfort', 'teach', 'advise'], counseled: ['counsel', 'explain', 'comfort', 'teach', 'advise'], counseling: ['counsel', 'explain', 'comfort', 'teach', 'advise'],
  };
  return Array.from(new Set([raw, ...(roots[raw] || [])]));
}

function predicateSupported(source: string, predicate: string): boolean {
  const irregular: Record<string, string[]> = {
    fight: ['fought'], meet: ['met'], lead: ['led'], teach: ['taught', 'taught'], tell: ['told'], hear: ['heard'],
    guide: ['guided', 'guiding', 'guides'], counsel: ['counseled', 'counselling', 'counseling'],
  };
  const variants = normalizedPredicateForms(predicate).flatMap(form => [
    form, `${form}s`, `${form}ed`, `${form}ing`, ...(irregular[form] || []),
  ]);
  const asksCombat = /\b(?:fight|fought|fighting|battle|duel|combat|vanquish(?:es|ed|ing)?|defeat(?:s|ed|ing)?)\b/i.test(predicate);
  if (asksCombat) variants.push('fight', 'fights', 'fought', 'fighting', 'battle', 'battled', 'duel', 'dueled', 'combat', 'vanquish', 'vanquished', 'defeat', 'defeated');
  const asksTeacherStudentRelation = /\b(?:guru|teacher|student|pupil|disciple)\b/i.test(predicate);
  if (asksTeacherStudentRelation) variants.push('guru', 'teacher', 'student', 'pupil', 'disciple');
  return variants.some(form => new RegExp(`\\b${escaped(form)}\\b`, 'i').test(source));
}

function answerRelevantToEvidence(prompt: string, response: string, evidence: CanonicalEvidence[]): boolean {
  const verse = prompt.match(/\b(?:Bhagavad\s*)?Gita\s*(\d{1,2})[.:](\d{1,2})\b/i);
  const names = Array.from(new Set(Array.from(prompt.matchAll(/\b[A-Z][a-z]{2,}\b/g))
    .map(match => match[0])
    .filter(name => !['Gita', 'Bhagavad', 'Mahabharata', 'Kurukshetra', 'Chapter', 'Verse', 'Tell', 'What', 'Was', 'Who', 'Can', 'Does', 'Did', 'Which', 'Use', 'Return', 'Earlier', 'Coming', 'Actually', 'I'].includes(name))));
  const asksForRelationship = names.length >= 2 && /\b(?:related|relationship|relation|between|fight|fought|battle|married|marry|meet|met|meeting|son of|daughter of|brother of|sister of|wife of|husband of)\b/i.test(prompt);
  if (asksForRelationship) {
    if (!names.every(name => namePresent(response, name))) return false;
    const pairEvidence = evidence.filter(item => names.every(name =>
      (item.characters || []).some(character => namePresent(character, name)) ||
      namePresent(`${item.text} ${item.sourceReference}`, name)
    ));
    if (!pairEvidence.length) return false;
    const relationSentences = response.split(/(?<=[.!?])\s+/).filter(sentence =>
      names.every(name => namePresent(sentence, name)) && RELATION.test(sentence));
    if (!relationSentences.length) return false;
    const relationSupported = relationSentences.some(sentence => {
      const predicate = sentence.match(RELATION)?.[0] || '';
      return pairEvidence.some(item => [...item.text.split(/(?<=[.!?])\s+/), item.sourceReference].some(source =>
        names.every(name => namePresent(source, name)) && predicateSupported(source, predicate)));
    });
    if (!relationSupported) return false;
  }
  const anchoredEvidence = evidence.filter(item => verse
    ? item.sourceReference.toLowerCase().includes(`gita ${verse[1]}.${verse[2]}`)
    : names.some(name => (item.characters || []).some(character => namePresent(character, name)) ||
      namePresent(`${item.text} ${item.sourceReference}`, name)));
  if (!anchoredEvidence.length) return false;
  if (!verse && !names.some(name => namePresent(response, name))) return false;

  const responseTokens = new Set((response.toLowerCase().match(/[a-z0-9]{4,}/g) || []).filter(token => !['that', 'with', 'from', 'this', 'they', 'them', 'then', 'have', 'will', 'your', 'about', 'does', 'were', 'what', 'which'].includes(token)));
  return anchoredEvidence.some(item => {
    const evidenceTokens = new Set((`${item.text} ${item.sourceReference} ${(item.characters || []).join(' ')}`.toLowerCase().match(/[a-z0-9]{4,}/g) || []));
    return Array.from(responseTokens).filter(token => evidenceTokens.has(token)).length >= 2;
  });
}

function independentCanonicalClaims(prompt: string, response: string, evidence: CanonicalEvidence[], tag: string): IndependentClaim[] {
  const names = uniquePromptNames(prompt, response);
  // Event support must be stated in a canonical text sentence or source title;
  // character-list metadata alone cannot prove the predicate.
  const claims: IndependentClaim[] = [];
  for (const name of names) {
    const sentence = response.split(/(?<=[.!?])\s+/).find(text => new RegExp(`\\b${escaped(name)}\\b`, 'i').test(text));
    if (!sentence || NEGATED_OR_QUALIFIED.test(sentence) || REFUSAL.test(sentence)) continue;
    const match = evidence.find(item => (item.characters || []).some(character => namePresent(character, name)) ||
      namePresent(`${item.text} ${item.sourceReference} ${item.speaker || ''} ${item.listener || ''}`, name));
    claims.push({
      claim: `${name} is present in the response as a canonical entity.`,
      type: 'entity',
      supported: Boolean(match),
      evidenceIds: match ? [match.id] : [],
      confidence: match ? 0.95 : 0,
      reason: match ? undefined : `No retrieved canonical evidence establishes the entity ${name}.`,
    });
  }

  const sentences = response.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    if (NEGATED_OR_QUALIFIED.test(sentence) || REFUSAL.test(sentence)) continue;
    const participants = names.filter(name => namePresent(sentence, name));
    const predicate = sentence.match(RELATION)?.[0];
    if (!participants.length || !predicate || NEGATED_OR_QUALIFIED.test(sentence)) continue;
    const matchingEvidence = evidence.find(item =>
      [...item.text.split(/(?<=[.!?])\s+/), item.sourceReference].some(source =>
        participants.every(name => namePresent(source, name)) &&
        predicateSupported(source, predicate)
      )
    );
    const supported = Boolean(matchingEvidence);
    claims.push({
      claim: sentence.trim(),
      type: participants.length > 1 ? 'relationship' : 'event',
      supported,
      evidenceIds: matchingEvidence ? [matchingEvidence.id] : [],
      confidence: supported ? 0.9 : 0,
      reason: supported ? undefined : `No retrieved canonical sentence independently entails the named participants and predicate.`,
    });
  }

  const quoteMatches = response.match(/[“"]([^”"]{25,})[”"]/g) || [];
  for (const raw of quoteMatches) {
    const text = raw.replace(/[“”"]/g, '').trim().toLowerCase();
    const match = evidence.find(item => item.text.toLowerCase().includes(text));
    claims.push({
      claim: raw,
      type: 'quote',
      supported: Boolean(match),
      evidenceIds: match ? [match.id] : [],
      confidence: match ? 1 : 0,
      reason: match ? undefined : 'Quoted canonical wording is absent from the retrieved source text.',
    });
  }

  for (const match of response.matchAll(/\b(?:Bhagavad\s*)?Gita\s*(\d{1,2})[.:](\d{1,2})\b/gi)) {
    const ref = `gita ${match[1]}.${match[2]}`.toLowerCase();
    const item = evidence.find(source => source.sourceReference.toLowerCase().includes(ref));
    claims.push({
      claim: match[0],
      type: 'verse',
      supported: Boolean(item),
      evidenceIds: item ? [item.id] : [],
      confidence: item ? 1 : 0,
      reason: item ? undefined : `The verse ${match[0]} is absent from retrieved Gita evidence.`,
    });
  }

  if ((tag.startsWith('scripture-') || tag === 'canonical-event-positive') && answerRelevantToEvidence(prompt, response, evidence)) {
    const match = evidence.find(item => answerRelevantToEvidence(prompt, response, [item]));
    claims.push({
      claim: response.trim(),
      type: 'teaching',
      supported: true,
      evidenceIds: match ? [match.id] : [],
      confidence: match ? 0.85 : 0.75,
    });
  }

  return claims;
}

function positiveAnswerIsRelevant(tag: string, prompt: string, response: string, evidence: CanonicalEvidence[]): boolean {
  if (tag === 'quote-verification') return REFUSAL.test(response) || response.trim().length >= 45;
  if (REFUSAL.test(response) && !answerRelevantToEvidence(prompt, response, evidence)) return false;
  return response.trim().length >= 45 && answerRelevantToEvidence(prompt, response, evidence);
}

function verifyQuotedCanonicalText(response: string, evidence: CanonicalEvidence[]): boolean {
  const longOrAttributedQuotes = response.match(/[“"]([^”"]{25,})[”"]/g) || [];
  return longOrAttributedQuotes.every(raw => {
    const quote = raw.replace(/[“”"]/g, '').trim().toLowerCase();
    return evidence.some(item => item.text.toLowerCase().includes(quote));
  });
}

function evaluateCitations(response: string, citationIds: string[], evidence: CanonicalEvidence[]): boolean {
  if (!citationIds.length) return true;
  const evidenceById = new Map(evidence.map(item => [item.id, item]));
  const answerTokens = new Set((response.toLowerCase().match(/[a-z0-9]{5,}/g) || []));
  return citationIds.every(id => {
    const item = evidenceById.get(id);
    if (!item) return false;
    if (response.toLowerCase().includes(item.sourceReference.toLowerCase()) || (item.verseRange && response.includes(item.verseRange))) return true;
    const evidenceTokens = (item.text.toLowerCase().match(/[a-z0-9]{5,}/g) || []).filter(token => !['bhagavad', 'mahabharata', 'chapter', 'verse'].includes(token));
    const overlap = evidenceTokens.filter(token => answerTokens.has(token)).length;
    return overlap >= Math.min(2, evidenceTokens.length);
  });
}

export function evaluateCanonicalContent(args: {
  tag: string;
  prompt: string;
  response: string;
  evidence: CanonicalEvidence[];
  citationIds: string[];
}): ContentEvaluation {
  const { tag, prompt, response, evidence, citationIds } = args;
  const claims = independentCanonicalClaims(prompt, response, evidence, tag);
  const unsupportedClaims = claims.filter(claim => !claim.supported).map(claim => ({
    claim: claim.claim,
    type: claim.type,
    reason: claim.reason || 'No retrieved canonical evidence supports this claim.',
  }));
  const fabricatedQuotes = !verifyQuotedCanonicalText(response, evidence);
  const unsupportedPremise = tag.startsWith('fictional-premise-');
  const positiveQuestion = tag === 'canonical-character-positive' || tag === 'canonical-event-positive' ||
    tag.startsWith('scripture-') || tag === 'quote-verification';
  const unsupportedPremiseRejected = unsupportedPremise ? REFUSAL.test(response) : null;
  const positiveQuestionAnswered = positiveQuestion ? positiveAnswerIsRelevant(tag, prompt, response, evidence) : null;
  const exactQuotePolicyPass = tag !== 'quote-verification' || (!fabricatedQuotes && (REFUSAL.test(response) || /[“"]/u.test(response) || /exact wording|exact text/i.test(response)));
  const citationsRelevant = evaluateCitations(response, citationIds, evidence);
  const unsupportedClaimCount = unsupportedClaims.length + (fabricatedQuotes && !unsupportedClaims.some(claim => claim.type === 'quote') ? 1 : 0);
  const pass = unsupportedClaimCount === 0 && unsupportedPremiseRejected !== false && positiveQuestionAnswered !== false && exactQuotePolicyPass && citationsRelevant;
  return {
    pass,
    claimCount: claims.length + (tag === 'quote-verification' && claims.length === 0 ? 1 : 0) + (fabricatedQuotes && !claims.some(claim => claim.type === 'quote') ? 1 : 0),
    supportedClaimCount: claims.filter(claim => claim.supported).length + (tag === 'quote-verification' && claims.length === 0 && REFUSAL.test(response) ? 1 : 0),
    unsupportedClaimCount,
    fabricatedEventCount: unsupportedClaims.filter(claim => claim.type === 'event').length,
    fabricatedRelationshipCount: unsupportedClaims.filter(claim => claim.type === 'relationship').length,
    fabricatedQuoteCount: unsupportedClaims.filter(claim => claim.type === 'quote').length + Number(fabricatedQuotes && !unsupportedClaims.some(claim => claim.type === 'quote')),
    claims,
    unsupportedClaims,
    unsupportedPremiseRejected,
    positiveQuestionAnswered,
    exactQuotePolicyPass,
    citationsRelevant,
  };
}
