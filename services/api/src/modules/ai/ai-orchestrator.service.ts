import { v4 as uuidv4 } from 'uuid';
import { eq, desc, asc, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { conversations, messages, messageCitations, userProfiles, userMemories } from '../../db/schema.js';
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
import { Message, StreamChunk, Citation } from '@talk-to-krisna/shared';

export interface OrchestrationOptions {
  userId: string;
  conversationId: string;
  userMessage: string;
  preferredName?: string;
  onStreamChunk?: (chunk: StreamChunk) => void;
}

export interface OrchestrationResult {
  message: Message;
  citations: Citation[];
  requestId: string;
  totalLatencyMs: number;
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
    const classification = IntentClassifier.classify(userMessage);
    const isMahabharataRelevant =
      classification.mahabharataRelevant ||
      conversationState.activeCharacters.length > 0 ||
      Boolean(conversationState.activeVerse);

    emit({
      type: 'metadata',
      metadata: {
        intent: classification.intentCategory,
        emotion: classification.emotionalState,
        isMahabharataRelevant,
      },
    });

    // Step 5: Hybrid Retrieval (using contextual query & merged character guidance)
    let retrievedPassages: RetrievedPassage[] = [];
    let corpusDoesNotEstablish = false;
    let retrievalLatencyMs = 0;

    if (isMahabharataRelevant) {
      const allCharacters = Array.from(new Set([
        ...classification.extractedCharacters,
        ...conversationState.activeCharacters
      ]));

      const retrievalResult = await HybridRetriever.retrieve(
        conversationState.contextualQuery,
        allCharacters,
        classification.extractedThemes,
        3
      );
      retrievedPassages = retrievalResult.passages;
      corpusDoesNotEstablish = retrievalResult.corpusDoesNotEstablish;
      retrievalLatencyMs = retrievalResult.retrievalLatencyMs;
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
    const isEmotionalConversationMode =
      classification.intentCategory === 'emotional_distress' ||
      classification.emotionalState === 'grief' ||
      classification.intentCategory === 'relationship_grief';

    const targetMaxTokens = isEmotionalConversationMode
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

    // Step 8: Final Sanitize & Quote Verification Guard
    generatedContent = MarkdownSanitizer.sanitize(generatedContent);

    // Safeguard: Intercept generic LLM corporate copyright refusals/disclaimers
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
        "My friend, the sacred wisdom of the verses belongs to all who seek truth. Hear the eternal words I spoke to Arjuna upon the battlefield of Kurukshetra:\n\n" +
        "Karmaṇy-evādhikāras te mā phaleṣu kadācana,\n" +
        "Mā karma-phala-hetur bhūr mā te saṅgo 'stv akarmaṇi.\n\n" +
        "You have a right only to your prescribed duty, but never to the fruits of action. Never let the fruits of your actions be your motive, nor let your attachment be to inaction.\n\n" +
        "Focus your whole heart on the righteous deed before you, dedicate your efforts with love, and let go of anxiety over what is to come. In this selfless action lies true peace.";
    }

    // Safeguard: Intercept generic LLM corporate therapist / medicalized clinical lists / helpline dumps
    const isImminentSelfHarm =
      /(?:suicid|kill myself|end my life|want to die|self[- ]harm)/i.test(userMessage);

    const isClinicalTherapistResponse =
      !isImminentSelfHarm &&
      /(?:acknowledge the (?:weight|feeling)|grounding (?:techniques|practices|in the present|yourself)|daily rituals|small daily actions|sleep hygiene|4-7-8|breathing (?:technique|exercise)|blanket that'?s hard to (?:lift|shake off)|heavy unending cloud|let the feeling surface|a small,? (?:intentional|comforting) ritual|seek professional (?:help|support)|notice the body|5-second pause|sensory check|write a note to yourself|practical steps you can take|name the feeling|explore a few gentle ways|move a little|write it down|cyclical nature of emotions|emergency resources|national suicide prevention|samaritans|\b\d+\.\s*(?:Name the feeling|Ground yourself|Reach out|Move a little|Write it down|Seek a small|Remember the|Consider medication|Build a safety net|Emergency resources))/i.test(generatedContent);

    if (isClinicalTherapistResponse) {
      console.warn('[AIOrchestratorService] Intercepted clinical therapist response from LLM. Overriding with authentic Krishna emotional reflection.');
      generatedContent =
        "Come, sit for a moment. You don't have to explain everything at once.\n\n" +
        "When Arjuna stood on the battlefield, he wasn't defeated by an enemy in front of him. His real struggle was inside—his mind was filled with confusion, grief, and questions he couldn't silence. And Krishna did not begin by telling him to take a walk, make a gratitude list, or follow seven steps.\n\n" +
        "He listened.\n\n" +
        "So if you're feeling depressed, don't worry about fixing your entire life tonight. Sometimes the first step is simply being honest about what hurts.\n\n" +
        (options.preferredName ? `Tell me, ${options.preferredName}—what happened that made everything feel this heavy?` : "Tell me—what happened that made everything feel this heavy?");
    }

    const quoteResult = QuoteVerifier.verify(
      generatedContent,
      retrievedPassages,
      corpusDoesNotEstablish
    );

    if (isCopyrightRefusal || isClinicalTherapistResponse || quoteResult.verifiedContent !== generatedContent) {
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
      await db.insert(messageCitations).values({
        messageId: savedMessage.id,
        chunkId: citation.id,
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
    }

    // Step 10: Auto-Title generation for the conversation if first turn
    if (historyRows.length <= 1) {
      const autoTitle = userMessage.slice(0, 40).trim() || 'Reflection';
      await db
        .update(conversations)
        .set({ title: autoTitle, updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
    }

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
    };
  }
}
