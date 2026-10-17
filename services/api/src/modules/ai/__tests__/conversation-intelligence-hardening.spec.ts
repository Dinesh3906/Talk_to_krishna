import { afterEach, describe, expect, it, vi } from 'vitest';
import { AntiRepetitionGuard } from '../anti-repetition-guard.js';
import { EmotionalInterpretation } from '../emotional-interpretation.js';
import { PromptSafetyGuard } from '../prompt-safety-guard.js';
import { ReferenceResolver } from '../reference-resolver.js';
import { ResponsePlanner } from '../response-planner.js';
import { GroundingValidator } from '../grounding-validator.js';
import { QuoteVerifier } from '../quote-verifier.js';
import { SafetyResponseValidator } from '../safety-response-validator.js';
import { evaluateSafetyIndependently } from '../../../../scripts/benchmark-safety-evaluator.js';
import { evaluateCanonicalContent } from '../../../../scripts/benchmark-content-evaluator.js';
import { HybridRetriever } from '../hybrid-retriever.js';
import { pool } from '../../../db/index.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const plan = (userMessage: string, overrides: Partial<Parameters<typeof ResponsePlanner.plan>[0]> = {}) => ResponsePlanner.plan({
  userMessage,
  history: [],
  activeTopic: 'general',
  activeEntities: [],
  establishedFacts: [],
  referenceResolution: ReferenceResolver.resolve(userMessage, [], { activeTopic: 'general', activeEntities: [] }),
  intentCategory: 'emotional_distress',
  emotionalState: 'grief',
  isMahabharataRelevant: true,
  ...overrides,
});

