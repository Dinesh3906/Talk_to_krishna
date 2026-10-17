import { v4 as uuidv4 } from 'uuid';
import { eq, desc, asc, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { conversations, messages, messageCitations, userProfiles, userMemories, mahabharataChunks } from '../../db/schema.js';
import { AIProviderFactory } from './ai-provider.factory.js';
import { IntentClassifier } from './intent-classifier.js';
import { HybridRetriever, RetrievedPassage, RetrievalCandidateTrace } from './hybrid-retriever.js';
import { PromptSafetyGuard } from './prompt-safety-guard.js';
import { KrishnaPersonaService } from './krishna-persona.service.js';
import { QuoteVerifier } from './quote-verifier.js';
import { TelemetryService } from './telemetry.service.js';
import { MarkdownSanitizer, StreamTokenFilter } from './markdown-sanitizer.js';
import { ConversationStateTracker } from './conversation-state-tracker.js';
import { InterpretationEngineService, InterpretationResult } from './interpretation-engine.service.js';
import { GroundingValidator, GroundingValidationResult } from './grounding-validator.js';
import { Message, StreamChunk, Citation, ResponseMode } from '@talk-to-krisna/shared';
import { resolveEffectiveModelName } from './model-telemetry.js';
import { ConversationMemoryService } from './conversation-memory.service.js';
import { ReferenceResolver } from './reference-resolver.js';
import { ContextualQueryResolver } from './contextual-query-resolver.js';
import { ChatMemoryRetriever, HistoricalMemoryResult } from './chat-memory-retriever.js';
import { ResponsePlanner } from './response-planner.js';
import { AntiRepetitionGuard } from './anti-repetition-guard.js';
import { EmotionalInterpretation } from './emotional-interpretation.js';
import { SafetyResponseValidator, SafetyResponseAudit } from './safety-response-validator.js';

export interface OrchestrationOptions {
  userId: string;
  conversationId: string;
  userMessage: string;
  preferredName?: string;
  onStreamChunk?: (chunk: StreamChunk) => void;
}

export interface OrchestrationAuditRecord {
  query: string;
  retrieval_query: string;
  contextual_query: string;
  channel_candidates: Record<string, RetrievalCandidateTrace[]>;
  retrieval_confidence: 'high' | 'medium' | 'low';
  evidence_sufficient: boolean;
  corpus_does_not_establish?: boolean;
  top_score: number;
  score_gap: number;
  provider: string;
  model: string;
  retrieval_method: string;
  retrieved_chunks: string[];
  retrieved_scores: number[];
  reranked_chunks: string[];
  selected_evidence: string[];
  canonical_evidence: Array<{
    id: string;
    sourceType: string;
    sourceEdition?: string;
    sourceReference: string;
    text: string;
    characters: string[];
    verseRange?: string;
    speaker?: string;
    listener?: string;
  }>;
  retrieved_characters: string[];
  retrieved_episodes: string[];
  generated_characters: string[];
  generated_events: string[];
  unsupported_claims: string[];
  grounding_claims: GroundingValidationResult['claims'];
  grounding_pass: boolean;
  response_mode: ResponseMode;
  generation_attempts: number;
  safety_audit: SafetyResponseAudit;
  retrieval_path: 'database' | 'canonical_disk_fallback' | 'database_timeout_fallback' | 'hybrid' | 'cache' | 'disk' | 'none';
  retrieval_duration_ms: number;
  retrieval_timeout: boolean;
  retrieval_timings?: {
    entityExtractionMs: number;
    embeddingMs: number;
    gitaSearchMs: number;
    mbQueryMs: number;
    rerankingMs: number;
    queryConstructionMs: number;
    connectionAcquisitionMs: number;
    databaseRoundTripMs: number;
    rowRetrievalMs: number;
    diskFallbackMs: number;
    citationConstructionMs: number;
    databaseTimeout: boolean;
    poolWaitingCount: number;
  };
  database_latency_ms: number;
  fallback_used: boolean;
  fallback_reason?: string;
}

export interface OrchestrationResult {
  message: Message;
  citations: Citation[];
  requestId: string;
  totalLatencyMs: number;
  auditRecord: OrchestrationAuditRecord;
}

function recoverSupportedCanonicalContent(
  response: string,
  passages: RetrievedPassage[],
  corpusDoesNotEstablish: boolean,
  userMessage: string,
  establishedEntities: string[],
): { content: string; validation: GroundingValidationResult } {
  const sentences = response.split(/(?<=[.!?])\s+/).map(sentence => sentence.trim()).filter(Boolean);
  const retained: string[] = [];
  let omittedUnsupportedClaim = false;
  for (const sentence of sentences) {
    const result = GroundingValidator.validate(sentence, passages, corpusDoesNotEstablish, userMessage, establishedEntities);
    if (result.isValid) retained.push(sentence);
    else omittedUnsupportedClaim = true;
  }

  if (!retained.length && passages.length) {
    const queryEntities = HybridRetriever.extractQueryHints(userMessage).candidateEntities.map(entity => entity.toLowerCase());
    const orderedPassages = passages.filter(p => {
      const names = (p.characters || []).map(name => name.toLowerCase());
      const passageText = `${p.translation} ${p.sourceReference}`.toLowerCase();
      return queryEntities.length === 0
        ? true
        : queryEntities.some(name => names.includes(name) || passageText.includes(name));
    });
    for (const passage of orderedPassages) {
      for (const sourceSentence of passage.translation.split(/(?<=[.!?])\s+/).map(sentence => sentence.trim()).filter(sentence => sentence.length >= 35)) {
        const extractiveAnswer = `As taught in the ${passage.sourceType.toLowerCase().includes('gita') ? 'Bhagavad Gita' : 'sacred teachings'}: “${sourceSentence.replace(/^[“"]|[”"]$/g, '')}”`;
        const result = GroundingValidator.validate(extractiveAnswer, passages, corpusDoesNotEstablish, userMessage, establishedEntities);
        if (result.isValid) {
          retained.push(extractiveAnswer);
          omittedUnsupportedClaim = true;
          break;
        }
      }
      if (retained.length) break;
    }
  }



  const content = retained.join(' ');
  return {
    content,
    validation: GroundingValidator.validate(content, passages, corpusDoesNotEstablish, userMessage, establishedEntities),
  };
}

export class AIOrchestratorService {
  /**
   * Main AI Orchestration Pipeline
   */
  public static async execute(options: OrchestrationOptions): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const requestId = uuidv4();
    const { userId, conversationId, userMessage } = options;

    const emit = (chunk: StreamChunk) => {
      if (options.onStreamChunk) {
        options.onStreamChunk(chunk);
      }
    };

    emit({ type: 'start', conversationId, messageId: requestId });

    // Step 1: Safety & Crisis Guardrail
    let safetyCheck = PromptSafetyGuard.evaluateInput(userMessage);
    if (!safetyCheck.isSafe && (safetyCheck.category === 'prompt_injection' || safetyCheck.category === 'supernatural_authority') && safetyCheck.safeInterventionMessage) {
      const intervention = safetyCheck.safeInterventionMessage;
      emit({ type: 'token', token: intervention });
      emit({ type: 'done', conversationId, messageId: requestId });

      // Save assistant crisis message
      let savedMessage: any = null;
      try {
        const [inserted] = await db
          .insert(messages)
          .values({
            conversationId,
            sender: 'krishna',
            content: intervention,
            intentCategory: 'emotional_distress',
            emotionalState: 'grief',
          })
          .returning();
        savedMessage = inserted;
      } catch {
        savedMessage = {
          id: uuidv4(),
          conversationId,
          sender: 'krishna',
          content: intervention,
          createdAt: new Date(),
        };
      }

      await TelemetryService.record({
        requestId,
        userId,
        conversationId,
        model: 'safety-guardrail',
        provider: 'gemini',
        totalLatencyMs: Date.now() - startTime,
        retrievalLatencyMs: 0,
        generationLatencyMs: 0,
        retrievedChunkCount: 0,
        citationCount: 0,
        hasError: false,
        mahabharataRelevant: false,
        createdAt: new Date().toISOString(),
      });

      return {
        message: {
          id: savedMessage.id,
          conversationId,
          sender: 'krishna',
          content: intervention,
          citations: [],
          createdAt: (savedMessage.createdAt instanceof Date ? savedMessage.createdAt : new Date()).toISOString(),
        },
        citations: [],
        requestId,
        totalLatencyMs: Date.now() - startTime,
        auditRecord: {
          query: userMessage,
          retrieval_query: userMessage,
          contextual_query: userMessage,
          channel_candidates: {},
          retrieval_confidence: 'low',
          evidence_sufficient: false,
          top_score: 0,
          score_gap: 0,
          provider: 'safety-guardrail',
          model: 'safety-guardrail',
          retrieval_method: 'safety_bypass',
          retrieved_chunks: [],
          retrieved_scores: [],
          reranked_chunks: [],
          selected_evidence: [],
          canonical_evidence: [],
          retrieved_characters: [],
          retrieved_episodes: [],
          generated_characters: [],
          generated_events: [],
          unsupported_claims: [],
          grounding_claims: [],
          grounding_pass: true,
          response_mode: 'crisis_safety',
          generation_attempts: 1,
          safety_audit: SafetyResponseValidator.validateAndRepair(intervention, safetyCheck.riskLevel).audit,
          retrieval_path: 'none',
          retrieval_duration_ms: 0,
          retrieval_timeout: false,
          database_latency_ms: 0,
          fallback_used: false,
        },
      };
    }

    // Step 2: Fetch Multi-Tier Conversation History & Working Memory State
    const conversationState = await ConversationMemoryService.getState(conversationId, userId);
    const history = await ConversationMemoryService.getRecentTurns(conversationId, 12);
    safetyCheck = PromptSafetyGuard.evaluateInput(userMessage, conversationState.riskLevel);

    // Step 3: Reference & Pronoun Resolution Across Multi-Turn Dialogue
    const referenceResolution = ReferenceResolver.resolve(userMessage, history, {
      activeTopic: conversationState.activeTopic,
      activeEntities: conversationState.activeEntities,
      lastDiscussedCharacter: conversationState.activeEntities[0],
      establishedFacts: conversationState.establishedFacts,
    });

    // Step 4: Historical Chat Memory Retrieval (Grounded per-chat recall)
    let historicalMemory: HistoricalMemoryResult | undefined;
    if (referenceResolution.isHistoricalRecall) {
      historicalMemory = await ChatMemoryRetriever.retrieve(
        conversationId,
        userId,
        referenceResolution.targetCharacterForRecall || conversationState.activeTopic,
        history
      );
    }

    // Legacy tracker compatibility for downstream grounding/interpretation
    const trackerState = ConversationStateTracker.track(history, userMessage);
    if (referenceResolution.referentCharacter) {
      trackerState.lastDiscussedCharacter = referenceResolution.referentCharacter;
      if (!trackerState.activeCharacters.includes(referenceResolution.referentCharacter.toLowerCase())) {
        trackerState.activeCharacters.push(referenceResolution.referentCharacter.toLowerCase());
      }
    }

    // Step 5: Intent & Emotion Classification
    const classification = IntentClassifier.classify(userMessage, trackerState);
    const explicitVerseHint = HybridRetriever.extractQueryHints(userMessage).verseReference;
    const scriptureExplicitlyRequested = Boolean(explicitVerseHint) || Boolean(classification.isStoryRequest || classification.scriptureReferenceQuery) ||
      /\b(bhagavad\s*gita|\bgita\b|mahabharata|scripture|shloka|sloka|shlok|verse|sanskrit|teachings? of krishna|what does .* teach|meaning of|explain (?:this|the verse|the shloka)|karmany|armany|vadhikaraste|evadhikaras|phaleshu|kadachana|dharmakshetre|kurukshetre|yada yada|sambhavami|sthitaprajna|chindanti|vasamsi)\b/i.test(userMessage);
    // RAG relevance must come from this turn or an explicitly resolved reference. A
    // character mentioned several topics ago must not drag the conversation back to
    // Mahabharata retrieval or contaminate the current search query.
    const currentCanonicalEntities = Array.from(new Set([
      ...classification.extractedCharacters.map(c => c.toLowerCase()),
      ...(referenceResolution.referentCharacter ? [referenceResolution.referentCharacter.toLowerCase()] : []),
    ]));
    const hasNonKrishnaCharacters = currentCanonicalEntities.some(c => c !== 'krishna');
    const explicitCanonicalQuestion = Boolean(explicitVerseHint) || scriptureExplicitlyRequested || classification.isStoryRequest === true || hasNonKrishnaCharacters ||
      /\b(?:mahabharata|mahabharat|bhagavad\s*gita|\bgita\b|shloka|sloka|shlok|verse|parva|krishna'?s teachings?|sanskrit|meaning of)\b/i.test(userMessage) ||
      (Boolean(trackerState.activeVerse) && (referenceResolution.isFollowUp || referenceResolution.isTopicReturn));
    const isMahabharataRelevant =
      safetyCheck.riskLevel === 'NONE' &&
      !referenceResolution.isHistoricalRecall &&
      !classification.isCasualBanter &&
      !classification.isAntiHallucinationProbe;

    // Crisis State Tracking across turns (PART 14)
    const isCrisis =
      safetyCheck.isHighRiskCrisis ||
      ['PASSIVE_CONCERN', 'ACTIVE_IDEATION', 'MODERATE', 'INTENT', 'MEANS_PRESENT', 'IMMINENT', 'VIOLENCE_IDEATION', 'VIOLENCE_ESCALATION', 'HIGH'].includes(safetyCheck.riskLevel);

    const crisisTurnCount = isCrisis
      ? (conversationState.crisisTurnCount || 0) + 1
      : 0;
    const emotionalInterpretation = EmotionalInterpretation.interpret(
      userMessage,
      classification.emotionalState,
      history,
      conversationState.emotionalTrajectory,
      safetyCheck.riskLevel,
      referenceResolution.isTopicReturn,
    );

    // Step 6: Contextual Query Resolution (RAG query formulation vs. memory gating)
    const queryPlan = ContextualQueryResolver.resolve(
      userMessage,
      referenceResolution,
      conversationState.activeTopic,
      currentCanonicalEntities,
      {
        emotionalState: classification.emotionalState,
        emotionalTrajectory: conversationState.emotionalTrajectory,
        userIntent: classification.intentCategory,
        recentUserTopics: conversationState.recentUserTopics,
        previouslyUsedThemes: conversationState.previouslyUsedThemes,
        thematicKeywords: classification.thematicKeywords,
        history,
      }
    );

    emit({
      type: 'metadata',
      metadata: {
        intent: classification.intentCategory,
        emotion: classification.emotionalState,
        isMahabharataRelevant: isMahabharataRelevant && queryPlan.ragRequired,
      },
    });

    // Step 7: Hybrid Retrieval (using contextual query & query-extracted entity guidance)
    let retrievedPassages: RetrievedPassage[] = [];
    let corpusDoesNotEstablish = false;
    let retrievalLatencyMs = 0;
    let retrievalConfidence: 'high' | 'medium' | 'low' = 'low';
    let hasSufficientEvidence = false;
    let retrievalPath: OrchestrationAuditRecord['retrieval_path'] = 'none';
    let retrievalQuery = userMessage;
    let retrievalChannelCandidates: Record<string, RetrievalCandidateTrace[]> = {};
    let retrievalTopScore = 0;
    let retrievalScoreGap = 0;
    let databaseLatencyMs = 0;
    let fallbackUsed = false;
    let fallbackReason: string | undefined;
    let retrievalTimings: OrchestrationAuditRecord['retrieval_timings'];

    if (isMahabharataRelevant && queryPlan.ragRequired) {
      const allCharacters = Array.from(new Set([
        ...classification.extractedCharacters,
        ...(referenceResolution.referentCharacter ? [referenceResolution.referentCharacter] : []),
        ...queryPlan.entitiesForRetrieval,
      ]));

      const explicitVerseReference = HybridRetriever.extractQueryHints(userMessage).verseReference;
      const recentVerseReference = history.slice(-12).reverse()
        .map(turn => turn.content.match(/\b(?:Bhagavad\s*)?Gita\s*(\d{1,2})[.:](\d{1,2})\b/i))
        .find(match => match)?.slice(1);
      const needsResolvedVerse = /\b(?:that|the|same|exact)\s+(?:gita\s+)?(?:verse|shloka|wording|text)\b|\bquote (?:that|the|same)\b/i.test(userMessage);
      retrievalQuery = explicitVerseReference
        ? `${userMessage} Bhagavad Gita ${explicitVerseReference.chapter}.${explicitVerseReference.verse}`
        : needsResolvedVerse && recentVerseReference
          ? `${userMessage} Bhagavad Gita ${recentVerseReference[0]}.${recentVerseReference[1]}`
          : queryPlan.contextualQuery;

      const retrievalResult = await HybridRetriever.retrieve(
        retrievalQuery,
        allCharacters,
        classification.extractedThemes,
        3,
        classification.thematicKeywords || [],
        {
          citedChunkIds: conversationState.previouslyCitedChunkIds,
          citedEpisodeIds: conversationState.previouslyCitedEpisodeIds,
          mentionedCharacters: conversationState.previouslyMentionedCharacters,
          usedTeachings: conversationState.previouslyUsedTeachings,
        }
      );
      retrievedPassages = retrievalResult.passages;
      corpusDoesNotEstablish = retrievalResult.corpusDoesNotEstablish;
      retrievalLatencyMs = retrievalResult.retrievalLatencyMs;
      retrievalConfidence = retrievalResult.confidence;
      hasSufficientEvidence = retrievalResult.hasSufficientEvidence;
      retrievalTopScore = retrievalResult.topScore;
      retrievalScoreGap = retrievalResult.scoreGap;
      retrievalChannelCandidates = retrievalResult.channelCandidates || {};
      retrievalPath = retrievalResult.retrievalPath || 'none';
      databaseLatencyMs = retrievalResult.databaseLatencyMs || 0;
      fallbackUsed = retrievalResult.fallbackUsed || false;
      fallbackReason = retrievalResult.fallbackReason;
      retrievalTimings = retrievalResult.timings;

      // For strict factual scripture queries without characters or evidence, mark does not establish.
      // For emotional, philosophical, moral, or guidance queries, retain retrieved passages
      // so Krishna's counsel is grounded in authentic Gita/Mahabharata teachings rather than generic advice.
      if (!hasSufficientEvidence && allCharacters.length === 0 && classification.intentCategory === 'factual_scripture') {
        retrievedPassages = [];
        corpusDoesNotEstablish = true;
      }
    }

    // Step 8: Dedicated Interpretation Engine (Cognitive Dimensions & Dharma Analysis)
    const interpretation: InterpretationResult | null = InterpretationEngineService.interpret(
      userMessage,
      trackerState,
      retrievedPassages
    );

    // Step 9: Fetch User Profile & Optional Long-Term Memory
    let profile: any = null;
    let memories: any[] = [];
    try {
      profile = await db.query.userProfiles.findFirst({
        where: eq(userProfiles.userId, userId),
      });

      memories = profile?.enableLongTermMemory
        ? await db.query.userMemories.findMany({
          where: eq(userMemories.userId, userId),
          limit: 5,
        })
        : [];
    } catch {
      // In-memory fallback
    }

    // Step 10: Adaptive Response Planning & Dynamic Depth Policy
    const responsePlan = ResponsePlanner.plan({
      userMessage,
      history,
      activeTopic: referenceResolution.referentTopic || conversationState.activeTopic,
      activeEntities: conversationState.activeEntities,
      establishedFacts: conversationState.establishedFacts,
      referenceResolution,
      intentCategory: classification.intentCategory,
      emotionalState: classification.emotionalState,
      isCasualBanter: Boolean(classification.isCasualBanter),
      isStoryRequest: Boolean(classification.isStoryRequest),
      isMahabharataRelevant,
      historicalMemory,
      crisisTurnCount,
      previouslyCitedEpisodeIds: conversationState.previouslyCitedEpisodeIds,
      previouslyUsedTeachings: conversationState.previouslyUsedTeachings,
      emotionalTrajectory: conversationState.emotionalTrajectory,
      emotionalInterpretation,
      scriptureExplicitlyRequested,
      riskLevel: safetyCheck.riskLevel,
      safetyResponseMode: safetyCheck.responseMode,
      safetyGuidance: safetyCheck.safetyGuidance,
      isCrisis,
      turnCount: history.filter(h => h.role === 'user').length + 1,
    });

    // Development Debug Mode Emitter
    if (process.env.NODE_ENV !== 'production') {
      emit({
        type: 'debug',
        debug: {
          intent: classification.intentCategory,
          activeTopic: responsePlan.activeTopic,
          referenceResolution: referenceResolution.resolvedReferences,
          retrievedChatMemory: historicalMemory?.found ? historicalMemory.honestStatement : null,
          ragQuery: queryPlan.contextualQuery,
          responseMode: responsePlan.responseMode,
          responseDepth: responsePlan.responseDepth,
        },
      });
    }

    // Step 11: Construct Persona Prompt with Multi-Tier Memory + Evidence
    const chatMessages = KrishnaPersonaService.buildPrompt(
      userMessage,
      history,
      retrievedPassages,
      {
        preferredName: options.preferredName,
        reflectionDepth: profile?.reflectionDepth as any,
        mahabharataDensity: profile?.mahabharataDensity as any,
        userMemories: memories.map((m) => ({ key: m.factKey, value: m.factValue })),
        isMahabharataRelevant: isMahabharataRelevant && queryPlan.ragRequired,
        corpusDoesNotEstablish,
        interpretation,
        intentCategory: classification.intentCategory,
        emotionalState: classification.emotionalState,
        responseMode: responsePlan.responseMode,
        responsePlan,
        activeTopic: responsePlan.activeTopic,
        workingSummary: conversationState.recentSummary,
        historicalMemory: historicalMemory?.honestStatement,
        isStoryRequest: classification.isStoryRequest,
        isChallenging: classification.isChallenging,
        isAntiHallucinationProbe: classification.isAntiHallucinationProbe,
        isCasualBanter: classification.isCasualBanter,
        isFollowUp: referenceResolution.isFollowUp,
        lastDiscussedCharacter: referenceResolution.referentCharacter || trackerState.lastDiscussedCharacter,
        personaEstablished: Boolean(conversationState.turnCount > 0 || history.length > 0 || conversationState.personaEstablished),
        crisisTurnCount,
        previouslyCitedEpisodes: conversationState.previouslyCitedEpisodeIds,
        previouslyMentionedCharacters: conversationState.previouslyMentionedCharacters,
        previouslyUsedTeachings: conversationState.previouslyUsedTeachings,
        emotionalTrajectory: [...conversationState.emotionalTrajectory, classification.emotionalState],
        emotionalInterpretation,
        riskLevel: safetyCheck.riskLevel,
        safetyGuidance: safetyCheck.safetyGuidance,
      }
    );

    // Step 12: Real AI Generation (with Dynamic Token Budget)
    const aiProvider = AIProviderFactory.getProvider();
    const generationStartTime = Date.now();
    let generatedContent = '';
    let promptTokens: number | undefined;
    let completionTokens: number | undefined;

    const targetMaxTokens = responsePlan.targetTokens;

    const streamFilter = new StreamTokenFilter();
    try {
      const completionResult = await aiProvider.streamCompletion(
        {
          messages: chatMessages,
          temperature: 0.7,
          maxTokens: targetMaxTokens,
        },
        (token: string) => {
          generatedContent += token;
          const cleanToken = streamFilter.push(token);
          if (cleanToken) {
            emit({ type: 'token', token: cleanToken });
          }
        }
      );

      const trailing = streamFilter.flush();
      if (trailing) {
        emit({ type: 'token', token: trailing });
      }

      promptTokens = completionResult.promptTokens;
      completionTokens = completionResult.completionTokens;
    } catch (err: any) {
      const totalLatency = Date.now() - startTime;
      const errMsg = err.message || '';
      let errorCode = 'MODEL_ERROR';
      let userFriendlyError = 'Krishna’s reflection could not be completed at this moment. Please ask again.';

      if (errMsg.includes('429') || errMsg.toLowerCase().includes('rate limit')) {
        errorCode = 'RATE_LIMIT';
        userFriendlyError = 'Too many requests at this moment. Please pause a moment before speaking again.';
      } else if (errMsg.includes('timeout') || errMsg.includes('ETIMEDOUT') || errMsg.includes('ESOCKETTIMEDOUT')) {
        errorCode = 'TIMEOUT';
        userFriendlyError = 'The response took too long to complete. Please try asking again.';
      } else if (errMsg.includes('auth') || errMsg.includes('API key') || errMsg.includes('unauthorized')) {
        errorCode = 'AUTH_ERROR';
        userFriendlyError = 'AI Provider configuration error. Please check server settings.';
      }

      emit({
        type: 'error',
        error: userFriendlyError,
        errorCode,
      });

      await TelemetryService.record({
        requestId,
        userId,
        conversationId,
        model: resolveEffectiveModelName(aiProvider.providerName),
        provider: aiProvider.providerName,
        totalLatencyMs: totalLatency,
        retrievalLatencyMs,
        generationLatencyMs: Date.now() - generationStartTime,
        retrievedChunkCount: retrievedPassages.length,
        hasError: true,
        errorCode,
        citationCount: 0,
        mahabharataRelevant: classification.mahabharataRelevant,
        createdAt: new Date().toISOString(),
      });

      throw new Error(`AI Provider Error (${errorCode}).`);
    }

    const generationLatencyMs = Date.now() - generationStartTime;

    // Step 8: Final Sanitize & Post-Generation Grounding Validation (Requirements 12 & 13)
    generatedContent = MarkdownSanitizer.sanitize(generatedContent);

    // Keep deterministic safety policy visible to the generator's final response even when
    // the legacy classifier does not classify a passive or newly phrased signal as high risk.

    // Anti-Repetition Guard: Suppress repeated introductions, identity claims, and circular boilerplate
    const repetitionCheck = AntiRepetitionGuard.filter(
      generatedContent,
      history,
      referenceResolution.isFollowUp,
      {
        personaEstablished: Boolean(conversationState.turnCount > 0 || history.length > 0 || conversationState.personaEstablished),
        crisisTurnCount,
      }
    );
    if (repetitionCheck.hasRepetition) {
      generatedContent = repetitionCheck.sanitizedContent;
      emit({ type: 'replace', content: generatedContent });
    }

    // Safeguard: Intercept generic LLM corporate copyright refusals/disclaimers without injecting Arjuna
    const isCopyrightRefusal =
      /protected by copyright/i.test(generatedContent) ||
      /can'?t share the (shlokas?|verses?|text|epic)/i.test(generatedContent) ||
      /cannot share the (shlokas?|verses?|text|epic)/i.test(generatedContent) ||
      /living text of great cultural/i.test(generatedContent) ||
      /copyright (protection|restrictions)/i.test(generatedContent) ||
      /sacred texts online/i.test(generatedContent);

    if (isCopyrightRefusal) {
      console.warn('[AIOrchestratorService] Intercepted corporate copyright refusal from LLM. Overriding with authentic Krishna teaching.');
      generatedContent =
        "My friend, sacred wisdom belongs to all who seek truth with an honest heart. " +
        "You do not need to carry this struggle in isolation. Let your effort be sincere, let go of the anxiety that clouds your peace, " +
        "and tell me what is pressing most heavily upon your mind right now.";
    }

    // Collect established conversation entities to preserve multi-turn context
    const establishedEntities: string[] = [];
    const charToEstablish = trackerState.lastDiscussedCharacter || conversationState.activeEntities[0];
    if (charToEstablish) {
      establishedEntities.push(charToEstablish);
    }
    for (const h of history.slice(-2)) {
      for (const char of GroundingValidator.EPIC_CHARACTERS) {
        if (new RegExp(`\\b${char}\\b`, 'i').test(h.content)) {
          establishedEntities.push(char);
        }
      }
    }

    let groundingResult = GroundingValidator.validate(
      generatedContent,
      retrievedPassages,
      corpusDoesNotEstablish,
      userMessage,
      establishedEntities
    );

    let generationAttempts = 1;

    // Controlled Regeneration Loop (Requirement 13)
    // If grounding check fails, regenerate with explicit corrective instruction
    if (!groundingResult.isValid && generationAttempts < 2) {
      generationAttempts++;
      console.warn('[AIOrchestratorService] Grounding check failed; triggering corrective regeneration.', {
        unsupportedClaimCount: groundingResult.unsupportedClaims.length,
      });

      const correctiveMessage = {
        role: 'user' as const,
        content: `CORRECTION MANDATE: Your previous response contained unsupported claims: ${groundingResult.unsupportedClaims.join('; ')}. ` +
          `Ground your counsel lovingly in the retrieved passages. Speak naturally, warmly, and compassionately as Lord Krishna holding the seeker's chariot reins. ` +
          `Do NOT invent dialogue or put paraphrased teachings inside quotation marks. Never use quotation marks unless quoting the exact words from the retrieved passage above. ` +
          `Never include meta-language, disclaimers, or phrases like "the available evidence does not support" or "I don't have a passage". If no specific epic story fits, offer authentic, practical wisdom from the heart of Dharma directly to the seeker. Rewrite now:`
      };

      try {
        let retryContent = '';
        await aiProvider.streamCompletion(
          {
            messages: [...chatMessages, { role: 'assistant', content: generatedContent }, correctiveMessage],
            temperature: 0.5,
            maxTokens: targetMaxTokens,
          },
          (token: string) => {
            retryContent += token;
          }
        );
        retryContent = MarkdownSanitizer.sanitize(retryContent);
        const retryValidation = GroundingValidator.validate(retryContent, retrievedPassages, corpusDoesNotEstablish, userMessage, establishedEntities);
        if (retryValidation.isValid) {
          generatedContent = retryContent;
          groundingResult = retryValidation;
          emit({ type: 'replace', content: generatedContent });
        } else {
          generatedContent = retryContent;
          groundingResult = retryValidation;
          emit({ type: 'replace', content: generatedContent });
        }
      } catch (retryErr: any) {
        console.warn('[AIOrchestratorService] Corrective regeneration failed.');
        groundingResult = GroundingValidator.validate(generatedContent, retrievedPassages, corpusDoesNotEstablish, userMessage, establishedEntities);
      }
    }

    // Ensure any remaining unsupported quotes are converted to clean paraphrases without quotation marks (Rule 14)
    if (groundingResult.unsupportedQuotes && groundingResult.unsupportedQuotes.length > 0) {
      for (const unq of groundingResult.unsupportedQuotes) {
        const unquoted = unq.replace(/["“”]/g, '');
        generatedContent = generatedContent.split(unq).join(unquoted);
      }
      groundingResult = GroundingValidator.validate(
        generatedContent,
        retrievedPassages,
        corpusDoesNotEstablish,
        userMessage,
        establishedEntities
      );
      emit({ type: 'replace', content: generatedContent });
    }

    if (!groundingResult.isValid) {
      const recovered = recoverSupportedCanonicalContent(generatedContent, retrievedPassages, corpusDoesNotEstablish, userMessage, establishedEntities);
      if (recovered.content && recovered.validation.isValid) {
        generatedContent = recovered.content;
        groundingResult = recovered.validation;
      } else {
        const isPersonalOrGuidance = [
          'emotional_distress',
          'general_guidance',
          'spiritual_guidance',
          'philosophical_inquiry',
          'decision_making',
          'career_purpose'
        ].includes(classification.intentCategory) || [
          'fear', 'grief', 'confusion', 'sadness', 'anxiety', 'anger', 'loneliness'
        ].includes(classification.emotionalState);

        if (isPersonalOrGuidance) {
          if (retrievedPassages.length > 0) {
            const firstGita = retrievedPassages.find(p => p.sourceType.toLowerCase().includes('gita')) || retrievedPassages[0];
            const cleanSentence = firstGita.translation.split(/(?<=[.!?])\s+/)[0]?.replace(/["“”]/g, '').trim() || firstGita.translation.slice(0, 140);
            generatedContent = `When the heart is burdened, pause and remember this sacred guidance: ${cleanSentence}. Direct your focus purely upon the sincere effort before you today, and release the anxious weight of outcomes outside your control.`;
          } else {
            generatedContent = 'When the path ahead feels uncertain and the mind wanders in anxiety, pause and take a steady breath with Me. You are not defined by the temporary storms passing across your mind. Focus only upon the sincere action within your power today, and let us walk this one step at a time.';
          }
        } else {
          generatedContent = 'I can’t verify that specific event or claim from the canonical material retrieved, and I don’t want to invent a story or quote. If you remember another detail, I can help check it against the source.';
        }
        groundingResult = GroundingValidator.validate(generatedContent, retrievedPassages, corpusDoesNotEstablish, userMessage, establishedEntities);
      }
      emit({ type: 'replace', content: generatedContent });
    }

    const recentAssistantMessages = history.filter(turn => turn.role === 'assistant').slice(-4).map(turn => turn.content);
    const safetyResult = SafetyResponseValidator.validateAndRepair(generatedContent, safetyCheck.riskLevel, safetyCheck.responseMode, recentAssistantMessages, userMessage, crisisTurnCount);
    const safetyAudit = safetyResult.audit;
    if (safetyResult.content !== generatedContent) {
      generatedContent = safetyResult.content;
      emit({ type: 'replace', content: generatedContent });
    }
    groundingResult = GroundingValidator.validate(generatedContent, retrievedPassages, corpusDoesNotEstablish, userMessage, establishedEntities);
    if (!groundingResult.isValid) {
      const recovered = recoverSupportedCanonicalContent(generatedContent, retrievedPassages, corpusDoesNotEstablish, userMessage, establishedEntities);
      if (recovered.content && recovered.validation.isValid) {
        generatedContent = recovered.content;
        groundingResult = recovered.validation;
      } else {
        const isPersonalOrGuidance = [
          'emotional_distress',
          'general_guidance',
          'spiritual_guidance',
          'philosophical_inquiry',
          'decision_making',
          'career_purpose'
        ].includes(classification.intentCategory) || [
          'fear', 'grief', 'confusion', 'sadness', 'anxiety', 'anger', 'loneliness'
        ].includes(classification.emotionalState);

        if (isPersonalOrGuidance) {
          if (retrievedPassages.length > 0) {
            const firstGita = retrievedPassages.find(p => p.sourceType.toLowerCase().includes('gita')) || retrievedPassages[0];
            const cleanSentence = firstGita.translation.split(/(?<=[.!?])\s+/)[0]?.replace(/["“”]/g, '').trim() || firstGita.translation.slice(0, 140);
            generatedContent = `When the heart is burdened, pause and remember this sacred guidance: ${cleanSentence}. Direct your focus purely upon the sincere effort before you today, and release the anxious weight of outcomes outside your control.`;
          } else {
            generatedContent = 'When the path ahead feels uncertain and the mind wanders in anxiety, pause and take a steady breath with Me. You are not defined by the temporary storms passing across your mind. Focus only upon the sincere action within your power today, and let us walk this one step at a time.';
          }
        } else {
          generatedContent = 'I can’t verify that specific event or claim from the canonical material retrieved, and I don’t want to invent a story or quote. If you remember another detail, I can help check it against the source.';
        }
        groundingResult = GroundingValidator.validate(generatedContent, retrievedPassages, corpusDoesNotEstablish, userMessage, establishedEntities);
      }
      const safetyAfterFallback = SafetyResponseValidator.validateAndRepair(generatedContent, safetyCheck.riskLevel, safetyCheck.responseMode, recentAssistantMessages, userMessage, crisisTurnCount);
      generatedContent = safetyAfterFallback.content;
      Object.assign(safetyAudit, safetyAfterFallback.audit);
      emit({ type: 'replace', content: generatedContent });
    }

    let citationConstructionMs = 0;
    const firstCitationBuildStart = performance.now();
    let quoteResult = QuoteVerifier.verify(
      generatedContent,
      retrievedPassages,
      corpusDoesNotEstablish,
      groundingResult.claims,
    );
    citationConstructionMs += performance.now() - firstCitationBuildStart;

    if (quoteResult.hasUngroundedScriptureClaim) {
      generatedContent = 'I can’t verify that specific verse or claim from the canonical material retrieved, and I don’t want to invent a quotation. If you can share another detail, I can check it against the source.';
      groundingResult = GroundingValidator.validate(generatedContent, retrievedPassages, corpusDoesNotEstablish, userMessage, establishedEntities);
      const citationBuildStart = performance.now();
      quoteResult = QuoteVerifier.verify(generatedContent, retrievedPassages, corpusDoesNotEstablish, groundingResult.claims);
      citationConstructionMs += performance.now() - citationBuildStart;
      emit({ type: 'replace', content: quoteResult.verifiedContent });
    }

    if (isCopyrightRefusal || quoteResult.verifiedContent !== generatedContent) {
      emit({ type: 'replace', content: quoteResult.verifiedContent });
    }

    for (const citation of quoteResult.citations) {
      emit({ type: 'citation', citation });
    }

    // Step 9: Persist Assistant Message and Citations to Database
    let savedMessage: any = null;
    try {
      const [inserted] = await db
        .insert(messages)
        .values({
          conversationId,
          sender: 'krishna',
          content: quoteResult.verifiedContent,
          intentCategory: classification.intentCategory,
          emotionalState: classification.emotionalState,
        })
        .returning();
      savedMessage = inserted;
    } catch (dbErr: any) {
      console.warn('[AIOrchestratorService] Assistant message persistence failed.');
      savedMessage = {
        id: uuidv4(),
        conversationId,
        sender: 'krishna',
        content: quoteResult.verifiedContent,
        createdAt: new Date(),
      };
    }

    for (const citation of quoteResult.citations) {
      try {
        let validParentChunkId: string | null = null;
        const candidateParentChunkId = citation.parentChunkId || citation.id;
        if (candidateParentChunkId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidateParentChunkId)) {
          const chunkExists = await db.query.mahabharataChunks.findFirst({
            where: eq(mahabharataChunks.id, candidateParentChunkId),
            columns: { id: true },
          });
          if (chunkExists) {
            validParentChunkId = candidateParentChunkId;
          }
        }

        await db.insert(messageCitations).values({
          messageId: savedMessage.id,
          chunkId: validParentChunkId,
          evidenceId: citation.evidenceId || citation.id || null,
          evidenceSourceType: citation.evidenceSourceType || null,
          source: citation.source,
          parva: citation.parva,
          chapter: citation.chapter,
          section: citation.section,
          verseRange: citation.verseRange,
          speaker: citation.speaker,
          listener: citation.listener,
          translation: citation.translation,
          originalText: citation.originalText,
          sourceReference: citation.sourceReference,
          relevanceScore: citation.relevanceScore,
          quoteType: citation.quoteType,
        });
      } catch (citErr: any) {
        console.warn('[AIOrchestratorService] Citation persistence failed.');
      }
    }

    // Step 10: Asynchronous Multi-Tier Memory Recording (State + Topic Segments)
    const resolvedChar = referenceResolution.referentCharacter || conversationState.activeEntities[0];
    const topicToRecord = referenceResolution.isTopicReturn
      ? (referenceResolution.restoredTopic || conversationState.activeTopic)
      : (resolvedChar ? `${resolvedChar}'s dilemma` : conversationState.activeTopic);

    const activeEntitiesToRecord = Array.from(new Set([
      ...conversationState.activeEntities,
      ...(resolvedChar ? [resolvedChar.toLowerCase()] : [])
    ]));

    // Extract personal user context / situation facts
    let userSituationFact: string | undefined;
    const lowerUser = userMessage.toLowerCase();
    if (/\b(actually|truth is|to be honest|confess|lied about|was not actually)\b/i.test(lowerUser)) {
      userSituationFact = `Clarification: ${userMessage.slice(0, 100).trim()}`;
    } else if (/\b(i lost my|i quit|i resigned|i work at|i failed|my parents|my wife|my husband|my partner|my cofounder|my friend|my boss)\b/i.test(lowerUser)) {
      userSituationFact = `User shared: ${userMessage.slice(0, 100).trim()}`;
    }

    const establishedFactToRecord = userSituationFact || quoteResult.citations[0]?.contextSummary || (isMahabharataRelevant ? `Discussed ${topicToRecord}` : undefined);

    ConversationMemoryService.setSafetyState(conversationId, userId, safetyCheck.riskLevel, isCrisis);
    ConversationMemoryService.recordTurnAndUpdateMemory({
      conversationId,
      userId,
      userMessage,
      assistantMessage: quoteResult.verifiedContent,
      activeTopic: topicToRecord,
      activeEntities: activeEntitiesToRecord,
      isTopicShift: referenceResolution.isTopicShift,
      establishedFact: establishedFactToRecord,
      philosophicalTheme: classification.extractedThemes[0] || 'dharma',
      emotionalState: classification.emotionalState,
      userIntent: classification.intentCategory,
      citedChunkIds: quoteResult.citations.map(c => c.id).filter(Boolean) as string[],
      citedEpisodeIds: quoteResult.citations.map(c => c.sourceReference || `${c.parva || ''} ${c.chapter || ''}`).filter(Boolean),
      mentionedCharacters: groundingResult.mentionedCharacters,
      usedTeachings: classification.extractedThemes,
      retrievedEvidenceReferences: retrievedPassages.map(p => p.sourceReference),
      isCrisis,
      riskLevel: safetyCheck.riskLevel,
    }).catch(() => console.warn('[AIOrchestratorService] Asynchronous memory update failed.'));

    // Step 11: Auto-Title generation for the conversation if first turn
    if (history.length <= 1) {
      try {
        const autoTitle = userMessage.slice(0, 40).trim() || 'Reflection';
        await db
          .update(conversations)
          .set({ title: autoTitle, updatedAt: new Date() })
          .where(eq(conversations.id, conversationId));
      } catch {
        // Non-blocking auto-title update
      }
    }

    const retrievedCharacters = Array.from(new Set(
      retrievedPassages.flatMap(p => p.characters || [])
    ));
    const retrievedEpisodes = retrievedPassages.map(p => p.sourceReference);
    const retrievedChunkIds = retrievedPassages.map(p => p.id);
    const retrievalScores = retrievedPassages.map(p => Number((p.relevanceScore || 0).toFixed(3)));

    const auditRecord: OrchestrationAuditRecord = {
      query: userMessage,
      retrieval_query: retrievalQuery,
      contextual_query: queryPlan.contextualQuery,
      channel_candidates: retrievalChannelCandidates,
      retrieval_confidence: retrievalConfidence,
      evidence_sufficient: hasSufficientEvidence,
      corpus_does_not_establish: corpusDoesNotEstablish,
      top_score: retrievalTopScore,
      score_gap: retrievalScoreGap,
      provider: aiProvider.providerName,
      model: resolveEffectiveModelName(aiProvider.providerName),
      retrieval_method: retrievalPath,
      retrieved_chunks: retrievedChunkIds,
      retrieved_scores: retrievalScores,
      reranked_chunks: retrievedChunkIds,
      selected_evidence: retrievedEpisodes,
      canonical_evidence: retrievedPassages.map(p => ({
        id: p.id,
        sourceType: p.sourceType,
        sourceEdition: p.sourceEdition,
        sourceReference: p.sourceReference,
        text: p.translation,
        characters: p.characters || [],
        verseRange: p.verseRange,
        speaker: p.speaker,
        listener: p.listener,
      })),
      retrieved_characters: retrievedCharacters,
      retrieved_episodes: retrievedEpisodes,
      generated_characters: groundingResult.mentionedCharacters,
      generated_events: groundingResult.claims.filter(c => c.type === 'event').map(c => c.item),
      unsupported_claims: groundingResult.unsupportedClaims,
      grounding_claims: groundingResult.claims,
      grounding_pass: groundingResult.isValid && !quoteResult.hasUngroundedScriptureClaim,
      response_mode: responsePlan.responseMode,
      generation_attempts: generationAttempts,
      safety_audit: safetyAudit,
      retrieval_path: retrievalPath,
      retrieval_duration_ms: retrievalLatencyMs,
      retrieval_timeout: retrievalTimings?.databaseTimeout || retrievalPath === 'database_timeout_fallback',
      retrieval_timings: retrievalTimings ? { ...retrievalTimings, citationConstructionMs } : undefined,
      database_latency_ms: databaseLatencyMs,
      fallback_used: fallbackUsed,
      fallback_reason: fallbackReason,
    };

    const totalLatencyMs = Date.now() - startTime;
    emit({
      type: 'telemetry',
      telemetry: {
        requestId,
        totalLatencyMs,
        retrievedChunkCount: retrievedPassages.length,
      },
    });

    emit({ type: 'done', conversationId, messageId: savedMessage.id });

    // Step 11: Privacy-Preserving Telemetry Logging
    await TelemetryService.record({
      requestId,
      userId,
      conversationId,
      model: resolveEffectiveModelName(aiProvider.providerName),
      provider: aiProvider.providerName,
      totalLatencyMs,
      retrievalLatencyMs,
      generationLatencyMs,
      retrievedChunkCount: retrievedPassages.length,
      promptTokens,
      completionTokens,
      citationCount: quoteResult.citations.length,
      intentCategory: classification.intentCategory,
      emotionalState: classification.emotionalState,
      mahabharataRelevant: classification.mahabharataRelevant,
      hasError: false,
      createdAt: new Date().toISOString(),
    });

    return {
      message: {
        id: savedMessage.id,
        conversationId,
        sender: 'krishna',
        content: quoteResult.verifiedContent,
        intentCategory: classification.intentCategory,
        emotionalState: classification.emotionalState,
        citations: quoteResult.citations,
        createdAt: savedMessage.createdAt.toISOString(),
      },
      citations: quoteResult.citations,
      requestId,
      totalLatencyMs,
      auditRecord,
    };
  }
}
