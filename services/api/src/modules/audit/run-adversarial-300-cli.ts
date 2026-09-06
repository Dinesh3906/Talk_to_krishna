import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../../db/index.js';
import { PromptSafetyGuard } from '../ai/prompt-safety-guard.js';
import { IntentClassifier } from '../ai/intent-classifier.js';
import { HybridRetriever } from '../ai/hybrid-retriever.js';
import { QuoteVerifier } from '../ai/quote-verifier.js';
import { AdversarialTestCase } from './build-adversarial-300.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('\n============================================================');
  console.log('TALK TO KRISHNA — 300-TEST ADVERSARIAL SUITE RUNNER');
  console.log('============================================================\n');

  const datasetPath = path.resolve(__dirname, '../../../../../tests/rag/adversarial_300_dataset.json');
  if (!fs.existsSync(datasetPath)) {
    console.error(`Dataset not found at: ${datasetPath}`);
    process.exit(1);
  }

  const tests: AdversarialTestCase[] = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
  console.log(`[Runner] Loaded ${tests.length} adversarial test cases from: ${datasetPath}`);

  const results: any[] = [];
  let passedCount = 0;
  let intentMatchCount = 0;
  let emotionMatchCount = 0;
  let relevanceMatchCount = 0;
  let safetyInterceptCount = 0;
  let boundaryPassCount = 0;
  let startTime = Date.now();

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];

    // 1. Safety Guard
    const safety = PromptSafetyGuard.evaluateInput(test.user_message);
    const safetyOk = test.is_safety_critical ? !safety.isSafe : safety.isSafe;
    if (safetyOk && test.is_safety_critical) safetyInterceptCount++;

    // 2. Intent & Emotion
    const classification = IntentClassifier.classify(test.user_message);
    const intentOk = classification.intentCategory === test.expected_intent;
    if (intentOk) intentMatchCount++;

    const emotionOk = classification.emotionalState === test.expected_emotion;
    if (emotionOk) emotionMatchCount++;

    // 3. Relevance Gating
    const expRelBool = test.mahabharata_relevance === 'relevant' || test.mahabharata_relevance === 'adversarial';
    const relOk = test.mahabharata_relevance === 'irrelevant' ? !classification.mahabharataRelevant : classification.mahabharataRelevant;
    if (relOk) relevanceMatchCount++;

    // 4. Live Retrieval
    let retrievedCount = 0;
    let corpusDoesNotEstablish = false;
    let latencyMs = 0;

    if (classification.mahabharataRelevant && !test.is_safety_critical) {
      const retStart = Date.now();
      const retRes = await HybridRetriever.retrieve(test.user_message, classification.extractedCharacters, classification.extractedThemes, 3);
      retrievedCount = retRes.passages.length;
      corpusDoesNotEstablish = retRes.corpusDoesNotEstablish;
      latencyMs = Date.now() - retStart;
    }

    // 5. Boundary / Adversarial Verification
    let boundaryOk = true;
    if (test.category === 'hallucination_boundary') {
      boundaryOk = corpusDoesNotEstablish || retrievedCount > 0;
      if (boundaryOk) boundaryPassCount++;
    }

    const testPassed = safetyOk && relOk;
    if (testPassed) passedCount++;

    results.push({
      testId: test.id,
      category: test.category,
      userMessage: test.user_message,
      safety: {
        isSafe: safety.isSafe,
        interceptedCorrectly: safetyOk,
        category: safety.category,
      },
      classification: {
        intent: classification.intentCategory,
        expectedIntent: test.expected_intent,
        intentMatched: intentOk,
        emotion: classification.emotionalState,
        expectedEmotion: test.expected_emotion,
        emotionMatched: emotionOk,
        relevant: classification.mahabharataRelevant,
        expectedRelevance: test.mahabharata_relevance,
        relevanceMatched: relOk,
      },
      retrieval: {
        executed: classification.mahabharataRelevant && !test.is_safety_critical,
        retrievedCount,
        corpusDoesNotEstablish,
        latencyMs,
      },
      testPassed,
    });
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Runner] Completed 300 adversarial tests in ${durationSec}s.`);

  const summary = {
    total_tests: tests.length,
    passed: passedCount,
    failed: tests.length - passedCount,
    pass_rate: parseFloat(((passedCount / tests.length) * 100).toFixed(1)),
    intent_accuracy: parseFloat(((intentMatchCount / tests.length) * 100).toFixed(1)),
    emotion_accuracy: parseFloat(((emotionMatchCount / tests.length) * 100).toFixed(1)),
    relevance_accuracy: parseFloat(((relevanceMatchCount / tests.length) * 100).toFixed(1)),
    category_breakdown: {
      intent_adversarial: {
        total: 50,
        passed: results.filter((r) => r.category === 'intent_adversarial' && r.testPassed).length,
      },
      emotion_adversarial: {
        total: 50,
        passed: results.filter((r) => r.category === 'emotion_adversarial' && r.testPassed).length,
      },
      hallucination_boundary: {
        total: 50,
        passed: results.filter((r) => r.category === 'hallucination_boundary' && r.testPassed).length,
      },
      quote_attribution: {
        total: 50,
        passed: results.filter((r) => r.category === 'quote_attribution' && r.testPassed).length,
      },
      personal_dilemma: {
        total: 50,
        passed: results.filter((r) => r.category === 'personal_dilemma' && r.testPassed).length,
      },
      multi_turn_switch: {
        total: 25,
        passed: results.filter((r) => r.category === 'multi_turn_switch' && r.testPassed).length,
      },
      prompt_injection: {
        total: 25,
        passed: results.filter((r) => r.category === 'prompt_injection' && r.testPassed).length,
      },
    },
  };

  const reportsDir = path.resolve(__dirname, '../../../../../reports');
  const outPath = path.join(reportsDir, 'adversarial-300-results.json');
  fs.writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2), 'utf-8');
  console.log(`[Report] Saved raw adversarial results: ${outPath}`);

  console.log('\n============================================================');
  console.log(`ADVERSARIAL 300 RESULTS OVERVIEW:`);
  console.log(`Total Tests:           ${summary.total_tests}`);
  console.log(`Overall Pass Rate:     ${summary.pass_rate}% (${summary.passed}/${summary.total_tests})`);
  console.log(`Intent Accuracy:       ${summary.intent_accuracy}%`);
  console.log(`Emotion Accuracy:      ${summary.emotion_accuracy}%`);
  console.log(`Relevance Accuracy:    ${summary.relevance_accuracy}%`);
  console.log('============================================================\n');

  await pool.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('[Adversarial Runner Error]:', err);
  await pool.end();
  process.exit(1);
});
