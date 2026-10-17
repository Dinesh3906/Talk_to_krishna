import { db } from '../../db/index.js';
import { aiRequestTelemetry } from '../../db/schema.js';
import { AIRequestTelemetry } from '@talk-to-krisna/shared';
import { createHash } from 'node:crypto';

export interface RagRequestDiagnostics {
  requestId: string;
  conversationId: string;
  retrievalQuery: string;
  retrievalStatus: string;
  retrievalPath: string;
  retrievedChunkCount: number;
  selectedEvidence: Array<{ id: string; sourceType: string; sourceReference: string; score: number }>;
  candidates: Array<{ id: string; sourceType: string; sourceReference: string; rank: number; score: number }>;
  retrievalLatencyMs: number;
  generationLatencyMs: number;
  modelFirstTokenLatencyMs?: number;
  firstVisibleTextLatencyMs?: number;
  citationValidationStatus: 'passed' | 'no_scriptural_claims' | 'failed';
  insufficientEvidenceReason?: string;
  completionStatus: 'completed' | 'failed';
}

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
    } catch {
      // Non-blocking telemetry log
      console.warn('[TelemetryService] Failed to record telemetry record.');
    }
  }

  /** Writes diagnostic metadata without retaining raw prompts or personal content. */
  public static recordRagDiagnostics(data: RagRequestDiagnostics): void {
    const normalizedQuery = data.retrievalQuery.toLowerCase().trim().replace(/\s+/g, ' ');
    console.info(JSON.stringify({
      event: 'rag_request_diagnostic',
      requestId: data.requestId,
      conversationId: data.conversationId,
      backendVersion: process.env.RENDER_GIT_COMMIT || process.env.BUILD_VERSION || 'local',
      retrievalConfigurationVersion: 'grounding-contract-v2',
      retrievalQueryFingerprint: createHash('sha256').update(normalizedQuery).digest('hex'),
      retrievalStatus: data.retrievalStatus,
      retrievalPath: data.retrievalPath,
      retrievedChunkCount: data.retrievedChunkCount,
      selectedEvidence: data.selectedEvidence,
      candidates: data.candidates.slice(0, 50),
      retrievalLatencyMs: data.retrievalLatencyMs,
      generationLatencyMs: data.generationLatencyMs,
      modelFirstTokenLatencyMs: data.modelFirstTokenLatencyMs,
      firstVisibleTextLatencyMs: data.firstVisibleTextLatencyMs,
      citationValidationStatus: data.citationValidationStatus,
      insufficientEvidenceReason: data.insufficientEvidenceReason,
      completionStatus: data.completionStatus,
    }));
  }
}
