/**
 * Structured logging utilities for edge functions
 * Provides consistent log format with trace IDs
 */

/**
 * Generate a new trace ID for request tracking
 */
export function newTraceId(): string {
  return crypto.randomUUID();
}

interface LogMeta {
  functionName?: string;
  userId?: string;
  orgId?: string;
  [key: string]: unknown;
}

/**
 * Sanitize metadata to prevent logging sensitive data
 */
function sanitizeMeta(meta: LogMeta): LogMeta {
  const sensitiveKeys = ['password', 'token', 'secret', 'apikey', 'authorization', 'cookie', 'accessToken', 'refreshToken'];
  const sanitized: LogMeta = {};
  
  for (const [key, value] of Object.entries(meta)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      // Don't log full objects to prevent accidental sensitive data exposure
      sanitized[key] = '[Object]';
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Log informational message with trace ID
 */
export function logInfo(traceId: string, message: string, meta?: LogMeta): void {
  const logEntry = {
    level: 'info',
    traceId,
    timestamp: new Date().toISOString(),
    message,
    ...sanitizeMeta(meta || {}),
  };
  console.log(JSON.stringify(logEntry));
}

/**
 * Log warning message with trace ID
 */
export function logWarn(traceId: string, message: string, meta?: LogMeta): void {
  const logEntry = {
    level: 'warn',
    traceId,
    timestamp: new Date().toISOString(),
    message,
    ...sanitizeMeta(meta || {}),
  };
  console.warn(JSON.stringify(logEntry));
}

/**
 * Log error with trace ID
 * Extracts error message and stack, but doesn't expose stack to client
 */
export function logError(traceId: string, error: unknown, meta?: LogMeta): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  
  const logEntry = {
    level: 'error',
    traceId,
    timestamp: new Date().toISOString(),
    error: errorMessage,
    stack: errorStack,
    ...sanitizeMeta(meta || {}),
  };
  console.error(JSON.stringify(logEntry));
}

/**
 * Create a scoped logger for a specific function
 */
export function createLogger(functionName: string, traceId: string) {
  return {
    info: (message: string, meta?: Omit<LogMeta, 'functionName'>) =>
      logInfo(traceId, message, { functionName, ...meta }),
    warn: (message: string, meta?: Omit<LogMeta, 'functionName'>) =>
      logWarn(traceId, message, { functionName, ...meta }),
    error: (error: unknown, meta?: Omit<LogMeta, 'functionName'>) =>
      logError(traceId, error, { functionName, ...meta }),
  };
}
