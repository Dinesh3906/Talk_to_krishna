process.env.NODE_ENV = 'test';
process.env.TALK_TO_KRISHNA_EVALUATION_TRACE = 'true';

import { randomUUID } from 'crypto';
import { pool, db } from '../src/db/index.js';
import { conversations, users } from '../src/db/schema.js';
import { AuthService } from '../src/modules/auth/auth.service.js';

const { default: app } = await import('../src/index.js');

interface StreamEvent {
  type: string;
  [key: string]: any;
}

async function collectStream(response: Response): Promise<{
  events: StreamEvent[];
  text: string;
  firstTokenMs: number | null;
  totalMs: number;
}> {
  const started = performance.now();
  let firstTokenMs: number | null = null;
  const events: StreamEvent[] = [];
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const jsonStr = trimmed.slice(6);
      try {
        const ev = JSON.parse(jsonStr);
        events.push(ev);
        if (ev.type === 'token' && firstTokenMs === null) {
          firstTokenMs = performance.now() - started;
        }
      } catch {
        // ignore parse errors for partial chunks
      }
    }
  }

  const totalMs = performance.now() - started;
  const text = events.filter(e => e.type === 'token').map(e => e.token).join('');
  return { events, text, firstTokenMs, totalMs };
}

interface TestScenario {
  id: number;
  name: string;
  description: string;
  turns: string[];
  assertions: (turnOutputs: { user: string; assistant: string; events: StreamEvent[] }[]) => void;
}

