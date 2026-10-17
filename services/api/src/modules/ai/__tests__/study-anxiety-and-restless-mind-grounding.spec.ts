import { describe, it, expect } from 'vitest';
import { IntentClassifier } from '../intent-classifier.js';
import { ContextualQueryResolver } from '../contextual-query-resolver.js';
import { HybridRetriever } from '../hybrid-retriever.js';
import { KrishnaPersonaService } from '../krishna-persona.service.js';
import { GroundingValidator } from '../grounding-validator.js';
import { MarkdownSanitizer } from '../markdown-sanitizer.js';

describe('Live RAG Grounding & Persona Integrity: Study Anxiety & Restless Mind', () => {
  const scenarioA = "Krishna, I keep failing in my studies even though I try hard. I feel like I'm disappointing my parents and I'm scared about my future. What would you tell me?";
  const scenarioB = "How can I find peace when my mind is restless?";

  it('1. Correctly classifies Scenario A (Study Anxiety & Parental Expectations) as eligible for Gita RAG', () => {
    const classification = IntentClassifier.classify(scenarioA);
    expect(classification.intentCategory).toBe('emotional_distress');
    expect(classification.emotionalState).toBe('fear');
    expect(classification.mahabharataRelevant).toBe(true);
    expect(classification.thematicKeywords).toBeDefined();
    expect(classification.thematicKeywords).toContain('effort');
    expect(classification.thematicKeywords).toContain('svadharma');
    expect(classification.thematicKeywords).toContain('fruits of action');
  });

  it('2. Correctly classifies Scenario B (Restless Mind) as eligible for Gita RAG', () => {
    const classification = IntentClassifier.classify(scenarioB);
    expect(classification.intentCategory).toBe('emotional_distress');
    expect(classification.mahabharataRelevant).toBe(true);
    expect(classification.thematicKeywords).toBeDefined();
    expect(classification.thematicKeywords).toContain('restless');
    expect(classification.thematicKeywords).toContain('Abhyasa');
    expect(classification.thematicKeywords).toContain('Vairagya');
  });

  it('3. HybridRetriever retrieves Gita 2.47 from canonical corpus for Scenario A', async () => {
    const classification = IntentClassifier.classify(scenarioA);
    const queryPlan = ContextualQueryResolver.resolve(
      scenarioA,
      { resolvedReferences: [], isFollowUp: false, isShortFollowUp: false, isTopicReturn: false, isHistoricalRecall: false },
      undefined,
      [],
      { thematicKeywords: classification.thematicKeywords, userIntent: classification.intentCategory }
    );

    const retrievalResult = await HybridRetriever.retrieve(
      queryPlan.contextualQuery,
      classification.extractedCharacters,
      [],
      3,
      classification.thematicKeywords
    );

    expect(retrievalResult.passages.length).toBeGreaterThan(0);
    const gitaPassage = retrievalResult.passages.find(p => p.sourceType.toLowerCase().includes('gita'));
    expect(gitaPassage).toBeDefined();
    expect(gitaPassage?.sourceReference).toContain('2.47');
    expect(gitaPassage?.characters).toContain('Krishna');
    expect(gitaPassage?.characters).toContain('Arjuna');
  }, 15000);

  it('4. HybridRetriever retrieves Gita 6.26/6.35 from canonical corpus for Scenario B', async () => {
    const classification = IntentClassifier.classify(scenarioB);
    const queryPlan = ContextualQueryResolver.resolve(
      scenarioB,
      { resolvedReferences: [], isFollowUp: false, isShortFollowUp: false, isTopicReturn: false, isHistoricalRecall: false },
      undefined,
      [],
      { thematicKeywords: classification.thematicKeywords, userIntent: classification.intentCategory }
    );

    const retrievalResult = await HybridRetriever.retrieve(
      queryPlan.contextualQuery,
      classification.extractedCharacters,
      [],
      3,
      classification.thematicKeywords
    );

    expect(retrievalResult.passages.length).toBeGreaterThan(0);
    const gitaPassage = retrievalResult.passages.find(p => p.sourceType.toLowerCase().includes('gita'));
    expect(gitaPassage).toBeDefined();
    expect(gitaPassage?.translation.toLowerCase()).toMatch(/restless|unsteady|mind/i);
    expect(gitaPassage?.characters).toContain('Krishna');
    expect(gitaPassage?.characters).toContain('Arjuna');
  }, 15000);

  it('5. Evidence reaches Persona prompt with full canonical context and without disclaimer leakage', async () => {
    const retrievalResult = await HybridRetriever.retrieve('Arjuna restless mind 6.26', ['Krishna', 'Arjuna'], [], 3, ['6.26']);
    const promptMessages = KrishnaPersonaService.buildPrompt(
      scenarioB,
      [],
      retrievalResult.passages,
      {
        preferredName: 'Seeker',
        isMahabharataRelevant: true,
        intentCategory: 'emotional_distress',
        emotionalState: 'confusion',
      }
    );

    const systemMessage = promptMessages.find(m => m.role === 'system')?.content || '';
    expect(systemMessage).toContain('AUTHORITATIVE CANONICAL REFERENCE EVIDENCE');
    expect(systemMessage).toContain('Bhagavad Gita');
    expect(systemMessage).toContain('6.26');
  });

  it('6. MarkdownSanitizer completely scrubs internal diagnostic disclaimer leaks', () => {
    const leaked1 = "I understand your pain. I've left out details that the available evidence does not support. Focus on your studies.";
    const sanitized1 = MarkdownSanitizer.sanitize(leaked1);
    expect(sanitized1).not.toContain("I've left out details that the available evidence does not support");
    expect(sanitized1).not.toContain("available evidence does not support");

    const leaked2 = "The available evidence does not support this claim. Focus on your breath.";
    const sanitized2 = MarkdownSanitizer.sanitize(leaked2);
    expect(sanitized2).not.toContain("The available evidence does not support");

    const leaked3 = "I don't have a specific passage in my retrieved context about Arjuna's exact words here.";
    const sanitized3 = MarkdownSanitizer.sanitize(leaked3);
    expect(sanitized3).not.toContain("I don't have a specific passage in my retrieved context");
  });

  it('7. GroundingValidator recognizes canonical Krishna-Arjuna dialogue when Gita passages are retrieved', async () => {
    const retrievalResult = await HybridRetriever.retrieve('Arjuna restless mind 6.26', ['Krishna', 'Arjuna'], [], 3, ['6.26']);
    const candidateDialogue = "When Arjuna stood with a restless mind on the battlefield, Krishna counseled him to bring the wandering mind back under control through patient practice.";
    
    const validation = GroundingValidator.validate(candidateDialogue, retrievalResult.passages, false, scenarioB, ['krishna', 'arjuna']);
    expect(validation.isValid).toBe(true);
    expect(validation.unsupportedClaims.length).toBe(0);
  });
});
