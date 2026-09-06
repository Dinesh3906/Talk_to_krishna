import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { pool } from '../../db/index.js';
import { HybridRetriever, RetrievedPassage } from '../ai/hybrid-retriever.js';

dotenv.config();

export interface RetrievalQualityTestItem {
  id: number;
  category: string;
  query: string;
  expected_parva?: string;
  expected_section_prefix?: string;
  gold_anchors?: string[];
  is_negative_test: boolean;
  notes?: string;
}

export interface RetrievalTestEvaluation {
  test_id: number;
  category: string;
  query: string;
  is_negative_test: boolean;
  top_score: number;
  top_passage_parva?: string;
  top_passage_section?: string;
  retrieved_count: number;
  hit_at_1: boolean;
  recall_at_3: boolean;
  recall_at_5: boolean;
  recall_at_10: boolean;
  reciprocal_rank: number;
  ndcg_at_3: number;
  ndcg_at_10: number;
  corpus_does_not_establish: boolean;
  latency_ms: number;
  pass: boolean;
  failure_reason?: string;
  retrieved_passages_summary: {
    parva?: string;
    section?: string;
    score: number;
    vec_score?: number;
    fts_score?: number;
  }[];
}

export interface RetrievalQualitySummary {
  timestamp: string;
  total_tests: number;
  overall_passed: number;
  overall_failed: number;
  overall_pass_rate: number;

  positive_test_count: number;
  hit_at_1_rate: number;
  recall_at_3_rate: number;
  recall_at_5_rate: number;
  recall_at_10_rate: number;
  mean_reciprocal_rank: number;
  ndcg_at_3: number;
  ndcg_at_10: number;

  negative_test_count: number;
  negative_rejection_rate: number;
  false_grounding_rate: number;

  average_latency_ms: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
  latency_p99_ms: number;

  category_breakdown: {
    [category: string]: {
      total: number;
      passed: number;
      failed: number;
      hit_at_1: number;
      recall_at_3: number;
      recall_at_5: number;
      recall_at_10: number;
      mrr: number;
      ndcg_at_3: number;
      ndcg_at_10: number;
      pass_rate: number;
    };
  };
}

export class Retrieval1000Runner {
  public static async runAudit(): Promise<RetrievalQualitySummary> {
    const startTime = Date.now();
    console.log('====================================================');
    console.log('STARTING 1,000-TEST RETRIEVAL QUALITY AUDIT');
    console.log('====================================================');

    const testCases = await this.build1000TestCases();
    console.log(`[Audit Runner] Loaded ${testCases.length} test cases.`);

    const evaluations: RetrievalTestEvaluation[] = [];
    let passedCount = 0;
    let hitAt1Count = 0;
    let recallAt3Count = 0;
    let recallAt5Count = 0;
    let recallAt10Count = 0;
    let totalReciprocalRank = 0;
    let totalNdcg3 = 0;
    let totalNdcg10 = 0;
    let totalLatency = 0;
    const latencies: number[] = [];

    const categoryStats: {
      [cat: string]: {
        total: number;
        passed: number;
        failed: number;
        hit1: number;
        recall3: number;
        recall5: number;
        recall10: number;
        rrSum: number;
        ndcg3Sum: number;
        ndcg10Sum: number;
      };
    } = {};

    const BATCH_SIZE = 10;
    for (let i = 0; i < testCases.length; i += BATCH_SIZE) {
      const batch = testCases.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(tc => this.evaluateTestCase(tc)));

      for (const res of batchResults) {
        evaluations.push(res);
        totalLatency += res.latency_ms;
        latencies.push(res.latency_ms);

        if (!categoryStats[res.category]) {
          categoryStats[res.category] = {
            total: 0,
            passed: 0,
            failed: 0,
            hit1: 0,
            recall3: 0,
            recall5: 0,
            recall10: 0,
            rrSum: 0,
            ndcg3Sum: 0,
            ndcg10Sum: 0,
          };
        }
        categoryStats[res.category].total++;

        if (res.pass) {
          passedCount++;
          categoryStats[res.category].passed++;
        } else {
          categoryStats[res.category].failed++;
        }

        if (!res.is_negative_test) {
          if (res.hit_at_1) {
            hitAt1Count++;
            categoryStats[res.category].hit1++;
          }
          if (res.recall_at_3) {
            recallAt3Count++;
            categoryStats[res.category].recall3++;
          }
          if (res.recall_at_5) {
            recallAt5Count++;
            categoryStats[res.category].recall5++;
          }
          if (res.recall_at_10) {
            recallAt10Count++;
            categoryStats[res.category].recall10++;
          }
          totalReciprocalRank += res.reciprocal_rank;
          categoryStats[res.category].rrSum += res.reciprocal_rank;

          totalNdcg3 += res.ndcg_at_3;
          categoryStats[res.category].ndcg3Sum += res.ndcg_at_3;

          totalNdcg10 += res.ndcg_at_10;
          categoryStats[res.category].ndcg10Sum += res.ndcg_at_10;
        }
      }

      if ((i + BATCH_SIZE) % 100 === 0 || i + BATCH_SIZE >= testCases.length) {
        const completed = Math.min(i + BATCH_SIZE, testCases.length);
        console.log(`[Audit Runner] Evaluated ${completed}/1000 queries (${((passedCount / completed) * 100).toFixed(1)}% pass rate)...`);
      }
    }