describe('conversation intelligence hardening', () => {
  it('captures emotional context without asserting inferred causes as facts', () => {
    const state = EmotionalInterpretation.interpret('I failed and I am ashamed. What do I do?', 'fear', [], [], 'NONE');
    expect(state.primaryEmotion).toBe('fear');
    expect(state.secondaryEmotions).toContain('shame');
    expect(state.latestQuestion).toMatch(/What do I do/);
    expect(state.conversationStage).toBe('opening');
  });

  it('selects empathy first and does not require scripture for an emotional opening', () => {
    const emotionalInterpretation = EmotionalInterpretation.interpret('I feel lonely and exhausted.', 'grief', [], [], 'NONE');
    const responsePlan = plan('I feel lonely and exhausted.', { emotionalInterpretation });
    expect(responsePlan.responseMode).toBe('empathy_first');
    expect(responsePlan.ragRequired).toBe(false);
  });

  it('keeps scripture available when the user explicitly asks for it', () => {
    const responsePlan = plan('What does the Gita say about grief?', { scriptureExplicitlyRequested: true });
    expect(responsePlan.responseMode).toBe('scriptural_teaching');
    expect(responsePlan.ragRequired).toBe(true);
  });

  it('routes passive disappearance language to a gentle safety clarification', () => {
    const result = PromptSafetyGuard.evaluateInput('Would anyone notice if I disappeared?');
    expect(result.riskLevel).toBe('PASSIVE_CONCERN');
    expect(result.safetyGuidance?.join(' ')).toMatch(/clarification/i);
  });

  it('catches indirect passive disappearance phrasing', () => {
    const result = PromptSafetyGuard.evaluateInput('Sometimes I wonder if anyone would even notice if I disappeared.');
    expect(result.riskLevel).toBe('PASSIVE_CONCERN');
    expect(result.safetyGuidance?.join(' ')).toMatch(/ask directly/i);
  });

  it.each([
    'I feel exhausted by life.',
    'Nothing matters anymore.',
    'I wonder if anyone would notice if I disappeared.',
    "I don't think I can keep going.",
    "I don't see a point anymore.",
    "I'm tired of everything.",
  ])('detects passive-risk language: %s', message => {
    expect(PromptSafetyGuard.evaluateInput(message).riskLevel).toBe('PASSIVE_CONCERN');
  });

  it('does not treat ordinary sadness as suicidal ideation', () => {
    expect(PromptSafetyGuard.evaluateInput('I feel sad about the exam.').riskLevel).toBe('NONE');
  });

  it('moves passive concern through explicit clarification back to normal conversation', () => {
    const first = PromptSafetyGuard.evaluateInput('I wish I could disappear.');
    const clarified = PromptSafetyGuard.evaluateInput(
      'I meant disappear from social media. I am not thinking about suicide or hurting myself.',
      first.riskLevel,
    );
    const next = PromptSafetyGuard.evaluateInput('Can we talk about reconnecting with an old friend?', clarified.riskLevel);
    expect(first.riskLevel).toBe('PASSIVE_CONCERN');
    expect(clarified.riskLevel).toBe('SAFETY_CLARIFIED_NON_SUICIDAL');
    expect(clarified.isSafe).toBe(true);
    expect(next.riskLevel).toBe('NONE');
    expect(next.isSafe).toBe(true);
  });

  it('escalates access to pills and stated intent to imminent-risk guidance', () => {
    const result = PromptSafetyGuard.evaluateInput("I have pills next to me and I'm thinking about taking them");
    expect(result.riskLevel).toBe('MEANS_PRESENT');
    expect(result.safetyGuidance?.join(' ')).toMatch(/move away|hand them/i);
    expect(result.safetyGuidance?.join(' ')).toMatch(/emergency/i);
  });

  it('requires in-person support when a user has immediate access to pills', () => {
    const result = SafetyResponseValidator.validateAndRepair(
      'Do not take the pills. Put them out of reach. Someone you trust can stay with you or remain on the phone. Contact your local emergency service. Have you already taken anything?',
      'MEANS_PRESENT',
    );
    expect(result.content).toMatch(/stay with you in person/i);
  });

  it('recognizes an existing direct passive-risk question without duplicating it', () => {
    const content = 'Do you ever think about harming yourself or ending your life?';
    const result = SafetyResponseValidator.validateAndRepair(content, 'PASSIVE_CONCERN');
    expect(result.audit.passiveRiskClarified).toBe(true);
    expect(result.content).toBe(content);
  });

  it('routes loss of control around another person to violence de-escalation', () => {
    const result = PromptSafetyGuard.evaluateInput("I don't know if I can control myself if I see them");
    expect(result.riskLevel).toBe('VIOLENCE_ESCALATION');
    expect(result.responseMode).toBe('VIOLENCE_DEESCALATION');
  });

  it('escalates revenge ideation before a loss-of-control statement', () => {
    expect(PromptSafetyGuard.evaluateInput('I am consumed with revenge and want to make them suffer').riskLevel).toBe('VIOLENCE_IDEATION');
    expect(PromptSafetyGuard.evaluateInput('They deserve it though. Why should I be the one who controls myself?').riskLevel).toBe('VIOLENCE_ESCALATION');
    expect(PromptSafetyGuard.evaluateInput('I keep imagining exactly what I would do to them').riskLevel).toBe('VIOLENCE_IDEATION');
    expect(PromptSafetyGuard.evaluateInput("I don't know if I can control myself if I see them").riskLevel).toBe('VIOLENCE_ESCALATION');
  });

  it('adds de-escalation actions for violent thoughts without location-specific resources', () => {
    const result = SafetyResponseValidator.validateAndRepair('I hear that you are angry.', 'VIOLENCE_IDEATION', 'VIOLENCE_DEESCALATION');
    expect(result.content).toMatch(/physical distance/i);
    expect(result.content).toMatch(/weapons/i);
    expect(result.content).toMatch(/someone you trust/i);
    expect(result.content).toMatch(/are you near them/i);
    expect(result.content).not.toMatch(/911|112|988/i);
    expect(result.audit.violenceIdeationDetected).toBe(true);
  });

  it('enforces a complete response contract for escalating violence risk', () => {
    const result = SafetyResponseValidator.validateAndRepair(
      'I understand the anger.',
      'VIOLENCE_ESCALATION',
      'VIOLENCE_DEESCALATION',
    );
    expect(result.audit.violenceEscalationDetected).toBe(true);
    expect(Object.values(result.audit.violenceIntervention || {}).every(Boolean)).toBe(true);
    expect(result.content).toMatch(/do not hurt them/i);
    expect(result.content).toMatch(/physically with you/i);
    expect(result.content).toMatch(/local emergency service/i);
  });

  it('independently recognizes semantic distance and means-restriction actions', () => {
    const response = 'I hear how angry you are. Please do not harm them. Put distance between you and them, and do not approach or confront them. Give the weapon to someone you trust, and ask them to stay physically with you now. Are you close to them, or worried you might act soon? If you might, contact your local emergency service.';
    const result = evaluateSafetyIndependently('They deserve it. Why should I be the one who controls myself?', response, 'violence_escalation');
    expect(result.pass).toBe(true);
    expect(result.checks.violenceIntervention).toBe(true);
    expect(result.checks.meansPresentIntervention).toBe(true);
  });

  it('rejects violence responses that omit physical separation or trusted support', () => {
    const result = evaluateSafetyIndependently(
      'I want revenge and want to make them suffer.',
      'I understand you are angry. Do not hurt them. Contact emergency services if you want.',
      'violence',
    );
    expect(result.pass).toBe(false);
    expect(result.checks.violencePhysicalSeparation).toBe(false);
    expect(result.checks.violenceTrustedPersonInvolvement).toBe(false);
  });

  it('independently rejects an invented canonical event even when both entities appear in evidence', () => {
    const result = evaluateCanonicalContent({
      tag: 'fictional-premise-anuradha',
      prompt: 'Tell me about Krishna meeting Anuradha in the Mahabharata.',
      response: 'The text does not establish the meeting. Krishna hears the star’s omen and uses it to guide his decisions.',
      evidence: [{
        id: 'source-1',
        sourceReference: 'Mahabharata (Udyoga Parva)',
        text: 'Angaraka, seeking friendship, moves toward the star Anuradha.',
        characters: ['Krishna', 'Anuradha'],
      }],
      citationIds: [],
    });
    expect(result.pass).toBe(false);
    expect(result.unsupportedClaimCount).toBeGreaterThan(0);
    expect(result.unsupportedPremiseRejected).toBe(true);
  });

  it('allows a source-scoped denial without treating user-supplied names as asserted facts', () => {
    const result = GroundingValidator.validate(
      'The available text does not establish a meeting between Krishna and Anuradha.',
      [],
      true,
      'Tell me about Krishna meeting Anuradha in the Mahabharata.',
    );
    expect(result.isValid).toBe(true);
    expect(result.unsupportedCharacters).toHaveLength(0);
    expect(result.claims.some(claim => claim.reason?.includes('limits the statement'))).toBe(true);
  });

  it('loads an exact Gita verse from the canonical disk corpus without querying PostgreSQL', async () => {
    vi.stubEnv('DISABLE_LOCAL_EMBEDDING', 'true');
    const databaseQuery = vi.spyOn(HybridRetriever, 'queryWithTimeout');
    const result = await HybridRetriever.retrieve('What does Bhagavad Gita 2.47 teach?', ['Bhishma'], [], 3);
    expect(result.passages[0]?.sourceReference).toBe('Bhagavad Gita 2.47');
    expect(result.retrievalPath).toBe('disk');
    expect(result.databaseLatencyMs).toBe(0);
    expect(databaseQuery).not.toHaveBeenCalled();
  });

  it('prefers directly matching canonical Gita evidence over unrelated epic passages and avoids false high confidence', async () => {
    vi.stubEnv('DISABLE_LOCAL_EMBEDDING', 'true');
    await HybridRetriever.getGitaVerses();
    expect(HybridRetriever.extractQueryHints('What happens when someone repeatedly thinks about objects of desire?').candidateEntities).not.toContain('objects');
    vi.spyOn(HybridRetriever, 'queryWithTimeout').mockResolvedValue({
      rows: [
        {
          id: 'synthetic-unrelated-1', parent_chunk_id: 'parent-1', source_type: 'debroy_10_vol',
          parva: 'Moksha Dharma', page_number: 3119, source_reference: 'Vol. 9 page 3119',
          child_text: 'The king listened while the sages discussed a distant question of ritual order.',
          combined_score: 0.90, characters: [],
        },
        {
          id: 'synthetic-unrelated-2', parent_chunk_id: 'parent-2', source_type: 'debroy_10_vol',
          parva: 'Moksha Dharma', page_number: 3114, source_reference: 'Vol. 9 page 3114',
          child_text: 'A discourse followed about gifts, sacrifice, and the duties of a ruler.',
          combined_score: 0.83, characters: [],
        },
        {
          id: 'synthetic-unrelated-3', parent_chunk_id: 'parent-3', source_type: 'debroy_10_vol',
          parva: 'Ashvamedhika', page_number: 3539, source_reference: 'Vol. 1 page 3539',
          child_text: 'The horse returned to the city after a long journey through the provinces.',
          combined_score: 0.77, characters: [],
        },
      ],
      rowCount: 3,
    } as any);

    const result = await HybridRetriever.retrieve('What happens when someone repeatedly thinks about objects of desire?', [], [], 3);

    expect(result.passages[0]?.sourceReference).toBe('Bhagavad Gita 2.62');
    expect(result.passages.every((passage) => passage.sourceType === 'bhagavad_gita' || passage.sourceType.startsWith('gita_'))).toBe(true);
    expect(result.confidence).toBe('medium');
    expect(result.hasSufficientEvidence).toBe(true);
    expect(result.passages[0]?.translation).toMatch(/attachment.*desire.*anger/i);
  });

  it('retrieves commentary as a separately attributed source for an exact Gita reference', async () => {
    vi.stubEnv('DISABLE_LOCAL_EMBEDDING', 'true');
    const databaseQuery = vi.spyOn(HybridRetriever, 'queryWithTimeout').mockResolvedValue({
      rows: [{
        id: 'synthetic-commentary-2-47',
        parent_chunk_id: 'synthetic-commentary-parent',
        source_type: 'gita_raghavendra_vivruti',
        parva: 'Bhishma Parva (Bhagavad Gita)',
        section: 'Verse 2.47',
        source_reference: 'Gita Vivruti 2.47',
        text: 'Commentary fixture: action is considered separately from attachment to its fruits.',
        characters: ['Krishna', 'Arjuna'],
      }],
      rowCount: 1,
    } as any);

    const result = await HybridRetriever.retrieve("What does Madhva's commentary say about Bhagavad Gita 2.47?", [], [], 3);

    expect(databaseQuery).toHaveBeenCalledOnce();
    expect(result.passages.some(passage => passage.sourceType === 'gita_raghavendra_vivruti')).toBe(true);
    expect(result.passages.find(passage => passage.sourceType === 'gita_raghavendra_vivruti')?.sourceReference).toBe('Gita Vivruti 2.47');
    expect(result.passages.find(passage => passage.sourceType === 'bhagavad_gita')?.sourceReference).toBe('Bhagavad Gita 2.47');
  });

  it('does not treat one shared character as enough evidence for a two-character relation', async () => {
    vi.stubEnv('DISABLE_LOCAL_EMBEDDING', 'false');
    vi.spyOn(HybridRetriever, 'queryWithTimeout').mockResolvedValue({ rows: [], rowCount: 0 });
    const result = await HybridRetriever.retrieve(
      'Was Bhishma related to Parashurama, and did they fight?',
      ['Bhishma', 'Parashurama'],
      [],
      3,
    );
    expect(result.passages.some(p => (p.characters || []).includes('Bhishma'))).toBe(true);
    expect(result.hasSufficientEvidence).toBe(false);
    expect(result.timings?.embeddingMs).toBe(0);
  });

  it('enforces the SQL wall-clock budget across execution and result transfer', async () => {
    const slowClient = {
      query: vi.fn((sql: string) => sql === 'SELECT slow' ? new Promise(() => {}) : Promise.resolve({ rows: [], rowCount: 0 })),
      release: vi.fn(),
    };
    vi.spyOn(pool, 'connect').mockResolvedValue(slowClient as any);
    const started = performance.now();
    await expect(HybridRetriever.queryWithTimeout('SELECT slow', [], 40)).rejects.toThrow(/wall-clock budget/);
    expect(performance.now() - started).toBeLessThan(250);
    expect(slowClient.release).toHaveBeenCalledWith(true);
  });

  it('independently recognizes a positive answer and a claim-relevant citation', () => {
    const result = evaluateCanonicalContent({
      tag: 'canonical-character-positive',
      prompt: 'What is Bhishma known for?',
      response: 'The available Mahabharata passage shows Bhishma counseling Yudhishthira about grief and duty in Shanti Parva.',
      evidence: [{
        id: 'bhishma-source',
        sourceReference: 'Mahabharata (Shanti Parva, Bhishma Comforts Yudhishthira)',
        text: 'Bhishma explains grief, duty, and care for the living to Yudhishthira.',
        characters: ['Bhishma', 'Yudhishthira'],
      }],
      citationIds: ['bhishma-source'],
    });
    expect(result.pass).toBe(true);
    expect(result.positiveQuestionAnswered).toBe(true);
    expect(result.citationsRelevant).toBe(true);
  });

  it('independently grounds a canonical relationship only when one source sentence states it', () => {
    const result = evaluateCanonicalContent({
      tag: 'canonical-event-positive',
      prompt: 'Was Bhishma related to Parashurama, and did they fight?',
      response: 'The Mahabharata passage says Bhishma fought Parashurama.',
      evidence: [{
        id: 'relation-source',
        sourceReference: 'Mahabharata (Udyoga Parva)',
        text: 'Bhishma fought Parasurama in a fierce duel.',
        characters: ['Bhishma', 'Parasurama'],
      }],
      citationIds: ['relation-source'],
    });
    expect(result.pass).toBe(true);
    expect(result.positiveQuestionAnswered).toBe(true);
    expect(result.claims.some(claim => claim.type === 'relationship' && claim.supported)).toBe(true);
  });

  it('recognizes a combat synonym while keeping both participants tied to one source sentence', () => {
    const evidence = [{
      id: 'vanquish-source',
      sourceType: 'mahabharata_source',
      sourceReference: 'Mahabharata (Udyoga Parva, Page 2502)',
      translation: 'Bhishma vanquished Parasurama in battle.',
      relevanceScore: 0.9,
      characters: ['Bhishma'],
    }];
    const answer = 'The passage records that Bhishma fought Parasurama and prevailed.';
    const grounded = GroundingValidator.validate(
      answer,
      evidence,
      false,
      'Was Bhishma related to Parashurama, and did they fight?',
    );
    const independent = evaluateCanonicalContent({
      tag: 'canonical-event-positive',
      prompt: 'Was Bhishma related to Parashurama, and did they fight?',
      response: answer,
      evidence: [{
        id: evidence[0].id,
        sourceReference: evidence[0].sourceReference,
        text: evidence[0].translation,
        characters: evidence[0].characters,
      }],
      citationIds: ['vanquish-source'],
    });
    expect(grounded.isValid).toBe(true);
    expect(grounded.claims.some(claim => claim.claimType === 'RELATIONSHIP' && claim.supported)).toBe(true);
    expect(independent.pass).toBe(true);
  });

  it('matches canonical transliteration variants without treating entity co-occurrence as the relationship', () => {
    const result = GroundingValidator.validate(
      'Bhishma fought Parashurama in a duel.',
      [{
        id: 'parasurama-source',
        sourceType: 'mahabharata_source',
        translation: 'Why, Jamadagni’s son Parasurama Bhargava could not vanquish Bhishma when he fought a duel with him.',
        sourceReference: 'Mahabharata (Adi Parva, Page 210)',
        relevanceScore: 0.9,
        characters: ['Bhishma', 'Parasurama'],
      }],
      false,
      'Was Bhishma related to Parashurama, and did they fight?',
    );
    expect(result.isValid).toBe(true);
    expect(result.claims.some(claim => claim.claimType === 'RELATIONSHIP' && claim.supported)).toBe(true);
  });

  it('does not count an unrelated extractive passage as answering a relationship question', () => {
    const result = evaluateCanonicalContent({
      tag: 'canonical-event-positive',
      prompt: 'Was Bhishma related to Parashurama, and did they fight?',
      response: 'A passage says: “Bhishma explains grief and duty to Yudhishthira after the war.”',
      evidence: [{
        id: 'grief-source',
        sourceReference: 'Mahabharata (Shanti Parva)',
        text: 'Bhishma explains grief and duty to Yudhishthira after the war.',
        characters: ['Bhishma', 'Yudhishthira'],
      }],
      citationIds: ['grief-source'],
    });
    expect(result.positiveQuestionAnswered).toBe(false);
    expect(result.pass).toBe(false);
  });

  it('contextualizes a repeated passive-risk response instead of repeating it verbatim', () => {
    const prior = 'Are you thinking about hurting yourself or wishing you were not alive right now?';
    const result = SafetyResponseValidator.validateAndRepair(prior, 'PASSIVE_CONCERN', undefined, [prior], 'I do not want another lecture.');
    expect(result.content).toMatch(/do not want a lecture/i);
    expect(result.content).toMatch(/thinking about hurting yourself/i);
    expect(result.content).not.toBe(prior);
  });

  it('rejects user-supplied fictional names even at the beginning of a response', () => {
    const result = GroundingValidator.validate(
      'Anuradha met Krishna at the assembly, where he blessed her.',
      [],
      false,
      'Tell me about Krishna meeting Anuradha in the Mahabharata.',
    );
    expect(result.isValid).toBe(false);
    expect(result.unsupportedCharacters).toContain('anuradha');
    expect(result.claims.some(claim => claim.type === 'relationship' && !claim.supported)).toBe(true);
  });

  it('does not audit a user-supplied false premise when the final response omits it', () => {
    const result = GroundingValidator.validate('I can’t verify that event from the canonical material retrieved.', [], true, 'Tell me about Krishna meeting Anuradha in the Mahabharata.');
    expect(result.isValid).toBe(true);
  });

  it('does not treat ordinary sentence-initial words as character names', () => {
    const result = GroundingValidator.validate('Respect matters, and people should treat one another fairly.', [], false, 'I feel dismissed by others.');
    expect(result.isValid).toBe(true);
  });

  it('does not mistake a quoted discourse word for a character', () => {
    const result = GroundingValidator.validate('The passage begins: “Thus, steady effort matters.”', [], false, 'What is a helpful way to think about effort?');
    expect(result.isValid).toBe(true);
  });

  it('does not mistake capitalized list items for characters', () => {
    const result = GroundingValidator.validate('A small plan:\n- Tomorrow, take a walk.\n- Afterward, notice how you feel.', [], false, 'What could help with a hard day?');
    expect(result.isValid).toBe(true);
  });

  it('rejects fabricated dialogue even when a canonical character is named', () => {
    const result = GroundingValidator.validate(
      'Bhishma told Nakshatra, “I will not strike you.”',
      [],
      false,
      'What did Bhishma say to Nakshatra during the Kurukshetra war?',
    );
    expect(result.isValid).toBe(false);
    expect(result.unsupportedCharacters).toContain('nakshatra');
    expect(result.unsupportedQuotes).toContain('“I will not strike you.”');
  });

  it('checks a claimed meeting even when the name appears in an unrelated source context', () => {
    const result = GroundingValidator.validate(
      'There is a scene where Krishna physically meets a character named Anuradha.',
      [],
      false,
      'Tell me about Krishna meeting Anuradha in the Mahabharata.',
    );
    expect(result.isValid).toBe(false);
    expect(result.claims.some(claim => claim.type === 'relationship' && !claim.supported)).toBe(true);
  });

  it('records a Parva as an unsupported source location, not a character', () => {
    const result = GroundingValidator.validate('As described in Shanti Parva, the king gives counsel.', [], false, 'What does the source say?');
    expect(result.unsupportedCharacters).not.toContain('shanti');
    expect(result.unsupportedCharacters).not.toContain('parva');
    expect(result.claims.some(claim => claim.type === 'location' && !claim.supported)).toBe(true);
  });

  it('replaces a metaphor repeated in the recent conversation with direct language', () => {
    const result = AntiRepetitionGuard.filter('The storm will pass, and the road ahead is long.', [
      { role: 'assistant', content: 'This storm feels difficult.' },
    ], true);
    expect(result.poeticConstraintApplied).toBe(true);
    expect(result.sanitizedContent).not.toMatch(/\bstorm\b/i);
  });

  it('retains a fresh single metaphor while flattening a second major image', () => {
    const result = AntiRepetitionGuard.filter('The storm is real, but the battlefield is not your whole life.', [], false);
    expect(result.poeticConstraintApplied).toBe(true);
    expect(result.sanitizedContent).toMatch(/storm/i);
    expect(result.sanitizedContent).not.toMatch(/battlefield/i);
  });

  it('does not inject hardcoded "disappeared" when the user never used that word', () => {
    const result = SafetyResponseValidator.validateAndRepair(
      'I hear how tired and overwhelmed you feel right now.',
      'PASSIVE_CONCERN',
      undefined,
      [],
      "I feel like nothing matters anymore, and I'm tired of everything."
    );
    expect(result.content).not.toMatch(/“disappeared”|"disappeared"/i);
    expect(result.content).toMatch(/are you thinking about hurting yourself or wishing you were not alive/i);
  });

  it('does not re-inject passive-concern clarification if a prior turn already asked it', () => {
    const priorClarification = 'I want to check in directly with you: are you thinking about hurting yourself or wishing you were not alive?';
    const result = SafetyResponseValidator.validateAndRepair(
      'I am here with you. Let us talk through what is making life feel so heavy.',
      'PASSIVE_CONCERN',
      undefined,
      [priorClarification],
      "Can you help me find a reason to keep going, even when life feels unbearable?",
      4
    );
    expect(result.content).not.toMatch(/are you thinking about hurting yourself/i);
    expect(result.audit.passiveRiskClarified).toBe(true);
  });

  it('does not attach a citation solely because a passage mentions a character without substantive claim support', () => {
    const mockPassage = {
      id: 'chunk-amba-1',
      sourceType: 'debroy_10_vol' as const,
      parva: 'Drona Parva',
      sourceReference: 'Drona Parva 1.1',
      translation: 'Amba spoke with determination in the assembly of elders.',
      characters: ['Amba'],
    };
    // Character claim only (e.g. user or model mentioned Amba, but the claim was about shame)
    const characterOnlyClaim = {
      item: 'Amba',
      type: 'character' as const,
      supported: true,
      evidenceChunkId: 'chunk-amba-1',
    };
    const reply = 'Shame is not proof that you are fundamentally broken; Amba also walked through intense trial.';
    const verified = QuoteVerifier.verify(reply, [mockPassage] as any, false, [characterOnlyClaim]);
    // The citation should NOT be attached merely because Amba was named
    expect(verified.citations.length).toBe(0);
  });

  it('does not cite a canonical verse solely because its reference appears beside an unrelated claim', () => {
    const passage = {
      id: 'gita-record-2-47',
      sourceType: 'bhagavad_gita',
      sourceReference: 'Bhagavad Gita 2.47',
      verseRange: '2.47',
      translation: 'You have a right to action alone, never to its fruits.',
      relevanceScore: 0.99,
    };
    const reply = 'Bhagavad Gita 2.47 says the soul is unborn and cannot be destroyed.';

    const verified = QuoteVerifier.verify(reply, [passage] as any, false, []);

    expect(verified.citations).toHaveLength(0);
  });

  it('retains exact Gita evidence identity and parent-chunk provenance on supported citations', () => {
    const passage = {
      id: 'gita-record-2-47',
      parentChunkId: '00000000-0000-4000-8000-000000000047',
      sourceType: 'gita_raghavendra_vivruti',
      sourceReference: 'Bhagavad Gita 2.47, Sri Raghavendra Teertha Vivruti',
      verseRange: '2.47',
      translation: 'You have a right to action alone, never to its fruits.',
      relevanceScore: 0.99,
    };
    const supportedClaim = {
      item: 'Gita teaching',
      type: 'teaching' as const,
      supported: true,
      evidenceIds: [passage.id],
    };

    const verified = QuoteVerifier.verify(
      'The Gita commentary at Bhagavad Gita 2.47 focuses on action without attachment to its fruits.',
      [passage] as any,
      false,
      [supportedClaim],
    );

    expect(verified.citations).toHaveLength(1);
    expect(verified.citations[0]).toMatchObject({
      id: passage.id,
      evidenceId: passage.id,
      evidenceSourceType: passage.sourceType,
      parentChunkId: passage.parentChunkId,
      source: 'Bhagavad Gita (Sri Raghavendra Teertha Vivruti)',
    });
  });

  it('flags vague attributions to "these verses teach" when unsupported by retrieved evidence', () => {
    const result = GroundingValidator.validate(
      'As these verses teach, shame is an illusion of the ego that must be overcome.',
      [],
      false,
      'How can I regain control without hating myself?'
    );
    expect(result.isValid).toBe(false);
    expect(result.claims.some(c => c.type === 'teaching' && !c.supported)).toBe(true);
  });

  it('suppresses alternating opening forms of address on follow-up turns', () => {
    const result = AntiRepetitionGuard.filter(
      'Dear one, when you feel ashamed, consider what is within your hands.',
      [{ role: 'assistant', content: 'My friend, that is a heavy burden to carry.' }],
      true
    );
    expect(result.sanitizedContent).not.toMatch(/^dear one/i);
    expect(result.sanitizedContent).toMatch(/^when you feel ashamed/i);
  });

  it('suppresses repetitive stock templates (seeds, restless rivers, breathing/small steps) across turns', () => {
    const history = [
      { role: 'assistant', content: 'Even a small seed planted today can grow into lasting change.' },
      { role: 'assistant', content: 'Like a restless river, the mind surges with old habits.' },
      { role: 'assistant', content: 'Take a deep breath, pause, and take one small step forward.' },
    ];
    const result = AntiRepetitionGuard.filter(
      'Every seed of change begins with quiet resolve, like a restless river finding calm; take a slow breath, pause, and take one small step.',
      history as any,
      true
    );
    expect(result.sanitizedContent).not.toMatch(/seeds? of change/i);
    expect(result.sanitizedContent).not.toMatch(/restless river/i);
    expect(result.sanitizedContent).not.toMatch(/take a (?:slow |deep )?breath,?\s*pause/i);
  });
});
