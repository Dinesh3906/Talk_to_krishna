import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AIProviderFactory } from './ai-provider.factory.js';

describe('AIProviderFactory', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    AIProviderFactory.resetProvider();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    AIProviderFactory.resetProvider();
  });

  it('should auto-detect Groq when AI_API_KEY starts with gsk_', () => {
    process.env.AI_PROVIDER = 'auto';
    process.env.AI_API_KEY = 'gsk_mock_key_12345';
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const provider = AIProviderFactory.getProvider();
    expect(provider.providerName).toBe('groq');
  });

  it('should override gemini provider setting if AI_API_KEY is unmistakably a Groq key (gsk_)', () => {
    process.env.AI_PROVIDER = 'gemini';
    process.env.AI_API_KEY = 'gsk_mock_key_12345';
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const provider = AIProviderFactory.getProvider();
    expect(provider.providerName).toBe('groq');
  });

  it('should auto-detect Gemini when AI_API_KEY starts with AIza', () => {
    process.env.AI_PROVIDER = 'auto';
    process.env.AI_API_KEY = 'AIzaSyMockKey12345';
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const provider = AIProviderFactory.getProvider();
    expect(provider.providerName).toBe('gemini');
  });

  it('should auto-detect OpenAI when AI_API_KEY starts with sk-', () => {
    process.env.AI_PROVIDER = 'auto';
    process.env.AI_API_KEY = 'sk-mock-openai-key-12345';
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const provider = AIProviderFactory.getProvider();
    expect(provider.providerName).toBe('openai');
  });

  it('should support manual provider injection with setProvider', () => {
    const mockProvider = {
      providerName: 'groq' as const,
      generateCompletion: async () => ({ content: 'mock' }),
      streamCompletion: async () => ({ content: 'mock' }),
      generateEmbeddings: async () => [[]],
    };

    AIProviderFactory.setProvider(mockProvider);
    expect(AIProviderFactory.getProvider()).toBe(mockProvider);
  });
});
