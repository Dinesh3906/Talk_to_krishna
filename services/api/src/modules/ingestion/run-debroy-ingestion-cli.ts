import { Debroy10VolIngester } from './debroy-10-vol-ingester.js';
import { pool } from '../../db/index.js';

async function main() {
  const args = process.argv.slice(2);
  let maxPages: number | undefined;
  let batchSize = 50;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--max-pages' && args[i + 1]) {
      maxPages = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--batch-size' && args[i + 1]) {
      batchSize = parseInt(args[i + 1], 10);
      i++;
    }
  }

  console.log(`[Debroy CLI] Starting ingestion (maxPages: ${maxPages || 'ALL'}, batchSize: ${batchSize})...`);
  const start = Date.now();

  try {
    const stats = await Debroy10VolIngester.ingest({
      batchSize,
      maxPages,
      resumeFromCheckpoint: true,
    });
    console.log(`[Debroy CLI] Ingestion Finished in ${((Date.now() - start) / 1000).toFixed(1)}s:`, stats);
    process.exit(0);
  } catch (err) {
    console.error(`[Debroy CLI Error]:`, err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
