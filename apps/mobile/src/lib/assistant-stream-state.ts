import { Citation, Message, StreamChunk } from '@talk-to-krisna/shared';

export interface AssistantStreamState {
  conversationId: string;
  content: string;
  citations: Citation[];
  message?: Message;
  targetMessageId?: string;
  eventIds: Set<string>;
}

export function createAssistantStreamState(conversationId: string): AssistantStreamState {
  return { conversationId, content: '', citations: [], eventIds: new Set() };
}

function citationKey(citation: Citation): string {
  return citation.evidenceId || citation.id || `${citation.sourceReference}:${citation.quoteType}`;
}

function appendCitation(citations: Citation[], citation: Citation): Citation[] {
  const key = citationKey(citation);
  return citations.some(existing => citationKey(existing) === key)
    ? citations
    : [...citations, citation];
}

/** Applies stream events idempotently; a final persisted message is authoritative. */
export function applyAssistantStreamChunk(
  state: AssistantStreamState,
  chunk: StreamChunk,
): AssistantStreamState {
  if (chunk.eventId && state.eventIds.has(chunk.eventId)) return state;
  const eventIds = new Set(state.eventIds);
  if (chunk.eventId) {
    eventIds.add(chunk.eventId);
    if (eventIds.size > 1000) eventIds.delete(eventIds.values().next().value as string);
  }

  const next = { ...state, eventIds };
  if (chunk.type === 'complete' && chunk.message) {
    if (chunk.message.conversationId !== state.conversationId) return next;
    return {
      ...next,
      message: chunk.message,
      targetMessageId: chunk.message.id,
      content: chunk.message.content,
      citations: chunk.message.citations || [],
    };
  }

  if (chunk.messageId && state.targetMessageId && chunk.messageId !== state.targetMessageId) return next;
  if (chunk.type === 'replace' && typeof chunk.content === 'string') {
    return { ...next, content: chunk.content };
  }
  if (chunk.type === 'token' && chunk.token) {
    return { ...next, content: next.content + chunk.token };
  }
  if (chunk.type === 'citation' && chunk.citation) {
    if (chunk.messageId && state.targetMessageId && chunk.messageId !== state.targetMessageId) return next;
    return {
      ...next,
      targetMessageId: chunk.messageId || state.targetMessageId,
      citations: appendCitation(next.citations, chunk.citation),
    };
  }
  return next;
}

export function toAssistantMessage(
  state: AssistantStreamState,
  conversationId: string,
  fallbackId: string,
  createdAt: string,
): Message | null {
  if (state.message) return state.message;
  const content = state.content.trim();
  if (!content) return null;
  return {
    id: fallbackId,
    conversationId,
    sender: 'krishna',
    content,
    citations: state.citations,
    createdAt,
  };
}
