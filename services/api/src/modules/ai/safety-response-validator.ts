import { ConversationRiskLevel } from './emotional-interpretation.js';

export interface SafetyResponseAudit {
  passiveRiskDetected: boolean;
  passiveRiskClarified: boolean;
  activeRiskDetected: boolean;
  meansRiskDetected: boolean;
  violenceEscalationDetected: boolean;
  violenceIdeationDetected: boolean;
  safetyInterventionPresent: boolean;
  locationGuessDetected: boolean;
  unsafeResourceDetected: boolean;
  violenceIntervention?: {
    angerAcknowledged: boolean;
    harmDiscouraged: boolean;
    physicalSeparation: boolean;
    noConfrontation: boolean;
    meansRestricted: boolean;
    trustedPersonInvolved: boolean;
    immediateRiskAssessed: boolean;
    trustedPersonPhysicallyPresent: boolean;
    urgentSupportIncluded: boolean;
  };
}

export interface SafetyResponseResult {
  content: string;
  audit: SafetyResponseAudit;
}

const PASSIVE_CLARIFICATION = /\b(?:are you thinking|are you considering|do you (?:ever )?think|have you been thinking)\b.{0,80}\b(?:hurt(?:ing)? yourself|harm(?:ing)? yourself|suicid|not alive|ending your life)\b/i;
const PHYSICAL_SEPARATION = /\b(?:create|keep|put|take|make) distance\b.{0,55}\b(?:them|the person|each other)?\b|\b(?:move|step|walk|leave|get)\b.{0,45}\b(?:away|far|outside|out of the area)\b.{0,45}\b(?:them|the person|their vicinity|there)?\b|\bseparate yourself from (?:them|the person)\b/i;
const NO_CONFRONTATION = /\b(?:do not|don't|avoid|stay away from|not to)\b.{0,35}\b(?:approach|confront|go near|go to|contact|see them|meet them)\b/i;
const MEANS_RESTRICTION = /\b(?:move|step|stay|keep|put|hand|give|leave|remove)\b.{0,65}\b(?:weapons?|means of harm|anything.{0,30}hurt(?:ing)? someone|anything that could hurt|objects? you could use)\b|\b(?:weapons?|means of harm|anything that could hurt|anything you could use to hurt someone)\b.{0,65}\b(?:away|out of reach|someone else|hand|give|move)\b/i;
const TRUSTED_PERSON = /\b(?:someone you trust|trusted person|friend|family member|sibling|brother|sister|neighbor)\b/i;
const IMMEDIATE_RISK_QUESTION = /\b(?:are you (?:near|close to) them|might act (?:on this )?(?:soon|now)|could act soon|worried you might act|risk of acting|are you worried you could hurt)\b/i;
const PHYSICAL_SUPPORT = /\b(?:stay|come|be|remain)\b.{0,55}\b(?:with you in person|physically (?:with you|present)|in person|here with you now)\b|\b(?:someone|a friend|family)\b.{0,40}\b(?:physically present|stay with you in person)\b/i;
const URGENT_SUPPORT = /\b(?:local emergency service|nearest emergency department|urgent emergency support)\b/i;

/** Validates safety essentials and strips unverified emergency resources deterministically. */
export class SafetyResponseValidator {
  static validateAndRepair(content: string, risk: ConversationRiskLevel, responseMode?: string, recentAssistantMessages: string[] = [], userMessage = '', crisisTurnCount = 0): SafetyResponseResult {
    const safetyRisk = !['NONE', 'LOW', 'SAFETY_CLARIFIED_NON_SUICIDAL'].includes(risk);
    const original = content;
    const locationGuessDetected = /\b(?:911|112|988|14416|1800[-\s]?891[-\s]?4416|9999[-\s]?666[-\s]?555)\b/i.test(original);
    const unsafeResourceDetected = locationGuessDetected || /\b(?:Tele-MANAS|Vandrevala|Samaritans|988lifeline)\b/i.test(original);
    let repaired = content;
    if (safetyRisk) {
      repaired = repaired
        .replace(/\b(?:call|dial|text|contact)\s+(?:emergency\s+services?\s*)?(?:at\s*)?(?:911|112|988)(?:\s*\/\s*(?:911|112|988))*\b/gi, 'contact your local emergency service')
        .replace(/\b(?:911\s*\/\s*112|112\s*\/\s*911|911|112|988|14416|1800[-\s]?891[-\s]?4416|9999[-\s]?666[-\s]?555)\b/gi, 'your local emergency service')
        .replace(/\b(?:Tele-MANAS|Vandrevala Foundation|Samaritans|988 Suicide & Crisis Lifeline)\b/gi, 'a local crisis service');

      const normalizedCurrent = repaired.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const repeatsRecentSafetyReply = recentAssistantMessages.some(previous =>
        previous.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === normalizedCurrent
      );
      if (repeatsRecentSafetyReply) {
        const acknowledgement = /\b(?:lecture|another lecture)\b/i.test(userMessage)
          ? 'I hear you do not want a lecture, so I will keep this brief. '
          : 'I hear this is still weighing on you. ';
        repaired = `${acknowledgement}${repaired.trim()}`;
      }

      // Determine whether a prior assistant turn already asked the passive-concern
      // clarification question so we do not repeat it on subsequent turns.
      const priorAlreadyAskedClarification = recentAssistantMessages.some(prev =>
        PASSIVE_CLARIFICATION.test(prev) ||
        /are you thinking about hurting yourself/i.test(prev) ||
        /wishing you were not alive/i.test(prev)
      );

      const actions: string[] = [];
      let passiveRiskClarified = false;
      let activeRiskDetected = false;
      let meansRiskDetected = false;
      let violenceEscalationDetected = false;
      const violenceIdeationDetected = ['VIOLENCE_IDEATION', 'VIOLENCE_ESCALATION'].includes(risk) || (risk === 'HIGH' && responseMode === 'VIOLENCE_DEESCALATION');
      const violenceEscalationRisk = risk === 'VIOLENCE_ESCALATION' || (risk === 'HIGH' && responseMode === 'VIOLENCE_DEESCALATION');
      let violenceIntervention: SafetyResponseAudit['violenceIntervention'];
      if (violenceIdeationDetected) {
        if (!/\b(?:angry|anger|hurt|furious|upset|betrayed)\b/i.test(repaired)) actions.push('I hear how angry and hurt you are.');
        if (!/\b(?:do not|don't|please don't|please do not)\s+(?:hurt|harm|attack|go after)\b|\bdo not act on (?:the|your) (?:revenge|urge)\b/i.test(repaired)) actions.push('Please do not hurt them or act on revenge.');
        if (!PHYSICAL_SEPARATION.test(repaired)) actions.push('Put physical distance between you and them; leave their vicinity now.');
        if (!NO_CONFRONTATION.test(repaired)) actions.push('Do not approach or confront them right now.');
        if (!MEANS_RESTRICTION.test(repaired)) actions.push('Move away from weapons or anything that could hurt someone.');
        if (!TRUSTED_PERSON.test(repaired)) actions.push('Contact someone you trust and ask them to support you now.');
        if (!IMMEDIATE_RISK_QUESTION.test(repaired)) actions.push('Are you near them now, or worried you might act on this soon?');
        if (violenceEscalationRisk && !PHYSICAL_SUPPORT.test(repaired)) actions.push('Ask someone you trust to come and stay physically with you now.');
        if (violenceEscalationRisk && !URGENT_SUPPORT.test(repaired)) actions.push('If you believe you may act, contact your local emergency service now.');
      } else if (risk === 'PASSIVE_CONCERN') {
        passiveRiskClarified = PASSIVE_CLARIFICATION.test(repaired);
        if (!passiveRiskClarified && !priorAlreadyAskedClarification) {
          const matchedWord = userMessage.match(/\b(disappear(?:ed)?|fade away|not be here|vanish(?:ed)?|end it all)\b/i)?.[1];
          if (matchedWord) {
            actions.push(`I want to check what you mean by "${matchedWord}": are you thinking about hurting yourself or wishing you were not alive?`);
          } else {
            actions.push('I want to check in directly with you: are you thinking about hurting yourself or wishing you were not alive?');
          }
        }
      } else if (risk === 'MEANS_PRESENT' || risk === 'IMMINENT') {
        meansRiskDetected = /\b(?:pills?|means|substance)\b.{0,80}\b(?:move|away|hand|give|reach|take)\b|\b(?:move|hand|give)\b.{0,80}\b(?:pills?|means|substance)\b/i.test(repaired);
        activeRiskDetected = /\b(?:emergency service|emergency department|urgent help)\b/i.test(repaired);
        if (!/\b(?:do not take|don't take|please do not take|please don't take)\b/i.test(repaired)) actions.push('Please do not take the pills.');
        if (!/\b(?:move|put|hand|give).{0,45}\b(?:pills?|them|means)\b|\b(?:pills?|them).{0,45}\b(?:out of reach|away|someone else)\b/i.test(repaired)) actions.push('Move the pills out of reach or hand them to another person now.');
        const namesTrustedSupport = /\b(?:trusted person|someone you trust|friend|family member|neighbor)\b/i.test(repaired);
        const promisesPresence = /\b(?:stay|come|be)\b.{0,40}\b(?:with you in person|physically with you|in person|physically)\b/i.test(repaired);
        if (!namesTrustedSupport || !promisesPresence) actions.push('Ask someone you trust to come and stay with you in person now.');
        if (!/\b(?:local emergency service|nearest emergency department)\b/i.test(repaired)) actions.push('Contact your local emergency service or go to the nearest emergency department now.');
        if (!/\b(?:already taken|taken anything|swallowed|ingested)\b/i.test(repaired)) actions.push('Have you already taken anything?');
      } else if (risk === 'INTENT' || risk === 'ACTIVE_IDEATION' || risk === 'MODERATE') {
        activeRiskDetected = /\b(?:emergency service|emergency department|urgent help)\b/i.test(repaired);
        if (!/\b(?:are you in immediate danger|thinking about hurting yourself|thinking of hurting yourself|plan to hurt yourself)\b/i.test(repaired)) actions.push('Are you thinking about hurting yourself right now, or do you have a plan to act?');
        if (!/\b(?:trusted person|someone you trust|friend|family member|neighbor)\b/i.test(repaired)) actions.push('Please contact someone you trust and ask them to stay with you.');
        if (risk === 'INTENT' && !/\b(?:local emergency service|nearest emergency department)\b/i.test(repaired)) actions.push('Contact your local emergency service or go to the nearest emergency department now.');
      }
      if (actions.length) repaired = `${repaired.trim()}\n\n${actions.join(' ')}`;

      if (risk === 'PASSIVE_CONCERN') passiveRiskClarified ||= PASSIVE_CLARIFICATION.test(repaired) || priorAlreadyAskedClarification;
      if (risk === 'MEANS_PRESENT' || risk === 'IMMINENT') {
        meansRiskDetected ||= /\b(?:move|hand|give).{0,45}\b(?:pills?|them|means)\b|\b(?:pills?|them).{0,45}\b(?:out of reach|away|someone else)\b/i.test(repaired);
        activeRiskDetected ||= /\b(?:local emergency service|nearest emergency department)\b/i.test(repaired);
      }
      if (violenceIdeationDetected) {
        violenceIntervention = {
          angerAcknowledged: /\b(?:angry|anger|hurt|furious|upset|betrayed)\b/i.test(repaired),
          harmDiscouraged: /\b(?:do not|don't|please don't|please do not)\s+(?:hurt|harm|attack|go after)\b|\bdo not act on (?:the|your) (?:revenge|urge)\b/i.test(repaired),
          physicalSeparation: PHYSICAL_SEPARATION.test(repaired),
          noConfrontation: NO_CONFRONTATION.test(repaired),
          meansRestricted: MEANS_RESTRICTION.test(repaired),
          trustedPersonInvolved: TRUSTED_PERSON.test(repaired),
          immediateRiskAssessed: IMMEDIATE_RISK_QUESTION.test(repaired),
          trustedPersonPhysicallyPresent: !violenceEscalationRisk || PHYSICAL_SUPPORT.test(repaired),
          urgentSupportIncluded: !violenceEscalationRisk || URGENT_SUPPORT.test(repaired),
        };
        violenceEscalationDetected = Object.values(violenceIntervention).every(Boolean);
      }

      // A final assertion prevents an unknown number/service slipping through the repair.
      repaired = repaired.replace(/\b(?:911|112|988|14416|1800[-\s]?891[-\s]?4416|9999[-\s]?666[-\s]?555)\b/gi, 'your local emergency service');
      const passiveRiskDetected = risk === 'PASSIVE_CONCERN';
      return {
        content: repaired,
        audit: {
          passiveRiskDetected,
          passiveRiskClarified,
          activeRiskDetected,
          meansRiskDetected,
          violenceEscalationDetected,
          violenceIdeationDetected,
          safetyInterventionPresent: safetyRisk && repaired.length > 0,
          locationGuessDetected: /\b(?:911|112|988|14416|1800[-\s]?891[-\s]?4416|9999[-\s]?666[-\s]?555)\b/i.test(repaired),
          unsafeResourceDetected: /\b(?:Tele-MANAS|Vandrevala|Samaritans|988lifeline)\b/i.test(repaired),
          violenceIntervention,
        },
      };
    }
    return {
      content: repaired,
      audit: {
        passiveRiskDetected: false, passiveRiskClarified: false, activeRiskDetected: false,
        meansRiskDetected: false, violenceEscalationDetected: false, violenceIdeationDetected: false, safetyInterventionPresent: false,
        locationGuessDetected: false, unsafeResourceDetected: false,
      },
    };
  }
}
