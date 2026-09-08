import { AIProvider, CompletionOptions, CompletionResult } from './ai-provider.interface.js';
import { GeminiProvider } from './providers/gemini.provider.js';
import { OpenAIProvider } from './providers/openai.provider.js';
import { GroqProvider } from './providers/groq.provider.js';

class ResilientFallbackProvider implements AIProvider {
  private primary: AIProvider;
  private fallback?: AIProvider;

  constructor(primary: AIProvider, fallback?: AIProvider) {
    this.primary = primary;
    this.fallback = fallback;
  }

  get providerName(): AIProvider['providerName'] {
    return this.primary.providerName;
  }

  async generateCompletion(options: CompletionOptions): Promise<CompletionResult> {
    try {
      return await this.primary.generateCompletion(options);
    } catch (err: any) {
      if (this.fallback && this.isRecoverable(err)) {
        console.warn(
          `[AIProvider] Primary provider ${this.primary.providerName} failed: ${err.message}. Falling back to ${this.fallback.providerName}...`
        );
        return await this.fallback.generateCompletion(options);
      }
      throw err;
    }
  }

  async streamCompletion(
    options: CompletionOptions,
    onChunk: (token: string) => void
  ): Promise<CompletionResult> {
    try {
      return await this.primary.streamCompletion(options, onChunk);
    } catch (err: any) {
      if (this.fallback && this.isRecoverable(err)) {
        console.warn(
          `[AIProvider] Primary provider ${this.primary.providerName} stream failed: ${err.message}. Falling back to ${this.fallback.providerName}...`
        );
        return await this.fallback.streamCompletion(options, onChunk);
      }
      throw err;
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      return await this.primary.generateEmbeddings(texts);
    } catch (err: any) {
      if (this.fallback) {
        return await this.fallback.generateEmbeddings(texts);
      }
      throw err;
    }
  }

  private isRecoverable(err: any): boolean {
    const msg = (err?.message || '').toLowerCase();
    return (
      msg.includes('401') ||
      msg.includes('429') ||
      msg.includes('invalid api key') ||
      msg.includes('quota') ||
      msg.includes('rate limit') ||
      msg.includes('not configured') ||
      msg.includes('econnrefused') ||
      msg.includes('fetch failed')
    );
  }
}

export class AIProviderFactory {
  private static instance: AIProvider | null = null;
  private static cachedKey: string = '';
  private static cachedProvider: string = '';

  public static getProvider(): AIProvider {
    const rawKey = (
      process.env.AI_API_KEY ||
      process.env.GROQ_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.OPENAI_API_KEY ||
      ''
    ).trim();

    let configuredProvider = (process.env.AI_PROVIDER || '').toLowerCase().trim();

    if (this.instance && this.cachedKey === rawKey && this.cachedProvider === configuredProvider) {
      return this.instance;
    }

    this.cachedKey = rawKey;
    this.cachedProvider = configuredProvider;

    // Auto-detect provider if not set or set to 'auto'
    if (!configuredProvider || configuredProvider === 'auto') {
      if (rawKey.startsWith('gsk_') || process.env.GROQ_API_KEY) {
        configuredProvider = 'groq';
      } else if (rawKey.startsWith('sk-') || process.env.OPENAI_API_KEY) {
        configuredProvider = 'openai';
      } else {
        configuredProvider = 'gemini';
      }
    } else if (configuredProvider === 'gemini' && rawKey.startsWith('gsk_')) {
      // Key format is unmistakably Groq; prevent immediate 401 error from Gemini
      configuredProvider = 'groq';
    } else if (configuredProvider === 'groq' && rawKey.startsWith('AIza')) {
      configuredProvider = 'gemini';
    }

    let primary: AIProvider;
    let fallback: AIProvider | undefined;

    switch (configuredProvider) {
      case 'groq':
        primary = new GroqProvider();
        if (process.env.GEMINI_API_KEY || (process.env.AI_API_KEY && !process.env.AI_API_KEY.startsWith('gsk_'))) {
          fallback = new GeminiProvider();
        }
        break;
      case 'openai':
        primary = new OpenAIProvider();
        if (process.env.GROQ_API_KEY) {
          fallback = new GroqProvider();
        }
        break;
      case 'gemini':
      default:
        primary = new GeminiProvider();
        if (process.env.GROQ_API_KEY || rawKey.startsWith('gsk_')) {
          fallback = new GroqProvider();
        }
        break;
    }

    this.instance = fallback ? new ResilientFallbackProvider(primary, fallback) : primary;
    return this.instance;
  }

  public static setProvider(provider: AIProvider): void {
    this.instance = provider;
  }

  public static resetProvider(): void {
    this.instance = null;
  }
}
