export interface AIRequestTelemetry {
  id?: string;
  requestId: string;
  userId: string;
  conversationId?: string;
  model: string;
  provider: 'gemini' | 'openai' | 'anthropic' | 'groq';
  totalLatencyMs: number;
  retrievalLatencyMs: number;
  generationLatencyMs: number;
  retrievedChunkCount: number;
  promptTokens?: number;
  completionTokens?: number;
  citationCount: number;
  intentCategory?: string;
  emotionalState?: string;
  mahabharataRelevant: boolean;
  hasError: boolean;
  errorCode?: string;
  createdAt: string;
}

export type TelemetryMetricSummary = {
  averageLatencyMs: number;
  p95LatencyMs: number;
  totalRequests: number;
  errorRate: number;
  averageCitationsPerResponse: number;
  providerBreakdown: Record<string, number>;
};
