import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { CorpusIntegrityValidator } from './corpus-validator.js';
import { SemanticChunker, SemanticCorpusChunk } from './semantic-chunker.js';
import { db, pool } from '../../db/index.js';
import { mahabharataChunks, mahabharataSources } from '../../db/schema.js';
import { AIProviderFactory } from '../ai/ai-provider.factory.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function seedCorpus() {
  const corpusDir = path.resolve(__dirname, '../../../../../data/mahabharata/corpus');
  console.log(`[Corpus Ingestion] Reading corpus from: ${corpusDir}`);

  // Stage 1: Validation
  console.log('[Corpus Ingestion] Stage 1: Running pre-ingestion corpus verification...');
  const report = CorpusIntegrityValidator.validateCorpus(corpusDir);

  if (!report.valid) {
    console.error('[Corpus Ingestion] CRITICAL: Pre-ingestion validation failed!');
    console.error('Errors:', report.errors);
    console.error('Corrupted passages:', report.corruptedPassages);
    console.error('Duplicate references:', report.duplicateReferences);
    throw new Error('Corpus failed verification. Ingestion aborted to prevent corrupted knowledge store.');
  }

  console.log('[Corpus Ingestion] Verification passed successfully:');
  console.log(`- Gita Chapters: ${report.totalGitaChapters}`);
  console.log(`- Gita Key Verses: ${report.totalKeyVerses}`);
  console.log(`- Episodes: ${report.totalEpisodes}`);
  console.log(`- Parvas Overview: ${report.totalParvas}`);

  // Stage 2: Semantic Chunking
  console.log('[Corpus Ingestion] Stage 2: Performing semantic chunking...');
  const gitaData = JSON.parse(fs.readFileSync(path.join(corpusDir, 'bhagavad_gita.json'), 'utf-8'));
  const episodesData = JSON.parse(fs.readFileSync(path.join(corpusDir, 'mahabharata_episodes.json'), 'utf-8'));
  const parvasData = JSON.parse(fs.readFileSync(path.join(corpusDir, 'parvas_overview.json'), 'utf-8'));

  const gitaChunks = SemanticChunker.chunkGita(gitaData);
  const episodeChunks = SemanticChunker.chunkEpisodes(episodesData);
  const parvaChunks = SemanticChunker.chunkParvas(parvasData);

  const allChunks: SemanticCorpusChunk[] = [...gitaChunks, ...episodeChunks, ...parvaChunks];
  console.log(`[Corpus Ingestion] Generated ${allChunks.length} total semantic units.`);

  // Stage 3: Embedding & Database Storage
  console.log('[Corpus Ingestion] Stage 3: Generating embeddings and persisting to PostgreSQL + pgvector...');
  const aiProvider = AIProviderFactory.getProvider();

  // Create or verify primary source record
  const [primarySource] = await db
    .insert(mahabharataSources)
    .values({
      title: 'Mahabharata & Bhagavad Gita Core Canonical Corpus',
      volumeParva: 'All Parvas',
      sourceType: 'canonical_structured',
    })
    .returning();

  let insertedCount = 0;

  for (let i = 0; i < allChunks.length; i++) {
    const chunk = allChunks[i];
    const textToEmbed = `${chunk.sourceReference}: ${chunk.translation} ${chunk.contextSummary || ''}`;
    
    // Generate real embedding from provider
    const [embedding] = await aiProvider.generateEmbeddings([textToEmbed]);

    await db.insert(mahabharataChunks).values({
      sourceId: primarySource.id,
      sourceType: chunk.sourceType,
      parva: chunk.parva,
      chapter: chunk.chapter,
      section: chunk.section,
      verseRange: chunk.verseRange,
      speaker: chunk.speaker,
      listener: chunk.listener,
      characters: chunk.characters,
      themes: chunk.themes,
      originalText: chunk.originalText,
      translation: chunk.translation,
      contextSummary: chunk.contextSummary,
      relevanceForGuidance: chunk.relevanceForGuidance,
      sourceReference: chunk.sourceReference,
      embedding: embedding,
    });

    insertedCount++;
    if (insertedCount % 10 === 0 || insertedCount === allChunks.length) {
      console.log(`[Corpus Ingestion] Ingested ${insertedCount}/${allChunks.length} chunks...`);
    }
  }

  console.log(`[Corpus Ingestion] Ingestion complete. Ingested ${insertedCount} chunks into pgvector.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedCorpus()
    .then(() => {
      console.log('[Corpus Ingestion] Successfully completed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Corpus Ingestion Error]:', err.message);
      process.exit(1);
    });
}
