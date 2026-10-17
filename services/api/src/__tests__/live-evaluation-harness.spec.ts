import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SseJsonDecoder, validateFixtures } from '../../scripts/live-evaluation-harness.js';

const fixtures = JSON.parse(readFileSync(new URL('../../scripts/evaluation-scenarios.json', import.meta.url), 'utf8'));

describe('live evaluation harness contracts', () => {
  it('keeps the mandatory Gita, safety, and retrieval turn counts fixed', () => {
    expect(validateFixtures(fixtures)).toEqual({
      gita: { scenarios: 10, turns: 40 },
      safety: { scenarios: 10, turns: 40 },
      retrieval: { scenarios: 10, turns: 10 },
    });
  });

  it('decodes split SSE JSON frames without losing event boundaries', () => {
    const decoder = new SseJsonDecoder();
    expect(decoder.push('data: {"type":"token","token":"Hare"}\r\n\r')).toEqual([]);
    expect(decoder.push('\ndata: {"type":"done"}\n\n')).toEqual([
      { type: 'token', token: 'Hare' },
      { type: 'done' },
    ]);
  });

  it('rejects fixtures that would under-run the required multi-turn suite', () => {
    const incomplete = structuredClone(fixtures);
    incomplete.suites.gita.scenarios[0].turns.pop();
    expect(() => validateFixtures(incomplete)).toThrow('must contain exactly 4 turns');
  });
});
