/**
 * Standardized response envelopes for edge functions
 * Provides consistent response format across all endpoints
 */

import { corsHeaders } from './cors.ts';

export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  traceId: string;
}

export interface ErrorDetails {
  code: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
}

export interface ErrorResponse {
  success: false;
  error: ErrorDetails;
  traceId: string;
}

/**
 * Create a successful response
 */
export function ok<T>(
  req: Request,
  data: T,
  traceId: string,
  status: number = 200
): Response {
  const body: SuccessResponse<T> = {
    success: true,
    data,
    traceId,
  };
  
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      'X-Trace-Id': traceId,
    },
  });
}

/**
 * Create an error response
 * Never exposes stack traces to client
 */
export function fail(
  req: Request,
  error: ErrorDetails,
  traceId: string,
  status: number = 400
): Response {
  const body: ErrorResponse = {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
      retryable: error.retryable ?? false,
    },
    traceId,
  };
  
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      'X-Trace-Id': traceId,
    },
  });
}

/**
 * Common error codes
 */
export const ErrorCodes = {
  // Authentication errors
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  
  // Authorization errors
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  
  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  
  // Rate limiting
  RATE_LIMITED: 'RATE_LIMITED',
  
  // Idempotency
  IDEMPOTENCY_IN_PROGRESS: 'IDEMPOTENCY_IN_PROGRESS',
  
  // External service errors
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  HMRC_ERROR: 'HMRC_ERROR',
  STRIPE_ERROR: 'STRIPE_ERROR',
  COMPANIES_HOUSE_ERROR: 'COMPANIES_HOUSE_ERROR',
  
  // Database errors
  DATABASE_ERROR: 'DATABASE_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  
  // Generic errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

/**
 * Create a standardized error from an exception
 */
export function errorFromException(error: unknown, fallbackCode?: string): ErrorDetails {
  if (error instanceof Error) {
    return {
      code: fallbackCode || ErrorCodes.INTERNAL_ERROR,
      message: error.message,
      retryable: false,
    };
  }
  
  return {
    code: fallbackCode || ErrorCodes.INTERNAL_ERROR,
    message: String(error),
    retryable: false,
  };
}
