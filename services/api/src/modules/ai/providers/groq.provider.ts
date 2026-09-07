import OpenAI from 'openai';
import { AIProvider, CompletionOptions, CompletionResult } from '../ai-provider.interface.js';

export class GroqProvider implements AIProvider {
  public readonly providerName = 'groq' as const;
  private client: OpenAI;
  private modelName: string;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY || process.env.AI_API_KEY;
    this.client = new OpenAI({
      apiKey: apiKey || 'missing_key',
      baseURL: 'https://api.groq.com/openai/v1',
    });
    const rawModel = process.env.GROQ_MODEL_NAME || process.env.AI_MODEL_NAME;
    const isGeminiModel = rawModel && rawModel.toLowerCase().includes('gemini');
    this.modelName = !isGeminiModel && rawModel ? rawModel : 'openai/gpt-oss-20b';
  }

  private checkApiKey() {
    const apiKey = process.env.GROQ_API_KEY || process.env.AI_API_KEY;
    if (!apiKey || apiKey === 'missing_key' || apiKey.includes('your_')) {
      throw new Error(
        'Groq API key is not configured or invalid. The service is currently unable to reach the AI provider.'
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
      reasoning_format: 'hidden',
    } as any);

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

    const streamParams = {
      model: this.modelName,
      messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
      stream: true as const,
    };
    const stream = await this.client.chat.completions.create(
      Object.assign(streamParams, { reasoning_format: 'hidden' }) as typeof streamParams
    );

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

  public async generateEmbeddings(_texts: string[]): Promise<number[][]> {
    throw new Error(
      'Groq does not provide embedding models natively. Please configure GEMINI_API_KEY or OPENAI_API_KEY for vector embeddings.'
    );
  }
}
