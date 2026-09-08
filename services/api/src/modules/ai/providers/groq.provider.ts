import OpenAI from 'openai';
import { AIProvider, CompletionOptions, CompletionResult } from '../ai-provider.interface.js';

export class GroqProvider implements AIProvider {
  public readonly providerName = 'groq' as const;

  private getApiKey(): string {
    const raw =
      process.env.GROQ_API_KEY ||
      (process.env.AI_API_KEY?.startsWith('gsk_') ? process.env.AI_API_KEY : '') ||
      '';
    return raw.trim().replace(/[\r\n\t\s]/g, '').replace(/^["']|["']$/g, '');
  }

  private getModelName(): string {
    const rawModel = (process.env.GROQ_MODEL_NAME || process.env.AI_MODEL_NAME || '')
      .trim()
      .replace(/^["']|["']$/g, '');
    const isGeminiModel = rawModel && rawModel.toLowerCase().includes('gemini');
    return !isGeminiModel && rawModel ? rawModel : 'openai/gpt-oss-20b';
  }

  private checkApiKey(): string {
    const apiKey = this.getApiKey();
    if (!apiKey || apiKey === 'missing_key' || apiKey.includes('your_') || !apiKey.startsWith('gsk_')) {
      throw new Error(
        'Groq API key is not configured or invalid. Please configure GROQ_API_KEY (starts with gsk_) in the environment.'
      );
    }
    return apiKey;
  }

  public async generateCompletion(options: CompletionOptions): Promise<CompletionResult> {
    const apiKey = this.checkApiKey();
    const model = this.getModelName();

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 2048,
          reasoning_format: 'hidden',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as any;
      const choice = data.choices?.[0];
      return {
        content: choice?.message?.content || '',
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        finishReason: choice?.finish_reason,
      };
    } catch (err: any) {
      // Fallback via OpenAI client if direct fetch encounters issues
      const client = new OpenAI({
        apiKey,
        baseURL: 'https://api.groq.com/openai/v1',
      });
      const response = await client.chat.completions.create({
        model,
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
  }

  public async streamCompletion(
    options: CompletionOptions,
    onChunk: (token: string) => void
  ): Promise<CompletionResult> {
    const apiKey = this.checkApiKey();
    const model = this.getModelName();

    // Primary: Native fetch with SSE parsing (bulletproof against Node header/SDK connection errors)
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 2048,
          stream: true,
          reasoning_format: 'hidden',
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Groq API responded with status ${response.status}: ${errorBody}`);
      }

      if (!response.body) {
        throw new Error('Groq response stream body was empty.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              const delta = parsed.choices?.[0]?.delta?.content || '';
              if (delta) {
                fullText += delta;
                onChunk(delta);
              }
            } catch {
              // Skip malformed SSE chunks
            }
          }
        }
      }

      return { content: fullText };
    } catch (fetchErr: any) {
      console.warn('[GroqProvider] Direct fetch stream failed, trying OpenAI SDK fallback:', fetchErr.message);

      // Fallback: OpenAI client stream
      const client = new OpenAI({
        apiKey,
        baseURL: 'https://api.groq.com/openai/v1',
      });

      const stream = await client.chat.completions.create({
        model,
        messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
        stream: true as const,
      });

      let fullText = '';
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          fullText += delta;
          onChunk(delta);
        }
      }

      return { content: fullText };
    }
  }

  public async generateEmbeddings(_texts: string[]): Promise<number[][]> {
    throw new Error(
      'Groq does not provide embedding models natively. Please configure GEMINI_API_KEY or OPENAI_API_KEY for vector embeddings.'
    );
  }
}
