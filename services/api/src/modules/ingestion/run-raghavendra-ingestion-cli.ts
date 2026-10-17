import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { GitaRaghavendraIngester } from './gita-raghavendra-ingester.js';

async function main() {
  console.log('=== STARTING SRI RAGHAVENDRA GITA VIVRUTI INGESTION ===');
  const stats = await GitaRaghavendraIngester.ingestRaghavendraGita({
    batchSize: 30,
    embeddingBatchSize: 32,
  });

  console.log('=== INGESTION FINISHED ===');
  console.log(JSON.stringify(stats, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error('[CLI ERROR]', err);
  process.exit(1);
});
