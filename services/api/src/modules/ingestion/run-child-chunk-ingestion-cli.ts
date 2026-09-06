import { ChildChunkIngester } from './child-chunk-ingester.js';
import { pool } from '../../db/index.js';

async function main() {
  try {
    const res = await ChildChunkIngester.ingestAllChildChunks();
    console.log('[CLI] Parent-Child ingestion finished:', res);
    process.exit(0);
  } catch (err) {
    console.error('[CLI Error]:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
