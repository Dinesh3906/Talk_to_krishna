export interface SemanticCorpusChunk {
  sourceType: 'gita' | 'episodes' | 'pdf_volume';
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
  relevanceForGuidance?: string;
  sourceReference: string;
}

export class SemanticChunker {
  /**
   * Chunks Bhagavad Gita chapter objects into verse-level semantic units with context
   */
  public static chunkGita(chapters: any[]): SemanticCorpusChunk[] {
    const chunks: SemanticCorpusChunk[] = [];

    for (const chap of chapters) {
      // 1. Chapter-level overview chunk
      chunks.push({
        sourceType: 'gita',
        parva: 'Bhishma Parva',
        chapter: `${chap.chapter}`,
        section: chap.sanskritTitle,
        characters: ['Krishna', 'Arjuna', 'Sanjaya', 'Dhritarashtra'],
        themes: [chap.theme, 'duty', 'wisdom', 'dharma'],
        translation: `${chap.englishTitle} (${chap.sanskritTitle}): ${chap.summary}`,
        contextSummary: `Bhagavad Gita Chapter ${chap.chapter} introduces core teachings on ${chap.theme}.`,
        relevanceForGuidance: `Provides overarching perspective for seekers exploring ${chap.theme}.`,
        sourceReference: `Bhagavad Gita Chapter ${chap.chapter}`,
      });

      // 2. Key verse semantic units
      if (Array.isArray(chap.keyVerses)) {
        for (const v of chap.keyVerses) {
          chunks.push({
            sourceType: 'gita',
            parva: 'Bhishma Parva',
            chapter: `${chap.chapter}`,
            verseRange: v.verse,
            speaker: v.speaker,
            listener: v.listener,
            characters: [v.speaker, v.listener].filter(Boolean),
            themes: Array.isArray(v.themes) ? v.themes : [],
            originalText: v.transliteration || undefined,
            translation: v.translation,
            contextSummary: v.context,
            relevanceForGuidance: v.relevanceForGuidance,
            sourceReference: `Bhagavad Gita ${chap.chapter}.${v.verse}`,
          });
        }
      }
    }

    return chunks;
  }

  /**
   * Chunks Mahabharata narrative episodes into dialogue and theme-level units
   */
  public static chunkEpisodes(episodes: any[]): SemanticCorpusChunk[] {
    const chunks: SemanticCorpusChunk[] = [];

    for (const ep of episodes) {
      // 1. Episode Narrative Core
      chunks.push({
        sourceType: 'episodes',
        parva: ep.parva,
        chapter: ep.chapter,
        section: ep.title,
        characters: ep.characters || [],
        themes: ep.themes || [],
        translation: `${ep.title}: ${ep.summary}`,
        contextSummary: ep.summary,
        relevanceForGuidance: ep.relevanceForGuidance,
        sourceReference: `Mahabharata ${ep.parva}, ${ep.title}`,
      });

      // 2. Episode Key Dialogues
      if (Array.isArray(ep.keyDialogues)) {
        for (let i = 0; i < ep.keyDialogues.length; i++) {
          const d = ep.keyDialogues[i];
          const text = d.text || (d.question && d.answer ? `Q: ${d.question}\nA: ${d.answer}` : '');

          chunks.push({
            sourceType: 'episodes',
            parva: ep.parva,
            chapter: ep.chapter,
            section: ep.title,
            speaker: d.speaker || (d.question ? 'Yaksha / Dharma' : undefined),
            listener: d.listener || (d.answer ? 'Yudhishthira' : undefined),
            characters: ep.characters || [],
            themes: ep.themes || [],
            translation: text,
            contextSummary: `Key exchange from ${ep.title} in ${ep.parva}.`,
            relevanceForGuidance: ep.relevanceForGuidance,
            sourceReference: `Mahabharata ${ep.parva}, ${ep.title} (Dialogue ${i + 1})`,
          });
        }
      }
    }

    return chunks;
  }

  /**
   * Chunks Parva overviews
   */
  public static chunkParvas(parvas: any[]): SemanticCorpusChunk[] {
    return parvas.map((p) => ({
      sourceType: 'episodes',
      parva: p.name,
      section: p.englishMeaning,
      characters: p.keyFigures || [],
      themes: p.keyThemes || [],
      translation: `${p.name} (${p.englishMeaning}): ${p.description}`,
      contextSummary: `Overview of ${p.name}, containing ${p.chaptersCount} chapters and ${p.subParvasCount} sub-parvas.`,
      relevanceForGuidance: `Foundational structural context for events occurring in ${p.name}.`,
      sourceReference: `Mahabharata Parva ${p.id}: ${p.name}`,
    }));
  }
}
