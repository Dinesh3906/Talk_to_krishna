import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../../db/index.js';
import { defaultEmbeddingProvider } from '../ai/providers/bge-embedding.provider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface GitaIngestionReport {
  ingestedVerses: number;
  totalCanonicalVerses: number;
  missingVerses: number;
  chaptersCovered: number;
  provenance: string;
}

export class GitaIngester {
  public static async ingestVerifiedGitaVerses(): Promise<GitaIngestionReport> {
    console.log('[GitaIngester] Starting canonical Bhagavad Gita 700-verse ingestion into PostgreSQL...');

    const possiblePaths = [
      path.resolve(__dirname, '../../../../../data/mahabharata/corpus/gita_700_canonical.json'),
      path.resolve(__dirname, '../../../../data/mahabharata/corpus/gita_700_canonical.json'),
      path.resolve(process.cwd(), 'data/mahabharata/corpus/gita_700_canonical.json'),
      path.resolve(process.cwd(), '../../data/mahabharata/corpus/gita_700_canonical.json'),
      'D:/talk to krisna/data/mahabharata/corpus/gita_700_canonical.json',
      path.resolve(__dirname, '../../../../../data/mahabharata/corpus/bhagavad_gita.json'),
      path.resolve(__dirname, '../../../../data/mahabharata/corpus/bhagavad_gita.json'),
      path.resolve(process.cwd(), 'data/mahabharata/corpus/bhagavad_gita.json'),
      path.resolve(process.cwd(), '../../data/mahabharata/corpus/bhagavad_gita.json'),
    ];

    const gitaPath = possiblePaths.find(p => fs.existsSync(p));
    if (!gitaPath) {
      throw new Error('[GitaIngester] Neither gita_700_canonical.json nor bhagavad_gita.json found in corpus paths.');
    }

    console.log(`[GitaIngester] Loading verified Gita dataset from: ${gitaPath}`);
    const rawData = JSON.parse(fs.readFileSync(gitaPath, 'utf8'));

    const client = await pool.connect();
    try {
      if (Array.isArray(rawData) && rawData.length > 50 && rawData[0].chapter !== undefined && rawData[0].verse !== undefined) {
        // Full 700+ canonical verses dataset
        console.log(`[GitaIngester] Found full canonical dataset with ${rawData.length} verse records.`);
        
        // Clean out legacy multi-verse range keys to maintain strict 1-to-1 verse integrity
        await client.query(`DELETE FROM gita_verses WHERE id LIKE '%-%';`);

        const BATCH_SIZE = 50;
        let ingestedCount = 0;
        const chaptersSeen = new Set<number>();

        for (let i = 0; i < rawData.length; i += BATCH_SIZE) {
          const batch = rawData.slice(i, i + BATCH_SIZE);
          console.log(`[GitaIngester] Processing batch ${Math.floor(i / BATCH_SIZE) + 1} / ${Math.ceil(rawData.length / BATCH_SIZE)} (verses ${i + 1} - ${i + batch.length})...`);

          const textsToEmbed = batch.map((v: any) =>
            `Bhagavad Gita ${v.chapter}.${v.verse}: ${v.translation} ${v.transliteration || ''} ${v.deepMeaning || ''}`
          );

          const embeddings = await defaultEmbeddingProvider.embedBatch(textsToEmbed);

          await client.query('BEGIN');
          try {
            for (let j = 0; j < batch.length; j++) {
              const v = batch[j];
              const emb = embeddings[j];
              const embString = `[${emb.join(',')}]`;
              chaptersSeen.add(v.chapter);

              await client.query(`
                INSERT INTO gita_verses (
                  id, chapter, verse, verse_order, speaker, listener,
                  sanskrit, transliteration, translation, source_edition,
                  provenance, deep_meaning, krishna_teaching, themes, embedding
                ) VALUES (
                  $1, $2, $3, $4, $5, $6,
                  $7, $8, $9, $10,
                  $11, $12, $13, $14, $15::vector
                )
                ON CONFLICT (id) DO UPDATE SET
                  chapter = EXCLUDED.chapter,
                  verse = EXCLUDED.verse,
                  verse_order = EXCLUDED.verse_order,
                  speaker = EXCLUDED.speaker,
                  listener = EXCLUDED.listener,
                  sanskrit = EXCLUDED.sanskrit,
                  transliteration = EXCLUDED.transliteration,
                  translation = EXCLUDED.translation,
                  source_edition = EXCLUDED.source_edition,
                  provenance = EXCLUDED.provenance,
                  deep_meaning = EXCLUDED.deep_meaning,
                  krishna_teaching = EXCLUDED.krishna_teaching,
                  themes = EXCLUDED.themes,
                  embedding = EXCLUDED.embedding;
              `, [
                v.id,
                v.chapter,
                v.verse,
                v.verseOrder || (i + j + 1),
                v.speaker,
                v.listener,
                v.sanskrit,
                v.transliteration,
                v.translation,
                v.sourceEdition,
                v.provenance,
                v.deepMeaning,
                v.krishnaTeaching,
                v.themes,
                embString,
              ]);
              ingestedCount++;
            }
            await client.query('COMMIT');
          } catch (err) {
            await client.query('ROLLBACK');
            throw err;
          }
        }

        console.log(`[GitaIngester] Successfully ingested all ${ingestedCount} canonical verses across ${chaptersSeen.size} chapters.`);

        return {
          ingestedVerses: ingestedCount,
          totalCanonicalVerses: 700,
          missingVerses: Math.max(0, 700 - ingestedCount),
          chaptersCovered: chaptersSeen.size,
          provenance: 'Mahabharata Book 6 Bhishma Parva, Cantos 25-42 (Swami Sivananda English Translation & IAST Transliteration)',
        };
      } else {
        // Fallback for legacy 18-chapter overview
        let verseOrder = 0;
        let ingestedCount = 0;
        const chaptersSeen = new Set<number>();

        for (const ch of rawData) {
          chaptersSeen.add(ch.chapter);
          if (!ch.keyVerses || !Array.isArray(ch.keyVerses)) continue;

          for (const kv of ch.keyVerses) {
            verseOrder++;
            let verseNum = 1;
            const vStr = String(kv.verse).trim();
            const cleanNum = vStr.includes('.') ? vStr.split('.')[1] : vStr;
            const parsed = parseInt(cleanNum, 10);
            if (!isNaN(parsed)) {
              verseNum = parsed;
            }

            const verseId = `BG_${ch.chapter}.${cleanNum}`;
            const textToEmbed = `Bhagavad Gita ${ch.chapter}.${cleanNum}: ${kv.translation} - Teaching: ${kv.philosophical_context || ch.essence || ''}`;
            const emb = await defaultEmbeddingProvider.embedDocument(textToEmbed);
            const embString = `[${emb.join(',')}]`;

            const speaker = ch.chapter === 1 ? 'Sanjaya' : 'Shri Krishna';
            const listener = ch.chapter === 1 ? 'Dhritarashtra' : 'Arjuna';
            const sanskrit = kv.sanskrit || kv.transliteration || '';
            const transliteration = kv.transliteration || '';
            const translation = kv.translation || '';
            const sourceEdition = 'Canonical Shrimad Bhagavad Gita (Bhisma Parva chapters 25-42)';
            const provenance = `Bhagavad Gita Chapter ${ch.chapter}, Verse ${cleanNum}`;
            const deepMeaning = kv.philosophical_context || ch.essence || '';
            const krishnaTeaching = ch.teachings_for_modern_life?.[0] || deepMeaning;
            const themes = ch.keyThemes || ['dharma', 'karma_yoga'];

            await client.query(`
              INSERT INTO gita_verses (
                id, chapter, verse, verse_order, speaker, listener,
                sanskrit, transliteration, translation, source_edition,
                provenance, deep_meaning, krishna_teaching, themes, embedding
              ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10,
                $11, $12, $13, $14, $15::vector
              )
              ON CONFLICT (id) DO UPDATE SET
                sanskrit = EXCLUDED.sanskrit,
                transliteration = EXCLUDED.transliteration,
                translation = EXCLUDED.translation,
                deep_meaning = EXCLUDED.deep_meaning,
                krishna_teaching = EXCLUDED.krishna_teaching,
                themes = EXCLUDED.themes,
                embedding = EXCLUDED.embedding;
            `, [
              verseId,
              ch.chapter,
              verseNum,
              verseOrder,
              speaker,
              listener,
              sanskrit,
              transliteration,
              translation,
              sourceEdition,
              provenance,
              deepMeaning,
              krishnaTeaching,
              themes,
              embString
            ]);

            ingestedCount++;
          }
        }

        return {
          ingestedVerses: ingestedCount,
          totalCanonicalVerses: 700,
          missingVerses: 700 - ingestedCount,
          chaptersCovered: chaptersSeen.size,
          provenance: 'Mahabharata Bhishma Parva Chapters 25-42',
        };
      }
    } finally {
      client.release();
    }
  }
}

// Allow direct execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  GitaIngester.ingestVerifiedGitaVerses()
    .then(report => {
      console.log('[GitaIngester Report]:', report);
      process.exit(0);
    })
    .catch(err => {
      console.error('[GitaIngester Error]:', err);
      process.exit(1);
    });
}
