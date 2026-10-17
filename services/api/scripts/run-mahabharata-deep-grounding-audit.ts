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

const MULTI_TURN_SCENARIOS: ScenarioDefinition[] = [
  // Suite A: Draupadi, Dice Hall & Silence of Elders
  {
    id: 'A1-pandavas-silence',
    suite: 'A',
    title: "Why did the Pandavas remain silent during Draupadi's humiliation?",
    reviewFocus: "Examine dice game rules, Yudhishthira's authority, Bhima's restraint, and assembly failure.",
    turns: [
      "Why did the Pandavas sit silently while Draupadi was being humiliated in the Kuru assembly? They were great warriors, so why didn't they stop it?",
      "Were they afraid of Duryodhana, or were they bound by the rules of the dice game?",
      "If Yudhishthira had already lost his freedom, did he still have the authority to stake Draupadi?",
      "Was Bhima wrong to remain restrained instead of immediately attacking Duryodhana?",
      "Who bears the greatest responsibility for what happened in that assembly?"
    ]
  },
  {
    id: 'A2-elders-silence',
    suite: 'A',
    title: "Why did no elder stop Draupadi's humiliation?",
    reviewFocus: "Bhishma's subtle dharma dilemma, Drona/Kripa obligations, Dhritarashtra's complicity, rules vs adharma.",
    turns: [
      "Why did Bhishma, Drona, Dhritarashtra and the other powerful elders fail to stop Draupadi's humiliation? Didn't they know what dharma required?",
      "Why did Bhishma struggle to give Draupadi a clear answer about whether she had been won?",
      "Was Bhishma protecting the throne, obeying his commitments, or genuinely confused about dharma?",
      "Why didn't Drona or Kripacharya intervene more forcefully?",
      "Does this episode show that following rules can sometimes become adharma?"
    ]
  },
  {
    id: 'A3-draupadi-question',
    suite: 'A',
    title: "Why did Draupadi question Yudhishthira's right to stake her?",
    reviewFocus: "Legal vs moral question, Vikarna's defense, Karna's opposition, limits of legalistic rules.",
    turns: [
      "Why did Draupadi ask whether Yudhishthira had lost himself before staking her? What was the importance of that question?",
      "Why was her question so difficult for the assembly to answer?",
      "What did Vikarna argue in her defence?",
      "Why did Karna oppose Draupadi despite the arguments raised on her behalf?",
      "What does this dispute reveal about the limits of legal rules when dharma is at stake?"
    ]
  },
  {
    id: 'A4-draupadi-call-krishna',
    suite: 'A',
    title: "Why did Draupadi call upon Krishna?",
    reviewFocus: "Narrative description vs devotional retelling, Krishna's presence/absence, textual variations.",
    turns: [
      "Why did Draupadi call upon Krishna during the attempted disrobing? What exactly does the Mahabharata describe happening?",
      "Does the source explicitly describe divine intervention, or are different accounts told in different ways?",
      "What is the difference between the narrative event and its devotional interpretation?",
      "Why did Krishna not prevent the dice game before Draupadi was humiliated?",
      "How should a reader understand this episode without inventing details that are not in the source?"
    ]
  },

  // Suite B: Decisions, Duty & Moral Contradictions
  {
    id: 'B1-yudhishthira-gambling',
    suite: 'B',
    title: "Why did Yudhishthira gamble even though he knew the risks?",
    reviewFocus: "Kshatriya convention, invitation compulsion, pride/weakness, continuing after losses, responsibility.",
    turns: [
      "Why did Yudhishthira agree to gamble when he was a king who should have protected his family and kingdom?",
      "Was he pressured by the invitation, bound by royal conventions, or overcome by his own weakness?",
      "Why did he continue after losing valuable possessions?",
      "Does being committed to a rule justify continuing when the consequences become disastrous?",
      "How should we evaluate his responsibility without pretending his actions were harmless?"
    ]
  },
  {
    id: 'B2-karna-support-duryodhana',
    suite: 'B',
    title: "Why did Karna support Duryodhana against Draupadi?",
    reviewFocus: "Gratitude to Duryodhana vs dharma, exclusion trauma, non-excusable moral failure, complexity.",
    turns: [
      "Karna was a great warrior and had suffered humiliation himself. Why did he participate in Draupadi's humiliation?",
      "Was his loyalty to Duryodhana more important to him than justice?",
      "How did Karna's own experiences of exclusion influence his choices?",
      "Can personal suffering explain harmful behaviour without excusing it?",
      "Does Karna's generosity in other situations make his conduct in the dice hall less serious?"
    ]
  },
  {
    id: 'B3-bhishma-allegiance',
    suite: 'B',
    title: "Why did Bhishma fight for the Kauravas?",
    reviewFocus: "Vows to Hastinapura throne, obligation vs endorsement, knowing Pandavas were righteous, limits of duty.",
    turns: [
      "Bhishma knew the Pandavas were related to him and had strong claims. Why did he fight on the Kaurava side?",
      "How did his vows and obligations to the throne affect his decision?",
      "Did Bhishma believe Duryodhana was right?",
      "Why did he continue fighting despite his concerns?",
      "Does loyalty remain dharma when the person or institution receiving that loyalty acts unjustly?"
    ]
  },
  {
    id: 'B5-krishna-peace-mission',
    suite: 'B',
    title: "Why did Krishna attempt peace before the war?",
    reviewFocus: "Five villages proposal, establishing moral responsibility, Duryodhana's refusal, diplomatic purpose.",
    turns: [
      "If Krishna knew that the war was coming, why did he still go to the Kaurava court as a peace envoy?",
      "Why was the offer associated with five villages important?",
      "Why did Duryodhana refuse to compromise?",
      "Was Krishna trying to prevent the war, establish responsibility, or accomplish several things at once?",
      "What can we conclude from the peace mission without claiming to know motives that the source does not state?"
    ]
  },
  {
    id: 'B7-karna-death-controversy',
    suite: 'B',
    title: "Why was Karna's death so controversial?",
    reviewFocus: "Chariot wheel stuck, curse, Krishna invoking Karna's past violations (Abhimanyu, Draupadi), combat ethics.",
    turns: [
      "Why did Krishna encourage Arjuna to attack Karna when Karna was in a vulnerable position?",
      "What happened with Karna's chariot and weapons in the version indexed here?",
      "How did Krishna invoke Karna's earlier actions when addressing the situation?",
      "Was the killing consistent with the war's rules?",
      "How should we evaluate the moral tension without pretending the epic offers a simple answer?"
    ]
  },

  // Suite C: Krishna's Choices & Bhagavad Gita
  {
    id: 'C2-krishna-advise-arjuna-fight',
    suite: 'C',
    title: "Why did Krishna advise Arjuna to fight?",
    reviewFocus: "Arjuna's dejection, svadharma vs personal attachment, preventing adharma, responsible application.",
    turns: [
      "Why did Krishna tell Arjuna to fight when his enemies included his relatives, teachers and elders?",
      "What was Arjuna's moral crisis before the Bhagavad Gita began?",
      "How does Krishna distinguish personal attachment from responsibility in Arjuna's particular situation?",
      "Does the teaching mean everyone should fight anyone they consider wrong?",
      "How can the Gita be applied responsibly to a modern conflict without treating every disagreement as Kurukshetra?"
    ]
  },
  {
    id: 'C4-krishna-vishvarupa',
    suite: 'C',
    title: "Why did Krishna reveal the Vishvarupa?",
    reviewFocus: "Arjuna's request in BG 11, vision of Kala (Time), warriors already slain, theological & narrative role.",
    turns: [
      "Why did Krishna reveal the Vishvarupa to Arjuna in the Bhagavad Gita?",
      "What was Arjuna asking or struggling with before the revelation?",
      "What does Arjuna experience when he sees the universal form?",
      "How does the revelation relate to Krishna's teaching about time, action, and the fate of warriors?",
      "How should the episode be explained to someone who wants to understand both its theological meaning and its narrative purpose?"
    ]
  },

  // Suite D: Exile, Family & Difficult Episodes
  {
    id: 'D3-draupadi-yudhishthira-forgiveness',
    suite: 'D',
    title: "Why did Draupadi challenge Yudhishthira's patience during exile?",
    reviewFocus: "Vana Parva dialogues on kshama (forgiveness) vs tejas (energy/action), Bhima's position, dharma debate.",
    turns: [
      "During the exile, why did Draupadi challenge Yudhishthira's patience when he had chosen to honour the conditions of the dice game?",
      "What arguments did Draupadi use?",
      "How did Bhima's views compare with hers?",
      "How did Yudhishthira respond?",
      "What does the exchange reveal about competing ideas of dharma, justice and restraint?"
    ]
  }
];

