import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { CorpusIntegrityValidator } from './corpus-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('CorpusIntegrityValidator', () => {
  it('should validate the canonical Mahabharata & Gita corpus files without errors', () => {
    const corpusDir = path.resolve(__dirname, '../../../../../data/mahabharata/corpus');
    const report = CorpusIntegrityValidator.validateCorpus(corpusDir);

    expect(report.valid).toBe(true);
    expect(report.errors).toHaveLength(0);
    expect(report.corruptedPassages).toHaveLength(0);
    expect(report.duplicateReferences).toHaveLength(0);

    // Verify expectations
    expect(report.totalGitaChapters).toBeGreaterThanOrEqual(18);
    expect(report.totalKeyVerses).toBeGreaterThanOrEqual(18);
    expect(report.totalEpisodes).toBeGreaterThanOrEqual(2);
    expect(report.totalParvas).toBe(18);
  });
});
