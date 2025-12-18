/**
 * CORS handler for edge functions
 * Provides consistent CORS headers across all endpoints
 */

const DEFAULT_ALLOWED_HEADERS = [
  'authorization',
  'x-client-info',
  'apikey',
  'content-type',
  'x-trace-id',
  'x-idempotency-key',
].join(', ');

export type CorsHeaders = Record<string, string>;

/**
 * Get CORS headers for a request
 * If ALLOWED_ORIGINS env is set, validates origin against allowlist
 */
export function getCorsHeaders(req: Request): CorsHeaders {
  const origin = req.headers.get('Origin') || '*';
  const allowedOriginsEnv = Deno.env.get('ALLOWED_ORIGINS');
  
  let allowedOrigin = '*';
  let vary: string | undefined;
  
  if (allowedOriginsEnv) {
    const allowedOrigins = allowedOriginsEnv.split(',').map(o => o.trim());
    if (allowedOrigins.includes(origin)) {
      allowedOrigin = origin;
      vary = 'Origin';
    } else {
      // Origin not in allowlist, still use * for token-based auth
      allowedOrigin = '*';
    }
  }
  
  const headers: CorsHeaders = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': DEFAULT_ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
  
  if (vary) {
    headers['Vary'] = vary;
  }
  
  return headers;
}

/**
 * Handle CORS preflight request
 * Returns Response for OPTIONS requests, null otherwise
 */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(req),
    });
  }
  return null;
}

/**
 * Create headers object with CORS headers for responses
 */
export function corsHeaders(req: Request): Record<string, string> {
  return {
    ...getCorsHeaders(req),
    'Content-Type': 'application/json',
  };
}
