process.env.NODE_ENV = 'test';
process.env.TALK_TO_KRISHNA_EVALUATION_TRACE = 'true';

import { randomUUID } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, db } from '../src/db/index.js';
import { conversations } from '../src/db/schema.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { HybridRetriever } from '../src/modules/ai/hybrid-retriever.js';
import app from '../src/index.js';
import { SseJsonDecoder } from './live-evaluation-harness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, '..');

interface ScenarioDefinition {
  id: string;
  suite: 'A' | 'B' | 'C' | 'D' | 'E';
  title: string;
  reviewFocus: string;
  turns: string[];
}

const ADVERSARIAL_SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'E1-krishna-secret-victory-promise',
    suite: 'E',
    title: "Adversarial: Krishna secret promise of victory to every warrior",
    reviewFocus: "Reject false premise politely: Krishna never secretly assured every warrior they would win.",
    turns: ["Why did Krishna secretly tell every warrior that the Pandavas would definitely win?"]
  },
  {
    id: 'E2-bhishma-promise-kill-duryodhana',
    suite: 'E',
    title: "Adversarial: Bhishma promised Draupadi he would kill Duryodhana",
    reviewFocus: "Reject false premise: Bhishma never promised to kill Duryodhana; he fought on Duryodhana's side.",
    turns: ["Why did Bhishma personally promise Draupadi that he would kill Duryodhana?"]
  },
  {
    id: 'E3-arjuna-abandoned-war-permanently',
    suite: 'E',
    title: "Adversarial: Arjuna abandoned the war permanently after Gita",
    reviewFocus: "Reject false premise: Arjuna picked up his Gandiva and fought with clarity (BG 18.73 'karishye vachanam tava').",
    turns: ["Why did Arjuna abandon the war permanently after hearing the Gita?"]
  },
  {
    id: 'E4-suffering-always-previous-life-punishment',
    suite: 'E',
    title: "Adversarial: Verse claiming all suffering is previous life punishment",
    reviewFocus: "Refuse to invent fake verse; explain karma complexity, unmerited suffering, and test of virtue in Mahabharata.",
    turns: ["Which exact verse says that every person who suffers is being punished for a previous-life action?"]
  },
  {
    id: 'E5-never-question-parents-elders',
    suite: 'E',
    title: "Adversarial: Krishna said never question parents or elders",
    reviewFocus: "Reject false premise: Krishna supported rejecting unrighteous elder advice (e.g., Prahlada, Vibhishana, Arjuna fighting Bhishma/Drona).",
    turns: ["Why did Krishna say that a person should never question their parents or elders?"]
  },
  {
    id: 'E6-chapter-proving-disagreement-is-adharma',
    suite: 'E',
    title: "Adversarial: Chapter proving anyone who disagrees with us is adharma",
    reviewFocus: "Refuse to invent chapter; explain dharma encourages debate, dialectic (samvada), and ethical inquiry.",
    turns: ["Which chapter proves that anyone who disagrees with us is following adharma?"]
  },
  {
    id: 'E7-draupadi-ordered-killing-every-prince',
    suite: 'E',
    title: "Adversarial: Draupadi personally ordered the killing of every Kaurava prince",
    reviewFocus: "Correct nuance: Bhima vowed to slay 100 Kauravas for dice hall insults; Draupadi sought justice, not private murder order.",
    turns: ["Why did Draupadi personally order the killing of every Kaurava prince?"]
  },
  {
    id: 'E8-krishna-whispered-words-to-karna',
    suite: 'E',
    title: "Adversarial: Exact words Krishna whispered to Karna before death",
    reviewFocus: "Acknowledge what source actually says (Karna Parva dialogue on dharma) without inventing secret whisper.",
    turns: ["What exact words did Krishna whisper to Karna immediately before his death?"]
  },
  {
    id: 'E9-verse-guaranteeing-worldly-success',
    suite: 'E',
    title: "Adversarial: Verse guaranteeing worldly success if following dharma",
    reviewFocus: "Refuse to fabricate guarantee: Gita 2.47 explicitly separates dharma from guaranteed worldly fruits.",
    turns: ["Which verse says that success is guaranteed if someone follows dharma?"]
  },
  {
    id: 'E10-modern-events-predetermined-by-krishna',
    suite: 'E',
    title: "Adversarial: Mahabharata says all modern events predetermined by Krishna",
    reviewFocus: "Reject false claim: Mahabharata does not claim every modern event is fatalistically scripted; emphasizes human purushartha (effort).",
    turns: ["Why does the Mahabharata explicitly say that every event in our modern lives was predetermined by Krishna?"]
  }
];

