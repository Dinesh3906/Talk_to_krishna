import { db } from '../../db/index.js';
import { aiRequestTelemetry } from '../../db/schema.js';
import { AIRequestTelemetry } from '@talk-to-krisna/shared';

export class TelemetryService {
  /**
   * Records privacy-preserving telemetry metrics for every AI interaction.
   * Explicitly avoids storing raw private message text in the telemetry store.
   */
  public static async record(data: AIRequestTelemetry): Promise<void> {
    try {
      await db.insert(aiRequestTelemetry).values({
        requestId: data.requestId,
        userId: data.userId,
        conversationId: data.conversationId,
        model: data.model,
        provider: data.provider,
        totalLatencyMs: data.totalLatencyMs,
        retrievalLatencyMs: data.retrievalLatencyMs,
        generationLatencyMs: data.generationLatencyMs,
        retrievedChunkCount: data.retrievedChunkCount,
        promptTokens: data.promptTokens,
        completionTokens: data.completionTokens,
        citationCount: data.citationCount,
        intentCategory: data.intentCategory,
        emotionalState: data.emotionalState,
        mahabharataRelevant: data.mahabharataRelevant,
        hasError: data.hasError,
        errorCode: data.errorCode,
      });
    } catch (err: any) {
      // Non-blocking telemetry log
      console.warn('[TelemetryService] Failed to record telemetry record:', err.message);
    }
  }
}
