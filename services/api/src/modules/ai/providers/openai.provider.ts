import OpenAI from 'openai';
import { AIProvider, CompletionOptions, CompletionResult } from '../ai-provider.interface.js';

export class OpenAIProvider implements AIProvider {
  public readonly providerName = 'openai' as const;
  private client: OpenAI;
  private modelName: string;
  private embeddingModelName: string;

  constructor() {
    const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
    this.client = new OpenAI({ apiKey: apiKey || 'missing_key' });
    this.modelName = process.env.AI_MODEL_NAME || 'gpt-4o';
    this.embeddingModelName = process.env.EMBEDDING_MODEL_NAME || 'text-embedding-3-small';
  }

  private checkApiKey() {
    const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'missing_key' || apiKey.includes('your_')) {
      throw new Error(
        'OpenAI API key is not configured or invalid. The service is currently unable to reach the AI provider.'
      );
    }
  }

  public async generateCompletion(options: CompletionOptions): Promise<CompletionResult> {
    this.checkApiKey();

    const response = await this.client.chat.completions.create({
      model: this.modelName,
      messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
    });

    const choice = response.choices[0];
    return {
      content: choice?.message?.content || '',
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      finishReason: choice?.finish_reason,
    };
  }

  public async streamCompletion(
    options: CompletionOptions,
    onChunk: (token: string) => void
  ): Promise<CompletionResult> {
    this.checkApiKey();

    const stream = await this.client.chat.completions.create({
      model: this.modelName,
      messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
      stream: true,
    });

    let fullText = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        fullText += delta;
        onChunk(delta);
      }
    }

    return {
      content: fullText,
    };
  }

  public async generateEmbeddings(texts: string[]): Promise<number[][]> {
    this.checkApiKey();

    const response = await this.client.embeddings.create({
      model: this.embeddingModelName,
      input: texts,
    });

    return response.data.map((item) => item.embedding);
  }
}
