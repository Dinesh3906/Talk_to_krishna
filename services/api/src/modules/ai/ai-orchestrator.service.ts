import { v4 as uuidv4 } from 'uuid';
import { eq, desc, asc, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { conversations, messages, messageCitations, userProfiles, userMemories, mahabharataChunks } from '../../db/schema.js';
import { AIProviderFactory } from './ai-provider.factory.js';
import { IntentClassifier } from './intent-classifier.js';
import { HybridRetriever, RetrievedPassage } from './hybrid-retriever.js';
import { PromptSafetyGuard } from './prompt-safety-guard.js';
import { KrishnaPersonaService } from './krishna-persona.service.js';
import { QuoteVerifier } from './quote-verifier.js';
import { TelemetryService } from './telemetry.service.js';
import { MarkdownSanitizer, StreamTokenFilter } from './markdown-sanitizer.js';
import { ConversationStateTracker } from './conversation-state-tracker.js';
import { InterpretationEngineService, InterpretationResult } from './interpretation-engine.service.js';
import { GroundingValidator, GroundingValidationResult } from './grounding-validator.js';
import { Message, StreamChunk, Citation, ResponseMode } from '@talk-to-krisna/shared';

export interface OrchestrationOptions {
  userId: string;
  conversationId: string;
  userMessage: string;
  preferredName?: string;
  onStreamChunk?: (chunk: StreamChunk) => void;
}

export interface OrchestrationAuditRecord {
  query: string;
  retrieval_method: string;
  retrieved_chunks: string[];
  retrieved_scores: number[];
  reranked_chunks: string[];
  selected_evidence: string[];
  retrieved_characters: string[];
  retrieved_episodes: string[];
  generated_characters: string[];
  generated_events: string[];
  unsupported_claims: string[];
  grounding_pass: boolean;
  generation_attempts: number;
}

export interface OrchestrationResult {
  message: Message;
  citations: Citation[];
  requestId: string;
  totalLatencyMs: number;
  auditRecord: OrchestrationAuditRecord;
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
    const safetyCheck = PromptSafetyGuard.evaluateInput(userMessage);
    if (!safetyCheck.isSafe && safetyCheck.safeInterventionMessage) {
      const intervention = safetyCheck.safeInterventionMessage;
      emit({ type: 'token', token: intervention });
      emit({ type: 'done', conversationId, messageId: requestId });

      // Save assistant crisis message
      const [savedMessage] = await db
        .insert(messages)
        .values({
          conversationId,
          sender: 'krishna',
          content: intervention,
          intentCategory: 'emotional_distress',
          emotionalState: 'grief',
        })
        .returning();

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
          createdAt: savedMessage.createdAt.toISOString(),
        },
        citations: [],
        requestId,
        totalLatencyMs: Date.now() - startTime,
        auditRecord: {
          query: userMessage,
          retrieval_method: 'safety_bypass',
          retrieved_chunks: [],
          retrieved_scores: [],
          reranked_chunks: [],
          selected_evidence: [],
          retrieved_characters: [],
          retrieved_episodes: [],
          generated_characters: [],
          generated_events: [],
          unsupported_claims: [],
          grounding_pass: true,
          generation_attempts: 1,
        },
      };
    }

    // Step 2: Fetch Recent Conversation History for Multi-Turn Context Tracking
    const historyRows = await db.query.messages.findMany({
      where: eq(messages.conversationId, conversationId),
      orderBy: [asc(messages.createdAt)],
      limit: 10,
    });

    const history = historyRows.map((m) => ({
      role: (m.sender === 'krishna' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: m.content,
    }));

    // Step 3: Multi-Turn Conversation State Tracking & Query Rewriting
    const conversationState = ConversationStateTracker.track(history, userMessage);

    // Step 4: Intent & Emotion Classification
    const classification = IntentClassifier.classify(userMessage, conversationState);
    const hasNonKrishnaCharacters = conversationState.activeCharacters.some(c => c.toLowerCase() !== 'krishna');
    const isMahabharataRelevant =
      !classification.isCasualBanter &&
      !classification.isAntiHallucinationProbe &&
      (
        classification.mahabharataRelevant ||
        classification.isStoryRequest === true ||
        hasNonKrishnaCharacters ||
        Boolean(conversationState.activeVerse)
      );

    emit({
      type: 'metadata',
      metadata: {
        intent: classification.intentCategory,
        emotion: classification.emotionalState,
        isMahabharataRelevant,
      },
    });

    // Step 5: Hybrid Retrieval (using contextual query & query-extracted entity guidance)
    let retrievedPassages: RetrievedPassage[] = [];
    let corpusDoesNotEstablish = false;
    let retrievalLatencyMs = 0;
    let retrievalConfidence: 'high' | 'medium' | 'low' = 'low';
    let hasSufficientEvidence = false;

    if (isMahabharataRelevant) {
      const allCharacters = Array.from(new Set([
        ...classification.extractedCharacters,
        ...conversationState.activeCharacters
      ]));

      const retrievalResult = await HybridRetriever.retrieve(
        conversationState.contextualQuery,
        allCharacters,
        classification.extractedThemes,
        3,
        classification.thematicKeywords || []
      );
      retrievedPassages = retrievalResult.passages;
      corpusDoesNotEstablish = retrievalResult.corpusDoesNotEstablish;
      retrievalLatencyMs = retrievalResult.retrievalLatencyMs;
      retrievalConfidence = retrievalResult.confidence;
      hasSufficientEvidence = retrievalResult.hasSufficientEvidence;

      // Evidence Quality Gate (Requirement 10 & 11):
      // If retrieval confidence is low for personal struggles without explicit epic entities,
      // trigger No-Evidence Mode (conversational presence) instead of forcing weak/spurious analogies.
      if (!hasSufficientEvidence && allCharacters.length === 0) {
        retrievedPassages = [];
        corpusDoesNotEstablish = true;
      }
    }

    // Step 6: Dedicated Interpretation Engine (Cognitive Dimensions & Dharma Analysis)
    const interpretation: InterpretationResult | null = InterpretationEngineService.interpret(
      userMessage,
      conversationState,
      retrievedPassages
    );

    // Step 7: Fetch User Profile & Optional Long-Term Memory
    const profile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, userId),
    });

    const memories = profile?.enableLongTermMemory
      ? await db.query.userMemories.findMany({
          where: eq(userMemories.userId, userId),
          limit: 5,
        })
      : [];

    // Determine explicit ResponseMode
    const isImminentSelfHarm =
      PromptSafetyGuard.evaluateInput(userMessage).category === 'self_harm' ||
      /(?:suicid|kill myself|end my life|want to die|self[- ]harm)/i.test(userMessage);

    const isEmotionalDistress =
      classification.intentCategory === 'emotional_distress' ||
      classification.intentCategory === 'relationship_grief' ||
      classification.emotionalState === 'grief' ||
      classification.emotionalState === 'fear' ||
      classification.emotionalState === 'loneliness' ||
      classification.emotionalState === 'confusion' ||
      /(?:depress|sad|lonely|heartbreak|grief|anxious|anxiety|hopeless|hurting|empty inside|overwhelm|crying|pain)/i.test(userMessage);

    const isCasualBanter =
      classification.isCasualBanter ||
      classification.intentCategory === 'casual_banter';

    const responseMode: ResponseMode = isImminentSelfHarm
      ? 'crisis_safety'
      : isCasualBanter
      ? 'casual_greeting'
      : isEmotionalDistress
      ? 'emotional_conversation'
      : (classification.isStoryRequest || isMahabharataRelevant)
      ? 'narrative_storytelling'
      : 'philosophical_inquiry';

    // Step 8: Construct Persona Prompt with Source Evidence + Grounded Interpretation
    const chatMessages = KrishnaPersonaService.buildPrompt(
      userMessage,
      history,
      retrievedPassages,
      {
        preferredName: options.preferredName,
        reflectionDepth: profile?.reflectionDepth as any,
        mahabharataDensity: profile?.mahabharataDensity as any,
        userMemories: memories.map((m) => ({ key: m.factKey, value: m.factValue })),
        isMahabharataRelevant,
        corpusDoesNotEstablish,
        interpretation,
        intentCategory: classification.intentCategory,
        emotionalState: classification.emotionalState,
        responseMode,
        isStoryRequest: classification.isStoryRequest,
        isChallenging: classification.isChallenging,
        isAntiHallucinationProbe: classification.isAntiHallucinationProbe,
        isCasualBanter: classification.isCasualBanter,
        isFollowUp: conversationState.isFollowUp,
        lastDiscussedCharacter: conversationState.lastDiscussedCharacter,
      }
    );

    // Step 7: Real AI Generation (Fails cleanly with 503 if provider unavailable - NO FAKE DATA)
    const aiProvider = AIProviderFactory.getProvider();
    const generationStartTime = Date.now();
    let generatedContent = '';
    let promptTokens: number | undefined;
    let completionTokens: number | undefined;

    const maxTokensByDepth: Record<string, number> = {
      concise: isMahabharataRelevant ? 220 : 150,
      balanced: isMahabharataRelevant ? 450 : 250,
      deep_philosophical: isMahabharataRelevant ? 600 : 400,
    };

    const targetMaxTokens = responseMode === 'emotional_conversation'
      ? 240
      : maxTokensByDepth[profile?.reflectionDepth || 'balanced'] || (isMahabharataRelevant ? 450 : 250);

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
        model: process.env.AI_MODEL_NAME || (aiProvider.providerName === 'groq' ? 'llama-3.1-8b-instant' : 'gemini-1.5-pro'),
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

      throw new Error(`AI Provider Error (${errorCode}): ${err.message}`);
    }

    const generationLatencyMs = Date.now() - generationStartTime;

    // Step 8: Final Sanitize & Post-Generation Grounding Validation (Requirements 12 & 13)
    generatedContent = MarkdownSanitizer.sanitize(generatedContent);

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
    if (conversationState.lastDiscussedCharacter) {
      establishedEntities.push(conversationState.lastDiscussedCharacter);
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
      console.warn(`[AIOrchestratorService] Grounding check failed on attempt 1: ${groundingResult.unsupportedClaims.join(', ')}. Triggering corrective regeneration.`);

      const correctiveMessage = {
        role: 'user' as const,
        content: `CORRECTION MANDATE: Your previous response contained unsupported claims: ${groundingResult.unsupportedClaims.join('; ')}. ` +
                 `You must ONLY mention characters and episodes present in the retrieved evidence above. ` +
                 `Do NOT invent dialogue or put paraphrased teachings inside quotation marks. Never use quotation marks unless quoting the exact words from the retrieved passage above. ` +
                 `If the retrieved evidence does not contain a suitable parallel, speak with pure conversational presence and warmth without naming unsupported characters or inventing stories. Rewrite now:`
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
        if (retryValidation.isValid || retryValidation.unsupportedClaims.length < groundingResult.unsupportedClaims.length) {
          generatedContent = retryContent;
          groundingResult = retryValidation;
          emit({ type: 'replace', content: generatedContent });
        }
      } catch (retryErr: any) {
        console.warn('[AIOrchestratorService] Corrective regeneration failed:', retryErr.message);
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

    const quoteResult = QuoteVerifier.verify(
      generatedContent,
      retrievedPassages,
      corpusDoesNotEstablish
    );

    if (isCopyrightRefusal || quoteResult.verifiedContent !== generatedContent) {
      emit({ type: 'replace', content: quoteResult.verifiedContent });
    }

    for (const citation of quoteResult.citations) {
      emit({ type: 'citation', citation });
    }

    // Step 9: Persist Assistant Message and Citations to Database
    const [savedMessage] = await db
      .insert(messages)
      .values({
        conversationId,
        sender: 'krishna',
        content: quoteResult.verifiedContent,
        intentCategory: classification.intentCategory,
        emotionalState: classification.emotionalState,
      })
      .returning();

    for (const citation of quoteResult.citations) {
      try {
        let validParentChunkId: string | null = null;
        if (citation.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(citation.id)) {
          const chunkExists = await db.query.mahabharataChunks.findFirst({
            where: eq(mahabharataChunks.id, citation.id),
            columns: { id: true },
          });
          if (chunkExists) {
            validParentChunkId = citation.id;
          }
        }

        await db.insert(messageCitations).values({
          messageId: savedMessage.id,
          chunkId: validParentChunkId,
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
        console.warn('[AIOrchestratorService] Citation save notice:', citErr.message);
      }
    }

    // Step 10: Auto-Title generation for the conversation if first turn
    if (historyRows.length <= 1) {
      const autoTitle = userMessage.slice(0, 40).trim() || 'Reflection';
      await db
        .update(conversations)
        .set({ title: autoTitle, updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
    }

    const retrievedCharacters = Array.from(new Set(
      retrievedPassages.flatMap(p => p.characters || [])
    ));
    const retrievedEpisodes = retrievedPassages.map(p => p.sourceReference);
    const retrievedChunkIds = retrievedPassages.map(p => p.id);
    const retrievalScores = retrievedPassages.map(p => Number((p.relevanceScore || 0).toFixed(3)));

    const auditRecord: OrchestrationAuditRecord = {
      query: userMessage,
      retrieval_method: 'hybrid_pgvector_fts',
      retrieved_chunks: retrievedChunkIds,
      retrieved_scores: retrievalScores,
      reranked_chunks: retrievedChunkIds,
      selected_evidence: retrievedEpisodes,
      retrieved_characters: retrievedCharacters,
      retrieved_episodes: retrievedEpisodes,
      generated_characters: groundingResult.mentionedCharacters,
      generated_events: groundingResult.claims.filter(c => c.type === 'event').map(c => c.item),
      unsupported_claims: groundingResult.unsupportedClaims,
      grounding_pass: groundingResult.isValid,
      generation_attempts: generationAttempts,
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
      model: process.env.AI_MODEL_NAME || (aiProvider.providerName === 'groq' ? 'llama-3.1-8b-instant' : 'gemini-1.5-pro'),
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
