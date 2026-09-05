import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Rag10000Runner } from './rag-10000-runner.js';
import { pool } from '../../db/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const testJsonlPath = path.resolve(__dirname, '../../../../../tests/rag/mahabharata_10000_rag_tests.jsonl');
  console.log('[RAG CLI] Starting execution of 10,000 tests from:', testJsonlPath);

  try {
    const summary = await Rag10000Runner.runAllTests(testJsonlPath);
    console.log('[RAG CLI] Completed 10,000 RAG tests.');
    console.log(`Pass Rate: ${summary.pass_rate_percent}%`);
    console.log(`Overall Status: ${summary.overall_status}`);
  } catch (err: any) {
    console.error('[RAG CLI Error]:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
