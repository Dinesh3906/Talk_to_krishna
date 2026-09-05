import { AIProvider } from './ai-provider.interface.js';
import { GeminiProvider } from './providers/gemini.provider.js';
import { OpenAIProvider } from './providers/openai.provider.js';
import { GroqProvider } from './providers/groq.provider.js';

export class AIProviderFactory {
  private static instance: AIProvider | null = null;

  public static getProvider(): AIProvider {
    if (this.instance) {
      return this.instance;
    }

    const providerType = (
      process.env.AI_PROVIDER || (process.env.GROQ_API_KEY ? 'groq' : 'gemini')
    ).toLowerCase();

    switch (providerType) {
      case 'groq':
        this.instance = new GroqProvider();
        break;
      case 'openai':
        this.instance = new OpenAIProvider();
        break;
      case 'gemini':
      default:
        this.instance = new GeminiProvider();
        break;
    }

    return this.instance!;
  }

  public static setProvider(provider: AIProvider): void {
    this.instance = provider;
  }

  public static resetProvider(): void {
    this.instance = null;
  }
}
