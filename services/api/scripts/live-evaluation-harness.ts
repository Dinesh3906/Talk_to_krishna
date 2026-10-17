import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';

const apiRoot = fileURLToPath(new URL('..', import.meta.url));
dotenv.config({ path: path.join(apiRoot, '.env') });

type TurnFixture = { label: string; user: string };
type ScenarioFixture = {
  id: string;
  turns: TurnFixture[];
  groundingTargets?: string[];
  reviewFocus?: string;
  safetyFocus?: string;
  expectedEvidence?: string[];
  expectedBehavior?: string;
};
type SuiteName = 'gita' | 'safety' | 'retrieval';
type ScenarioSuite = { description: string; scenarios: ScenarioFixture[] };
type FixtureFile = {
  version: number;
  rubric: { dimensions: string[]; scale: Record<string, string>; automaticScores: boolean };
  suites: Record<SuiteName, ScenarioSuite>;
};

const fixturePath = path.join(apiRoot, 'scripts', 'evaluation-scenarios.json');
const dimensions = [
  'scripturalGrounding',
  'retrievalAndCitationIntegrity',
  'personaAndEmpathy',
  'continuity',
  'practicalUsefulnessAndSafety',
];

export function validateFixtures(fixtures: FixtureFile): Record<SuiteName, { scenarios: number; turns: number }> {
  if (fixtures.version !== 1 || fixtures.rubric.automaticScores !== false) {
    throw new Error('Fixture version or manual-review scoring contract is invalid.');
  }
  if (dimensions.some(dimension => !fixtures.rubric.dimensions.includes(dimension))) {
    throw new Error('The scoring rubric is missing a required evaluation dimension.');
  }
  const counts = {} as Record<SuiteName, { scenarios: number; turns: number }>;
  for (const suiteName of ['gita', 'safety', 'retrieval'] as const) {
    const suite = fixtures.suites[suiteName];
    if (!suite || suite.scenarios.length !== 10) {
      throw new Error(`The ${suiteName} suite must contain exactly 10 scenarios.`);
    }
    const ids = new Set<string>();
    let turns = 0;
    for (const scenario of suite.scenarios) {
      if (!scenario.id || ids.has(scenario.id)) throw new Error(`${suiteName} has a missing or duplicate scenario ID.`);
      ids.add(scenario.id);
      const expectedTurnCount = suiteName === 'retrieval' ? 1 : 4;
      if (scenario.turns.length !== expectedTurnCount) {
        throw new Error(`${scenario.id} must contain exactly ${expectedTurnCount} turns.`);
      }
      for (const turn of scenario.turns) {
        if (!turn.user.trim() || !turn.label.trim()) throw new Error(`${scenario.id} has an empty turn.`);
      }
      turns += scenario.turns.length;
    }
    counts[suiteName] = { scenarios: suite.scenarios.length, turns };
  }
  return counts;
}

export class SseJsonDecoder {
  private buffer = '';

  push(chunk: string, final = false): Record<string, unknown>[] {
    this.buffer += chunk;
    const events: Record<string, unknown>[] = [];
    let boundary = this.buffer.search(/\r?\n\r?\n/);
    while (boundary >= 0) {
      const separator = this.buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0] || '\n\n';
      const frame = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + separator.length);
      const data = frame.split(/\r?\n/)
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (data) {
        const value: unknown = JSON.parse(data);
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          throw new Error('The API stream returned a non-object event.');
        }
        events.push(value as Record<string, unknown>);
      }
      boundary = this.buffer.search(/\r?\n\r?\n/);
    }
    if (final && this.buffer.trim()) {
      const frame = this.buffer;
      this.buffer = '';
      const data = frame.split(/\r?\n/)
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (data) {
        const value: unknown = JSON.parse(data);
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          throw new Error('The API stream returned a non-object event.');
        }
        events.push(value as Record<string, unknown>);
      }
    }
    return events;
  }
}

function selectedSuites(fixtures: FixtureFile, choice: string): Array<[SuiteName, ScenarioSuite]> {
  if (choice === 'all') return Object.entries(fixtures.suites) as Array<[SuiteName, ScenarioSuite]>;
  if (choice !== 'gita' && choice !== 'safety' && choice !== 'retrieval') {
    throw new Error('Use --suite all, gita, safety, or retrieval.');
  }
  return [[choice, fixtures.suites[choice]]];
}

function safeErrorCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'string' && /^[A-Z0-9_]{2,32}$/.test(code) ? code : 'EVALUATION_SETUP_FAILED';
}

