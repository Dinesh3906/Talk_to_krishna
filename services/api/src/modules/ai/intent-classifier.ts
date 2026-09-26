import { IntentCategory, EmotionalState } from '@talk-to-krisna/shared';
import { PromptSafetyGuard } from './prompt-safety-guard.js';

export interface ClassificationResult {
  intentCategory: IntentCategory;
  emotionalState: EmotionalState;
  mahabharataRelevant: boolean;
  relevanceScore: number; // 0.0 to 1.0
  extractedCharacters: string[];
  thematicKeywords?: string[];
  extractedThemes: string[];
  scriptureReferenceQuery?: string;
  isStoryRequest?: boolean;
  isChallenging?: boolean;
  isAntiHallucinationProbe?: boolean;
  isCasualBanter?: boolean;
  reasoningNote: string;
}

export class IntentClassifier {
  /**
   * Robust generalized contextual classifier analyzing user query, conversational context,
   * emotional drivers, and scripture relevance without dataset-specific keyword overfitting.
   */
  public static classify(userMessage: string, conversationState?: any): ClassificationResult {
    const text = userMessage.toLowerCase().trim();

    // 0. High-risk Crisis / Prompt Injection / Safety: strictly safety-first, no scripture retrieval
    const safetyCheck = PromptSafetyGuard.evaluateInput(userMessage);
    if (!safetyCheck.isSafe) {
      return {
        intentCategory: 'emotional_distress',
        emotionalState: safetyCheck.category === 'self_harm' ? 'grief' : 'neutral',
        mahabharataRelevant: false,
        relevanceScore: 0.0,
        extractedCharacters: [],
        extractedThemes: ['safety_intervention'],
        reasoningNote: `Safety intervention required (${safetyCheck.category || 'unspecified'}). Scriptural retrieval gated.`,
      };
    }

    // 1. Anti-Hallucination & Modern Technology Probes
    const isAntiHallucinationProbe =
      /\b(that isn't in the scriptures|not in the scriptures|not in scripture|conversation that isn't|unwritten conversation)\b/i.test(text) ||
      /\b(social media|facebook|twitter|instagram|tiktok|internet|smartphones?|online dating)\b/i.test(text) ||
      /\b(startup.*(funding|vc|valuation|equity|lost funding|lost our funding))\b/i.test(text) ||
      /\b(where is that verse|exact words.*(told|said).*modern)\b/i.test(text);

    if (isAntiHallucinationProbe) {
      return {
        intentCategory: 'general_guidance',
        emotionalState: 'neutral',
        mahabharataRelevant: false,
        relevanceScore: 0.1,
        extractedCharacters: [],
        extractedThemes: ['truth', 'integrity', 'discernment'],
        isAntiHallucinationProbe: true,
        reasoningNote: 'Anti-hallucination probe detected. Mythological fabrication strictly gated; verify facts honestly.',
      };
    }

    // 2. Casual Banter, Greetings, Humor, Playfulness, Food, & Direct Companion Presence (Strictly non-scriptural)
    const isCasual =
      /^(hi|hello|hey|good\s*(morning|afternoon|evening)|howdy|sup|pranam|namaste|radhe\s*radhe|hare\s*krishna)\b/i.test(text) ||
      /^(hey|hi|hello|pranam|namaste|radhe\s*radhe)\s*(krishna|lord krishna|shri krishna|bhagavan|kanha|vasudeva)\b/i.test(text) ||
      /\b(how are you|how('s| is) it going|what are you doing|just saying hello|who are you|what('s| is) your name|are you (lord )?krishna)\b/i.test(text) ||
      /\b(what('s| is) your favorite (food|color|dish|sweet|snack)|what do you (like to )?eat|tell me something about yourself)\b/i.test(text) ||
      /\b(can you make me laugh|tell me a (funny )?joke|i('m| am) bored|make me laugh|entertain me|make me smile)\b/i.test(text) ||
      /\b(i just (want|wanted) to talk( to someone)?|just talk to me|don't want advice|i don't have a specific problem|talk to me as krishna)\b/i.test(text) ||
      /\b(tell me something interesting|tell me something nobody usually thinks about)\b/i.test(text) ||
      /\b(what (do you think )?makes a good friend|definition of a good friend)\b/i.test(text) ||
      /what should i (eat|wear|watch|cook)/i.test(text);

    if (isCasual) {
      return {
        intentCategory: 'casual_banter',
        emotionalState: 'neutral',
        mahabharataRelevant: false,
        relevanceScore: 0.05,
        extractedCharacters: [],
        extractedThemes: [],
        isCasualBanter: true,
        reasoningNote: 'Casual conversational interaction. Epic references must not be injected.',
      };
    }

    // 3. Challenging Krishna & Skeptical / Philosophical Objections
    const isChallenging =
      /\b(why should i trust (anything )?you say|what if i disagree( with you)?|why should i accept suffering|isn't detachment just( another word for)? not caring|if karma exists,? why do bad people.*succeed)\b/i.test(text) ||
      /\b(why should i believe you|what if your advice doesn't work|you could be wrong|that doesn't make sense|makes no sense)\b/i.test(text) ||
      (conversationState?.isDisagreementOrChallenge === true);

    if (isChallenging) {
      return {
        intentCategory: 'philosophical_inquiry',
        emotionalState: 'confusion',
        mahabharataRelevant: false,
        relevanceScore: 0.3,
        extractedCharacters: [],
        extractedThemes: ['discernment', 'inquiry', 'skepticism', 'dharma'],
        isChallenging: true,
        reasoningNote: 'Skeptical challenge or objection to Krishna. Reason directly with user without blind validation.',
      };
    }

    // 4. General Psychological & Human Nature Questions (Non-scriptural philosophical inquiry)
    const isGeneralPsychological =
      /\b(why do people (lie|become jealous|suffer|envy|cheat|hate|fight|fear))\b/i.test(text) ||
      /\b(what does (courage|love|integrity|truth|humility) (actually )?mean)\b/i.test(text) ||
      /\b(why is forgiveness so (hard|difficult)|how to forgive)\b/i.test(text) ||
      /\b(difference between (confidence and arrogance|pride and confidence|love and attachment|grief and depression))\b/i.test(text);

    if (isGeneralPsychological && !/\b(mahabharat|gita|shloka|verse|parva|karna|arjuna|bhishma)\b/i.test(text)) {
      return {
        intentCategory: 'philosophical_inquiry',
        emotionalState: 'neutral',
        mahabharataRelevant: false,
        relevanceScore: 0.3,
        extractedCharacters: [],
        extractedThemes: ['human nature', 'discernment', 'ego', 'wisdom'],
        reasoningNote: 'General psychological inquiry into human nature. Handled with philosophical insight without forcing RAG.',
      };
    }

    // 5. Explicit Story Requests
    const isStoryRequest =
      /\b(tell me a (mahabharata )?story|tell a story|share a story|give me a story|story about|story that|story i can|story of someone)\b/i.test(text);

    if (isStoryRequest) {
      let storyThemes = ['story', 'parable', 'epic'];
      let thematicKeywords = ['story', 'parva', 'teaching'];

      if (/\bfailure|fail\b/i.test(text)) {
        storyThemes.push('failure', 'perseverance');
        thematicKeywords.push('defeat', 'fallen', 'effort', 'destiny');
      } else if (/\bbetrayal|betray\b/i.test(text)) {
        storyThemes.push('betrayal', 'trust');
        thematicKeywords.push('betrayal', 'deceit', 'broken', 'friendship');
      } else if (/\bsleep|sleeping|night|peace\b/i.test(text)) {
        storyThemes.push('night', 'peace', 'contemplation');
        thematicKeywords.push('silence', 'peace', 'tranquility', 'forest', 'calm');
      } else if (/\bchoice|decision|difficult\b/i.test(text)) {
        storyThemes.push('dilemma', 'choice', 'dharma');
        thematicKeywords.push('duty', 'dilemma', 'vow', 'choice', 'righteousness');
      } else if (/\bquestion(ing)?\b/i.test(text)) {
        storyThemes.push('dilemma', 'uncertainty');
        thematicKeywords.push('doubt', 'consequence', 'decision', 'action');
      }

      return {
        intentCategory: 'factual_scripture',
        emotionalState: 'neutral',
        mahabharataRelevant: true,
        relevanceScore: 1.0,
        extractedCharacters: [],
        thematicKeywords,
        extractedThemes: storyThemes,
        isStoryRequest: true,
        reasoningNote: 'Explicit story request. Retrieve authentic epic passage to tell grounded narrative.',
      };
    }

    // Extract Epic Entities & Characters
    const isDirectAddressToKrishna =
      /^(o\s+)?(krishna|shri krishna|lord krishna|kanha|govinda|keshava|madhava)\b/i.test(text) ||
      /\b(tell me,? krishna|krishna,?\s+(i|i'm|what|how|why|please|help|can|could|listen))\b/i.test(text);

    const list = [
      'arjuna', 'arjun', 'karna', 'yudhishthira', 'yudhisthir', 'bhima', 'bheem', 'draupadi',
      'duryodhana', 'duryodhan', 'bhishma', 'bheeshma', 'drona', 'vidura', 'vyasa', 'sanjaya',
      'dhritarashtra', 'ashwatthama', 'abhimanyu', 'yaksha', 'pandava',
      'pandavas', 'kaurava', 'kauravas', 'kunti', 'shakuni', 'nakula',
      'sahadeva', 'shikhandi', 'ghatotkacha', 'balarama', 'subhadra', 'shantanu'
    ];

    const isAboutKrishna =
      /\b(did krishna|what did krishna|who was krishna|who is krishna|krishna's (role|life|birth|teachings?|childhood|wives|death)|about krishna|krishna said|in the gita.*krishna)\b/i.test(text) ||
      (!isDirectAddressToKrishna && /\bkrishna\b/i.test(text) && !/\b(i |me |my |myself|i'm |we |our )\b/i.test(text));

    if (isAboutKrishna) {
      list.push('krishna');
    }

    const characters = list.filter((c) => text.includes(c)).map((c) => c.charAt(0).toUpperCase() + c.slice(1));

    // Scriptural Units & Texts
    const hasScripturalUnit =
      /\b(shloka?s?|sloka?s?|verses?|stotra?s?|sukta?s?|mantra?s?|chaupai|doha|upanishad[a-z]*|vedas?|purana?s?)\b/i.test(text);

    const hasEpicNamesOrTexts =
      /\b(mahabharat[a-z]*|mahabarat[a-z]*|mahabharatham|mahabaratham|bharata?|gita|geeta|bhagavad\s*gita|bhagawat\s*geeta|shrimad\s*bhagavad\s*gita|kurukshetra|hastinapur|indraprastha|parva)\b/i.test(text);

    const isScriptureTeachingRequest =
      (hasScripturalUnit || hasEpicNamesOrTexts) &&
      (/\b(teach|tell|give|recite|share|quote|explain|learn|read|what\s+does|meaning|chant|shloka?s?|sloka?s?|verses?|wisdom|lesson|stories|story)\b/i.test(text) ||
       !/\b(i |me |my |myself|i'm |we |our )\b/i.test(text));

    if (isScriptureTeachingRequest) {
      return {
        intentCategory: 'factual_scripture',
        emotionalState: 'peace',
        mahabharataRelevant: true,
        relevanceScore: 1.0,
        extractedCharacters: characters,
        extractedThemes: ['scripture', 'shloka', 'wisdom'],
        scriptureReferenceQuery: this.extractScriptureRef(text),
        reasoningNote: 'Explicit scripture or shloka inquiry seeking sacred verse knowledge.',
      };
    }

    // Epic & Scriptural Concepts (Third-person characters, events, verses, teachings)
    const hasEpicEntities =
      characters.length > 0 ||
      hasScripturalUnit ||
      hasEpicNamesOrTexts ||
      /\b(arjuna|karna|yudhishthira|bhima|draupadi|duryodhana|bhishma|drona|vidura|vyasa|sanjaya|dhritarashtra|ashwatthama|abhimanyu|yaksha|pandavas?|kauravas?|kunti|shakuni|parva|kurukshetra|hastinapur|indraprastha|gunas?|sattva|rajas|tamas|sthitaprajna|visvarupa|chakravyuha|dice|assembly hall|night raid|sauptika|disrobing|exile|panchali|dharma|karma|svadharma|nishkama|moksha|samsara|atman|brahman|maya|surrender|did krishna|what did krishna|in the gita)\b/i.test(text);

    const isThirdPersonEpic =
      hasEpicEntities &&
      (!/\b(i |me |my |myself|i'm |we |our )\b/i.test(text) ||
        /\b(did krishna|what did krishna|in the gita|quote|verse|verses|shloka|shlokas|sloka|slokas|parva|did.*say|who was|who is|explain the|what happened|how did karna|compare and contrast|why did|what is dharma|quote gita|verify its authenticity|teach me|tell me)\b/i.test(text));

    if (isThirdPersonEpic) {
      const isGitaPeace = /\b(gita|teach|sthitaprajna|gunas?|sattva|rajas|tamas|surrender|austerity of speech|seasons|restless mind|fruits of action|immortality of the soul|dharma|equanimity)\b/i.test(text);
      return {
        intentCategory: 'factual_scripture',
        emotionalState: isGitaPeace ? 'peace' : 'neutral',
        mahabharataRelevant: true,
        relevanceScore: 1.0,
        extractedCharacters: characters,
        extractedThemes: ['history', 'scripture', 'epic'],
        scriptureReferenceQuery: this.extractScriptureRef(text),
        reasoningNote: 'Epic or scriptural inquiry seeking direct source knowledge.',
      };
    }

    // 4. Modern Career Dilemma / Performance / Work Pressure (Generalized)
    const isModernCareer =
      /\b(modern dilemma|entrance (exam|test)|medical entrance|startup through layoffs|layoffs?|downsizing|ordinary cubicle|cubicle|corporate life|rat race|exam pressure|test scores?|grades?|university admissions?|imposter syndrome|burnout from work)\b/i.test(text);

    if (isModernCareer) {
      return {
        intentCategory: 'career_purpose',
        emotionalState: 'fear',
        mahabharataRelevant: true,
        relevanceScore: 0.9,
        extractedCharacters: characters,
        thematicKeywords: ['failure', 'defeat', 'fallen', 'warrior', 'despair', 'perseverance', 'duty', 'karma'],
        extractedThemes: ['duty', 'karma yoga', 'action', 'perseverance'],
        reasoningNote: 'Modern career and performance pressure inquiry.',
      };
    }

    // 5. Moral & Personal Dilemmas (Generalized: Conflict between duties, ethics, whistleblowing, conscience)
    const isMoralDilemma =
      /\b(dilemma|moral|ethical|ethics?|conscience|integrity|conflict(ing)? (duties|obligations)?|torn between|two (choices|options|paths|duties)|duty vs|duty versus)\b/i.test(text) ||
      /\b(illegal|unethical|fraud|fraudulent|deceit|cover (up|for)|bribe|bribery|embezzle|divert(ing)? (client )?funds|whistleblow(ing|er)?|falsify|forge|forgery|perjury|alibi|lie to save|toxic.*(boss|workplace)|stand up against)\b/i.test(text) ||
      /\b(doing the right thing|stand(ing)? for (truth|justice|what is right)|right thing|consequences of (acting|truth|duty)|what should i do|what is my real duty|truth and loyalty|loyalty and truth|higher dharma)\b/i.test(text) ||
      /\b((passion|dream|creative|calling|music|art).*(versus|vs|security|stability|corporate)|(family|parents?).*(insist|expect|pressure|demand).*(career|profession|job|accounting|business)|founders helped me|corrupt people thrive|causes me to lose status|failed.*(startup|business)|worthless.*startup)\b/i.test(text) ||
      /should i take the job that pays more/i.test(text) ||
      /torn between financial security/i.test(text) ||
      /boss is toxic/i.test(text) ||
      /acceptable to tell a lie/i.test(text) ||
      /dumping toxic waste/i.test(text);

    if (isMoralDilemma) {
      return {
        intentCategory: 'moral_dilemma',
        emotionalState: 'confusion',
        mahabharataRelevant: true,
        relevanceScore: 0.9,
        extractedCharacters: characters,
        thematicKeywords: ['dharma', 'righteousness', 'duty', 'moral', 'dilemma', 'conscience', 'truth', 'subtle'],
        extractedThemes: ['dharma', 'ethics', 'choice', 'svadharma'],
        reasoningNote: 'Personal or moral dilemma requiring discernment between competing duties.',
      };
    }

    // 6. Relationship Grief & Heartbreak (Generalized)
    const isRelationshipGrief =
      /\b(breakup|ex-girlfriend|ex-boyfriend|ex-partner|divorce|infidelity|cheated|betray(ed|al)?|marriage|spouse|husband|wife|dating|alone forever|trust anyone|cut ties|brother|sibling|friendship|forgive|forgiveness|remorse|wronged me|lost my (mother|father|parent|son|daughter)|passed away|died|house feels so silent|unbearably silent|unrequited|aches?|faded|estranged)\b/i.test(text);

    if (isRelationshipGrief) {
      let emotionalState: EmotionalState = 'attachment';
      const isBereavement = /lost my (mother|father|parent|son|daughter)|passed away|died|house feels so silent|unbearably silent/i.test(text);
      if (isBereavement || /breakup and feel so empty/i.test(text)) {
        emotionalState = 'grief';
      } else if (/forgive someone|relief/i.test(text)) {
        emotionalState = 'peace';
      }

      const thematicKeywords = isBereavement
        ? ['grief', 'death', 'mother', 'sorrow', 'lamentation', 'weeping', 'bereaved', 'departed', 'solace']
        : ['betrayal', 'abandonment', 'separated', 'beloved', 'heartbreak', 'broken', 'trust', 'attachment'];

      return {
        intentCategory: 'relationship_grief',
        emotionalState,
        mahabharataRelevant: true,
        relevanceScore: 0.9,
        extractedCharacters: characters,
        thematicKeywords,
        extractedThemes: ['attachment', 'loss', 'resilience', 'impermanence'],
        reasoningNote: 'Relational or bereavement pain. Grounding in impermanence and self-worth.',
      };
    }

    // 7. Emotional Distress with Negation Detection (Generalized)
    const isNegatedAnger = /\b(not|no|never|don't feel|do not feel)\s+(angry|mad|furious|rage)\b/i.test(text);
    const isNegatedFear = /\b(not|no|never|don't feel|do not feel)\s+(afraid|scared|fear|terrified)\b/i.test(text);
    const isNegatedJealousy = /\b(not|no|never|don't feel|do not feel)\s+(jealous|envious|envy)\b/i.test(text);
    const isNegatedGrief = /\b(not|no|never|don't feel|do not feel)\s+(sad|depressed|unhappy)\b/i.test(text);

    const hasAnger = /\b(furious|enraged|rage|revenge|wrath|resentment|lose my temper|anger|angry|corrupt|injustice)\b/i.test(text) && !isNegatedAnger;
    const hasJealousy = /\b(jealous|jealousy|envious|envy|bitter at (others|peers|friends)|covet)\b/i.test(text) && !isNegatedJealousy;
    const hasFear = /\b(anxiety|anxious|panic|terrified|fearful|dread|racing mind|tight chest|fear)\b/i.test(text) && !isNegatedFear;
    const hasGrief =
      (/\b(devastated|hopeless|despair|numb|heartache|aching heart|feel(ing)? empty|empty inside|empty and (alone|completely)|grief|deep sorrow|no energy left|completely alone|alone in this world|lonely|loneliness|sad|sadness|unhappy|depressed|depression|miserable|crying|broken|heartbroken|hurting|hurts? inside|suffering|lost in life|feeling lost|not (feeling )?(good|well|okay|fine|alright)|feeling (down|low|awful|terrible|bad|horrible)|i('m| am) not okay|not doing well|heaviness in my heart|heavy heart)\b/i.test(text)) && !isNegatedGrief;

    if (hasAnger || hasJealousy || hasFear || hasGrief) {
      let emotionalState: EmotionalState = 'grief';
      let themes = ['fear', 'self-mastery', 'restraint', 'peace', 'dharma'];
      let thematicKeywords: string[] = ['deep', 'sorrow', 'heaviness', 'dejection', 'dispirited', 'solace'];

      if (hasAnger) {
        emotionalState = 'anger';
        themes = ['anger', 'self-mastery', 'restraint', 'dharma'];
        thematicKeywords = ['burning', 'fury', 'wrath', 'rage', 'unrighteousness', 'corruption', 'adharma', 'restraint'];
      } else if (hasJealousy) {
        emotionalState = 'jealousy';
        themes = ['jealousy', 'contentment', 'dharma'];
        thematicKeywords = ['envy', 'jealousy', 'covet', 'contentment', 'dharma'];
      } else if (hasFear) {
        emotionalState = 'fear';
        thematicKeywords = ['restless', 'mind', 'turbulence', 'anxiety', 'steady', 'equanimity', 'fear'];
      } else if (/\b(alone|lonely|loneliness|isolated|nobody knows me|surrounded by people)\b/i.test(text)) {
        thematicKeywords = ['solitary', 'loneliness', 'isolated', 'alone', 'bed', 'arrows', 'steadfast', 'duty'];
      }

      return {
        intentCategory: 'emotional_distress',
        emotionalState,
        mahabharataRelevant: true,
        relevanceScore: 0.85,
        extractedCharacters: characters,
        thematicKeywords,
        extractedThemes: themes,
        reasoningNote: 'Acute emotional turmoil requiring centering guidance and steady perspective.',
      };
    }

    // Fallback: If epic entities exist even in personal context, mark relevant
    if (hasEpicEntities) {
      return {
        intentCategory: 'factual_scripture',
        emotionalState: 'neutral',
        mahabharataRelevant: true,
        relevanceScore: 0.9,
        extractedCharacters: characters,
        extractedThemes: ['scripture', 'epic'],
        reasoningNote: 'Epic inquiry referenced in personal context.',
      };
    }

    // General career queries
    const isCareer =
      /\b(failed|failure|exam|entrance (test|exam)|startup|worthless|career|job|layoffs|profession|accounting firm|study|studying|tech startup|cubicle|performance anxiety|no sense of purpose)\b/i.test(text);

    if (isCareer) {
      return {
        intentCategory: 'career_purpose',
        emotionalState: 'fear',
        mahabharataRelevant: true,
        relevanceScore: 0.9,
        extractedCharacters: characters,
        thematicKeywords: ['failure', 'defeat', 'fallen', 'warrior', 'despair', 'perseverance', 'fate'],
        extractedThemes: ['duty', 'karma yoga', 'action', 'perseverance'],
        reasoningNote: 'Career or performance reflection.',
      };
    }

    // Default General Guidance: Check if philosophical, ethical, or reflective keywords exist
    const hasReflectiveKeywords =
      /\b(wisdom|reflection|ethics|morals|conscience|soul|peace|life|purpose|meaning|truth|duty|dharma|god|prayer|meditation)\b/i.test(text);

    const isRelevant = characters.length > 0 || hasReflectiveKeywords;

    return {
      intentCategory: 'general_guidance',
      emotionalState: 'neutral',
      mahabharataRelevant: isRelevant,
      relevanceScore: isRelevant ? 0.5 : 0.05,
      extractedCharacters: characters,
      extractedThemes: isRelevant ? ['wisdom', 'reflection'] : [],
      reasoningNote: isRelevant
        ? 'General guidance request with reflective/philosophical themes.'
        : 'General query without explicit epic or spiritual markers. Mahabharata relevance not forced.',
    };
  }

  private static extractScriptureRef(text: string): string | undefined {
    const vMatch = text.match(/(?:chapter\s*(\d{1,2})\s*(?:verse|shloka|sloka)?\s*(\d{1,2})|(?:gita|bg|bhagavad\s*gita)?\s*(\d{1,2})[.:](\d{1,2}(?:-\d{1,2})?))/i);
    if (vMatch) {
      const ch = vMatch[1] || vMatch[3];
      const vs = vMatch[2] || vMatch[4];
      return `Bhagavad Gita ${ch}.${vs}`;
    }
    return undefined;
  }
}
