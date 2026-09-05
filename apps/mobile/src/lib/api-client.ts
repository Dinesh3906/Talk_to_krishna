import { StreamChunk } from '@talk-to-krisna/shared';

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.localStorage) {
    const customUrl = window.localStorage.getItem('TALK_TO_KRISHNA_API_URL');
    if (customUrl) return customUrl.replace(/\/+$/, '');
  }
  return (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');
}

const API_BASE_URL = getApiBaseUrl();

let authToken: string | null = null;

export function setApiAuthToken(token: string | null) {
  authToken = token;
}

export function getApiAuthToken(): string | null {
  return authToken;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    try {
      const errorJson = await response.json();
      if (errorJson?.error?.message) {
        errorMessage = errorJson.error.message;
      }
    } catch {
      // Ignored if response is not json
    }
    throw new Error(errorMessage);
  }

  const json = await response.json();
  return json.data ?? json;
}

export async function streamChatMessage(
  conversationId: string,
  content: string,
  preferredName: string | undefined,
  onChunk: (chunk: StreamChunk) => void,
  onError: (error: Error) => void,
  onDone: () => void
): Promise<() => void> {
  const controller = new AbortController();
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/conversations/${conversationId}/messages`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content, preferredName }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let msg = `Server error ${response.status}`;
      try {
        const errData = await response.json();
        if (errData?.error?.message) msg = errData.error.message;
      } catch {}
      throw new Error(msg);
    }

    if (!response.body) {
      throw new Error('ReadableStream not supported or empty response');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const dataStr = trimmed.replace('data: ', '');
            const chunk: StreamChunk = JSON.parse(dataStr);
            onChunk(chunk);
          } catch {
            // Partial chunk
          }
        }
      }
    }

    onDone();
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      onError(err);
    }
  }

  return () => controller.abort();
}
