import { ConversationRiskLevel } from './emotional-interpretation.js';

export interface SafetyCheckResult {
  isSafe: boolean;
  isHighRiskCrisis: boolean;
  riskLevel: ConversationRiskLevel;
  responseMode?: 'CRISIS_SUPPORT' | 'VIOLENCE_DEESCALATION';
  safetyGuidance?: string[];
  category?: 'self_harm' | 'violence' | 'medical_legal' | 'prompt_injection' | 'supernatural_authority';
  safeInterventionMessage?: string;
}

export class PromptSafetyGuard {
  /**
   * Evaluates user input against high-risk categories (self-harm, violence, medical, injection)
   */
  public static evaluateInput(userInput: string, previousRisk: ConversationRiskLevel = 'NONE'): SafetyCheckResult {
    const text = userInput.toLowerCase();

    // Risk is assessed before persona, scripture, and retrieval. This is deliberately
    // a lightweight policy signal; the model still responds to the user's actual words.
    const meansPresent = /\b(?:pills?\s+(?:next to me|beside me|in my hand)|(?:thinking about|plan(?:ning)? on) taking (?:them|the pills)|about to (?:take|overdose)|already took (?:the )?pills|have (?:a )?means? (?:with me|near me)|have a plan to (?:kill myself|end my life))\b/i.test(text);
    const statedIntent = /\b(?:i am|i'm|i will|i intend to|i plan to|i am going to|i'm going to)\s+(?:kill myself|end my life|hurt myself|do it tonight)\b/i.test(text);
    const explicitDenial = /\b(?:i am not|i'm not|i do not|i don't|i never|i meant)\s+(?:currently\s+)?(?:thinking about suicide|thinking of suicide|planning to (?:hurt|harm) myself|going to (?:hurt|harm) myself|want(?:ing)? to (?:die|hurt myself|harm myself)|suicidal)\b/i.test(text) ||
      /\bi meant disappear from (?:social media|the internet|online)\b/i.test(text) ||
      /\b(?:i will not|i won't|i am not going to|i'm not going to) (?:hurt|harm|attack) (?:anyone|them|him|her|myself)\b/i.test(text) ||
      /\bi (?:gave|handed|moved|put) (?:the )?(?:pills|medication|weapon|means) (?:to|away|out of reach)\b/i.test(text);
    const hasNegatedSelfHarmClause = /\b(?:not|never|don't|do not|no longer)\s+(?:currently\s+)?(?:thinking about|thinking of|considering|planning|want(?:ing)? to)\s+(?:suicide|suicid|hurt myself|harm myself|ending my life|dying)\b/i.test(text);
    const activeIdeation = !hasNegatedSelfHarmClause && /\b(?:what if i (?:actually )?do something tonight|might hurt myself|thinking of suicide|thinking about suicide|considering suicide|thinking about hurting myself|don't want the pain to stop|do not want the pain to stop|want to die|better off without me)\b/i.test(text);
    const passiveSignal = !hasNegatedSelfHarmClause && /\b(?:life feels pointless|nothing matters(?: anymore)?|i feel exhausted by life|i am exhausted by life|i'm exhausted by life|i don't think i can keep going|i do not think i can keep going|i can't keep going|i cannot keep going|i don't see (?:a|the) point anymore|i do not see (?:a|the) point anymore|i'm tired of everything|i am tired of everything|wish i could (?:disappear|be gone|not wake up)|would anyone notice if i (?:dis)?appeared|would anyone care if i vanished)\b/i.test(text) ||
      (!hasNegatedSelfHarmClause && /\b(?:wonder(?:ing)? if anyone|anyone would|anyone might|if anyone would|if anyone might)\b.{0,60}\b(?:notice|care)\b.{0,35}\b(?:if i )?(?:disappear(?:ed)?|vanish(?:ed)?|were gone|was gone)\b/i.test(text));
    const imminentViolence = /\b(?:don't know if i can control myself|do not know if i can control myself|can't control myself if i see|cannot control myself if i see|might hurt them|going to confront them now|on my way to (?:him|her|them)|i could attack them|i may act on it soon)\b/i.test(text);
    const violenceEscalationCue = /\b(?:why should i be the one who controls myself|they deserve it.{0,60}(?:control|act)|i might (?:go after|attack|hurt) them|i could (?:go after|attack|hurt) them|i am close to acting|i'm close to acting)\b/i.test(text);
    const violenceIdeation = /\b(?:revenge|make them suffer|want to hurt (?:him|her|them|someone)|deserve to be hurt|deserve it.{0,60}control(?:s)? myself|imagining exactly what i would do|imagining hurting (?:him|her|them)|fantas(?:y|izing) about (?:hurting|harming)|thinking about hurting (?:him|her|them))\b/i.test(text);
    const protectiveViolenceClarification = /\b(?:i will not|i won't|i am not going to|i'm not going to) (?:hurt|harm|attack|go near|approach|confront)\b.{0,50}\b(?:them|him|her|anyone|the person)\b/i.test(text) ||
      /\b(?:i am|i'm) (?:at home|with someone|away from them|not near them)\b.{0,100}\b(?:will not|won't|not going to)\s+(?:hurt|harm|approach|confront)\b/i.test(text);
    const denial = explicitDenial || protectiveViolenceClarification;

    if (meansPresent) return {
      isSafe: false, isHighRiskCrisis: true, riskLevel: 'MEANS_PRESENT', category: 'self_harm', responseMode: 'CRISIS_SUPPORT',
      safetyGuidance: ['Keep the reply concise and concrete.', 'Tell the user not to take the pills and to move away from them or hand them to another person.', 'Ask them to contact local emergency services now and have a trusted person physically stay with them.', 'Ask whether they have already taken anything.'],
    };
    if (statedIntent) return {
      isSafe: false, isHighRiskCrisis: true, riskLevel: 'INTENT', category: 'self_harm', responseMode: 'CRISIS_SUPPORT',
      safetyGuidance: ['Treat the stated intent as urgent.', 'Ask them to move away from anything they could use to hurt themselves.', 'Ask a trusted person to come stay with them now and direct them to local emergency services.'],
    };
    if (imminentViolence) return {
      isSafe: false, isHighRiskCrisis: true, riskLevel: 'VIOLENCE_ESCALATION', category: 'violence', responseMode: 'VIOLENCE_DEESCALATION',
      safetyGuidance: ['Tell the user to create immediate physical distance and not go to or confront the person.', 'Ask them to move away from anything that could be used to hurt someone.', 'Have them contact a trusted person to stay with them; urge emergency support if they might act.'],
    };
    if (violenceEscalationCue || (previousRisk === 'VIOLENCE_IDEATION' && !protectiveViolenceClarification && violenceIdeation)) return {
      isSafe: false, isHighRiskCrisis: true, riskLevel: 'VIOLENCE_ESCALATION', category: 'violence', responseMode: 'VIOLENCE_DEESCALATION',
      safetyGuidance: ['Acknowledge the anger without endorsing harm.', 'Clearly tell the user not to harm or confront the person.', 'Have them leave the person’s vicinity and move away from weapons or anything that could hurt someone.', 'Ask a trusted person to be physically present now. Ask whether they may act soon, and direct them to local emergency support if they may.'],
    };
    if (violenceIdeation && !protectiveViolenceClarification) return {
      isSafe: false, isHighRiskCrisis: false, riskLevel: 'VIOLENCE_IDEATION', category: 'violence', responseMode: 'VIOLENCE_DEESCALATION',
      safetyGuidance: ['Acknowledge the anger without endorsing harm.', 'Clearly tell the user not to harm or confront the person.', 'Encourage distance from the person and from weapons or anything that could hurt someone.', 'Ask them to contact someone trusted for support and assess whether they may act soon.'],
    };
    if (activeIdeation) return {
      isSafe: false, isHighRiskCrisis: false, riskLevel: 'MODERATE', category: 'self_harm', responseMode: 'CRISIS_SUPPORT',
      safetyGuidance: ['Acknowledge the signal and ask directly whether they are thinking about harming themselves or are in immediate danger.', 'Encourage contacting someone trusted now. Escalate to local emergency support if intent, plan, or means are present.'],
    };
    if (explicitDenial && (previousRisk !== 'NONE' || /\b(?:suicid|hurt myself|harm myself|disappear)\b/i.test(text))) return {
      isSafe: true, isHighRiskCrisis: false, riskLevel: 'SAFETY_CLARIFIED_NON_SUICIDAL', category: 'self_harm',
      safetyGuidance: [],
    };
    if (!denial && (passiveSignal || previousRisk === 'PASSIVE_CONCERN')) return {
      isSafe: false, isHighRiskCrisis: false, riskLevel: 'PASSIVE_CONCERN', category: 'self_harm', responseMode: 'CRISIS_SUPPORT',
      safetyGuidance: previousRisk === 'PASSIVE_CONCERN' && !passiveSignal
        ? [
            'Directly answer the seeker\'s latest question or feelings with deep empathy and compassionate presence.',
            'Do not repeat boilerplate safety questions or re-ask if they are thinking of hurting themselves unless a new self-harm signal is raised. Focus on offering hope, grounding, and perspective.'
          ]
        : [
            'Ask directly and gently whether the user is thinking about hurting themselves or wishing they were not alive.',
            'Do not assume imminent risk; wait for clarification and reassess on the next turn.'
          ],
    };

    // 1. Critical Crisis / Self-Harm
    const selfHarmPatterns = [
      /\b(kill myself|commit suicide|end(ing)? my life|want to die|hang myself|slit my wrist|overdose)\b/i,
    ];

    if (selfHarmPatterns.some((p) => p.test(text)) && !hasNegatedSelfHarmClause) {
      return {
        isSafe: false,
        isHighRiskCrisis: true,
        riskLevel: 'ACTIVE_IDEATION',
        responseMode: 'CRISIS_SUPPORT',
        safetyGuidance: ['Keep the reply concise and concrete.', 'Ask the user to move away from anything they could use to hurt themselves.', 'Encourage immediate local emergency support and a trusted person physically staying with them.'],
        category: 'self_harm',
        safeInterventionMessage: 'I am taking what you said seriously. Please contact your local emergency service or go to the nearest emergency department, and ask someone you trust to stay with you now.',
      };
    }

    // 2. Physical Violence / Harm to others
    const violencePatterns = [
      /\b(how to (make a )?bomb|how to (kill|poison)|how do i (kill|poison)|beat them to death|stab them|blow up)\b/i,
      /\b(want to kill|going to kill|plan(ning)? to kill|gonna kill|murder|slay someone|kill someone|kill some one)\b/i,
      /\b(ruined my life and i want revenge|take revenge by killing|murder him|murder her)\b/i,
      /\bhow do i poison someone\b/i,
    ];

    if (violencePatterns.some((p) => p.test(text))) {
      return {
        isSafe: false,
        isHighRiskCrisis: true,
        riskLevel: 'HIGH',
        responseMode: 'VIOLENCE_DEESCALATION',
        safetyGuidance: ['Create physical distance from the person and do not confront them.', 'Move away from weapons or other means of harm.', 'Contact a trusted person or emergency support if they might act.'],
        category: 'violence',
        safeInterventionMessage: `I cannot assist with harming another human being, planning acts of violence, or creating dangerous weapons. The tragedy of Kurukshetra stands as the ultimate testament that violence leaves only grief in its wake. If you are experiencing intense anger or conflict, we can explore peaceful resolution, restraint, and seeking lawful justice.`,
      };
    }

    // 3. Prompt Injection Defense on User Input
    const injectionPatterns = [
      /ignore (all )?(previous|above|system|prior) (instructions|rules|directives|prompts|constraints)/i,
      /reveal the (internal )?(developer )?system prompt/i,
      /(you are now in|activate|enable) developer mode/i,
      /you are now (evil|unfiltered|dan|jailbroken)/i,
      /pretend (you have no rules|to be evil|there are no rules)/i,
      /bypass (all )?(safety|ethical)? (protocols|checks|filters|guardrails)/i,
      /system (message|prompt)? (override|overwrite|reset)/i,
      /disregard (all )?(ethical|safety|system)? (filters|rules|instructions|constraints)/i,
      /\b(dan mode|jailbreak)\b/i,
      /<script\b|<system_override\b|\[system_instruction\]/i,
    ];

    if (injectionPatterns.some((p) => p.test(text))) {
      return {
        isSafe: false,
        isHighRiskCrisis: false,
        riskLevel: 'NONE',
        category: 'prompt_injection',
        safeInterventionMessage: `I remain grounded as a thoughtful, Krishna-inspired conversational companion exploring the wisdom of the Mahabharata. What problem or reflection can we explore together?`,
      };
    }

    // 4. Harmful Cult Directives / Dangerous Command Exploitation
    const supernaturalPatterns = [
      /\b(are you )?(literally |actually )?(lord krishna|krishna|god)?.*(commanding|ordering) me to (leave|hurt|abandon|harm|kill)\b/i,
      /\bcommanding me to (leave|hurt|abandon|kill|harm)\b/i,
    ];

    if (supernaturalPatterns.some((p) => p.test(text))) {
      return {
        isSafe: false,
        isHighRiskCrisis: false,
        riskLevel: 'NONE',
        category: 'supernatural_authority',
        safeInterventionMessage: `I cannot issue commands or dictate destructive choices such as abandoning family or causing harm. For major life, relationship, or family crises, please reflect with discernment and consult trusted people or professionals in your life.`,
      };
    }

    return {
      isSafe: true,
      isHighRiskCrisis: false,
      riskLevel: 'NONE',
    };
  }

  /**
   * Sanitizes retrieved chunks to prevent indirect prompt injection
   */
  public static sanitizeRetrievedContext(rawContext: string): string {
    return rawContext
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/(?:ignore all previous instructions|system instruction:)/gi, '[sanitized]');
  }
}