const SINGLE_TURN_SCENARIOS: ScenarioDefinition[] = [
  // Suite A Remaining
  {
    id: 'A5-pandavas-accept-exile',
    suite: 'A',
    title: "Why did the Pandavas accept exile after the dice game?",
    reviewFocus: "Conditions of 12 years forest + 1 year incognito, Anudyuta game, honouring vows vs immediate war.",
    turns: ["After everything that happened to Draupadi, why did the Pandavas accept exile instead of immediately fighting the Kauravas?"]
  },
  {
    id: 'A6-draupadi-anger-forgiveness',
    suite: 'A',
    title: "Why did Draupadi challenge the idea of forgiveness?",
    reviewFocus: "Moral distinction between forgiving interpersonal slights and tolerating public injustice/adharma.",
    turns: ["Why was Draupadi so angry with Yudhishthira and the idea of forgiveness after the humiliation she suffered?"]
  },

  // Suite B Remaining
  {
    id: 'B4-drona-fighting-kauravas',
    suite: 'B',
    title: "Why did Drona fight for the Kauravas?",
    reviewFocus: "Royal patron debt (Hastinapura salt), rivalry with Drupada, Ekalavya complexity, role as preceptor.",
    turns: ["Why did Dronacharya fight for the Kauravas even though the Pandavas were his students?"]
  },
  {
    id: 'B6-abhimanyu-chakravyuha',
    suite: 'B',
    title: "Why did Abhimanyu enter the Chakravyuha?",
    reviewFocus: "Knowledge of entering but not exiting, Jayadratha blocking Pandavas, multi-warrior breach of combat rules.",
    turns: ["Why did Abhimanyu enter the Chakravyuha even though he could not fully escape it?"]
  },
  {
    id: 'B8-yudhishthira-grief-victory',
    suite: 'B',
    title: "Why did Yudhishthira struggle with the consequences of victory?",
    reviewFocus: "Sorrow over slaughtered kin, Shanti Parva instruction from Bhishma on bed of arrows, trauma of victory.",
    turns: ["After the Pandavas won the war, why was Yudhishthira not simply happy to become king?"]
  },

  // Suite C Remaining
  {
    id: 'C1-krishna-war-permission',
    suite: 'C',
    title: "Why did Krishna allow the Mahabharata war to happen?",
    reviewFocus: "Free will, karma, peace mission failure, necessity of purging adharmic tyranny, theological perspective.",
    turns: ["If Krishna was divine and could influence events, why didn't he prevent the Kurukshetra war and save everyone?"]
  },
  {
    id: 'C3-krishna-unarmed-charioteer',
    suite: 'C',
    title: "Why did Krishna not fight with a weapon?",
    reviewFocus: "Narayani sena to Duryodhana vs Krishna as guide to Arjuna, role of Sarathi, divine guidance vs human effort.",
    turns: ["Why did Krishna agree to serve as Arjuna's charioteer instead of personally fighting the war?"]
  },
  {
    id: 'C5-gita-multiple-paths',
    suite: 'C',
    title: "Why did Krishna give different kinds of teachings throughout the Gita?",
    reviewFocus: "Synthesis of Karma, Jnana, Dhyana, Bhakti yogas; spiritual diversity matching human psychological temperaments.",
    turns: ["Why does Krishna discuss knowledge, action, meditation, devotion and surrender instead of giving Arjuna one simple answer?"]
  },
  {
    id: 'C6-gita-non-attachment',
    suite: 'C',
    title: "Why does the Gita say to act without attachment to results?",
    reviewFocus: "BG 2.47-48 karmany evadhikaras te; focusing on present execution rather than paralyzing anxiety over fruits.",
    turns: ["If the outcome matters in real life, why does Krishna teach Arjuna not to be attached to the fruits of action?"]
  },

  // Suite D Remaining
  {
    id: 'D1-pandavas-exile-together',
    suite: 'D',
    title: "Why did the Pandavas go into exile together?",
    reviewFocus: "Brotherly solidarity, mutual vow, strategic preparation, forest penance and weapon gathering.",
    turns: ["Why did the Pandavas accept exile together after the dice game instead of separating and pursuing different solutions?"]
  },
  {
    id: 'D2-kunti-staying-hastinapura',
    suite: 'D',
    title: "Why did Kunti remain in Hastinapura?",
    reviewFocus: "Old age, residing in Vidura's house, protection of family lineage, edition differences acknowledged.",
    turns: ["Why did Kunti remain behind when the Pandavas went into exile?"]
  },
  {
    id: 'D4-pandavas-repeated-negotiation',
    suite: 'D',
    title: "Why did the Pandavas keep negotiating and accepting conditions?",
    reviewFocus: "Avoiding catastrophic bloodshed, upholding moral high ground, exhausting all peaceful remedies before war.",
    turns: ["Why did the Pandavas keep negotiating and accepting conditions when Duryodhana repeatedly acted against them?"]
  },
  {
    id: 'D5-gandhari-curse-krishna',
    suite: 'D',
    title: "Why did Gandhari curse Krishna?",
    reviewFocus: "Stri Parva grief over 100 dead sons, holding Krishna capable of stopping war, Krishna calmly accepting curse.",
    turns: ["Why did Gandhari curse Krishna after the destruction of her sons and the Kaurava army?"]
  }
];

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
    query: "What did Vikarna argue in defence of Draupadi in the dice hall?",
    expectedEntities: ['Vikarna', 'Draupadi', 'Karna'],
    expectedThemes: ['stake', 'assembly', 'right']
  },
  {
    id: 'F4-karna-dushasana-cheer',
    query: "Why did Karna call Draupadi a bandhaki or unchaste woman in the dice assembly?",
    expectedEntities: ['Karna', 'Draupadi', 'Dushasana'],
    expectedThemes: ['assembly', 'garment', 'disrobing']
  },
  {
    id: 'F5-peace-mission-five-villages',
    query: "What happened when Krishna went to the Kaurava court asking for five villages for the Pandavas?",
    expectedEntities: ['Krishna', 'Duryodhana', 'Dhritarashtra'],
    expectedThemes: ['peace', 'villages', 'embassy']
  },
  {
    id: 'F6-abhimanyu-chakravyuha-entry',
    query: "How did Abhimanyu learn to enter the Chakravyuha while still in Subhadra's womb?",
    expectedEntities: ['Abhimanyu', 'Arjuna', 'Subhadra'],
    expectedThemes: ['formation', 'womb', 'exit']
  },
  {
    id: 'F7-karna-death-wheel-stuck',
    query: "What happened when Karna's chariot wheel sank into the earth during his final fight with Arjuna?",
    expectedEntities: ['Karna', 'Arjuna', 'Krishna'],
    expectedThemes: ['wheel', 'chariot', 'curse']
  },
  {
    id: 'F8-gita-karma-yoga-2-47',
    query: "Explain Bhagavad Gita 2.47 regarding duty without attachment to results.",
    expectedEntities: ['Krishna', 'Arjuna'],
    expectedThemes: ['karma', 'phala', 'adhikara']
  },
  {
    id: 'F9-gita-vishvarupa-chapter-11',
    query: "What did Arjuna see when Krishna showed him the universal form in Bhagavad Gita chapter 11?",
    expectedEntities: ['Krishna', 'Arjuna'],
    expectedThemes: ['universal', 'kala', 'time']
  },
  {
    id: 'F10-raghavendra-vivruti-commentary',
    query: "How does Sri Raghavendra Teertha Gita Vivruti interpret Bhagavad Gita 2.48 regarding equanimity?",
    expectedEntities: ['Krishna', 'Arjuna'],
    expectedThemes: ['samatvam', 'vivruti', 'commentary']
  }
];

