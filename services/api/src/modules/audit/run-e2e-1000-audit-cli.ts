import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../../db/index.js';
import { E2E1000Evaluator } from './e2e-1000-evaluator.js';
import { generateE2EMarkdownReport } from './generate-e2e-markdown-report.js';
import { buildE2EDataset, E2ETestCase } from './build-e2e-dataset.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('\n============================================================');
  console.log('TALK TO KRISHNA — 1,000-TEST END-TO-END AI QUALITY AUDIT');
  console.log('============================================================\n');

  const datasetPath = path.resolve(__dirname, '../../../../../tests/rag/e2e_1000_ai_audit_dataset.json');

  let tests: E2ETestCase[];
  if (!fs.existsSync(datasetPath)) {
    console.log('[Runner] Dataset not found, generating fresh 1,000-test dataset...');
    tests = buildE2EDataset();
    fs.mkdirSync(path.dirname(datasetPath), { recursive: true });
    fs.writeFileSync(datasetPath, JSON.stringify(tests, null, 2), 'utf-8');
  } else {
    tests = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
  }

  console.log(`[Runner] Loaded ${tests.length} test cases from: ${datasetPath}`);

  // Ensure reports directory exists
  const reportsDir = path.resolve(__dirname, '../../../../../reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  console.log('[Runner] Starting End-to-End audit execution against live database...');
  const startTime = Date.now();

  const { results, summary } = await E2E1000Evaluator.evaluateAll(tests, (completed, total) => {
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const pct = ((completed / total) * 100).toFixed(1);
    console.log(`[Runner Progress] Evaluated ${completed}/${total} tests (${pct}%) in ${elapsedSec}s...`);
  });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n[Runner] Audit completed in ${durationSec}s!`);

  // 1. Save summary JSON
  const summaryPath = path.join(reportsDir, 'mahabharata-e2e-1000-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`[Report] Saved JSON summary: ${summaryPath}`);

  // 2. Save full results JSON
  const resultsPath = path.join(reportsDir, 'mahabharata-e2e-1000-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`[Report] Saved raw results: ${resultsPath}`);

  // 3. Save markdown report
  const markdownContent = generateE2EMarkdownReport(summary);
  const markdownPath = path.join(reportsDir, 'mahabharata-e2e-1000-audit-report.md');
  fs.writeFileSync(markdownPath, markdownContent, 'utf-8');
  console.log(`[Report] Saved Markdown report: ${markdownPath}`);

  console.log('\n============================================================');
  console.log(`AUDIT RESULTS OVERVIEW:`);
  console.log(`Total Tests:                  ${summary.total_tests}`);
  console.log(`Overall Pass Rate:            ${summary.overall_pass_rate}% (${summary.overall_passed}/${summary.total_tests})`);
  console.log(`Safety Interception Rate:     ${summary.layer1_summary.safety_interception_rate}%`);
  console.log(`Forced Reference Rate:        ${summary.layer1_summary.forced_reference_rate}%`);
  console.log(`Retrieval Grounding Rate:     ${summary.layer1_summary.retrieval_grounding_rate}%`);
  console.log(`Adversarial Correction Rate:  ${summary.layer1_summary.adversarial_correction_rate}%`);
  console.log(`Critical Failures Count:      ${summary.critical_failures_count}`);
  console.log(`Avg Retrieval Latency:        ${summary.latency.avg_retrieval_ms} ms`);
  console.log(`P95 Retrieval Latency:        ${summary.latency.p95_retrieval_ms} ms`);
  console.log('============================================================\n');

  await pool.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('[Fatal Runner Error]:', err);
  await pool.end();
  process.exit(1);
});
