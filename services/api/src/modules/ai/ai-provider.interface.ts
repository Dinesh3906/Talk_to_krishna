export interface ChatMessageParam {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  messages: ChatMessageParam[];
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

export interface CompletionResult {
  content: string;
  promptTokens?: number;
  completionTokens?: number;
  finishReason?: string;
}

export interface AIProvider {
  readonly providerName: 'gemini' | 'openai' | 'anthropic' | 'groq';
  generateCompletion(options: CompletionOptions): Promise<CompletionResult>;
  streamCompletion(
    options: CompletionOptions,
    onChunk: (token: string) => void
  ): Promise<CompletionResult>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
}
