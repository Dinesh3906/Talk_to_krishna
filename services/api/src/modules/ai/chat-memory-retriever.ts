import { eq, and, asc, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { conversationSegments, messages } from '../../db/schema.js';
import { ConversationTurn } from './conversation-state-tracker.js';

export interface HistoricalMemoryResult {
  found: boolean;
  targetSubject: string;
  earliestUserQuestion?: string;
  discussionSummary?: string;
  keyPointsDiscussed: string[];
  honestStatement: string;
}

export class ChatMemoryRetriever {
  /**
   * Retrieves actual previous discussion from this chat's stored segments and messages.
   * Never fabricates historical conversation context.
   */
  public static async retrieve(
    conversationId: string,
    userId: string,
    targetSubject: string,
    inMemoryHistory?: ConversationTurn[]
  ): Promise<HistoricalMemoryResult> {
    const cleanSubject = targetSubject.trim();
    const lowerSubject = cleanSubject.toLowerCase();

    // 1. First, search stored topic segments in PostgreSQL
    const segments = await db.query.conversationSegments.findMany({
      where: and(
        eq(conversationSegments.conversationId, conversationId),
        eq(conversationSegments.userId, userId)
      ),
      orderBy: [asc(conversationSegments.segmentIndex)],
    });

    const matchingSegment = segments.find(s => {
      const topicMatch = s.topic.toLowerCase().includes(lowerSubject);
      const entityMatch = s.entities.some(e => e.toLowerCase().includes(lowerSubject));
      return topicMatch || entityMatch;
    });

    // 2. Search message history for actual user inquiries on this subject
    let messageRows: any[] = [];
    if (inMemoryHistory && inMemoryHistory.length > 0) {
      messageRows = inMemoryHistory.map(h => ({
        sender: h.role === 'assistant' ? 'krishna' : 'user',
        content: h.content,
      }));
    } else {
      messageRows = await db.query.messages.findMany({
        where: eq(messages.conversationId, conversationId),
        orderBy: [asc(messages.createdAt)],
      });
    }

    // Find user questions mentioning targetSubject
    let earliestUserQuestion: string | undefined;
    let relevantTurns: Array<{ user: string; assistant?: string }> = [];

    for (let i = 0; i < messageRows.length; i++) {
      const row = messageRows[i];
      if (row.sender === 'user' && new RegExp(`\\b${lowerSubject}\\b`, 'i').test(row.content)) {
        if (!earliestUserQuestion) {
          earliestUserQuestion = row.content;
        }
        const nextRow = messageRows[i + 1];
        relevantTurns.push({
          user: row.content,
          assistant: nextRow?.sender === 'krishna' ? nextRow.content : undefined,
        });
      }
    }

    // 3. Synthesize Grounded Historical Statement
    if (earliestUserQuestion || matchingSegment) {
      const keyPoints: string[] = [];
      if (matchingSegment?.keyFacts && matchingSegment.keyFacts.length > 0) {
        keyPoints.push(...matchingSegment.keyFacts);
      }

      let summary = matchingSegment?.summary || '';
      if (!summary && relevantTurns.length > 0) {
        summary = `You asked: "${earliestUserQuestion}". We explored ${cleanSubject}'s role, actions, and underlying dharmic choices.`;
      }

      return {
        found: true,
        targetSubject: cleanSubject,
        earliestUserQuestion,
        discussionSummary: summary,
        keyPointsDiscussed: keyPoints,
        honestStatement: `Earlier in this chat, you asked about ${cleanSubject}: "${earliestUserQuestion || summary}". We discussed how ${cleanSubject}'s dilemma connects to duty, purpose, and inner choice.`,
      };
    }

    // 4. If nothing was found, return honest non-fabricated statement
    return {
      found: false,
      targetSubject: cleanSubject,
      keyPointsDiscussed: [],
      honestStatement: `Earlier in this chat, we have not discussed ${cleanSubject} yet. We have been exploring other reflections.`,
    };
  }
}
