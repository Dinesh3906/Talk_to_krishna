import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { FullCorpusIngester } from './full-corpus-ingester.js';
import { pool } from '../../db/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const pdfPath = path.resolve(__dirname, '../../../../../The Complete Mahabharata Volume 1-12.pdf');
  console.log('====================================================');
  console.log('STARTING FULL MAHABHARATA CORPUS INGESTION (6,808 PAGES)');
  console.log('====================================================');

  try {
    const result = await FullCorpusIngester.ingestCorpus(pdfPath);
    console.log('====================================================');
    console.log('INGESTION SUCCESSFUL!');
    console.log(`Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
    console.log(`Total Pages: ${result.totalPages}`);
    console.log(`Non-empty Chunks: ${result.ingestedChunks}`);
    console.log('====================================================');
  } catch (err: any) {
    console.error('CRITICAL INGESTION ERROR:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
