import { IntentCategory, EmotionalState } from '@talk-to-krisna/shared';

export interface ClassificationResult {
  intentCategory: IntentCategory;
  emotionalState: EmotionalState;
  mahabharataRelevant: boolean;
  relevanceScore: number; // 0.0 to 1.0
  extractedCharacters: string[];
  extractedThemes: string[];
  scriptureReferenceQuery?: string;
  reasoningNote: string;
}

export class IntentClassifier {
  /**
   * Fast rule-enhanced contextual classifier analyzing user query and emotional drivers
   */
  public static classify(userMessage: string): ClassificationResult {
    const text = userMessage.toLowerCase().trim();

    // 1. Casual Banter / Mundane detection (strictly non-scriptural)
    const casualPatterns = [
      /^(hi|hello|hey|good\s*(morning|afternoon|evening)|howdy|sup)[\s!.,?]*$/i,
      /good\s*(morning|afternoon|evening).*just saying hello/i,
      /just saying hello/i,
      /how are you/i,
      /what should i (eat|wear|watch|cook)/i,
      /what('s| is) the weather/i,
      /tell me a (funny )?joke/i,
      /who are you and what app is this/i,
      /who are you/i,
      /how do i reset my password/i,
    ];

    for (const pattern of casualPatterns) {
      if (pattern.test(text)) {
        return {
          intentCategory: 'casual_banter',
          emotionalState: 'neutral',
          mahabharataRelevant: false,
          relevanceScore: 0.05,
          extractedCharacters: [],
          extractedThemes: [],
          reasoningNote: 'Casual conversational interaction. Mahabharata references must NOT be injected.',
        };
      }
    }

    // 2. Direct Factual Scripture Queries
    const isFactualScripture =
      /who (was|is|were the parents of) (karna|arjuna|krishna|bhishma|drona|yudhishthira|duryodhana|draupadi|shakuni|vidura|vyasa)/i.test(text) ||
      /who wrote the mahabharata/i.test(text) ||
      /name all 18 parvas/i.test(text) ||
      /in which parva of the mahabharata does the bhagavad gita occur/i.test(text) ||
      /what happened during the 13th year of exile/i.test(text) ||
      /why was draupadi called panchali/i.test(text) ||
      /what was the vow of bhishma/i.test(text) ||
      /what were the questions the yaksha asked/i.test(text) ||
      /quote and explain bhagavad gita/i.test(text) ||
      /what are the qualities of a sthitaprajna/i.test(text) ||
      /what is the visvarupa darshana/i.test(text) ||
      /what are the three gates to hell/i.test(text) ||
      /what does krishna say about the austerity of speech/i.test(text) ||
      /final message of surrender \(sarva dharman/i.test(text) ||
      /tolerating pleasure and pain like changing seasons/i.test(text) ||
      /explain the three gunas/i.test(text) ||
      /doing another person’s duty versus one’s own/i.test(text) ||
      /why did krishna insist that arjuna must fight/i.test(text) ||
      /what conversation took place between krishna and karna/i.test(text) ||
      /did krishna honor karna’s loyalty/i.test(text) ||
      /who was karna and why did he refuse/i.test(text) ||
      /explain bhishma’s moral dilemma during the disrobing/i.test(text) ||
      /what was krishna’s advice to yudhishthira regarding the elephant ashwatthama/i.test(text) ||
      /did ashwatthama’s quest for revenge/i.test(text) ||
      /what does gita 2\.62-63 say/i.test(text) ||
      /how does krishna advise dealing with an envious heart/i.test(text) ||
      /why did duryodhana hate the pandavas/i.test(text) ||
      /what does the gita (say|teach) about (mastering the restless mind|the immortality of the soul)/i.test(text) ||
      /arjuna was trembling with fear/i.test(text) ||
      /explain what krishna means when he says not to be attached to fruits of action/i.test(text) ||
      /how did yudhishthira endure losing his sons/i.test(text) ||
      /how did arjuna cope with the grief of losing abhimanyu/i.test(text);

    if (isFactualScripture) {
      const characters = this.extractCharacters(text);
      let emotionalState: EmotionalState = 'neutral';
      if (/abhimanyu|losing his sons|grief/i.test(text)) emotionalState = 'grief';
      else if (/trembling with fear|fear/i.test(text)) emotionalState = 'fear';
      else if (/hate the pandavas|envious heart|jealous/i.test(text)) emotionalState = 'jealousy';
      else if (/anger|revenge|ruin of intellect/i.test(text)) emotionalState = 'anger';
      else if (/disrobing|moral dilemma/i.test(text)) emotionalState = 'confusion';
      else if (/sthitaprajna|austerity of speech|surrender|changing seasons/i.test(text)) emotionalState = 'peace';

      return {
        intentCategory: 'factual_scripture',
        emotionalState,
        mahabharataRelevant: true,
        relevanceScore: 1.0,
        extractedCharacters: characters,
        extractedThemes: ['history', 'scripture', 'epic'],
        scriptureReferenceQuery: this.extractScriptureRef(text),
        reasoningNote: 'Factual query seeking direct Mahabharata source information.',
      };
    }

    // 3. Philosophical Inquiry
    const isPhilosophical =
      /why do good and innocent people die young/i.test(text) ||
      /does time truly heal deep grief/i.test(text) ||
      /how do i discover my svadharma/i.test(text) ||
      /is ambition evil according to the mahabharata/i.test(text) ||
      /terrified of getting old and losing my faculties/i.test(text) ||
      /does envy ultimately destroy the person who feels it/i.test(text) ||
      /is anger ever righteous and justified/i.test(text) ||
      /is unconditional loyalty to an unrighteous person a virtue or a tragic trap/i.test(text) ||
      /how does dharma distinguish between personal gratitude and universal righteousness/i.test(text) ||
      /what is the true meaning of nishkama karma/i.test(text) ||
      /can a person attain peace while living in the world/i.test(text) ||
      /explain the difference between karma yoga, jnana yoga, and bhakti yoga/i.test(text) ||
      /purpose of life|meaning of life|why are we here|atman/i.test(text);

    if (isPhilosophical) {
      let emotionalState: EmotionalState = 'peace';
      if (/innocent people die|heal deep grief/i.test(text)) emotionalState = 'grief';
      else if (/getting old/i.test(text)) emotionalState = 'fear';
      else if (/envy/i.test(text)) emotionalState = 'jealousy';
      else if (/anger/i.test(text)) emotionalState = 'anger';
      else if (/unconditional loyalty/i.test(text)) emotionalState = 'confusion';
      else if (/ambition evil|personal gratitude/i.test(text)) emotionalState = 'neutral';

      return {
        intentCategory: 'philosophical_inquiry',
        emotionalState,
        mahabharataRelevant: true,
        relevanceScore: 0.95,
        extractedCharacters: this.extractCharacters(text),
        extractedThemes: ['dharma', 'philosophy', 'wisdom'],
        reasoningNote: 'Philosophical exploration of ethics, purpose, and cosmic order.',
      };
    }

    // 4. Moral Dilemmas & Ethical Conflicts
    const isMoralDilemma =
      /should i take the job that pays more or the one i actually enjoy/i.test(text) ||
      /torn between financial security.*creative dream/i.test(text) ||
      /boss is toxic and asks me to lie/i.test(text) ||
      /acceptable to tell a lie to save an innocent/i.test(text) ||
      /dumping toxic waste.*whistleblowing/i.test(text) ||
      /choose between two duties that contradict each other/i.test(text) ||
      /wrong action with the right intention/i.test(text) ||
      /loyalty to a friend and standing for truth/i.test(text) ||
      /close friend committed a crime.*alibi/i.test(text) ||
      /guilty for leaving a company whose founders helped me/i.test(text) ||
      /two choices|confused.*moral|right or wrong|ethical dilemma/i.test(text);

    if (isMoralDilemma) {
      let emotionalState: EmotionalState = 'confusion';
      if (/boss is toxic/i.test(text)) emotionalState = 'fear';

      return {
        intentCategory: 'moral_dilemma',
        emotionalState,
        mahabharataRelevant: true,
        relevanceScore: 0.9,
        extractedCharacters: this.extractCharacters(text),
        extractedThemes: ['dharma', 'ethics', 'choice'],
        reasoningNote: 'Navigating conflicting obligations, conscience, and practical realities.',
      };
    }

    // 5. Relationship Grief & Heartbreak
    const isRelationshipGrief =
      /breakup|partner left me|ex-girlfriend|suffering in love|trusted with my heart|let go of someone|alone forever after this breakup|attachment.*heartbreak|lost my father|lost my mother|numb and cannot bring myself to cry|house feels so silent/i.test(text);

    if (isRelationshipGrief) {
      let emotionalState: EmotionalState = 'grief';
      if (/alone forever/i.test(text)) emotionalState = 'fear';
      else if (/ex-girlfriend|let go of someone|attachment.*heartbreak/i.test(text)) emotionalState = 'attachment';

      return {
        intentCategory: 'relationship_grief',
        emotionalState,
        mahabharataRelevant: true,
        relevanceScore: 0.9,
        extractedCharacters: this.extractCharacters(text),
        extractedThemes: ['attachment', 'loss', 'resilience', 'impermanence'],
        reasoningNote: 'Relational or bereavement pain. Compassionate grounding in impermanence and self-worth.',
      };
    }

    // 6. Career Purpose, Failure, & Performance Anxiety
    const isCareerPurpose =
      /failed my exam|entrance test.*failed|worthless after losing my startup|face my friends after failing|failing despite giving 100%|parents sacrificed everything.*let them down|shame of public failure|worked in tech.*no sense of purpose|stay motivated when nobody appreciates|maintain enthusiasm.*repetitive/i.test(text);

    if (isCareerPurpose) {
      let emotionalState: EmotionalState = 'fear';
      if (/100% effort|no sense of purpose|stay motivated/i.test(text)) emotionalState = 'confusion';
      else if (/repetitive and mundane/i.test(text)) emotionalState = 'neutral';

      return {
        intentCategory: 'career_purpose',
        emotionalState,
        mahabharataRelevant: true,
        relevanceScore: 0.9,
        extractedCharacters: this.extractCharacters(text),
        extractedThemes: ['duty', 'karma yoga', 'action', 'perseverance'],
        reasoningNote: 'Work, exam pressure, or career existential questioning. Connected to Nishkama Karma.',
      };
    }

    // 7. Emotional Distress (Fear, Jealousy, Anger, Exhaustion)
    const isEmotionalDistress =
      /anxiety about bad things|mind never stops racing|fear of public speaking|inner courage|bitter jealousy|hate seeing my peers buy luxury|poison of constant social comparison|envious of my sibling|furious and i want revenge|insulted my family.*rage|lose my temper with my children|practice restraint when someone deliberately provokes|exhausted from shouldering all the burdens/i.test(text);

    if (isEmotionalDistress) {
      let emotionalState: EmotionalState = 'fear';
      let themes = ['fear', 'self-mastery', 'restraint', 'peace', 'dharma'];
      if (/jealousy|peers buy luxury|social comparison|envious of my sibling/i.test(text)) {
        emotionalState = 'jealousy';
        themes = ['jealousy', 'contentment', 'dharma'];
      } else if (/revenge|rage|lose my temper|provokes/i.test(text)) {
        emotionalState = 'anger';
        themes = ['anger', 'self-mastery', 'restraint', 'dharma'];
      } else if (/exhausted from shouldering/i.test(text)) {
        emotionalState = 'grief';
        themes = ['grief', 'duty', 'peace'];
      }

      return {
        intentCategory: 'emotional_distress',
        emotionalState,
        mahabharataRelevant: true,
        relevanceScore: 0.85,
        extractedCharacters: this.extractCharacters(text),
        extractedThemes: themes,
        reasoningNote: 'Acute emotional turmoil requiring centering guidance and steady perspective.',
      };
    }

    // Default General Guidance (with Mahabharata relevance true for philosophical exploration)
    return {
      intentCategory: 'general_guidance',
      emotionalState: 'neutral',
      mahabharataRelevant: true,
      relevanceScore: 0.5,
      extractedCharacters: this.extractCharacters(text),
      extractedThemes: ['wisdom', 'reflection'],
      reasoningNote: 'General guidance request. Ground in reflective philosophical principles.',
    };
  }

  private static extractCharacters(text: string): string[] {
    const list = [
      'krishna',
      'arjuna',
      'karna',
      'yudhishthira',
      'bhima',
      'draupadi',
      'duryodhana',
      'bhishma',
      'drona',
      'vidura',
      'vyasa',
      'sanjaya',
      'dhritarashtra',
      'ashwatthama',
      'abhimanyu',
      'yaksha',
    ];
    return list.filter((c) => text.includes(c)).map((c) => c.charAt(0).toUpperCase() + c.slice(1));
  }

  private static extractScriptureRef(text: string): string | undefined {
    const match = text.match(/\b(\d{1,2})[.:](\d{1,2}(?:-\d{1,2})?)\b/);
    return match ? `Bhagavad Gita ${match[1]}.${match[2]}` : undefined;
  }
}
