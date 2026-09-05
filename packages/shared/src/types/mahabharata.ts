export interface MahabharataChunk {
  id: string;
  source: 'Mahabharata' | 'Bhagavad Gita';
  parva?: string;
  chapter?: string;
  section?: string;
  verseRange?: string;
  speaker?: string;
  listener?: string;
  characters: string[];
  themes: string[];
  originalText?: string;
  translation: string;
  contextSummary?: string;
  sourceReference: string;
  similarity?: number;
}

export interface ParvaInfo {
  id: number;
  name: string;
  transliteration: string;
  englishMeaning: string;
  subParvasCount: number;
  chaptersCount: number;
  description: string;
  keyThemes: string[];
  keyFigures: string[];
}

export interface GitaChapterInfo {
  chapterNumber: number;
  sanskritName: string;
  englishTranslation: string;
  versesCount: number;
  coreTheme: string;
  summary: string;
}

export interface ScriptureSearchQuery {
  query: string;
  source?: 'Mahabharata' | 'Bhagavad Gita';
  parva?: string;
  character?: string;
  theme?: string;
  limit?: number;
}