function safeFailureDetail(stage: string, error: unknown): string {
  const message = (error as { message?: unknown })?.message;
  const knownMessages = [
    'Set an explicit evaluation DATABASE_URL and database name beginning talk_to_krishna_eval_.',
    'The database name does not match the explicitly expected evaluation target.',
    'The evaluation database is missing pgvector or required indexed source data.',
    'AI_PROVIDER must be explicitly set to groq, gemini, or openai.',
    'The selected provider does not match AI_PROVIDER.',
    'The effective configured model could not be determined.',
    'The API database health check failed.',
    'The API did not return a conversation ID.',
    'The API evaluation trace was not returned; no result can be marked complete.',
    'The persisted conversation did not contain the expected sequential user and assistant turns.',
    'The latest user or generated assistant turn did not persist as expected.',
    'A persisted citation failed evidence identity or provenance validation.',
  ];
  if (typeof message === 'string' && knownMessages.includes(message)) return message;
  if (stage.includes(':send-message')) return 'A live API turn failed; provider and database response details were omitted.';
  if (stage.includes(':reload')) return 'Conversation reload or persistence verification failed; response details were omitted.';
  if (stage.includes('database')) return 'The explicitly named evaluation database could not be positively identified or queried.';
  if (stage.includes('model')) return 'The configured model/provider could not be initialized; credential and provider details were omitted.';
  if (stage.includes('api')) return 'The in-process API could not complete startup or its health check.';
  return 'The run stopped during setup; sensitive connection and provider details were omitted.';
}

function safeModelKey(provider: string): { variable: string; value: string } {
  const keyVariable: Record<string, string> = {
    groq: 'GROQ_API_KEY',
    gemini: 'GEMINI_API_KEY',
    openai: 'OPENAI_API_KEY',
  };
  const variable = keyVariable[provider];
  if (!variable) throw new Error('AI_PROVIDER must be explicitly set to groq, gemini, or openai.');
  const value = process.env[variable] || process.env.AI_API_KEY || '';
  if (!value.trim()) throw new Error(`The configured ${provider} credential is missing.`);
  return { variable, value };
}

function isolateProviderConfiguration(provider: string): void {
  const selected = safeModelKey(provider);
  for (const variable of ['AI_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY']) delete process.env[variable];
  process.env[selected.variable] = selected.value;
  process.env.AI_API_KEY = selected.value;
  process.env.AI_PROVIDER = provider;
}

