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
    let errorMessage = response.status === 502 || response.status === 504
      ? 'The Sanctuary is currently reconnecting. Please send your message again in a moment.'
      : `Request failed with status ${response.status}`;
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
  xhr.setRequestHeader('Accept', 'text/event-stream, application/json');
  if (authToken) {
    xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
  }

  // 90 second timeout to accommodate backend cold starts (e.g. Render free tier)
  xhr.timeout = 90000;

  let seenBytes = 0;
  let buffer = '';

  const processIncomingText = () => {
    try {
      const responseText = xhr.responseText;
      if (!responseText || responseText.length <= seenBytes) return;

      const newText = responseText.substring(seenBytes);
      seenBytes = responseText.length;
      buffer += newText;

      const lines = buffer.split('\n');
      // Retain incomplete trailing line in buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.slice(6).trim();
          if (dataStr === '[DONE]') continue;
          try {
            const chunk: StreamChunk = JSON.parse(dataStr);
            onChunk(chunk);
          } catch {
            // Incomplete JSON or malformed chunk in stream buffer
          }
        }
      }
    } catch {
      // In some native runtimes, accessing responseText during early LOADING throws
    }
  };

  xhr.onprogress = () => {
    processIncomingText();
  };

  xhr.onreadystatechange = () => {
    // Read incrementally at state 3 (LOADING) and state 4 (DONE)
    if (xhr.readyState === 3 || xhr.readyState === 4) {
      processIncomingText();
    }
  };

  xhr.onload = () => {
    // Ensure all remaining bytes are processed
    processIncomingText();

    // If any final data remains in buffer, process it
    if (buffer.trim().startsWith('data: ')) {
      const dataStr = buffer.trim().slice(6).trim();
      if (dataStr && dataStr !== '[DONE]') {
        try {
          const chunk: StreamChunk = JSON.parse(dataStr);
          onChunk(chunk);
        } catch {}
      }
      buffer = '';
    }

    if (xhr.status >= 200 && xhr.status < 300) {
      onDone();
    } else {
      let msg = xhr.status === 502 || xhr.status === 504
        ? 'The Sanctuary is currently reconnecting. Please send your message again in a moment.'
        : `Server error ${xhr.status}`;
      try {
        const errData = JSON.parse(xhr.responseText);
        if (errData?.error?.message) msg = errData.error.message;
      } catch {}
      onError(new Error(msg));
    }
  };

  xhr.ontimeout = () => {
    onError(new Error('The server took too long to respond (cold start). Please try again.'));
  };

  xhr.onerror = () => {
    onError(new Error('Network request failed. Please check your internet connection and backend status.'));
  };

  xhr.send(JSON.stringify({ content, preferredName }));

  return () => {
    try {
      xhr.abort();
    } catch {}
  };
}
