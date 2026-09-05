import { StreamChunk } from '@talk-to-krisna/shared';

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.localStorage) {
    const customUrl = window.localStorage.getItem('TALK_TO_KRISHNA_API_URL');
    if (customUrl) return customUrl.replace(/\/+$/, '');
  }
  return (process.env.EXPO_PUBLIC_API_URL || 'https://talk-to-krishna-w4tb.onrender.com/api/v1').replace(/\/+$/, '');
}

export function setCustomApiUrl(url: string): void {
  const sanitized = url.trim().replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.localStorage) {
    if (sanitized) {
      window.localStorage.setItem('TALK_TO_KRISHNA_API_URL', sanitized);
    } else {
      window.localStorage.removeItem('TALK_TO_KRISHNA_API_URL');
    }
  }
}

export async function checkBackendHealth(testUrl?: string): Promise<{
  healthy: boolean;
  database: 'connected' | 'disconnected' | 'unknown';
  error?: string;
}> {
  const base = (testUrl || getApiBaseUrl()).replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}/health`, { method: 'GET' });
    const data = await res.json();
    return {
      healthy: res.ok && data.status === 'healthy',
      database: data.database || (res.ok ? 'connected' : 'disconnected'),
      error: data.error,
    };
  } catch (err: any) {
    return {
      healthy: false,
      database: 'disconnected',
      error: err.message || 'Cannot reach server',
    };
  }
}

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
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/conversations/${conversationId}/messages`;

  const xhr = new XMLHttpRequest();
  xhr.open('POST', url, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  if (authToken) {
    xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
  }

  let seenBytes = 0;
  let buffer = '';

  xhr.onprogress = () => {
    const newText = xhr.responseText.substring(seenBytes);
    seenBytes = xhr.responseText.length;
    buffer += newText;

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
          // Partial JSON in stream buffer
        }
      }
    }
  };

  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      if (buffer.trim().startsWith('data: ')) {
        try {
          const chunk: StreamChunk = JSON.parse(buffer.trim().replace('data: ', ''));
          onChunk(chunk);
        } catch {}
      }
      onDone();
    } else {
      let msg = `Server error ${xhr.status}`;
      try {
        const errData = JSON.parse(xhr.responseText);
        if (errData?.error?.message) msg = errData.error.message;
      } catch {}
      onError(new Error(msg));
    }
  };

  xhr.onerror = () => {
    onError(new Error('Network request failed'));
  };

  xhr.send(JSON.stringify({ content, preferredName }));

  return () => {
    try {
      xhr.abort();
    } catch {}
  };
}