async function collectStream(response: Response): Promise<{ events: Record<string, unknown>[]; firstTokenMs: number | null; completedAtMs: number }> {
  const startedAt = performance.now();
  let firstTokenMs: number | null = null;
  const events: Record<string, unknown>[] = [];
  const decoder = new SseJsonDecoder();
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body has no reader.');
  const textDecoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = textDecoder.decode(value, { stream: true });
    const parsed = decoder.push(chunk, false);
    for (const event of parsed) {
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

async function runAudit() {
  console.log('================================================================================');
  console.log('TALK TO KRISHNA — MAHABHARATA & BHAGAVAD GITA DEEP-GROUNDING AUDIT');
  console.log('Executing against Real API, Groq LLM, BGE Embeddings & Local PostgreSQL (Port 5433)');
  console.log('================================================================================\n');

  // 1. Corpus Inventory
  console.log('[Corpus Inventory]:');
  const [sourcesRes, gitaCountRes, chunksBySourceRes, childCountRes] = await Promise.all([
    pool.query('SELECT id, title, volume_parva, source_type FROM mahabharata_sources ORDER BY created_at ASC'),
    pool.query('SELECT count(*) FROM gita_verses'),
    pool.query('SELECT source_type, count(*) FROM mahabharata_chunks GROUP BY source_type ORDER BY count DESC'),
    pool.query('SELECT count(*) FROM mahabharata_child_chunks')
  ]);

  console.log(`  • Registered Editions (${sourcesRes.rows.length}):`);
  for (const s of sourcesRes.rows) {
    console.log(`    - [${s.source_type}] ${s.title} (${s.volume_parva})`);
  }
  console.log(`  • Canonical Gita Verses: ${gitaCountRes.rows[0].count}`);
  console.log(`  • Indexed Parent Chunks by Source:`);
  for (const c of chunksBySourceRes.rows) {
    console.log(`    - ${c.source_type}: ${c.count} parent chunks`);
  }
  console.log(`  • Total Child Chunks: ${childCountRes.rows[0].count}\n`);

  // 2. Start API Server
  const server = await new Promise<any>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[API Server]: Started on ${baseUrl}\n`);

  // 3. User Authentication
  const authSession = await AuthService.createAnonymousSession({ preferredName: 'Mahabharata Scholar Seeker' });
  const userId = authSession.user.id;
  const token = authSession.token;
  console.log(`[Auth]: Created authenticated test session for user ${userId}\n`);

  const results: any = {
    metadata: {
      timestamp: new Date().toISOString(),
      database: 'talk_to_krishna_eval_local (port 5433)',
      model: 'Groq llama-3.3-70b-versatile',
      embeddings: 'BGE English v1.5 (768-dim)',
      corpusSources: sourcesRes.rows,
    },
    multiTurnScenarios: [],
    singleTurnScenarios: [],
    adversarialScenarios: [],
    retrievalProbes: [],
    summary: {
      totalTurnsExecuted: 0,
      successfulTurns: 0,
      totalMultiTurnScenarios: MULTI_TURN_SCENARIOS.length,
      totalSingleTurnScenarios: SINGLE_TURN_SCENARIOS.length,
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
    // -------------------------------------------------------------------------
    // PART 1: 12 Multi-Turn Deep Conversations (5 turns each = 60 turns)
    // -------------------------------------------------------------------------
    console.log('================================================================================');
    console.log('PART 1: 12 MULTI-TURN DEEP CONVERSATIONS (SUITES A, B, C, D)');
    console.log('================================================================================\n');

    for (let i = 0; i < MULTI_TURN_SCENARIOS.length; i++) {
      const scenario = MULTI_TURN_SCENARIOS[i];
      const conversationId = randomUUID();
      console.log(`--------------------------------------------------------------------------------`);
      console.log(`[Multi-Turn ${i + 1}/${MULTI_TURN_SCENARIOS.length}] (${scenario.suite}) ${scenario.title}`);
      console.log(`Conversation ID: ${conversationId}`);
      console.log(`Review Focus: ${scenario.reviewFocus}`);
      console.log(`--------------------------------------------------------------------------------`);

      await db.insert(conversations).values({
        id: conversationId,
        userId,
        title: `Deep Audit: ${scenario.title}`,
      });

      const scenarioRecord: any = {
        id: scenario.id,
        suite: scenario.suite,
        title: scenario.title,
        conversationId,
        reviewFocus: scenario.reviewFocus,
        turns: [],
        persistenceCheck: null,
      };

      for (let tIdx = 0; tIdx < scenario.turns.length; tIdx++) {
        const userPrompt = scenario.turns[tIdx];
        turnsCount++;
        results.summary.totalTurnsExecuted++;

        console.log(`\n  [Turn ${tIdx + 1}/${scenario.turns.length}] User: "${userPrompt}"`);

        const res = await fetch(`${baseUrl}/api/v1/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: userPrompt }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Turn ${tIdx + 1} failed with HTTP ${res.status}: ${errText}`);
        }

        const stream = await collectStream(res);
        const answer = stream.events.filter((e) => e.type === 'token').map((e) => e.token).join('');
        const citations = (stream.events.find((e) => e.type === 'citations')?.citations as any[]) || [];
        const debug = stream.events.find((e) => e.type === 'debug')?.debug as any;
        const telemetry = stream.events.find((e) => e.type === 'telemetry')?.telemetry as any;

        totalLatency += stream.completedAtMs;
        if (stream.firstTokenMs) totalTtft += stream.firstTokenMs;
        results.summary.successfulTurns++;

        console.log(`  [Turn ${tIdx + 1}] TTFT: ${stream.firstTokenMs?.toFixed(1) ?? 'N/A'}ms | Total: ${stream.completedAtMs.toFixed(1)}ms | Citations: ${citations.length}`);
        console.log(`  Answer Preview: "${answer.slice(0, 150).replace(/\r?\n/g, ' ')}..."`);

        scenarioRecord.turns.push({
          turnIndex: tIdx + 1,
          user: userPrompt,
          answer,
          citations,
          latencyMs: Math.round(stream.completedAtMs),
          ttftMs: stream.firstTokenMs ? Math.round(stream.firstTokenMs) : null,
          retrievalDebug: debug || null,
          telemetry: telemetry || null,
        });
      }

      // Reload persistence check
      const historyRes = await fetch(`${baseUrl}/api/v1/conversations/${conversationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const historyData = await historyRes.json();
      const loadedMessages = historyData.data?.messages || [];
      const expectedMessages = scenario.turns.length * 2;
      const consistent = loadedMessages.length === expectedMessages;
      console.log(`\n  [Persistence Verification]: Reloaded ${loadedMessages.length}/${expectedMessages} messages from database (Consistent: ${consistent}).`);

      scenarioRecord.persistenceCheck = {
        consistent,
        loadedCount: loadedMessages.length,
        persistedCitations: loadedMessages.flatMap((m: any) => m.citations || []).length,
      };

      results.multiTurnScenarios.push(scenarioRecord);
    }

    // -------------------------------------------------------------------------
    // PART 2: 13 Single-Turn Scenario Breadth Tests (Suites A, B, C, D)
    // -------------------------------------------------------------------------
    console.log('\n================================================================================');
    console.log('PART 2: 13 SINGLE-TURN BREADTH SCENARIOS (SUITES A, B, C, D)');
    console.log('================================================================================\n');

    for (let i = 0; i < SINGLE_TURN_SCENARIOS.length; i++) {
      const scenario = SINGLE_TURN_SCENARIOS[i];
      const conversationId = randomUUID();
      turnsCount++;
      results.summary.totalTurnsExecuted++;

      console.log(`[Single-Turn ${i + 1}/${SINGLE_TURN_SCENARIOS.length}] (${scenario.suite}) ${scenario.title}`);
      console.log(`User: "${scenario.turns[0]}"`);

      await db.insert(conversations).values({
        id: conversationId,
        userId,
        title: `Breadth: ${scenario.title}`,
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
        throw new Error(`Single-turn scenario ${scenario.id} failed with HTTP ${res.status}`);
      }

      const stream = await collectStream(res);
      const answer = stream.events.filter((e) => e.type === 'token').map((e) => e.token).join('');
      const citations = (stream.events.find((e) => e.type === 'citations')?.citations as any[]) || [];
      const debug = stream.events.find((e) => e.type === 'debug')?.debug as any;

      totalLatency += stream.completedAtMs;
      if (stream.firstTokenMs) totalTtft += stream.firstTokenMs;
      results.summary.successfulTurns++;

      console.log(`  TTFT: ${stream.firstTokenMs?.toFixed(1) ?? 'N/A'}ms | Total: ${stream.completedAtMs.toFixed(1)}ms | Citations: ${citations.length}`);
      console.log(`  Answer Preview: "${answer.slice(0, 150).replace(/\r?\n/g, ' ')}...\n"`);

      results.singleTurnScenarios.push({
        id: scenario.id,
        suite: scenario.suite,
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

    // -------------------------------------------------------------------------
    // PART 3: 10 Adversarial Hallucination Tests (Suite E)
    // -------------------------------------------------------------------------
    console.log('================================================================================');
    console.log('PART 3: 10 ADVERSARIAL HALLUCINATION & FALSE-PREMISE PROBES (SUITE E)');
    console.log('================================================================================\n');

    for (let i = 0; i < ADVERSARIAL_SCENARIOS.length; i++) {
      const scenario = ADVERSARIAL_SCENARIOS[i];
      const conversationId = randomUUID();
      turnsCount++;
      results.summary.totalTurnsExecuted++;

      console.log(`[Adversarial ${i + 1}/${ADVERSARIAL_SCENARIOS.length}] ${scenario.title}`);
      console.log(`Adversarial Query: "${scenario.turns[0]}"`);

      await db.insert(conversations).values({
        id: conversationId,
        userId,
        title: `Adversarial: ${scenario.title}`,
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
      console.log(`  Assistant Response: "${answer.slice(0, 180).replace(/\r?\n/g, ' ')}...\n"`);

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

    // -------------------------------------------------------------------------
    // PART 4: 10 Suite F Live Retrieval, Fusion & Citation Pipeline Probes
    // -------------------------------------------------------------------------
    console.log('================================================================================');
    console.log('PART 4: 10 LIVE RETRIEVAL, FUSION & CITATION PROBES (SUITE F)');
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
    console.log(`AUDIT EXECUTION COMPLETE: ${results.summary.successfulTurns}/${results.summary.totalTurnsExecuted} TURNS PASSED`);
    console.log(`Average Latency: ${results.summary.averageLatencyMs} ms | Average TTFT: ${results.summary.averageTtftMs} ms`);
    console.log('================================================================================\n');

    // Save JSON
    const outDir = path.join(apiRoot, 'evaluation-results');
    await mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, 'mahabharata-deep-grounding-audit.json');
    await writeFile(outPath, JSON.stringify(results, null, 2), 'utf8');
    console.log(`Saved comprehensive audit results to: ${outPath}`);

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }
}

runAudit().catch((err) => {
  console.error('[Mahabharata Audit Fatal Error]:', err);
  process.exit(1);
});