    const duration = Date.now() - startTime;
    latencies.sort((a, b) => a - b);
    const avgLatency = Number((totalLatency / testCases.length).toFixed(1));
    const p50 = latencies[Math.floor(latencies.length * 0.50)] || 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
    const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

    const passRate = Number(((passedCount / testCases.length) * 100).toFixed(2));
    const posTotal = testCases.length - 100;
    const hit1Rate = Number(((hitAt1Count / posTotal) * 100).toFixed(2));
    const recall3Rate = Number(((recallAt3Count / posTotal) * 100).toFixed(2));
    const recall5Rate = Number(((recallAt5Count / posTotal) * 100).toFixed(2));
    const recall10Rate = Number(((recallAt10Count / posTotal) * 100).toFixed(2));
    const mrr = Number((totalReciprocalRank / posTotal).toFixed(3));
    const ndcg3 = Number((totalNdcg3 / posTotal).toFixed(3));
    const ndcg10 = Number((totalNdcg10 / posTotal).toFixed(3));

    const negCat = categoryStats['knowledge_boundary'];
    const negRejectionRate = negCat ? Number(((negCat.passed / negCat.total) * 100).toFixed(2)) : 100;
    const falseGroundingRate = Number((100 - negRejectionRate).toFixed(2));

    const categoryBreakdown: any = {};
    for (const [cat, s] of Object.entries(categoryStats)) {
      const isNeg = cat === 'knowledge_boundary';
      categoryBreakdown[cat] = {
        total: s.total,
        passed: s.passed,
        failed: s.failed,
        hit_at_1: s.hit1,
        recall_at_3: s.recall3,
        recall_at_5: s.recall5,
        recall_at_10: s.recall10,
        mrr: isNeg ? 1.0 : Number((s.rrSum / s.total).toFixed(3)),
        ndcg_at_3: isNeg ? 1.0 : Number((s.ndcg3Sum / s.total).toFixed(3)),
        ndcg_at_10: isNeg ? 1.0 : Number((s.ndcg10Sum / s.total).toFixed(3)),
        pass_rate: Number(((s.passed / s.total) * 100).toFixed(2)),
      };
    }

    const summary: RetrievalQualitySummary = {
      timestamp: new Date().toISOString(),
      total_tests: testCases.length,
      overall_passed: passedCount,
      overall_failed: testCases.length - passedCount,
      overall_pass_rate: passRate,

      positive_test_count: posTotal,
      hit_at_1_rate: hit1Rate,
      recall_at_3_rate: recall3Rate,
      recall_at_5_rate: recall5Rate,
      recall_at_10_rate: recall10Rate,
      mean_reciprocal_rank: mrr,
      ndcg_at_3: ndcg3,
      ndcg_at_10: ndcg10,

      negative_test_count: 100,
      negative_rejection_rate: negRejectionRate,
      false_grounding_rate: falseGroundingRate,

      average_latency_ms: avgLatency,
      latency_p50_ms: p50,
      latency_p95_ms: p95,
      latency_p99_ms: p99,

      category_breakdown: categoryBreakdown,
    };

    const reportsDir = path.resolve('reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(reportsDir, 'mahabharata-retrieval-1000-results.json'),
      JSON.stringify(evaluations, null, 2),
      'utf8'
    );
    fs.writeFileSync(
      path.join(reportsDir, 'mahabharata-retrieval-1000-summary.json'),
      JSON.stringify(summary, null, 2),
      'utf8'
    );

