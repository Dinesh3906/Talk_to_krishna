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

export type SanctuaryErrorCode =
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'RETRIEVAL_TIMEOUT'
  | 'RETRIEVAL_ERROR'
  | 'MODEL_ERROR'
  | 'RATE_LIMIT'
  | 'AUTH_ERROR'
  | 'SERVER_ERROR'
  | 'EMPTY_RESPONSE';

export class SanctuaryError extends Error {
  constructor(
    public readonly code: SanctuaryErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'SanctuaryError';
  }
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

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (err: any) {
    throw new SanctuaryError('NETWORK_ERROR', 'Network connection failed. Please check your internet connection.');
  }

  if (!response.ok) {
    let errorCode: SanctuaryErrorCode = 'SERVER_ERROR';
    let errorMessage = `Request failed with status ${response.status}`;

    if (response.status === 504) {
      errorCode = 'TIMEOUT';
      errorMessage = 'The Sanctuary took too long to complete the reflection. Please try again.';
    } else if (response.status === 502 || response.status === 503) {
      errorCode = 'SERVER_ERROR';
      errorMessage = 'The Sanctuary server is momentarily unavailable. Please try again in a few moments.';
    } else if (response.status === 429) {
      errorCode = 'RATE_LIMIT';
      errorMessage = 'Too many reflections requested. Please pause a moment before speaking again.';
    } else if (response.status === 401 || response.status === 403) {
      errorCode = 'AUTH_ERROR';
      errorMessage = 'Authentication expired. Please sign in again.';
    }

    try {
      const errorJson = await response.json();
      if (errorJson?.error?.message) {
        errorMessage = errorJson.error.message;
      }
      if (errorJson?.error?.code) {
        errorCode = errorJson.error.code as SanctuaryErrorCode;
      }
    } catch {
      // Ignored if response is not json
    }
    throw new SanctuaryError(errorCode, errorMessage);
  }

  const json = await response.json();
  return json.data ?? json;
}

export async function streamChatMessage(
  conversationId: string,
  content: string,
  preferredName: string | undefined,
  onChunk: (chunk: StreamChunk) => void,
  onError: (error: SanctuaryError | Error) => void,
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

  // 45 second timeout for chat stream
  xhr.timeout = 45000;

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
            if (chunk.type === 'error') {
              const code = (chunk.errorCode as SanctuaryErrorCode) || 'MODEL_ERROR';
              onError(new SanctuaryError(code, chunk.error || 'Krishna’s reflection could not be generated.'));
              return;
            }
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
          if (chunk.type === 'error') {
            const code = (chunk.errorCode as SanctuaryErrorCode) || 'MODEL_ERROR';
            onError(new SanctuaryError(code, chunk.error || 'Krishna’s reflection could not be generated.'));
            return;
          }
          onChunk(chunk);
        } catch {}
      }
      buffer = '';
    }

    if (xhr.status >= 200 && xhr.status < 300) {
      onDone();
    } else {
      let code: SanctuaryErrorCode = 'SERVER_ERROR';
      let msg = `Server error ${xhr.status}`;

      if (xhr.status === 504) {
        code = 'TIMEOUT';
        msg = 'The reflection timed out on the server. Please try sending your message again.';
      } else if (xhr.status === 502 || xhr.status === 503) {
        code = 'SERVER_ERROR';
        msg = 'The Sanctuary is currently processing requests. Please retry in a moment.';
      } else if (xhr.status === 429) {
        code = 'RATE_LIMIT';
        msg = 'Too many requests at this moment. Please pause a moment.';
      } else if (xhr.status === 401) {
        code = 'AUTH_ERROR';
        msg = 'Your session has expired. Please sign in again.';
      }

      try {
        const errData = JSON.parse(xhr.responseText);
        if (errData?.error?.message) msg = errData.error.message;
        if (errData?.error?.code) code = errData.error.code as SanctuaryErrorCode;
      } catch {}

      onError(new SanctuaryError(code, msg));
    }
  };

  xhr.ontimeout = () => {
    onError(new SanctuaryError('TIMEOUT', 'The server took too long to respond. Please try again.'));
  };

  xhr.onerror = () => {
    onError(new SanctuaryError('NETWORK_ERROR', 'Network connection interrupted. The Sanctuary is currently reconnecting...'));
  };

  xhr.send(JSON.stringify({ content, preferredName }));

  return () => {
    try {
      xhr.abort();
    } catch {}
  };
}
