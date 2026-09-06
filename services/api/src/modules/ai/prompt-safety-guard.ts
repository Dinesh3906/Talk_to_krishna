export interface SafetyCheckResult {
  isSafe: boolean;
  isHighRiskCrisis: boolean;
  category?: 'self_harm' | 'violence' | 'medical_legal' | 'prompt_injection' | 'supernatural_authority';
  safeInterventionMessage?: string;
}

export class PromptSafetyGuard {
  /**
   * Evaluates user input against high-risk categories (self-harm, violence, medical, injection)
   */
  public static evaluateInput(userInput: string): SafetyCheckResult {
    const text = userInput.toLowerCase();

    // 1. Critical Crisis / Self-Harm
    const selfHarmPatterns = [
      /\b(kill myself|commit suicide|end(ing)? my life|want to die|hang myself|slit my wrist|overdose)\b/i,
      /\b(better off dead|no reason to live|goodbye forever)\b/i,
    ];

    if (selfHarmPatterns.some((p) => p.test(text))) {
      return {
        isSafe: false,
        isHighRiskCrisis: true,
        category: 'self_harm',
        safeInterventionMessage: `Parth, your pain is real and heavy, but please know that you do not have to carry this immense darkness alone. Your life possesses sacred worth. 

Please reach out immediately to people trained to support you through this exact moment:
- In the US: Call or text 988 (Suicide & Crisis Lifeline) or chat at 988lifeline.org
- In India: Call 14416 or 1800-891-4416 (Tele-MANAS) or Vandrevala Foundation at 9999 666 555
- In the UK: Call 111 or Samaritans at 116 123
- International: Find immediate confidential help at https://findahelpline.com

Please speak to someone right now who can walk beside you in this hour.`,
      };
    }

    // 2. Physical Violence / Harm to others
    const violencePatterns = [
      /\b(how to (make a )?bomb|how to (kill|poison)|how do i (kill|poison)|beat them to death|stab them|blow up)\b/i,
      /\bhow do i poison someone\b/i,
    ];

    if (violencePatterns.some((p) => p.test(text))) {
      return {
        isSafe: false,
        isHighRiskCrisis: false,
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
        category: 'prompt_injection',
        safeInterventionMessage: `I remain grounded as a thoughtful, Krishna-inspired conversational companion exploring the wisdom of the Mahabharata. What problem or reflection can we explore together?`,
      };
    }

    // 4. Supernatural Authority Claims / God Commands
    const supernaturalPatterns = [
      /\bare you (literally|actually) (lord krishna|krishna|god)\b/i,
      /\bcommanding me to (leave|hurt|abandon|do)\b/i,
    ];

    if (supernaturalPatterns.some((p) => p.test(text))) {
      return {
        isSafe: false,
        isHighRiskCrisis: false,
        category: 'supernatural_authority',
        safeInterventionMessage: `I am an AI conversational guide inspired by the teachings, literature, and philosophical character of Lord Krishna in the Mahabharata. I possess no divine or supernatural authority, and I cannot issue divine commands or dictate your life choices. For major life, relationship, or family decisions, please reflect with discernment and consult trusted people in your life.`,
      };
    }

    return {
      isSafe: true,
      isHighRiskCrisis: false,
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
