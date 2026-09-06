/**
 * Live LLM E2E Validation CLI
 *
 * Executes the Talk to Krishna pipeline with REAL LLM generation (Groq/Gemini/OpenAI)
 * and evaluates the actual generated responses using mechanical scoring.
 *
 * Usage: npx tsx src/modules/audit/run-live-llm-e2e-cli.ts [--limit N] [--offset N] [--smoke]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../../db/index.js';
import { E2E1000Evaluator } from './e2e-1000-evaluator.js';
import { LiveLLMEvaluator, LiveLLMScore } from './live-llm-evaluator.js';
import { AIProviderFactory } from '../ai/ai-provider.factory.js';
import { E2ETestCase } from './build-e2e-dataset.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface LiveLLMSummary {
  timestamp: string;
  provider: string;
  model: string;
  totalTests: number;
  testsWithLLM: number;
  testsWithoutLLM: number;
  llmErrors: number;

  // Pipeline pass rates
  pipelinePassRate: number;
  llmPassRate: number;

  // Score averages (0-2)
  avgScores: {
    factualAccuracy: number;
    reasoningQuality: number;
    practicalHelpfulness: number;
    krishnaPersona: number;
    answerRelevance: number;
    responseCoherence: number;
    emotionalSensitivity: number;
  };

  // Integrity
  hallucinationFailCount: number;
  quoteIntegrityCounts: { clean: number; suspicious: number; fabricated: number };
  safetyFailCount: number;

  // Violations
  totalViolations: number;
  totalWarnings: number;
  violationBreakdown: Record<string, number>;

  // Category breakdown
  categoryBreakdown: Record<string, {
    total: number;
    llmPassed: number;
    passRate: number;
    avgFactual: number;
    avgReasoning: number;
    avgPersona: number;
  }>;

  // Latency
  avgGenerationMs: number;
  p95GenerationMs: number;
  avgTotalMs: number;

  // Failures detail
  failures: {
    testId: string;
    category: string;
    userMessage: string;
    violations: string[];
    responsePreview: string;
  }[];
}

async function main() {
  console.log('\n============================================================');
  console.log('TALK TO KRISHNA — LIVE LLM E2E PRODUCTION VALIDATION');
  console.log('============================================================\n');

  // Parse CLI args
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const offsetIdx = args.indexOf('--offset');
  const isSmoke = args.includes('--smoke');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : undefined;
  const offset = offsetIdx >= 0 ? parseInt(args[offsetIdx + 1], 10) : 0;

  // Verify API key is present
  const hasKey = !!(process.env.AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY);
  if (!hasKey) {
    console.error('\n❌ FATAL: No AI API key configured.');
    console.error('Set one of: AI_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY in services/api/.env');
    console.error('Cannot proceed with live LLM validation without a real API key.\n');
    await pool.end();
    process.exit(1);
  }

  // Verify provider
  const provider = AIProviderFactory.getProvider();
  console.log(`[Config] AI Provider: ${provider.providerName}`);
  console.log(`[Config] Model: ${process.env.GROQ_MODEL_NAME || process.env.AI_MODEL_NAME || 'default'}`);

  // Single smoke test to verify connectivity
  console.log('[Pre-flight] Testing API connectivity...');
  try {
    const smokeResult = await provider.generateCompletion({
      messages: [
        { role: 'system', content: 'You are a helpful assistant. Respond briefly.' },
        { role: 'user', content: 'Hello, say "API connection verified" and nothing else.' },
      ],
      temperature: 0.0,
      maxTokens: 50,
    });
    console.log(`[Pre-flight] ✅ API connection verified. Response: "${smokeResult.content.slice(0, 60)}..."`);
    console.log(`[Pre-flight] Tokens: prompt=${smokeResult.promptTokens}, completion=${smokeResult.completionTokens}`);
  } catch (err: any) {
    console.error(`\n❌ FATAL: API connectivity test failed: ${err.message}`);
    console.error('Please verify your API key and network connectivity.');
    await pool.end();
    process.exit(1);
  }

  if (isSmoke) {
    console.log('\n[Smoke] Smoke test mode — running 10 tests only.');
  }

  // Load dataset
  const datasetPath = path.resolve(__dirname, '../../../../../tests/rag/e2e_1000_ai_audit_dataset.json');
  if (!fs.existsSync(datasetPath)) {
    console.error(`❌ Dataset not found at: ${datasetPath}`);
    await pool.end();
    process.exit(1);
  }

  let allTests: E2ETestCase[] = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));

  // Apply offset and limit
  if (offset > 0) allTests = allTests.slice(offset);
  if (isSmoke) allTests = allTests.slice(0, 10);
  else if (limit) allTests = allTests.slice(0, limit);

  console.log(`[Runner] Running ${allTests.length} tests through live LLM pipeline\n`);

  const reportsDir = path.resolve(__dirname, '../../../../../reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  const startTime = Date.now();
  const llmScores: LiveLLMScore[] = [];
  const generationLatencies: number[] = [];
  const totalLatencies: number[] = [];
  let llmErrorCount = 0;

  // Rate limiting: configurable delay between LLM calls (default 300ms)
  const delayIdx = args.indexOf('--delay');
  const RATE_LIMIT_DELAY_MS = delayIdx >= 0 ? parseInt(args[delayIdx + 1], 10) : 300;

  for (let i = 0; i < allTests.length; i++) {
    const test = allTests[i];
    const testStart = Date.now();

    try {
      // Run through existing pipeline (includes real LLM if key present)
      const result = await E2E1000Evaluator.evaluateSingle(test);

      // Score the real LLM output
      const llmScore = LiveLLMEvaluator.scoreResponse(test, result);
      llmScores.push(llmScore);

      if (result.layer2.executedLLM) {
        generationLatencies.push(result.layer2.latency.generationMs);
      }
      if (result.layer2.llmErrorCode) {
        llmErrorCount++;
      }

      totalLatencies.push(Date.now() - testStart);

      // Progress logging
      if ((i + 1) % 10 === 0 || i === allTests.length - 1) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const pct = (((i + 1) / allTests.length) * 100).toFixed(1);
        const passCount = llmScores.filter(s => s.overallLLMPass).length;
        const passRate = (((passCount) / (i + 1)) * 100).toFixed(1);
        console.log(
          `[Progress] ${i + 1}/${allTests.length} (${pct}%) | ` +
          `Pass: ${passRate}% | Violations: ${llmScores.reduce((sum, s) => sum + s.violations.length, 0)} | ` +
          `LLM Errors: ${llmErrorCount} | ${elapsed}s elapsed`
        );
      }

      // Rate limiting
      if (i < allTests.length - 1) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
      }
    } catch (err: any) {
      console.error(`[Error] Test ${test.id} failed: ${err.message}`);
      llmErrorCount++;
    }
  }

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n[Runner] Completed ${allTests.length} tests in ${totalDuration}s`);

  // Build summary
  const testsWithLLM = llmScores.filter(s => s.executedLLM).length;
  const llmPassed = llmScores.filter(s => s.overallLLMPass).length;

  const avgScore = (field: keyof LiveLLMScore['scores']) => {
    const vals = llmScores.filter(s => s.executedLLM).map(s => {
      const v = s.scores[field];
      return typeof v === 'number' ? v : 0;
    });
    return vals.length > 0 ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : 0;
  };

  const violationBreakdown: Record<string, number> = {};
  for (const s of llmScores) {
    for (const v of s.violations) {
      const key = v.split(':')[0].trim();
      violationBreakdown[key] = (violationBreakdown[key] || 0) + 1;
    }
  }

  const categoryBreakdown: Record<string, any> = {};
  for (const s of llmScores) {
    if (!categoryBreakdown[s.category]) {
      categoryBreakdown[s.category] = {
        total: 0, llmPassed: 0,
        factualSum: 0, reasoningSum: 0, personaSum: 0,
      };
    }
    const cat = categoryBreakdown[s.category];
    cat.total++;
    if (s.overallLLMPass) cat.llmPassed++;
    cat.factualSum += s.scores.factualAccuracy;
    cat.reasoningSum += s.scores.reasoningQuality;
    cat.personaSum += s.scores.krishnaPersona;
  }

  const categoryResult: LiveLLMSummary['categoryBreakdown'] = {};
  for (const [k, v] of Object.entries(categoryBreakdown)) {
    const c = v as any;
    categoryResult[k] = {
      total: c.total,
      llmPassed: c.llmPassed,
      passRate: Number(((c.llmPassed / c.total) * 100).toFixed(1)),
      avgFactual: Number((c.factualSum / c.total).toFixed(2)),
      avgReasoning: Number((c.reasoningSum / c.total).toFixed(2)),
      avgPersona: Number((c.personaSum / c.total).toFixed(2)),
    };
  }

  generationLatencies.sort((a, b) => a - b);
  const getP = (arr: number[], pct: number) => {
    if (arr.length === 0) return 0;
    return arr[Math.min(Math.floor(pct / 100 * arr.length), arr.length - 1)];
  };

  const failures = llmScores
    .filter(s => !s.overallLLMPass)
    .map(s => ({
      testId: s.testId,
      category: s.category,
      userMessage: s.userMessage,
      violations: s.violations,
      responsePreview: (llmScores.find(x => x.testId === s.testId)?.responseLength || 0) > 0
        ? `[${s.responseLength} chars]`
        : '[no LLM response]',
    }));

  const summary: LiveLLMSummary = {
    timestamp: new Date().toISOString(),
    provider: provider.providerName,
    model: process.env.GROQ_MODEL_NAME || process.env.AI_MODEL_NAME || 'default',
    totalTests: allTests.length,
    testsWithLLM: testsWithLLM,
    testsWithoutLLM: allTests.length - testsWithLLM,
    llmErrors: llmErrorCount,
    pipelinePassRate: Number(((llmPassed / allTests.length) * 100).toFixed(2)),
    llmPassRate: testsWithLLM > 0 ? Number(((llmScores.filter(s => s.executedLLM && s.overallLLMPass).length / testsWithLLM) * 100).toFixed(2)) : 0,
    avgScores: {
      factualAccuracy: avgScore('factualAccuracy'),
      reasoningQuality: avgScore('reasoningQuality'),
      practicalHelpfulness: avgScore('practicalHelpfulness'),
      krishnaPersona: avgScore('krishnaPersona'),
      answerRelevance: avgScore('answerRelevance'),
      responseCoherence: avgScore('responseCoherence'),
      emotionalSensitivity: avgScore('emotionalSensitivity'),
    },
    hallucinationFailCount: llmScores.filter(s => s.scores.hallucinationControl === 'FAIL').length,
    quoteIntegrityCounts: {
      clean: llmScores.filter(s => s.scores.quoteIntegrity === 'CLEAN').length,
      suspicious: llmScores.filter(s => s.scores.quoteIntegrity === 'SUSPICIOUS').length,
      fabricated: llmScores.filter(s => s.scores.quoteIntegrity === 'FABRICATED').length,
    },
    safetyFailCount: llmScores.filter(s => s.scores.safetyBehavior === 'FAIL').length,
    totalViolations: llmScores.reduce((sum, s) => sum + s.violations.length, 0),
    totalWarnings: llmScores.reduce((sum, s) => sum + s.warnings.length, 0),
    violationBreakdown,
    categoryBreakdown: categoryResult,
    avgGenerationMs: generationLatencies.length > 0
      ? Number((generationLatencies.reduce((a, b) => a + b, 0) / generationLatencies.length).toFixed(0))
      : 0,
    p95GenerationMs: getP(generationLatencies, 95),
    avgTotalMs: totalLatencies.length > 0
      ? Number((totalLatencies.reduce((a, b) => a + b, 0) / totalLatencies.length).toFixed(0))
      : 0,
    failures,
  };

  // Save results
  const resultsPath = path.join(reportsDir, 'live-llm-e2e-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(llmScores, null, 2), 'utf-8');
  console.log(`[Report] Saved detailed results: ${resultsPath}`);

  const summaryPath = path.join(reportsDir, 'live-llm-e2e-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`[Report] Saved summary: ${summaryPath}`);

  // Generate markdown report
  const md = generateMarkdownReport(summary);
  const mdPath = path.join(reportsDir, 'live-llm-production-certification.md');
  fs.writeFileSync(mdPath, md, 'utf-8');
  console.log(`[Report] Saved certification report: ${mdPath}`);

  // Console summary
  console.log('\n============================================================');
  console.log('LIVE LLM VALIDATION RESULTS');
  console.log('============================================================');
  console.log(`Provider:                ${summary.provider}`);
  console.log(`Model:                   ${summary.model}`);
  console.log(`Total Tests:             ${summary.totalTests}`);
  console.log(`Tests with LLM:          ${summary.testsWithLLM}`);
  console.log(`LLM Errors:              ${summary.llmErrors}`);
  console.log(`Pipeline Pass Rate:      ${summary.pipelinePassRate}%`);
  console.log(`LLM Quality Pass Rate:   ${summary.llmPassRate}%`);
  console.log(`Hallucination Failures:  ${summary.hallucinationFailCount}`);
  console.log(`Safety Failures:         ${summary.safetyFailCount}`);
  console.log(`Total Violations:        ${summary.totalViolations}`);
  console.log(`Total Warnings:          ${summary.totalWarnings}`);
  console.log(`Avg Generation Latency:  ${summary.avgGenerationMs}ms`);
  console.log(`P95 Generation Latency:  ${summary.p95GenerationMs}ms`);
  console.log('============================================================');
  console.log('\nScore Averages (0-2 scale):');
  for (const [k, v] of Object.entries(summary.avgScores)) {
    console.log(`  ${k}: ${v}`);
  }
  console.log('\nCategory Breakdown:');
  for (const [k, v] of Object.entries(summary.categoryBreakdown)) {
    console.log(`  ${k}: ${v.llmPassed}/${v.total} (${v.passRate}%)`);
  }
  if (summary.failures.length > 0) {
    console.log(`\nFailures (${summary.failures.length}):`);
    for (const f of summary.failures.slice(0, 20)) {
      console.log(`  ${f.testId} [${f.category}]: ${f.violations.join('; ')}`);
    }
    if (summary.failures.length > 20) {
      console.log(`  ... and ${summary.failures.length - 20} more`);
    }
  }
  console.log('============================================================\n');

  await pool.end();
  process.exit(0);
}

function generateMarkdownReport(summary: LiveLLMSummary): string {
  const isProductionReady =
    summary.llmPassRate >= 90 &&
    summary.hallucinationFailCount === 0 &&
    summary.safetyFailCount === 0 &&
    summary.llmErrors <= summary.totalTests * 0.02;

  let md = `# Talk to Krishna — Live LLM Production Certification Report

## Executive Summary

| Metric | Value |
|--------|-------|
| **Status** | ${isProductionReady ? '✅ PRODUCTION READY' : '⚠️ REQUIRES ATTENTION'} |
| **Provider** | ${summary.provider} |
| **Model** | ${summary.model} |
| **Total Tests** | ${summary.totalTests} |
| **Tests with Live LLM** | ${summary.testsWithLLM} |
| **LLM Errors** | ${summary.llmErrors} |
| **Pipeline Pass Rate** | ${summary.pipelinePassRate}% |
| **LLM Quality Pass Rate** | ${summary.llmPassRate}% |
| **Hallucination Failures** | ${summary.hallucinationFailCount} |
| **Safety Failures** | ${summary.safetyFailCount} |
| **Total Violations** | ${summary.totalViolations} |
| **Total Warnings** | ${summary.totalWarnings} |
| **Avg Generation Latency** | ${summary.avgGenerationMs}ms |
| **P95 Generation Latency** | ${summary.p95GenerationMs}ms |
| **Timestamp** | ${summary.timestamp} |

## Score Averages (0–2 Scale)

| Dimension | Score |
|-----------|-------|
| Factual Accuracy | ${summary.avgScores.factualAccuracy} |
| Reasoning Quality | ${summary.avgScores.reasoningQuality} |
| Practical Helpfulness | ${summary.avgScores.practicalHelpfulness} |
| Krishna Persona | ${summary.avgScores.krishnaPersona} |
| Answer Relevance | ${summary.avgScores.answerRelevance} |
| Response Coherence | ${summary.avgScores.responseCoherence} |
| Emotional Sensitivity | ${summary.avgScores.emotionalSensitivity} |

## Quote Integrity

| Classification | Count |
|----------------|-------|
| Clean | ${summary.quoteIntegrityCounts.clean} |
| Suspicious | ${summary.quoteIntegrityCounts.suspicious} |
| Fabricated | ${summary.quoteIntegrityCounts.fabricated} |

## Category Breakdown

| Category | Total | Passed | Pass Rate | Avg Factual | Avg Reasoning | Avg Persona |
|----------|-------|--------|-----------|-------------|---------------|-------------|
`;

  for (const [k, v] of Object.entries(summary.categoryBreakdown)) {
    md += `| ${k} | ${v.total} | ${v.llmPassed} | ${v.passRate}% | ${v.avgFactual} | ${v.avgReasoning} | ${v.avgPersona} |\n`;
  }

  if (Object.keys(summary.violationBreakdown).length > 0) {
    md += `\n## Violation Breakdown\n\n| Violation Type | Count |\n|----------------|-------|\n`;
    for (const [k, v] of Object.entries(summary.violationBreakdown)) {
      md += `| ${k} | ${v} |\n`;
    }
  }

  if (summary.failures.length > 0) {
    md += `\n## Failures Detail (${summary.failures.length})\n\n`;
    for (const f of summary.failures) {
      md += `### ${f.testId} [${f.category}]\n`;
      md += `- **Query:** ${f.userMessage}\n`;
      md += `- **Violations:** ${f.violations.join('; ')}\n`;
      md += `- **Response:** ${f.responsePreview}\n\n`;
    }
  }

  md += `\n## Methodology

- All responses generated by real LLM calls through the Groq API (${summary.provider}/${summary.model})
- Evaluation is **mechanical** (deterministic regex/heuristic), NOT LLM-as-judge, to avoid self-evaluation bias
- Scoring dimensions: factual accuracy, reasoning quality, practical helpfulness, Krishna persona, answer relevance, response coherence, emotional sensitivity, hallucination control, quote integrity, safety behavior
- Rate-limited to avoid API throttling
- Pipeline: PromptSafetyGuard → IntentClassifier → HybridRetriever → KrishnaPersonaService → Groq LLM → QuoteVerifier → LiveLLMEvaluator
`;

  return md;
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
