/**
 * Secret redaction for audit persistence and logging.
 *
 * The filing engine writes HMRC request/response metadata to audit tables
 * (filing_provider_events). Those records must NEVER contain access tokens,
 * refresh tokens, client secrets, vault secrets or raw Authorization headers.
 *
 * This module is intentionally runtime-agnostic (no Deno/Node globals, no
 * external imports) so the exact same redaction logic is exercised by the
 * edge runtime and by the Sprint 0 verification harness.
 */

export const REDACTED = '[REDACTED]';

/**
 * Key fragments that mark a value as sensitive. Matching is done after
 * stripping separators so `access_token`, `accessToken` and `access-token`
 * are all caught.
 */
const SENSITIVE_KEY_FRAGMENTS = [
  'password',
  'passwd',
  'secret',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'apikey',
  'clientsecret',
  'cookie',
  'bearer',
  'vault',
  'encryptionkey',
  'privatekey',
  'sessionkey',
].map((f) => f.replace(/[^a-z0-9]/g, ''));

const NORMALISE = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, '');

/** True if the given object key should have its value redacted. */
export function isSensitiveKey(key: string): boolean {
  const normalised = NORMALISE(key);
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalised.includes(fragment));
}

/**
 * Redact bearer-token style secrets embedded inside free-text strings, e.g.
 * an `Authorization: Bearer eyJ...` header captured as a plain string.
 */
export function redactString(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
    .replace(/(access_token|refresh_token|client_secret)=([^&\s]+)/gi, `$1=${REDACTED}`);
}

const MAX_DEPTH = 12;

/**
 * Deeply redact sensitive values from an arbitrary structure. Returns a new
 * value; the input is never mutated.
 */
export function redactSecrets<T>(value: T, depth = 0): T {
  if (depth > MAX_DEPTH) return REDACTED as unknown as T;

  if (typeof value === 'string') {
    return redactString(value) as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, depth + 1)) as unknown as T;
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        out[key] = REDACTED;
      } else {
        out[key] = redactSecrets(val, depth + 1);
      }
    }
    return out as unknown as T;
  }

  return value;
}

/**
 * Build a safe, redacted summary of outbound request headers for audit.
 * Header names are preserved; sensitive header values are replaced.
 */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, val] of Object.entries(headers)) {
    out[name] = isSensitiveKey(name) ? REDACTED : redactString(val);
  }
  return out;
}