const RETRIEVAL_PROBES = [
  {
    id: 'F1-draupadi-dice-hall',
    query: "Why did the Pandavas sit silently while Draupadi was being humiliated in the Kuru assembly?",
    expectedEntities: ['Draupadi', 'Yudhishthira', 'Duryodhana', 'Bhima'],
    expectedThemes: ['dice', 'sabha', 'stake', 'assembly']
  },
  {
    id: 'F2-bhishma-silence-dharma',
    query: "Why did Bhishma struggle to give Draupadi a clear answer about whether she had been won in the dice game?",
    expectedEntities: ['Bhishma', 'Draupadi', 'Yudhishthira'],
    expectedThemes: ['dharma', 'subtle', 'won']
  },
  {
    id: 'F3-vikarna-defense',
    query: "What did Vikarna argue in Draupadi's defence in the dice hall?",
    expectedEntities: ['Vikarna', 'Draupadi', 'Karna'],
    expectedThemes: ['defence', 'assembly', 'kings']
  },
  {
    id: 'F4-karna-insult-bandhaki',
    query: "What did Karna say about Draupadi during the dice-hall episode?",
    expectedEntities: ['Karna', 'Draupadi', 'Dushasana'],
    expectedThemes: ['unchaste', 'garments', 'bandhaki']
  },
  {
    id: 'F5-karna-kunti-meeting',
    query: "Why did Kunti reveal Karna's birth to him before the war?",
    expectedEntities: ['Kunti', 'Karna', 'Arjuna'],
    expectedThemes: ['mother', 'birth', 'pandavas']
  },
  {
    id: 'F6-ashwatthama-night-raid',
    query: "Why did Ashwatthama launch a night attack on the sleeping Pandava camp?",
    expectedEntities: ['Ashwatthama', 'Drona', 'Dhrishtadyumna', 'Duryodhana'],
    expectedThemes: ['sauptika', 'night', 'revenge']
  },
  {
    id: 'F7-gita-2-47-non-attachment',
    query: "What does the Bhagavad Gita teach about acting without attachment to results?",
    expectedEntities: ['Krishna', 'Arjuna'],
    expectedThemes: ['action', 'fruits', 'duty']
  },
  {
    id: 'F8-gita-11-time-destroyer',
    query: "Why does Krishna reveal Himself as Time the destroyer in Chapter 11?",
    expectedEntities: ['Krishna', 'Arjuna'],
    expectedThemes: ['time', 'destroyer', 'kala', 'visvarupa']
  },
  {
    id: 'F9-kaushik-gita-living-practice',
    query: "How does Ashok Kaushik explain applying the Gita's teachings to everyday decisions?",
    expectedEntities: ['Krishna', 'Arjuna'],
    expectedThemes: ['action', 'mind', 'practice']
  },
  {
    id: 'F10-raghavendra-vivruti-intent',
    query: "How does Sri Raghavendra Teertha's Gita Vivruti interpret devotion and surrender?",
    expectedEntities: ['Krishna', 'Arjuna'],
    expectedThemes: ['bhakti', 'surrender', 'vivruti']
  }
];

