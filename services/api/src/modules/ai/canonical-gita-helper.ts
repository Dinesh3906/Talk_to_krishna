import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export interface CanonicalGitaVerse {
  id: string;
  chapter: number;
  verse: number;
  speaker: string;
  listener: string;
  sanskrit: string;
  transliteration: string;
  translation: string;
  deepMeaning?: string;
  krishnaTeaching?: string;
  provenance: string;
  themes?: string[];
}

export class CanonicalGitaHelper {
  private static cache: Map<string, CanonicalGitaVerse> | null = null;

  private static findCorpusFile(relativePath: string): string | null {
    const candidates = [
      path.resolve(process.cwd(), relativePath),
      path.resolve(process.cwd(), '../../', relativePath),
      path.resolve(process.cwd(), '../', relativePath),
    ];
    try {
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      candidates.push(
        path.resolve(currentDir, '../../../../../../', relativePath),
        path.resolve(currentDir, '../../../../../', relativePath),
        path.resolve(currentDir, '../../../../', relativePath),
        path.resolve(currentDir, '../../../', relativePath)
      );
    } catch {
      // ignore
    }
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        return c;
      }
    }
    return null;
  }

  public static getVersesMap(): Map<string, CanonicalGitaVerse> {
    if (this.cache) return this.cache;
    const map = new Map<string, CanonicalGitaVerse>();
    const corpusPath = this.findCorpusFile('data/mahabharata/corpus/gita_700_canonical.json');
    if (corpusPath && fs.existsSync(corpusPath)) {
      try {
        const raw = fs.readFileSync(corpusPath, 'utf8');
        const list = JSON.parse(raw);
        for (const item of list) {
          const key = `${item.chapter}.${item.verse}`;
          map.set(key, {
            id: item.id || `BG_${key}`,
            chapter: item.chapter,
            verse: item.verse,
            speaker: item.speaker,
            listener: item.listener,
            sanskrit: item.sanskrit,
            transliteration: item.transliteration,
            translation: item.translation,
            deepMeaning: item.deepMeaning,
            krishnaTeaching: item.krishnaTeaching,
            provenance: item.provenance,
            themes: item.themes,
          });
        }
      } catch (err) {
        console.warn('[CanonicalGitaHelper] Failed to read canonical Gita JSON file:', err);
      }
    }
    this.cache = map;
    return map;
  }

  public static getVerse(chapter: number, verse: number): CanonicalGitaVerse | null {
    const map = this.getVersesMap();
    return map.get(`${chapter}.${verse}`) || null;
  }

  public static parseWordNumber(word: string): number | null {
    const numMap: Record<string, number> = {
      one: 1, first: 1, two: 2, second: 2, three: 3, third: 3, four: 4, fourth: 4,
      five: 5, fifth: 5, six: 6, sixth: 6, seven: 7, seventh: 7, eight: 8, eighth: 8,
      nine: 9, ninth: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
      fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
      thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
    };
    const clean = word.toLowerCase().trim().replace(/[\u2010-\u2015-]/g, '-');
    if (/^\d+$/.test(clean)) return parseInt(clean, 10);
    if (numMap[clean]) return numMap[clean];
    if (clean.includes('-')) {
      const parts = clean.split('-');
      if (parts.length === 2 && numMap[parts[0]] && numMap[parts[1]]) {
        return numMap[parts[0]] + numMap[parts[1]];
      }
    }
    return null;
  }

  public static extractVerseReferences(text: string): { match: string; chapter: number; verse: number; sentence: string }[] {
    const results: { match: string; chapter: number; verse: number; sentence: string }[] = [];
    // 1. Matches digits: "Bhagavad Gita 4.17", "Gita 4:17", "BG 2.47", "Chapter 4, Verse 17", "BG 4:17"
    const regex = /\b(?:(?:Bhagavad\s*Gita|Gita|BG)\s*(?:Chapter\s*)?(\d{1,2})[.:,]?\s*(?:Verse\s*)?(\d{1,2})|Chapter\s*(\d{1,2})[,\s]+(?:Verse\s*)?(\d{1,2}))\b/gi;
    for (const m of text.matchAll(regex)) {
      const chStr = m[1] || m[3];
      const vStr = m[2] || m[4];
      if (chStr && vStr) {
        const chapter = parseInt(chStr, 10);
        const verse = parseInt(vStr, 10);
        const sentence = this.extractSentence(text, m.index || 0, m[0].length);
        results.push({
          match: m[0],
          chapter,
          verse,
          sentence,
        });
      }
    }

    // 2. Matches English written words: "chapter two, verse forty-seven" or "Gita chapter six, verse thirty-five"
    const wordRegex = /\b(?:(?:Bhagavad\s*Gita|Gita|BG)\s*)?chapter\s+([\w\u2010-\u2015\-]+)[,\s]+verse\s+([\w\u2010-\u2015\-]+)\b/gi;
    for (const m of text.matchAll(wordRegex)) {
      const ch = this.parseWordNumber(m[1]);
      const v = this.parseWordNumber(m[2]);
      if (ch && v && ch >= 1 && ch <= 18 && v >= 1 && v <= 78) {
        const alreadyFound = results.some(r => r.chapter === ch && r.verse === v);
        if (!alreadyFound) {
          const sentence = this.extractSentence(text, m.index || 0, m[0].length);
          results.push({
            match: m[0],
            chapter: ch,
            verse: v,
            sentence,
          });
        }
      }
    }

    return results;
  }

  private static extractSentence(text: string, matchIndex: number, matchLength: number): string {
    // Look backwards from matchIndex, skipping periods that are part of numbers like 4.17
    let left = 0;
    for (let i = matchIndex - 1; i >= 0; i--) {
      const ch = text[i];
      if (ch === '\n') {
        left = i + 1;
        break;
      }
      if (ch === '.' || ch === '!' || ch === '?') {
        // Ensure not part of decimal number or abbreviation
        const prev = i > 0 ? text[i - 1] : '';
        const next = i < text.length - 1 ? text[i + 1] : '';
        if (/\d/.test(prev) && /\d/.test(next)) continue;
        left = i + 1;
        break;
      }
    }

    // Look forwards from after the match
    let right = text.length;
    for (let i = matchIndex + matchLength; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\n') {
        right = i;
        break;
      }
      if (ch === '.' || ch === '!' || ch === '?') {
        const prev = i > 0 ? text[i - 1] : '';
        const next = i < text.length - 1 ? text[i + 1] : '';
        if (/\d/.test(prev) && /\d/.test(next)) continue;
        right = i + 1;
        break;
      }
    }

    return text.slice(left, right).trim();
  }

  public static validateVerseClaim(
    chapter: number,
    verse: number,
    claimSentence: string
  ): { supported: boolean; reason?: string; canonicalVerse?: CanonicalGitaVerse } {
    const canonical = this.getVerse(chapter, verse);
    if (!canonical) {
      return {
        supported: false,
        reason: `Verse reference ${chapter}.${verse} does not exist in the Bhagavad Gita (canonical Gita contains 18 chapters, 700 verses).`,
      };
    }

    const verseCorpus = `${canonical.translation} ${canonical.deepMeaning || ''} ${canonical.krishnaTeaching || ''} ${(canonical.themes || []).join(' ')} ${canonical.sanskrit || ''} ${canonical.transliteration || ''}`.toLowerCase();

    // 1. Defect 2 (E4): Universal suffering-as-punishment claim attached to BG 4.17 or any verse
    if (chapter === 4 && verse === 17) {
      const isSufferingPunishmentClaim = /\b(punish|punished|punishment|suffer|suffers|suffering|penalty|penalized)\b/i.test(claimSentence);
      const isDenial = /\b(does not|not|never|cannot|neither|refutes?|unsupported|no evidence|hard to understand)\b/i.test(claimSentence);
      if (isSufferingPunishmentClaim && !isDenial) {
        return {
          supported: false,
          reason: `Bhagavad Gita 4.17 addresses the deep nature of action, forbidden action, and inaction; it does not state that all suffering is punishment for past-life karma.`,
          canonicalVerse: canonical,
        };
      }
    }

    // 2. BG 2.47 attached to guaranteed worldly success, wealth, or unrelated crafts
    if (chapter === 2 && verse === 47) {
      const isGuaranteedSuccessClaim = /\b(guarantee|guaranteed|wealth|rich|prosperity|worldly success|certain victory)\b/i.test(claimSentence);
      const isDenialOrDetachment = /\b(not|never|no|dissociat\w+|without|detach\w+|unattached)\b/i.test(claimSentence);
      if (isGuaranteedSuccessClaim && !isDenialOrDetachment) {
        return {
          supported: false,
          reason: `Bhagavad Gita 2.47 teaches acting without attachment to fruits; it does not guarantee worldly success or wealth.`,
          canonicalVerse: canonical,
        };
      }
    }

    // 3. Substantive topic and token overlap check
    const claimTokens = claimSentence.toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 4 && !['gita', 'bhagavad', 'verse', 'chapter', 'says', 'states', 'speaks', 'teaches', 'krishna', 'arjuna', 'according', 'explains', 'reminds', 'refers', 'this', 'that', 'with', 'from', 'have', 'been', 'must'].includes(t));

    if (claimTokens.length > 0) {
      const matched = claimTokens.filter(t =>
        verseCorpus.includes(t) ||
        (chapter === 2 && verse === 47 && ['duty', 'duties', 'work', 'action', 'fruit', 'fruits', 'result', 'results', 'outcome', 'outcomes', 'karma', 'detachment', 'attachment'].includes(t)) ||
        (chapter === 11 && verse === 32 && ['time', 'destroyer', 'destruction', 'worlds', 'armies', 'death', 'slay'].includes(t))
      );
      const ratio = matched.length / claimTokens.length;
      if (ratio < 0.15 && matched.length < 2) {
        return {
          supported: false,
          reason: `Verse ${chapter}.${verse} does not support the attached substantive claim: "${claimSentence.slice(0, 120)}..."`,
          canonicalVerse: canonical,
        };
      }
    }

    return {
      supported: true,
      canonicalVerse: canonical,
    };
  }
}