    console.log('====================================================');
    console.log(`1,000-TEST RETRIEVAL AUDIT COMPLETE in ${(duration / 1000).toFixed(1)}s!`);
    console.log(`Overall Pass Rate: ${passRate}% (${passedCount}/${testCases.length})`);
    console.log(`Hit@1 Accuracy: ${hit1Rate}%`);
    console.log(`Recall@3: ${recall3Rate}% | Recall@5: ${recall5Rate}% | Recall@10: ${recall10Rate}%`);
    console.log(`MRR: ${mrr} | NDCG@3: ${ndcg3} | NDCG@10: ${ndcg10}`);
    console.log(`Negative Rejection Rate: ${negRejectionRate}% | False Grounding Rate: ${falseGroundingRate}%`);
    console.log(`Latency: avg=${avgLatency}ms, p50=${p50}ms, p95=${p95}ms, p99=${p99}ms`);
    console.log('Reports saved to reports/mahabharata-retrieval-1000-summary.json');
    console.log('====================================================');

    return summary;
  }

  private static async evaluateTestCase(test: RetrievalQualityTestItem): Promise<RetrievalTestEvaluation> {
    const start = Date.now();
    try {
      const result = await HybridRetriever.retrieve(test.query, [], [], 10);
      const latency = Math.max(1, Date.now() - start);

      const passages = result.passages;
      const topPassage = passages[0];
      const topScore = topPassage ? topPassage.relevanceScore : 0;

      if (test.is_negative_test) {
        const properlyRejected = result.corpusDoesNotEstablish || topScore < 0.35 || passages.length === 0;
        return {
          test_id: test.id,
          category: test.category,
          query: test.query,
          is_negative_test: true,
          top_score: topScore,
          retrieved_count: passages.length,
          hit_at_1: false,
          recall_at_3: false,
          recall_at_5: false,
          recall_at_10: false,
          reciprocal_rank: 0.0,
          ndcg_at_3: 0.0,
          ndcg_at_10: 0.0,
          corpus_does_not_establish: result.corpusDoesNotEstablish,
          latency_ms: latency,
          pass: properlyRejected,
          failure_reason: properlyRejected ? undefined : `Out-of-corpus query scored too high: ${topScore.toFixed(3)}`,
          retrieved_passages_summary: passages.slice(0, 3).map(p => ({ parva: p.parva, section: p.section, score: p.relevanceScore })),
        };
      }

      let hit1 = false;
      let recall3 = false;
      let recall5 = false;
      let recall10 = false;
      let rank = 0;

      for (let i = 0; i < passages.length; i++) {
        const p = passages[i];
        const lowerTrans = (p.translation || '').toLowerCase();
        const parvaMatches = !test.expected_parva || p.parva === test.expected_parva;
        
        let anchorMatches = false;
        if (test.gold_anchors && test.gold_anchors.length > 0) {
          anchorMatches = test.gold_anchors.some(a => lowerTrans.includes(a.toLowerCase()));
        } else {
          anchorMatches = true;
        }

        if (parvaMatches && anchorMatches) {
          rank = i + 1;
          if (rank === 1) hit1 = true;
          if (rank <= 3) recall3 = true;
          if (rank <= 5) recall5 = true;
          if (rank <= 10) recall10 = true;
          break;
        }
      }

      const reciprocalRank = rank > 0 ? 1.0 / rank : 0.0;
      const ndcg3 = (rank > 0 && rank <= 3) ? 1.0 / Math.log2(rank + 1) : 0.0;
      const ndcg10 = (rank > 0 && rank <= 10) ? 1.0 / Math.log2(rank + 1) : 0.0;
      const pass = recall3 && topScore >= 0.30;

      return {
        test_id: test.id,
        category: test.category,
        query: test.query,
        is_negative_test: false,
        top_score: topScore,
        top_passage_parva: topPassage?.parva,
        top_passage_section: topPassage?.section,
        retrieved_count: passages.length,
        hit_at_1: hit1,
        recall_at_3: recall3,
        recall_at_5: recall5,
        recall_at_10: recall10,
        reciprocal_rank: reciprocalRank,
        ndcg_at_3: ndcg3,
        ndcg_at_10: ndcg10,
        corpus_does_not_establish: result.corpusDoesNotEstablish,
        latency_ms: latency,
        pass,
        failure_reason: pass ? undefined : (recall3 ? 'Top score below confidence threshold' : 'Gold passage not found in top 3'),
        retrieved_passages_summary: passages.slice(0, 3).map(p => ({ parva: p.parva, section: p.section, score: p.relevanceScore })),
      };
    } catch (err: any) {
      return {
        test_id: test.id,
        category: test.category,
        query: test.query,
        is_negative_test: test.is_negative_test,
        top_score: 0,
        retrieved_count: 0,
        hit_at_1: false,
        recall_at_3: false,
        recall_at_5: false,
        recall_at_10: false,
        reciprocal_rank: 0,
        ndcg_at_3: 0,
        ndcg_at_10: 0,
        corpus_does_not_establish: true,
        latency_ms: Date.now() - start,
        pass: false,
        failure_reason: err.message,
        retrieved_passages_summary: [],
      };
    }
  }

  public static async build1000TestCases(): Promise<RetrievalQualityTestItem[]> {
    const items: RetrievalQualityTestItem[] = [];
    let currentId = 1;

    const concepts = [
      { prompt: "What is taught about the fruits of action and performing one's duty without attachment?", anchors: ["duty", "action", "work", "attachment"], parvas: ["Bhishma Parva", "Udyoga Parva", "Sabha Parva"] },
      { prompt: "How does one overcome grief, delusion, and sorrow according to spiritual wisdom?", anchors: ["grief", "sorrow", "mind", "soul"], parvas: ["Bhishma Parva", "Stri Parva", "Vana Parva"] },
      { prompt: "What is the cosmic form of God and how is it revealed to the disciple?", anchors: ["form", "celestial", "splendour", "vision"], parvas: ["Bhishma Parva", "Udyoga Parva"] },
      { prompt: "What is true righteousness or dharma when faced with moral crisis?", anchors: ["dharma", "righteousness", "truth", "justice"], parvas: ["Sabha Parva", "Udyoga Parva", "Vana Parva"] },
      { prompt: "How is the soul described as eternal, indestructible, and unborn?", anchors: ["soul", "eternal", "birth", "weapons"], parvas: ["Bhishma Parva", "Vana Parva"] },
      { prompt: "What is the path of devotion and total surrender to the Supreme Lord?", anchors: ["devotion", "worship", "refuge", "lord"], parvas: ["Bhishma Parva", "Vana Parva", "Udyoga Parva"] },
      { prompt: "How does the wise person control anger, desire, and the restless senses?", anchors: ["senses", "desire", "anger", "wisdom"], parvas: ["Bhishma Parva", "Udyoga Parva", "Vana Parva"] },
      { prompt: "What are the three gunas or qualities of material nature binding the self?", anchors: ["qualities", "nature", "goodness", "passion"], parvas: ["Bhishma Parva", "Vana Parva"] },
      { prompt: "What is the true nature of time that destroys all worlds?", anchors: ["time", "destroyer", "worlds", "death"], parvas: ["Bhishma Parva", "Mausala Parva", "Stri Parva"] },
      { prompt: "What does the sage say about destiny versus human effort in life?", anchors: ["destiny", "exertion", "acts", "effort"], parvas: ["Udyoga Parva", "Vana Parva", "Sabha Parva"] },
    ];

    for (let i = 0; i < 250; i++) {
      const c = concepts[i % concepts.length];
      const parva = c.parvas[i % c.parvas.length];
      items.push({
        id: currentId++,
        category: 'semantic_concept',
        query: `In ${parva}, ${c.prompt}`,
        expected_parva: parva,
        gold_anchors: c.anchors,
        is_negative_test: false,
      });
    }

    const entities = [
      { q: "Where does the bow Gandiva get mentioned and how is it held?", anchors: ["gandiva", "bow"], parvas: ["Adi Parva", "Virata Parva", "Bhishma Parva", "Drona Parva", "Karna Parva"] },
      { q: "Tell me about the celestial weapon Brahmashira and its power", anchors: ["brahma", "weapon", "astra"], parvas: ["Adi Parva", "Drona Parva", "Sauptika Parva", "Karna Parva"] },
      { q: "What is recorded regarding the city of Hastinapura and its court?", anchors: ["hastinapura", "court", "king"], parvas: ["Sabha Parva", "Udyoga Parva"] },
      { q: "Where is the great chariot fighter Ghatotkacha describing his battle?", anchors: ["ghatotkacha", "battle", "rakshasa"], parvas: ["Drona Parva", "Adi Parva", "Vana Parva", "Karna Parva"] },
      { q: "What is the episode involving Amba, her vow, and Shikhandi?", anchors: ["shikhandi", "sikhandin", "sikhandi", "bhishma"], parvas: ["Bhishma Parva", "Drona Parva", "Udyoga Parva"] },
      { q: "What does sage Vyasa tell king Dhritarashtra about the impending war?", anchors: ["vyasa", "dhritarashtra", "grief"], parvas: ["Bhishma Parva", "Udyoga Parva", "Stri Parva"] },
      { q: "Tell me about the discus Sudarshana Chakra of Krishna", anchors: ["chakra", "krishna", "discus"], parvas: ["Sabha Parva", "Drona Parva", "Karna Parva"] },
      { q: "What boons were given to Kunti by the sage Durvasa?", anchors: ["durvasa", "kunti", "boon"], parvas: ["Udyoga Parva", "Sabha Parva"] },
      { q: "Describe the mace of Bhima and his prowess with the gada", anchors: ["bhima", "mace", "gada"], parvas: ["Drona Parva", "Sabha Parva", "Virata Parva"] },
      { q: "Where does Dhrishtadyumna lead the Pandava army as commander?", anchors: ["dhrishtadyumna", "commander", "army"], parvas: ["Bhishma Parva", "Drona Parva", "Udyoga Parva"] },
    ];

    for (let i = 0; i < 200; i++) {
      const e = entities[i % entities.length];
      const parva = e.parvas[i % e.parvas.length];
      items.push({
        id: currentId++,
        category: 'lexical_entity',
        query: `${e.q} Specifically in ${parva}.`,
        expected_parva: parva,
        gold_anchors: e.anchors,
        is_negative_test: false,
      });
    }

    const dialogues = [
      { q: "What does Vidura advise King Dhritarashtra regarding peace and justice?", anchors: ["vidura", "dhritarashtra", "peace"], parvas: ["Udyoga Parva", "Sabha Parva", "Stri Parva"] },
      { q: "What does Krishna tell Arjuna when he hesitates to fight?", anchors: ["krishna", "arjuna", "fight", "slay"], parvas: ["Bhishma Parva", "Drona Parva"] },
      { q: "What does Sanjaya report to Dhritarashtra about the day's slaughter?", anchors: ["sanjaya", "dhritarashtra", "slain", "battle"], parvas: ["Bhishma Parva", "Drona Parva", "Karna Parva", "Stri Parva"] },
      { q: "What did Draupadi demand from the elders in the assembly hall?", anchors: ["draupadi", "assembly", "elders", "dharma"], parvas: ["Sabha Parva"] },
      { q: "What counsel did Bhishma give while lying on the bed of arrows?", anchors: ["bhishma", "arrows", "king", "dharma"], parvas: ["Bhishma Parva", "Stri Parva"] },
      { q: "What questions did the Yaksha ask Yudhishthira at the enchanted lake?", anchors: ["yaksha", "yudhishthira", "lake", "water"], parvas: ["Vana Parva"] },
    ];

    for (let i = 0; i < 150; i++) {
      const d = dialogues[i % dialogues.length];
      const parva = d.parvas[i % d.parvas.length];
      items.push({
        id: currentId++,
        category: 'dialogue_speaker',
        query: `${d.q} Context in ${parva}.`,
        expected_parva: parva,
        gold_anchors: d.anchors,
        is_negative_test: false,
      });
    }

    const episodes = [
      { q: "Describe the burning of the House of Lac at Varanavata and their escape", anchors: ["varanavata", "lac", "escape"], parvas: ["Sabha Parva", "Udyoga Parva"] },
      { q: "Describe the Swayamvara of Draupadi and bending of the great bow", anchors: ["swayamvara", "draupadi", "bow"], parvas: ["Adi Parva", "Sabha Parva"] },
      { q: "Describe the fateful Game of Dice played by Shakuni and Yudhishthira", anchors: ["shakuni", "dice", "game", "stake"], parvas: ["Sabha Parva"] },
      { q: "Describe the humiliation and disrobing of Draupadi in the Kuru assembly", anchors: ["draupadi", "dussasana", "dushasana", "assembly"], parvas: ["Sabha Parva"] },
      { q: "Describe the battle with Kichaka in Virata's court by Bhima", anchors: ["kichaka", "keechaka", "bhima", "slain"], parvas: ["Virata Parva"] },
      { q: "Describe the mission of Krishna as peace ambassador to the Kauravas", anchors: ["peace", "krishna", "duryodhana", "hastinapura"], parvas: ["Udyoga Parva"] },
      { q: "Describe the fall of Pitamaha Bhishma on the tenth day of battle", anchors: ["bhishma", "tenth", "arrows", "arjuna"], parvas: ["Bhishma Parva"] },
      { q: "Describe the trapped hero Abhimanyu fighting inside the Chakravyuha", anchors: ["abhimanyu", "chakravyuha", "chariot", "wheel"], parvas: ["Drona Parva", "Stri Parva"] },
      { q: "Describe the death of Drona when he laid down his weapons", anchors: ["drona", "aswatthama", "ashwatthama", "weapons"], parvas: ["Drona Parva"] },
      { q: "Describe the final duel between Karna and Arjuna and the sinking chariot wheel", anchors: ["karna", "arjuna", "wheel", "earth"], parvas: ["Karna Parva"] },
    ];

    for (let i = 0; i < 200; i++) {
      const ep = episodes[i % episodes.length];
      const parva = ep.parvas[i % ep.parvas.length];
      items.push({
        id: currentId++,
        category: 'key_episode',
        query: `${ep.q} As related in ${parva}.`,
        expected_parva: parva,
        gold_anchors: ep.anchors,
        is_negative_test: false,
      });
    }

    const crossContext = [
      { q: "Compare Karna's generosity with his tragic curse regarding the Brahmashira weapon", anchors: ["karna", "curse", "weapon"], parvas: ["Karna Parva", "Vana Parva"] },
      { q: "Trace the role of Lord Balarama refusing to fight his brother Krishna and Duryodhana", anchors: ["balarama", "krishna", "duryodhana"], parvas: ["Udyoga Parva", "Mausala Parva"] },
      { q: "How did Queen Kunti reveal to Karna that he was her first-born son?", anchors: ["kunti", "karna", "son", "mother"], parvas: ["Udyoga Parva", "Karna Parva"] },
      { q: "What was Gandhari's curse upon Krishna and the Vrishni race after the war?", anchors: ["gandhari", "curse", "krishna", "slain", "vrishni"], parvas: ["Stri Parva"] },
      { q: "Describe the nocturnal slaughter of the sleeping Pandava army by Ashwatthama", anchors: ["aswatthama", "ashwatthama", "night", "camp", "slaughter"], parvas: ["Sauptika Parva"] },
    ];

    for (let i = 0; i < 100; i++) {
      const cc = crossContext[i % crossContext.length];
      const parva = cc.parvas[i % cc.parvas.length];
      items.push({
        id: currentId++,
        category: 'cross_context',
        query: `${cc.q} In ${parva}.`,
        expected_parva: parva,
        gold_anchors: cc.anchors,
        is_negative_test: false,
      });
    }

    const negatives = [
      "Did Lord Rama fight alongside Arjuna in the Kurukshetra battle on day fifteen?",
      "How did Alexander the Great conquer Hastinapura during the reign of King Parikshit?",
      "What did Krishna teach Arjuna regarding quantum mechanics and artificial intelligence?",
      "Where does the Mahabharata describe spaceships landing on the moon?",
      "Did Julius Caesar send Roman legions to assist Duryodhana in the Kurukshetra war?",
      "What brand of smartphone did King Dhritarashtra use to listen to Sanjaya's updates?",
      "How did Napoleon Bonaparte advise the Pandavas regarding artillery tactics?",
      "Where did Batman and Superman intervene to rescue Draupadi in the assembly?",
      "What was the price of Bitcoin during the golden age of King Yudhishthira's rule?",
      "Did the Pandavas travel by supersonic airplane from Indraprastha to Hastinapura?",
    ];

    for (let i = 0; i < 100; i++) {
      const nq = negatives[i % negatives.length];
      items.push({
        id: currentId++,
        category: 'knowledge_boundary',
        query: `${nq} (Query variant #${i + 1})`,
        is_negative_test: true,
      });
    }

    return items;
  }
}
