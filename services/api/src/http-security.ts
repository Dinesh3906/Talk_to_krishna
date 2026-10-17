export function parseAllowedOrigins(configured: string | undefined): Set<string> {
  return new Set((configured || '').split(',').map((origin) => origin.trim()).filter(Boolean));
}

export function isCorsOriginAllowed(
  origin: string | undefined,
  allowedOrigins: Set<string>,
  environment: string | undefined,
): boolean {
  if (!origin || allowedOrigins.has(origin)) return true;
  return environment !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

export function sanitizeRequestId(value: string | string[] | undefined, fallback: string): string {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : fallback;
}

export function safeErrorLogMetadata(error: any, requestId: string | string[] | undefined): Record<string, unknown> {
  const allowedErrorNames = new Set(['Error', 'TypeError', 'SyntaxError', 'URIError', 'ValidationError']);
  const name = allowedErrorNames.has(error?.name) ? error.name : 'Error';
  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 500;
  return { requestId: sanitizeRequestId(requestId, 'unknown'), status, errorType: name };
}

export function safeErrorResponse(error: any, requestId: string | string[] | undefined): {
  code: string;
  message: string;
  requestId: string | string[] | undefined;
} {
  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 500;
  const allowedCodes = new Set(['VALIDATION_ERROR', 'TOO_MANY_REQUESTS', 'AUTH_RATE_LIMIT_EXCEEDED']);
  const code = status < 500 && typeof error?.code === 'string' && allowedCodes.has(error.code)
    ? error.code
    : 'INTERNAL_SERVER_ERROR';
  return { code, message: 'An unexpected internal error occurred.', requestId: sanitizeRequestId(requestId, 'unknown') };
}