async function hashFile(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

function readSseStream(response: Response, startedAt: number): Promise<{
  events: Record<string, unknown>[];
  firstTokenMs: number | null;
  completedAtMs: number;
}> {
  return (async () => {
    if (!response.body) throw new Error('The API did not return a response stream.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const eventDecoder = new SseJsonDecoder();
    const events: Record<string, unknown>[] = [];
    let firstTokenMs: number | null = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const parsed = eventDecoder.push(decoder.decode(value, { stream: true }));
      for (const event of parsed) {
        if (event.type === 'token' && firstTokenMs === null) firstTokenMs = performance.now() - startedAt;
        events.push(event);
      }
    }
    const tail = eventDecoder.push(decoder.decode(), true);
    for (const event of tail) {
      if (event.type === 'token' && firstTokenMs === null) firstTokenMs = performance.now() - startedAt;
      events.push(event);
    }
    return { events, firstTokenMs, completedAtMs: performance.now() - startedAt };
  })();
}

async function requestJson(baseUrl: string, token: string, endpoint: string, init?: RequestInit): Promise<any> {
  const response = await fetch(new URL(endpoint, baseUrl), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) throw new Error(`API request failed with HTTP ${response.status}.`);
  return response.json();
}

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  const option = (name: string, fallback: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] || '' : fallback;
  };
  const fixtures = JSON.parse(await readFile(fixturePath, 'utf8')) as FixtureFile;
  const counts = validateFixtures(fixtures);
  if (args.includes('--validate-only')) {
    console.log(`Fixture validation passed: Gita ${counts.gita.turns}/40 turns; safety ${counts.safety.turns}/40 turns; retrieval ${counts.retrieval.turns}/10 turns. No database or model was contacted.`);
    return;
  }

  const suiteChoice = option('--suite', 'all');
  const suites = selectedSuites(fixtures, suiteChoice);
  const runId = randomUUID();
  const targetDir = path.resolve(option('--output-dir', path.join(apiRoot, 'evaluation-results')));
  const jsonPath = path.join(targetDir, `live-evaluation-${runId}.json`);
  const summaryPath = path.join(targetDir, `live-evaluation-${runId}.md`);
  const startedAt = new Date().toISOString();
  const report: Record<string, any> = {
    schemaVersion: 1,
    runId,
    status: 'blocked',
    verdict: 'NOT SCORED — human review required',
    startedAt,
    finishedAt: null,
    suites: {},
    rubric: fixtures.rubric,
    metadata: { resultFilesContainRawAnswers: true, credentialsIncluded: false },
    failure: null,
  };

  let pool: any;
  let server: any;
  let failureStage = 'configuration';
  try {
    const databaseUrl = process.env.TALK_TO_KRISHNA_EVAL_DATABASE_URL;
    const expectedDatabase = process.env.TALK_TO_KRISHNA_EVAL_DATABASE_NAME;
    if (!databaseUrl || !expectedDatabase || !/^talk_to_krishna_eval_[a-z0-9_]+$/i.test(expectedDatabase)) {
      throw new Error('Set an explicit evaluation DATABASE_URL and database name beginning talk_to_krishna_eval_.');
    }
    const providerName = (process.env.AI_PROVIDER || '').trim().toLowerCase();
    isolateProviderConfiguration(providerName);
    process.env.DATABASE_URL = databaseUrl;
    process.env.NODE_ENV = 'test';
    process.env.TALK_TO_KRISHNA_EVALUATION_TRACE = 'true';

    failureStage = 'database-identification';
    const [{ pool: databasePool, db }, schema, authConfig, migrationStartup, appModule, providerFactory, modelTelemetry, jwtModule] = await Promise.all([
      import('../src/db/index.js'),
      import('../src/db/schema.js'),
      import('../src/modules/auth/auth-config.js'),
      import('../src/server-startup.js'),
      import('../src/index.js'),
      import('../src/modules/ai/ai-provider.factory.js'),
      import('../src/modules/ai/model-telemetry.js'),
      import('jsonwebtoken'),
    ]);
    pool = databasePool;
    const databaseIdentity = await pool.query('SELECT current_database() AS database_name, current_setting(\'server_version\') AS server_version');
    const actualDatabase = String(databaseIdentity.rows[0]?.database_name || '');
    if (actualDatabase !== expectedDatabase) throw new Error('The database name does not match the explicitly expected evaluation target.');
    const [countsQuery, vectorQuery] = await Promise.all([
      pool.query(`SELECT
        (SELECT count(*)::int FROM gita_verses) AS gita_verses,
        (SELECT count(*)::int FROM mahabharata_chunks) AS mahabharata_parent_chunks,
        (SELECT count(*)::int FROM mahabharata_child_chunks) AS mahabharata_child_chunks`),
      pool.query("SELECT extversion FROM pg_extension WHERE extname = 'vector'"),
    ]);
    const corpusCounts = countsQuery.rows[0];
    if (!vectorQuery.rows.length || Number(corpusCounts.gita_verses) === 0 || Number(corpusCounts.mahabharata_child_chunks) === 0) {
      throw new Error('The evaluation database is missing pgvector or required indexed source data.');
    }
    await migrationStartup.startApiAfterSchemaCheck(pool, () => undefined);
    authConfig.getJwtSecret();

    failureStage = 'model-configuration';
    const provider = providerFactory.AIProviderFactory.getProvider();
    if (provider.providerName !== providerName) throw new Error('The selected provider does not match AI_PROVIDER.');
    const model = modelTelemetry.resolveEffectiveModelName(provider.providerName);
    if (!model || model === 'unknown') throw new Error('The effective configured model could not be determined.');

    const app = appModule.default;
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('The in-process API did not bind to a TCP port.');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    failureStage = 'api-health';
    const health = await fetch(new URL('/api/v1/health', baseUrl));
    if (!health.ok) throw new Error('The API database health check failed.');

    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: apiRoot, encoding: 'utf8' }).trim();
    const promptVersion = {
      gitCommit: commit,
      personaSha256: await hashFile(path.join(apiRoot, 'src/modules/ai/krishna-persona.service.ts')),
      orchestratorSha256: await hashFile(path.join(apiRoot, 'src/modules/ai/ai-orchestrator.service.ts')),
    };
    report.status = 'running';
    report.environment = {
      apiMode: 'in-process real Express API',
      databaseName: actualDatabase,
      databaseServerVersion: databaseIdentity.rows[0].server_version,
      pgvectorVersion: vectorQuery.rows[0].extversion,
      corpusCounts: Object.fromEntries(Object.entries(corpusCounts).map(([key, value]) => [key, Number(value)])),
      provider: provider.providerName,
      model,
      promptVersion,
      nodeVersion: process.version,
    };

    let completedTurns = 0;
    for (const [suiteName, suite] of suites) {
      report.suites[suiteName] = { description: suite.description, scenarios: [] };
      for (const scenario of suite.scenarios) {
        failureStage = `${suiteName}:${scenario.id}:create-user`;
        const userId = randomUUID();
        const email = `eval+${runId.replaceAll('-', '')}-${scenario.id}@example.invalid`;
        await db.insert(schema.users).values({
          id: userId,
          email,
          displayName: `Evaluation ${scenario.id}`,
          isAnonymous: true,
          isVerified: true,
          tokenVersion: 1,
        });
        const jwt = jwtModule.default.sign({ sub: userId, email, isAnonymous: true, tokenVersion: 1 }, authConfig.getJwtSecret(), { expiresIn: '4h' });
        failureStage = `${suiteName}:${scenario.id}:create-conversation`;
        const created = await requestJson(baseUrl, jwt, '/api/v1/conversations', {
          method: 'POST',
          body: JSON.stringify({ title: `Evaluation ${scenario.id}` }),
        });
        const conversationId = created?.data?.id;
        if (typeof conversationId !== 'string') throw new Error('The API did not return a conversation ID.');

        const scenarioRecord: Record<string, any> = {
          id: scenario.id,
          groundingTargets: scenario.groundingTargets || [],
          reviewFocus: scenario.reviewFocus || scenario.safetyFocus || scenario.expectedBehavior || '',
          conversationId,
          turns: [],
          humanReview: { continuity: null, severeSafetyFailure: null, reviewer: null },
        };
        report.suites[suiteName].scenarios.push(scenarioRecord);
        for (let turnIndex = 0; turnIndex < scenario.turns.length; turnIndex++) {
          const turn = scenario.turns[turnIndex];
          failureStage = `${suiteName}:${scenario.id}:${turn.label}:send-message`;
          const requestStart = performance.now();
          const response = await fetch(new URL(`/api/v1/conversations/${conversationId}/messages`, baseUrl), {
            method: 'POST',
            headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: turn.user }),
          });
          if (!response.ok) throw new Error(`The message API returned HTTP ${response.status}.`);
          const stream = await readSseStream(response, requestStart);
          const errorEvent = stream.events.find(event => event.type === 'error');
          if (errorEvent) throw new Error(`The live application returned an error event (${String(errorEvent.errorCode || 'UNKNOWN')}).`);
          const evaluationEvent = stream.events.find(event => event.type === 'evaluation')?.evaluation as Record<string, unknown> | undefined;
          if (!evaluationEvent) throw new Error('The API evaluation trace was not returned; no result can be marked complete.');

          failureStage = `${suiteName}:${scenario.id}:${turn.label}:reload`;
          const loaded = await requestJson(baseUrl, jwt, `/api/v1/conversations/${conversationId}`);
          const messages = loaded?.data?.messages;
          if (!Array.isArray(messages) || loaded?.data?.id !== conversationId) throw new Error('Conversation reload did not return the same conversation.');
          const expectedMessageCount = (turnIndex + 1) * 2;
          if (messages.length !== expectedMessageCount) throw new Error('The persisted conversation did not contain the expected sequential user and assistant turns.');
          const persistedUser = messages.filter((message: any) => message.sender === 'user').at(-1);
          const persistedAssistant = messages.filter((message: any) => message.sender === 'krishna').at(-1);
          if (persistedUser?.content !== turn.user || !persistedAssistant?.content) throw new Error('The latest user or generated assistant turn did not persist as expected.');

          const audit = evaluationEvent.auditRecord as Record<string, any>;
          const rankedEvidence = Array.isArray(audit?.canonical_evidence) ? audit.canonical_evidence : [];
          const rankedIds = new Set<string>(rankedEvidence.map((evidence: any) => String(evidence.id)));
          const persistedCitations = Array.isArray(persistedAssistant.citations) ? persistedAssistant.citations : [];
          const citationIdentityCheck = persistedCitations.every((citation: any) =>
            citation.evidenceId && rankedIds.has(String(citation.evidenceId)) && citation.evidenceSourceType
          );
          const streamedCitations = stream.events.filter(event => event.type === 'citation').map(event => event.citation as Record<string, any>);
          const streamedEvidenceIds = new Set(streamedCitations.map(citation => String(citation?.evidenceId || citation?.id || '')));
          const persistedEvidenceIds = new Set(persistedCitations.map((citation: any) => String(citation.evidenceId || '')));
          const citationPersistenceCheck = streamedEvidenceIds.size === persistedEvidenceIds.size &&
            [...streamedEvidenceIds].every(id => persistedEvidenceIds.has(id));
          const debugEvent = stream.events.find(event => event.type === 'debug')?.debug as Record<string, unknown> | undefined;
          const telemetryEvent = stream.events.find(event => event.type === 'telemetry')?.telemetry as Record<string, unknown> | undefined;
          const citationProvenanceComplete = persistedCitations.every((citation: any) =>
            citation.evidenceSourceType && citation.source && citation.sourceReference &&
            (citation.evidenceSourceType === 'bhagavad_gita' || citation.evidenceSourceType === 'gita' || citation.parentChunkId)
          );
          const turnRecord = {
            index: turnIndex + 1,
            label: turn.label,
            user: turn.user,
            rewrittenQuery: debugEvent?.ragQuery || audit?.retrieval_query || null,
            retrieval: audit,
            answer: persistedAssistant.content,
            streamedCitations,
            persistedCitations,
            conversationId,
            persistedMessageCount: messages.length,
            latencyMs: Math.round(stream.completedAtMs),
            timeToFirstTokenMs: stream.firstTokenMs === null ? null : Math.round(stream.firstTokenMs),
            telemetry: telemetryEvent || null,
            checks: {
              traceCaptured: true,
              conversationIdStable: true,
              conversationReloaded: true,
              citationIdentityMatchesRetrievedEvidence: citationIdentityCheck,
              citationsMatchAfterReload: citationPersistenceCheck,
              citationProvenanceComplete,
            },
            scores: Object.fromEntries(dimensions.map(dimension => [dimension, null])),
          };
          scenarioRecord.turns.push(turnRecord);
          if (!citationIdentityCheck || !citationPersistenceCheck || !citationProvenanceComplete) {
            throw new Error('A persisted citation failed evidence identity or provenance validation.');
          }
          completedTurns++;
        }
        scenarioRecord.status = 'recorded_for_human_review';
      }
    }
    report.status = 'recorded_for_human_review';
    report.summary = { completedTurns, requiredTurns: suites.reduce((sum, [, suite]) => sum + suite.scenarios.reduce((n, scenario) => n + scenario.turns.length, 0), 0) };
  } catch (error) {
    report.status = 'blocked_or_failed';
    report.failure = { stage: failureStage, code: safeErrorCode(error), detail: safeFailureDetail(failureStage, error) };
  } finally {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    if (pool) await pool.end().catch(() => undefined);
    report.finishedAt = new Date().toISOString();
    await mkdir(targetDir, { recursive: true });
    await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');
    const completedTurns = report.summary?.completedTurns || 0;
    const requiredTurns = report.summary?.requiredTurns || suites.reduce((sum, [, suite]) => sum + suite.scenarios.reduce((n, scenario) => n + scenario.turns.length, 0), 0);
    const summary = [
      '# Live application evaluation run',
      '',
      `- Run ID: ${runId}`,
      `- Status: ${report.status}`,
      `- Turns recorded: ${completedTurns}/${requiredTurns}`,
      `- Result JSON: ${path.basename(jsonPath)}`,
      '- Human scoring: pending; no automatic quality scores are assigned.',
      '- The JSON contains raw answers for the fixed synthetic prompts. Review it before sharing and do not commit generated results.',
      report.failure ? `- Failure stage: ${report.failure.stage} (${report.failure.code}) — ${report.failure.detail}` : '',
      '',
      'The run status records execution and persistence only. It is not a release pass; reviewers must score every turn and inspect the recorded evidence and safety behavior.',
      '',
    ].filter(Boolean).join('\n');
    await writeFile(summaryPath, summary, 'utf8');
    console.log(`Live evaluation status: ${report.status}; turns recorded: ${completedTurns}/${requiredTurns}.`);
    console.log(`Human summary: ${summaryPath}`);
    console.log(`Machine results: ${jsonPath}`);
    if (report.status !== 'recorded_for_human_review') process.exitCode = 1;
  }
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entry) void run();
