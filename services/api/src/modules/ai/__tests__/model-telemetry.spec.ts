import { describe, expect, it } from 'vitest';
import { resolveEffectiveModelName } from '../model-telemetry.js';

describe('effective model telemetry', () => {
  it('records the configured Groq model actually selected by the provider', () => {
    expect(resolveEffectiveModelName('groq', {
      GROQ_MODEL_NAME: 'openai/gpt-oss-20b',
      AI_MODEL_NAME: 'llama-3.1-8b-instant',
    })).toBe('openai/gpt-oss-20b');
  });

  it('matches the provider fallback when a Gemini model is mistakenly configured for Groq', () => {
    expect(resolveEffectiveModelName('groq', { AI_MODEL_NAME: 'gemini-1.5-pro' })).toBe('openai/gpt-oss-20b');
  });

  it('uses the same defaults as OpenAI and Gemini providers', () => {
    expect(resolveEffectiveModelName('openai', {})).toBe('gpt-4o');
    expect(resolveEffectiveModelName('gemini', {})).toBe('gemini-1.5-pro');
  });
});