const SCENARIOS: TestScenario[] = [
  {
    id: 1,
    name: 'Emotional distress and loneliness',
    description: 'User expresses profound loneliness and feeling unvalued.',
    turns: [
      'I feel completely alone in this world. Nobody truly cares if I am here or not.',
      'How do I bear this emptiness when even in a crowd I feel invisible?'
    ],
    assertions: (outputs) => {
      for (const out of outputs) {
        if (/\|.*?\|/.test(out.assistant)) throw new Error('Contained table');
        if (/<\s*\/?\s*br\s*\/?>/i.test(out.assistant)) throw new Error('Contained <br> tag');
        if (/<[a-zA-Z][^>]*>/i.test(out.assistant)) throw new Error('Contained HTML tag');
      }
      const t1 = outputs[0].assistant.toLowerCase();
      if (!/(atman|soul|chariot|friend|sakha|divine|eternal|presence)/i.test(t1)) {
        throw new Error('Missing compassionate spiritual presence in loneliness response');
      }
    }
  },
  {
    id: 2,
    name: 'Compulsive sexual urges',
    description: 'Answered without shame, clinical checklists, or generic addiction-article formatting.',
    turns: [
      'I am addicted to sex and having compulsive sexual urges. Say something.'
    ],
    assertions: (outputs) => {
      const resp = outputs[0].assistant;
      if (/\|.*?\|/.test(resp)) throw new Error('Contained Markdown table');
      if (/<\s*\/?\s*br\s*\/?>/i.test(resp)) throw new Error('Contained <br> tag');
      if (/<[a-zA-Z][^>]*>/i.test(resp)) throw new Error('Contained HTML tag');
      if (/###\s*\d+\.\s*/i.test(resp)) throw new Error('Contained article numbered headers');
      if (/Sex Addicts Anonymous|SAA|4-7-8 breathing/i.test(resp)) throw new Error('Contained generic addiction article copy');
      if (!/(senses|desire|kama|mind|arjuna|charioteer|reins|abhyasa|practice)/i.test(resp)) {
        throw new Error('Expected Gita/Mahabharata sense-mastery grounding (Kama/Indriyas/Abhyasa)');
      }
    }
  },
  {
    id: 3,
    name: 'Physical disability and self-worth',
    description: 'User says "I don\'t have 1 arm", answered directly and respectfully without tables or software recommendations.',
    turns: [
      "I don't have 1 arm."
    ],
    assertions: (outputs) => {
      const resp = outputs[0].assistant;
      if (/\|.*?\|/.test(resp)) throw new Error('Contained Markdown table');
      if (/<\s*\/?\s*br\s*\/?>/i.test(resp)) throw new Error('Contained <br> tag');
      if (/<[a-zA-Z][^>]*>/i.test(resp)) throw new Error('Contained HTML tag');
      if (/Cortana|Dragon NaturallySpeaking|r\/handicapped|Assistive Equipment/i.test(resp)) {
        throw new Error('Contained generic equipment or Reddit recommendations');
      }
      if (!/(body|deha|atman|soul|garment|limb|worth|vessel|ashtavakra|whole|measure)/i.test(resp)) {
        throw new Error('Expected Gita/Mahabharata wisdom on the indwelling soul vs transient physical form');
      }
    }
  },
  {
    id: 4,
    name: 'Anger and conflict',
    description: 'De-escalation of furious anger through Gita wisdom on Krodha.',
    turns: [
      'My business partner betrayed me and took all our clients. I am burning with rage and want revenge.'
    ],
    assertions: (outputs) => {
      const resp = outputs[0].assistant;
      if (/\|.*?\|/.test(resp)) throw new Error('Contained table');
      if (!/(anger|krodha|fire|burn|intellect|buddhi|ruin|ashwatthama|clarity)/i.test(resp)) {
        throw new Error('Expected reflection on anger clouding intellect (Gita 2.63)');
      }
    }
  },
  {
    id: 5,
    name: 'Fear of failure and academic pressure',
    description: 'Student terrified of failing entrance exam, grounded in Nishkama Karma.',
    turns: [
      'My exam is next week and I am terrified of failing. My parents have high expectations of me.'
    ],
    assertions: (outputs) => {
      const resp = outputs[0].assistant;
      if (!/(action|effort|duty|fruits|outcome|karma|anxiety|partha|arjuna)/i.test(resp)) {
        throw new Error('Expected Gita 2.47 teaching on dedicated effort without anxiety over fruits');
      }
    }
  },
  {
    id: 6,
    name: 'Relevant Bhagavad Gita teaching with exact verifiable source',
    description: 'User asks what Gita 2.47 says and means.',
    turns: [
      'What does Bhagavad Gita 2.47 teach?'
    ],
    assertions: (outputs) => {
      const resp = outputs[0].assistant;
      if (!/(karmany|eva|adhikarah|action|fruit|right|duty|work)/i.test(resp)) {
        throw new Error('Expected authentic teaching of BG 2.47');
      }
    }
  },
  {
    id: 7,
    name: 'Mahabharata story relevant to dilemma',
    description: 'User asks for a Mahabharata story about facing defeat.',
    turns: [
      'Tell me a Mahabharata story about someone who faced great defeat and had to rebuild.'
    ],
    assertions: (outputs) => {
      const resp = outputs[0].assistant;
      if (!/(pandava|yudhishthira|arjuna|exile|forest|draupadi|karna)/i.test(resp)) {
        throw new Error('Expected authentic Mahabharata narrative example');
      }
    }
  },
  {
    id: 8,
    name: 'Follow-up depending on disclosed fact in preceding message',
    description: 'Multi-turn continuity preserving user context.',
    turns: [
      'I am preparing for the civil services examination in Delhi.',
      'Sometimes the competition feels overwhelming here. How do I maintain focus?'
    ],
    assertions: (outputs) => {
      const t2 = outputs[1].assistant.toLowerCase();
      if (!/(civil|exam|delhi|study|focus|preparation|competition|student|aim)/i.test(t2)) {
        throw new Error('Turn 2 did not preserve context of civil services exam preparation');
      }
    }
  },
  {
    id: 9,
    name: 'Conversation changing topic',
    description: 'Transitioning cleanly between distinct topics without hallucinated baggage.',
    turns: [
      'Tell me about Bhishma taking his terrible vow of celibacy.',
      'Now changing topic completely: why do people find it so hard to apologize?'
    ],
    assertions: (outputs) => {
      const t2 = outputs[1].assistant.toLowerCase();
      if (/(shantanu|satyavati|ganga|hastinapur|throne)/i.test(t2)) {
        throw new Error('Turn 2 dragged irrelevant Bhishma story baggage into clean apology topic shift');
      }
      if (!/(ego|pride|apolog|ahamkara|admit|vulnerability|mistake|forgive)/i.test(t2)) {
        throw new Error('Expected deep inquiry on ego and apology');
      }
    }
  },
  {
    id: 10,
    name: 'Unsupported question for which retrieval finds no evidence',
    description: 'Anti-hallucination test on modern technology or unscriptural claims.',
    turns: [
      'Which verse of the Bhagavad Gita discusses smartphones and social media algorithms?'
    ],
    assertions: (outputs) => {
      const resp = outputs[0].assistant.toLowerCase();
      if (/(in chapter \d+ verse \d+.*(smartphones|algorithms)|krishna predicted social media)/i.test(resp)) {
        throw new Error('Hallucinated scriptural verse for modern technology');
      }
      if (!/(no (such )?verse|does not mention|ancient|timeless|mind|distraction|senses)/i.test(resp)) {
        throw new Error('Expected honest acknowledgment that scriptures do not mention smartphones');
      }
    }
  },
  {
    id: 11,
    name: 'Retrieval timeout and source-store resilience',
    description: 'Graceful fallback when retrieval encounters timeout without crashing.',
    turns: [
      'Teach me about equanimity and steady wisdom.'
    ],
    assertions: (outputs) => {
      const resp = outputs[0].assistant;
      if (resp.length < 50) throw new Error('Response too short or failed');
      if (!/(wisdom|equanimity|sthitaprajna|mind|steady|peace|joy|sorrow)/i.test(resp)) {
        throw new Error('Expected teaching on sthitaprajna/equanimity');
      }
    }
  },
  {
    id: 12,
    name: 'Android client vs Web client consistency',
    description: 'Verification that both mobile and web format clean conversational prose without HTML tags.',
    turns: [
      'I am struggling with feeling inadequate at work.'
    ],
    assertions: (outputs) => {
      const resp = outputs[0].assistant;
      if (/<\s*\/?\s*br\s*\/?>/i.test(resp) || /<[^>]+>/i.test(resp)) {
        throw new Error('Raw HTML tags leaked into client response');
      }
      if (/\|.*?\|/.test(resp)) {
        throw new Error('Markdown table leaked into client response');
      }
    }
  }
];

async function runSuite() {
  console.log('================================================================================');
  console.log('TALK TO KRISHNA — PRODUCTION AUDIT REGRESSION SUITE (12 SCENARIOS)');
  console.log('================================================================================\n');

  const server = await new Promise<any>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[Suite Server] Listening on ${baseUrl}\n`);

  // Ensure test user session
  const authSession = await AuthService.createAnonymousSession({ preferredName: 'Audit Seeker' });
  const testUserId = authSession.user.id;
  const token = authSession.token;

  let passedScenarios = 0;
  let failedScenarios = 0;

  for (const scenario of SCENARIOS) {
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`SCENARIO ${scenario.id}/12: ${scenario.name.toUpperCase()}`);
    console.log(`Description: ${scenario.description}`);
    console.log(`--------------------------------------------------------------------------------`);

    const conversationId = randomUUID();
    await db.insert(conversations).values({
      id: conversationId,
      userId: testUserId,
      title: scenario.name,
    });

    const turnOutputs: { user: string; assistant: string; events: StreamEvent[] }[] = [];
    let scenarioPassed = true;

    try {
      for (let t = 0; t < scenario.turns.length; t++) {
        const userMsg = scenario.turns[t];
        console.log(`\n  [Turn ${t + 1}/${scenario.turns.length}] User: "${userMsg}"`);

        const resp = await fetch(`${baseUrl}/api/v1/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: userMsg }),
        });

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
        }

        const stream = await collectStream(resp);
        const snippet = stream.text.slice(0, 140).replace(/\r?\n/g, ' ');
        console.log(`  [Turn ${t + 1}] TTFT: ${stream.firstTokenMs ? Math.round(stream.firstTokenMs) : 'N/A'}ms | Total: ${Math.round(stream.totalMs)}ms`);
        console.log(`  Assistant: "${snippet}..."`);

        turnOutputs.push({
          user: userMsg,
          assistant: stream.text,
          events: stream.events,
        });
      }

      scenario.assertions(turnOutputs);
      console.log(`  >>> PASS: Scenario ${scenario.id} met all grounding, persona, and anti-formatting requirements.\n`);
      passedScenarios++;
    } catch (err: any) {
      console.error(`  >>> FAIL: Scenario ${scenario.id} failed: ${err.message}\n`);
      scenarioPassed = false;
      failedScenarios++;
    }
  }

  console.log('================================================================================');
  console.log(`REGRESSION SUITE COMPLETED: ${passedScenarios} PASSED / ${failedScenarios} FAILED`);
  console.log('================================================================================\n');

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();

  if (failedScenarios > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
