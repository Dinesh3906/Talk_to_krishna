import { create } from 'zustand';
import { Conversation, Message, Citation, StreamChunk } from '@talk-to-krisna/shared';
import { apiFetch, streamChatMessage } from '../lib/api-client';

interface ChatState {
  conversations: Conversation[];
  activeConversation: (Conversation & { messages: Message[] }) | null;
  isLoading: boolean;
  isStreaming: boolean;
  streamingContent: string;
  streamingCitations: Citation[];
  streamingMetadata: { intent?: string; emotion?: string; isMahabharataRelevant?: boolean } | null;
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
      set({ activeConversation: conv, isLoading: false });
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
      error: null,
    }));

    let accumulatedContent = '';
    let accumulatedCitations: Citation[] = [];

    await streamChatMessage(
      conversationId,
      content,
      preferredName,
      (chunk: StreamChunk) => {
        if (chunk.type === 'token' && chunk.token) {
          accumulatedContent += chunk.token;
          set({ streamingContent: accumulatedContent });
        } else if (chunk.type === 'citation' && chunk.citation) {
          accumulatedCitations.push(chunk.citation);
          set({ streamingCitations: [...accumulatedCitations] });
        } else if (chunk.type === 'metadata' && chunk.metadata) {
          set({ streamingMetadata: chunk.metadata });
        } else if (chunk.type === 'error' && chunk.error) {
          set({ error: chunk.error, isStreaming: false });
        }
      },
      (err: Error) => {
        set({ error: err.message, isStreaming: false });
      },
      () => {
        // Stream completed: only add message if we actually received content
        if (accumulatedContent.trim()) {
          const assistantMsg: Message = {
            id: `msg-${Date.now()}`,
            conversationId,
            sender: 'krishna',
            content: accumulatedContent,
            citations: accumulatedCitations,
            createdAt: new Date().toISOString(),
          };

          set((state) => ({
            activeConversation: state.activeConversation
              ? {
                  ...state.activeConversation,
                  messages: [...state.activeConversation.messages, assistantMsg],
                }
              : null,
            isStreaming: false,
            streamingContent: '',
            streamingCitations: [],
            streamingMetadata: null,
          }));
        } else {
          set((state) => ({
            isStreaming: false,
            streamingContent: '',
            streamingCitations: [],
            streamingMetadata: null,
            error: state.error || 'The divine presence is temporarily quiet. Please check connection and try again.',
          }));
        }

        // Refresh conversation list to update titles and timestamps
        get().fetchConversations();
      }
    );
  },

  clearActiveConversation: () => {
    set({ activeConversation: null, streamingContent: '', streamingCitations: [], error: null });
  },
}));
