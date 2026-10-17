import { create } from 'zustand';
import { Conversation, Message, Citation, StreamChunk } from '@talk-to-krisna/shared';
import { apiFetch, streamChatMessage } from '../lib/api-client';
import { sanitizeConversationalText } from '../lib/sanitizer';
import { applyAssistantStreamChunk, createAssistantStreamState, toAssistantMessage } from '../lib/assistant-stream-state';

interface ChatState {
  conversations: Conversation[];
  activeConversation: (Conversation & { messages: Message[] }) | null;
  isLoading: boolean;
  isStreaming: boolean;
  streamingContent: string;
  streamingCitations: Citation[];
  streamingMetadata: { intent?: string; emotion?: string; isMahabharataRelevant?: boolean } | null;
  activeStreamId: string | null;
  error: string | null;

  fetchConversations: () => Promise<void>;
  fetchConversationDetails: (id: string) => Promise<void>;
  createConversation: (title?: string) => Promise<Conversation>;
  deleteConversation: (id: string) => Promise<void>;
  sendMessageStream: (conversationId: string, content: string, preferredName?: string) => Promise<void>;
  clearActiveConversation: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversation: null,
  isLoading: false,
  isStreaming: false,
  streamingContent: '',
  streamingCitations: [],
  streamingMetadata: null,
  activeStreamId: null,
  error: null,

  fetchConversations: async () => {
    set({ isLoading: true, error: null });
    try {
      const list: Conversation[] = await apiFetch('/conversations');
      set({ conversations: list, isLoading: false });
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
    }
  },

  fetchConversationDetails: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const conv: Conversation & { messages: Message[] } = await apiFetch(`/conversations/${id}`);
      set({
        activeConversation: conv,
        isLoading: false,
        isStreaming: false,
        streamingContent: '',
        streamingCitations: [],
        streamingMetadata: null,
        activeStreamId: null,
      });
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
    }
  },

  createConversation: async (title?: string) => {
    set({ isLoading: true, error: null });
    try {
      const created: Conversation = await apiFetch('/conversations', {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
      set((state) => ({
        conversations: [created, ...state.conversations],
        activeConversation: { ...created, messages: [] },
        isLoading: false,
        isStreaming: false,
        streamingContent: '',
        streamingCitations: [],
        streamingMetadata: null,
        activeStreamId: null,
      }));
      return created;
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      throw err;
    }
  },

  deleteConversation: async (id: string) => {
    try {
      await apiFetch(`/conversations/${id}`, { method: 'DELETE' });
      set((state) => ({
        conversations: state.conversations.filter((c) => c.id !== id),
        activeConversation: state.activeConversation?.id === id ? null : state.activeConversation,
      }));
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    }
  },

  sendMessageStream: async (conversationId: string, content: string, preferredName?: string) => {
    const streamId = `${conversationId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      conversationId,
      sender: 'user',
      content,
      citations: [],
      createdAt: new Date().toISOString(),
    };

    // Optimistically append user message
    set((state) => ({
      activeConversation: state.activeConversation
        ? {
            ...state.activeConversation,
            messages: [...state.activeConversation.messages, userMsg],
          }
        : null,
      isStreaming: true,
      streamingContent: '',
      streamingCitations: [],
      streamingMetadata: null,
      activeStreamId: streamId,
      error: null,
    }));

    let streamState = createAssistantStreamState(conversationId);
    const isCurrentStream = () => get().activeStreamId === streamId && get().activeConversation?.id === conversationId;

    await streamChatMessage(
      conversationId,
      content,
      preferredName,
      (chunk: StreamChunk) => {
        if (!isCurrentStream()) return;
        streamState = applyAssistantStreamChunk(streamState, chunk);
        const nextState: Partial<ChatState> = {};
        if (chunk.type === 'token' || chunk.type === 'replace' || chunk.type === 'complete') {
          nextState.streamingContent = sanitizeConversationalText(streamState.content);
          nextState.streamingCitations = streamState.citations;
        }
        if (chunk.type === 'citation' || chunk.type === 'complete') {
          nextState.streamingCitations = streamState.citations;
        }
        if (chunk.type === 'metadata' && chunk.metadata) nextState.streamingMetadata = chunk.metadata;
        set(nextState);
      },
      (err: Error) => {
        if (!isCurrentStream()) return;
        set({
          error: err.message,
          isStreaming: false,
          streamingContent: '',
          streamingCitations: [],
          streamingMetadata: null,
          activeStreamId: null,
        });
      },
      () => {
        if (!isCurrentStream()) return;
        const assistantMsg = toAssistantMessage(streamState, conversationId, `msg-${Date.now()}`, new Date().toISOString());
        if (assistantMsg) {
          set((state) => ({
            activeConversation: state.activeConversation
              && state.activeConversation.id === conversationId
              ? {
                  ...state.activeConversation,
                  messages: [...state.activeConversation.messages, assistantMsg],
                }
              : null,
            isStreaming: false,
            streamingContent: '',
            streamingCitations: [],
            streamingMetadata: null,
            activeStreamId: null,
          }));
        } else {
          set((state) => ({
            isStreaming: false,
            streamingContent: '',
            streamingCitations: [],
            streamingMetadata: null,
            activeStreamId: null,
            error: state.error || 'The divine presence is temporarily quiet. Please check connection and try again.',
          }));
        }

        // Refresh conversation list to update titles and timestamps
        get().fetchConversations();
      }
    );
  },

  clearActiveConversation: () => {
    set({
      activeConversation: null,
      isStreaming: false,
      streamingContent: '',
      streamingCitations: [],
      streamingMetadata: null,
      activeStreamId: null,
      error: null,
    });
  },
}));
