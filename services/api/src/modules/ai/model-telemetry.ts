export type TelemetryProviderName = 'gemini' | 'openai' | 'anthropic' | 'groq';

/** Keep telemetry aligned with the model selection each provider uses at runtime. */
export function resolveEffectiveModelName(
  provider: TelemetryProviderName,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  if (provider === 'groq') {
    const configured = (environment.GROQ_MODEL_NAME || environment.AI_MODEL_NAME || '').trim().replace(/^['"]|['"]$/g, '');
    return configured && !configured.toLowerCase().includes('gemini') ? configured : 'openai/gpt-oss-20b';
  }

  if (provider === 'openai') return environment.AI_MODEL_NAME?.trim() || 'gpt-4o';
  if (provider === 'gemini') return environment.AI_MODEL_NAME?.trim() || 'gemini-1.5-pro';
  return environment.AI_MODEL_NAME?.trim() || 'unknown';
}
