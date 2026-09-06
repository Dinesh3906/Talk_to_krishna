import path from 'path';
import { Retrieval1000Runner } from './retrieval-1000-runner.js';
import { generateRetrievalMarkdownReport } from './generate-retrieval-markdown-report.js';
import { pool } from '../../db/index.js';

async function main() {
  try {
    const summary = await Retrieval1000Runner.runAudit();
    console.log('[CLI] Audit complete. Summary pass rate:', summary.overall_pass_rate, '%');

    const summaryPath = path.resolve('reports/mahabharata-retrieval-1000-summary.json');
    const mdPath = path.resolve('reports/mahabharata-retrieval-1000-report.md');
    generateRetrievalMarkdownReport(summaryPath, mdPath);
    console.log('[CLI] Generated Markdown report at:', mdPath);
  } catch (err) {
    console.error('[CLI Error]:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