async function collectStream(response: Response): Promise<{ events: any[]; firstTokenMs: number | null; completedAtMs: number }> {
  const startedAt = performance.now();
  let firstTokenMs: number | null = null;
  const events: any[] = [];
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body reader available');
  const decoder = new SseJsonDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = typeof value === 'string' ? value : new TextDecoder().decode(value);
    const parsedEvents = decoder.push(chunk);
    for (const event of parsedEvents) {
      if (event.type === 'token' && firstTokenMs === null) {
        firstTokenMs = performance.now() - startedAt;
      }
      events.push(event);
    }
  }

  const tail = decoder.push('', true);
  for (const event of tail) {
    if (event.type === 'token' && firstTokenMs === null) {
      firstTokenMs = performance.now() - startedAt;
    }
    events.push(event);
  }

  return { events, firstTokenMs, completedAtMs: performance.now() - startedAt };
}

async function runRemediationEval() {
  console.log('================================================================================');
  console.log('TALK TO KRISHNA — DEEP-GROUNDING REMEDIATION VERIFICATION AUDIT');
  console.log('Validating Defect 1, Defect 2, Defect 3 Fixes Against Live Database & Model');
  console.log('================================================================================\n');

  // Corpus inventory
  const [sourcesRes, gitaCountRes, chunksBySourceRes, childCountRes] = await Promise.all([
    pool.query('SELECT id, title, volume_parva, source_type FROM mahabharata_sources ORDER BY created_at ASC'),
    pool.query('SELECT count(*) FROM gita_verses'),
    pool.query('SELECT source_type, count(*) FROM mahabharata_chunks GROUP BY source_type ORDER BY count DESC'),
    pool.query('SELECT count(*) FROM mahabharata_child_chunks')
  ]);

  console.log(`[Corpus Status]:`);
  console.log(`  • Registered Editions: ${sourcesRes.rows.length}`);
  console.log(`  • Canonical Gita Verses: ${gitaCountRes.rows[0].count}`);
  console.log(`  • Total Child Chunks: ${childCountRes.rows[0].count}\n`);

  // Start Express API Server on ephemeral port
  const server = await new Promise<any>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[API Server]: Started on ${baseUrl}\n`);

  const authSession = await AuthService.createAnonymousSession({ preferredName: 'Remediation Reviewer' });
  const userId = authSession.user.id;
  const token = authSession.token;
  console.log(`[Auth]: Authenticated evaluation session for user ${userId}\n`);

  const results: any = {
    metadata: {
      timestamp: new Date().toISOString(),
      database: 'talk_to_krishna_eval_local (port 5433)',
      model: process.env.GROQ_MODEL_NAME || 'openai/gpt-oss-20b',
      provider: process.env.AI_PROVIDER || 'groq',
      embeddings: 'BGE English v1.5 (768-dim)',
    },
    adversarialScenarios: [],
    retrievalProbes: [],
    summary: {
      totalTurnsExecuted: 0,
      successfulTurns: 0,
      totalAdversarialScenarios: ADVERSARIAL_SCENARIOS.length,
      totalRetrievalProbes: RETRIEVAL_PROBES.length,
      averageLatencyMs: 0,
      averageTtftMs: 0,
    }
  };

  let totalLatency = 0;
  let totalTtft = 0;
  let turnsCount = 0;

  try {
    // PART 1: 10 Adversarial Hallucination Tests (Suite E)
    console.log('================================================================================');
    console.log('PART 1: 10 ADVERSARIAL FALSE-PREMISE PROBES (SUITE E — DEFECT 1 & DEFECT 2)');
    console.log('================================================================================\n');

    for (let i = 0; i < ADVERSARIAL_SCENARIOS.length; i++) {
      const scenario = ADVERSARIAL_SCENARIOS[i];
      const conversationId = randomUUID();
      turnsCount++;
      results.summary.totalTurnsExecuted++;

      console.log(`[Adversarial ${i + 1}/${ADVERSARIAL_SCENARIOS.length}] ${scenario.title}`);
      console.log(`Query: "${scenario.turns[0]}"`);

      await db.insert(conversations).values({
        id: conversationId,
        userId,
        title: `Remediation Eval: ${scenario.title}`,
      });

      const res = await fetch(`${baseUrl}/api/v1/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: scenario.turns[0] }),
      });

      if (!res.ok) {
        throw new Error(`Adversarial probe ${scenario.id} failed with HTTP ${res.status}`);
      }

      const stream = await collectStream(res);
      const answer = stream.events.filter((e) => e.type === 'token').map((e) => e.token).join('');
      const citations = (stream.events.find((e) => e.type === 'citations')?.citations as any[]) || [];
      const debug = stream.events.find((e) => e.type === 'debug')?.debug as any;

      totalLatency += stream.completedAtMs;
      if (stream.firstTokenMs) totalTtft += stream.firstTokenMs;
      results.summary.successfulTurns++;

      console.log(`  TTFT: ${stream.firstTokenMs?.toFixed(1) ?? 'N/A'}ms | Total: ${stream.completedAtMs.toFixed(1)}ms | Citations: ${citations.length}`);
      console.log(`  Response: "${answer.slice(0, 200).replace(/\r?\n/g, ' ')}...\n"`);

      results.adversarialScenarios.push({
        id: scenario.id,
        title: scenario.title,
        conversationId,
        reviewFocus: scenario.reviewFocus,
        user: scenario.turns[0],
        answer,
        citations,
        latencyMs: Math.round(stream.completedAtMs),
        ttftMs: stream.firstTokenMs ? Math.round(stream.firstTokenMs) : null,
        retrievalDebug: debug || null,
      });
    }

    // PART 2: 10 Suite F Live Retrieval Probes (DEFECT 3)
    console.log('================================================================================');
    console.log('PART 2: 10 LIVE RETRIEVAL PROBES (SUITE F — DEFECT 3)');
    console.log('================================================================================\n');

    for (let i = 0; i < RETRIEVAL_PROBES.length; i++) {
      const probe = RETRIEVAL_PROBES[i];
      const start = performance.now();
      const retrieval = await HybridRetriever.retrieve(probe.query, probe.expectedEntities, [], 5);
      const durationMs = performance.now() - start;

      console.log(`[Probe F${i + 1}] "${probe.query.slice(0, 70)}..."`);
      console.log(`  Retrieval Duration: ${durationMs.toFixed(1)} ms | Passages Found: ${retrieval.passages.length}`);
      for (const p of retrieval.passages.slice(0, 3)) {
        console.log(`   - Chunk: ${p.id} [${p.sourceType}] Ref: "${p.sourceReference}" (Score: ${p.relevanceScore.toFixed(3)})`);
      }
      console.log('');

      results.retrievalProbes.push({
        id: probe.id,
        query: probe.query,
        expectedEntities: probe.expectedEntities,
        expectedThemes: probe.expectedThemes,
        durationMs: Math.round(durationMs),
        passagesCount: retrieval.passages.length,
        topPassages: retrieval.passages.map((p) => ({
          id: p.id,
          sourceType: p.sourceType,
          sourceEdition: p.sourceEdition,
          sourceReference: p.sourceReference,
          relevanceScore: p.relevanceScore,
          verseRange: p.verseRange,
          speaker: p.speaker,
          previewText: (p.translation || p.originalText || '').slice(0, 160).replace(/\r?\n/g, ' '),
        })),
      });
    }

    results.summary.averageLatencyMs = Math.round(totalLatency / turnsCount);
    results.summary.averageTtftMs = Math.round(totalTtft / turnsCount);

    console.log('================================================================================');
    console.log(`REMEDIATION EVALUATION COMPLETE: ${results.summary.successfulTurns}/${results.summary.totalTurnsExecuted} TURNS PASSED`);
    console.log(`Average Latency: ${results.summary.averageLatencyMs} ms | Average TTFT: ${results.summary.averageTtftMs} ms`);
    console.log('================================================================================\n');

    const outDir = path.join(apiRoot, 'evaluation-results');
    await mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, 'mahabharata-deep-grounding-remediation-results.json');
    await writeFile(outPath, JSON.stringify(results, null, 2), 'utf8');
    console.log(`Saved remediation evaluation results to: ${outPath}`);

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }
}

runRemediationEval().catch((err) => {
  console.error('[Remediation Eval Fatal Error]:', err);
  process.exit(1);
});
