import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { PDFMahabharataIngester } from './pdf-ingester.js';
import { db } from '../../db/index.js';
import { mahabharataChunks, mahabharataSources } from '../../db/schema.js';
import { AIProviderFactory } from '../ai/ai-provider.factory.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function ingestPDF() {
  const pdfPath = path.resolve(__dirname, '../../../../../The Complete Mahabharata Volume 1-12.pdf');
  console.log(`[PDF CLI] Reading 12-volume Mahabharata from: ${pdfPath}`);

  const chunks = await PDFMahabharataIngester.parsePDF(pdfPath, {
    maxPages: 50, // Initial bounded batch
  });

  const aiProvider = AIProviderFactory.getProvider();

  const [pdfSource] = await db
    .insert(mahabharataSources)
    .values({
      title: 'The Complete Mahabharata Volume 1-12 (Translation)',
      volumeParva: 'Multi-Volume Edition',
      sourceType: 'pdf_volume',
    })
    .returning();

  console.log(`[PDF CLI] Ingesting ${chunks.length} PDF sections into PostgreSQL + pgvector...`);

  let count = 0;
  for (const chunk of chunks) {
    const textToEmbed = `${chunk.sourceReference}: ${chunk.translation}`;
    const [embedding] = await aiProvider.generateEmbeddings([textToEmbed]);

    await db.insert(mahabharataChunks).values({
      sourceId: pdfSource.id,
      sourceType: chunk.sourceType,
      parva: chunk.parva,
      section: chunk.section,
      characters: chunk.characters,
      themes: chunk.themes,
      translation: chunk.translation,
      contextSummary: chunk.contextSummary,
      sourceReference: chunk.sourceReference,
      embedding: embedding,
    });

    count++;
    if (count % 10 === 0 || count === chunks.length) {
      console.log(`[PDF CLI] Processed ${count}/${chunks.length} chunks...`);
    }
  }

  console.log(`[PDF CLI] Completed ingestion of ${count} chunks from PDF.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ingestPDF()
    .then(() => {
      console.log('[PDF CLI] Completed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[PDF CLI Error]:', err.message);
      process.exit(1);
    });
}
