import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { GitaKaushikIngester } from './gita-kaushik-ingester.js';

async function main() {
  console.log('=== STARTING ASHOK KAUSHIK GITA (ASI 279) INGESTION ===');
  const stats = await GitaKaushikIngester.ingestKaushikGita({
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
