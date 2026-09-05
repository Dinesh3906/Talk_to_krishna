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

    // Step 2: Intent & Emotion Classification
    const classification = IntentClassifier.classify(userMessage);
    emit({
      type: 'metadata',
      metadata: {
        intent: classification.intentCategory,
        emotion: classification.emotionalState,
        isMahabharataRelevant: classification.mahabharataRelevant,
      },
    });

    // Step 3: Hybrid Retrieval
    let retrievedPassages: RetrievedPassage[] = [];
    let corpusDoesNotEstablish = false;
    let retrievalLatencyMs = 0;

    if (classification.mahabharataRelevant) {
      const retrievalResult = await HybridRetriever.retrieve(
        userMessage,
        classification.extractedCharacters,
        classification.extractedThemes,
        3
      );
      retrievedPassages = retrievalResult.passages;
      corpusDoesNotEstablish = retrievalResult.corpusDoesNotEstablish;
      retrievalLatencyMs = retrievalResult.retrievalLatencyMs;
    }

    // Step 4: Fetch User Profile & Optional Long-Term Memory
    const profile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, userId),
    });

    const memories = profile?.enableLongTermMemory
      ? await db.query.userMemories.findMany({
          where: eq(userMemories.userId, userId),
          limit: 5,
        })
      : [];

    // Step 5: Fetch Recent Conversation History
    const historyRows = await db.query.messages.findMany({
      where: eq(messages.conversationId, conversationId),
      orderBy: [asc(messages.createdAt)],
      limit: 10,
    });

    const history = historyRows.map((m) => ({
      role: (m.sender === 'krishna' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: m.content,
    }));

    // Step 6: Construct Persona Prompt
    const chatMessages = KrishnaPersonaService.buildPrompt(
      userMessage,
      history,
      retrievedPassages,
      {
        preferredName: options.preferredName,
        reflectionDepth: profile?.reflectionDepth as any,
        mahabharataDensity: profile?.mahabharataDensity as any,
        userMemories: memories.map((m) => ({ key: m.factKey, value: m.factValue })),
        isMahabharataRelevant: classification.mahabharataRelevant,
        corpusDoesNotEstablish,
      }
    );

    // Step 7: Real AI Generation (Fails cleanly with 503 if provider unavailable - NO FAKE DATA)
    const aiProvider = AIProviderFactory.getProvider();
    const generationStartTime = Date.now();
    let generatedContent = '';
    let promptTokens: number | undefined;
    let completionTokens: number | undefined;

    try {
      const completionResult = await aiProvider.streamCompletion(
        {
          messages: chatMessages,
          temperature: 0.7,
          maxTokens: 2048,
        },
        (token: string) => {
          generatedContent += token;
          emit({ type: 'token', token });
        }
      );

      promptTokens = completionResult.promptTokens;
      completionTokens = completionResult.completionTokens;
    } catch (err: any) {
      const totalLatency = Date.now() - startTime;
      emit({
        type: 'error',
        error: 'AI Provider service is currently unavailable. Please check API credentials.',
        errorCode: 'AI_PROVIDER_UNAVAILABLE',
      });

      await TelemetryService.record({
        requestId,
        userId,
        conversationId,
        model: 'gemini-1.5-pro',
        provider: aiProvider.providerName,
        totalLatencyMs: totalLatency,
        retrievalLatencyMs,
        generationLatencyMs: Date.now() - generationStartTime,
        retrievedChunkCount: retrievedPassages.length,
        hasError: true,
        errorCode: 'AI_PROVIDER_UNAVAILABLE',
        citationCount: 0,
        mahabharataRelevant: classification.mahabharataRelevant,
        createdAt: new Date().toISOString(),
      });

      throw new Error(`AI Provider Unavailable: ${err.message}`);
    }

    const generationLatencyMs = Date.now() - generationStartTime;

    // Step 8: Quote Verification & Source Citation Guard
    const quoteResult = QuoteVerifier.verify(
      generatedContent,
      retrievedPassages,
      corpusDoesNotEstablish
    );

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
      model: 'gemini-1.5-pro',
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
