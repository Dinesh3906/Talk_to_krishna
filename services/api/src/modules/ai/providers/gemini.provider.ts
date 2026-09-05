import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIProvider, CompletionOptions, CompletionResult } from '../ai-provider.interface.js';

export class GeminiProvider implements AIProvider {
  public readonly providerName = 'gemini' as const;
  private client: GoogleGenerativeAI;
  private modelName: string;
  private embeddingModelName: string;

  constructor() {
    const apiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Production fail-closed: Never fake responses when keys are absent
      console.warn('[GeminiProvider] Warning: AI_API_KEY not configured.');
    }
    this.client = new GoogleGenerativeAI(apiKey || 'missing_key');
    this.modelName = process.env.AI_MODEL_NAME || 'gemini-1.5-pro';
    this.embeddingModelName = process.env.EMBEDDING_MODEL_NAME || 'text-embedding-004';
  }

  private checkApiKey() {
    const apiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'missing_key' || apiKey.includes('your_')) {
      throw new Error(
        'Gemini AI API key is not configured or invalid. The service is currently unable to reach the AI provider.'
      );
    }
  }

  public async generateCompletion(options: CompletionOptions): Promise<CompletionResult> {
    this.checkApiKey();

    const model = this.client.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 2048,
      },
    });

    const systemMessage = options.messages.find((m) => m.role === 'system');
    const conversationMessages = options.messages.filter((m) => m.role !== 'system');

    const contents = conversationMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const result = await model.generateContent({
      contents,
      systemInstruction: systemMessage ? systemMessage.content : undefined,
    });

    const response = await result.response;
    const text = response.text();

    return {
      content: text,
      promptTokens: response.usageMetadata?.promptTokenCount,
      completionTokens: response.usageMetadata?.candidatesTokenCount,
    };
  }

  public async streamCompletion(
    options: CompletionOptions,
    onChunk: (token: string) => void
  ): Promise<CompletionResult> {
    this.checkApiKey();

    const model = this.client.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 2048,
      },
    });

    const systemMessage = options.messages.find((m) => m.role === 'system');
    const conversationMessages = options.messages.filter((m) => m.role !== 'system');

    const contents = conversationMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const resultStream = await model.generateContentStream({
      contents,
      systemInstruction: systemMessage ? systemMessage.content : undefined,
    });

    let fullText = '';
    for await (const chunk of resultStream.stream) {
      const chunkText = chunk.text();
      fullText += chunkText;
      onChunk(chunkText);
    }

    const response = await resultStream.response;
    return {
      content: fullText,
      promptTokens: response.usageMetadata?.promptTokenCount,
      completionTokens: response.usageMetadata?.candidatesTokenCount,
    };
  }

  public async generateEmbeddings(texts: string[]): Promise<number[][]> {
    this.checkApiKey();

    const model = this.client.getGenerativeModel({ model: this.embeddingModelName });
    const results: number[][] = [];

    for (const text of texts) {
      const resp = await model.embedContent(text);
      if (!resp.embedding || !resp.embedding.values) {
        throw new Error('Failed to generate embedding from Gemini API.');
      }
      results.push(resp.embedding.values);
    }

    return results;
  }
}
