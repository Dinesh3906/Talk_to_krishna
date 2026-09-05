import fs from 'fs';
import path from 'path';

export interface CorpusVerificationReport {
  valid: boolean;
  totalGitaChapters: number;
  totalKeyVerses: number;
  totalEpisodes: number;
  totalParvas: number;
  duplicateReferences: string[];
  missingMetadata: string[];
  corruptedPassages: string[];
  errors: string[];
  warnings: string[];
}

export class CorpusIntegrityValidator {
  /**
   * Validates the structured corpus files before any chunking or embedding occurs.
   * Fails closed if any critical data corruption, duplicate references, or missing metadata is discovered.
   */
  public static validateCorpus(corpusDir: string): CorpusVerificationReport {
    const report: CorpusVerificationReport = {
      valid: true,
      totalGitaChapters: 0,
      totalKeyVerses: 0,
      totalEpisodes: 0,
      totalParvas: 0,
      duplicateReferences: [],
      missingMetadata: [],
      corruptedPassages: [],
      errors: [],
      warnings: [],
    };

    const gitaPath = path.join(corpusDir, 'bhagavad_gita.json');
    const episodesPath = path.join(corpusDir, 'mahabharata_episodes.json');
    const parvasPath = path.join(corpusDir, 'parvas_overview.json');

    // 1. Verify existence of all corpus files
    for (const [name, filePath] of [
      ['Bhagavad Gita', gitaPath],
      ['Mahabharata Episodes', episodesPath],
      ['Parvas Overview', parvasPath],
    ]) {
      if (!fs.existsSync(filePath)) {
        report.errors.push(`Missing critical corpus file: ${name} at ${filePath}`);
      }
    }

    if (report.errors.length > 0) {
      report.valid = false;
      return report;
    }

    const seenReferences = new Set<string>();

    // 2. Validate Bhagavad Gita Corpus
    try {
      const gitaData = JSON.parse(fs.readFileSync(gitaPath, 'utf-8'));
      if (!Array.isArray(gitaData) || gitaData.length === 0) {
        report.errors.push('Bhagavad Gita corpus must be a non-empty array of chapters.');
      } else {
        report.totalGitaChapters = gitaData.length;

        for (const chap of gitaData) {
          if (!chap.chapter || typeof chap.chapter !== 'number') {
            report.errors.push(`Invalid or missing chapter number in Gita entry`);
          }
          if (!chap.sanskritTitle || !chap.englishTitle) {
            report.missingMetadata.push(`Gita Chapter ${chap.chapter}: missing Sanskrit or English title`);
          }
          if (!chap.summary || chap.summary.trim().length < 20) {
            report.corruptedPassages.push(`Gita Chapter ${chap.chapter}: summary is too short or missing`);
          }

          if (Array.isArray(chap.keyVerses)) {
            for (const v of chap.keyVerses) {
              report.totalKeyVerses++;
              const ref = `Gita-${chap.chapter}.${v.verse}`;

              if (seenReferences.has(ref)) {
                report.duplicateReferences.push(ref);
              }
              seenReferences.add(ref);

              if (!v.verse || !v.translation || v.translation.trim().length < 10) {
                report.corruptedPassages.push(`${ref}: translation is missing or too short`);
              }
              if (!v.speaker) {
                report.missingMetadata.push(`${ref}: missing speaker attribute`);
              }
              if (!v.listener) {
                report.missingMetadata.push(`${ref}: missing listener attribute`);
              }
              if (!v.themes || !Array.isArray(v.themes) || v.themes.length === 0) {
                report.warnings.push(`${ref}: missing themes array`);
              }
              if (!v.context) {
                report.missingMetadata.push(`${ref}: missing context summary`);
              }
              if (!v.relevanceForGuidance) {
                report.warnings.push(`${ref}: missing practical guidance relevance tag`);
              }
            }
          }
        }
      }
    } catch (err: any) {
      report.errors.push(`JSON parse error in bhagavad_gita.json: ${err.message}`);
    }

    // 3. Validate Mahabharata Episodes Corpus
    try {
      const episodesData = JSON.parse(fs.readFileSync(episodesPath, 'utf-8'));
      if (!Array.isArray(episodesData) || episodesData.length === 0) {
        report.errors.push('Mahabharata episodes corpus must be a non-empty array.');
      } else {
        report.totalEpisodes = episodesData.length;

        for (const ep of episodesData) {
          if (!ep.id || !ep.title) {
            report.missingMetadata.push('Episode entry missing id or title');
          }
          if (!ep.parva) {
            report.missingMetadata.push(`Episode ${ep.title || ep.id}: missing parva designation`);
          }
          if (!ep.summary || ep.summary.trim().length < 30) {
            report.corruptedPassages.push(`Episode ${ep.id}: summary is missing or truncated`);
          }
          if (!ep.characters || !Array.isArray(ep.characters) || ep.characters.length === 0) {
            report.missingMetadata.push(`Episode ${ep.id}: missing characters list`);
          }
          if (!ep.themes || !Array.isArray(ep.themes) || ep.themes.length === 0) {
            report.missingMetadata.push(`Episode ${ep.id}: missing themes list`);
          }
          if (!ep.keyDialogues || !Array.isArray(ep.keyDialogues) || ep.keyDialogues.length === 0) {
            report.warnings.push(`Episode ${ep.id}: no key dialogues extracted`);
          }
        }
      }
    } catch (err: any) {
      report.errors.push(`JSON parse error in mahabharata_episodes.json: ${err.message}`);
    }

    // 4. Validate Parvas Overview
    try {
      const parvasData = JSON.parse(fs.readFileSync(parvasPath, 'utf-8'));
      if (!Array.isArray(parvasData) || parvasData.length !== 18) {
        report.errors.push(`Mahabharata Parvas overview must contain exactly 18 parvas (found ${parvasData?.length || 0})`);
      } else {
        report.totalParvas = parvasData.length;

        for (const parva of parvasData) {
          if (!parva.id || !parva.name || !parva.englishMeaning) {
            report.missingMetadata.push(`Parva ${parva.id}: missing essential nomenclature`);
          }
          if (!parva.description || parva.description.trim().length < 30) {
            report.corruptedPassages.push(`Parva ${parva.name}: description is truncated`);
          }
          if (!parva.keyThemes || parva.keyThemes.length === 0) {
            report.missingMetadata.push(`Parva ${parva.name}: missing keyThemes`);
          }
          if (!parva.keyFigures || parva.keyFigures.length === 0) {
            report.missingMetadata.push(`Parva ${parva.name}: missing keyFigures`);
          }
        }
      }
    } catch (err: any) {
      report.errors.push(`JSON parse error in parvas_overview.json: ${err.message}`);
    }

    // Determine validity: critical errors or corrupted passages fail the report
    if (
      report.errors.length > 0 ||
      report.corruptedPassages.length > 0 ||
      report.duplicateReferences.length > 0
    ) {
      report.valid = false;
    }

    return report;
  }
}
