import { runParallelChildIngestion } from './parallel-child-ingester.js';
import { pool } from '../../db/index.js';

async function main() {
  try {
    const res = await runParallelChildIngestion(6);
    console.log('[CLI] Parallel Parent-Child ingestion completed successfully:', res);
    process.exit(0);
  } catch (err) {
    console.error('[CLI Error]:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
