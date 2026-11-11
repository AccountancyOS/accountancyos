/**
 * Encryption at rest for third-party OAuth tokens (HMRC).
 *
 * Fails closed. There is no fallback key: if ENCRYPTION_KEY is absent or malformed, every
 * operation throws TokenCryptoNotConfiguredError and callers return 503 `not_configured`.
 * A default key would mean tokens "encrypted" with a value published in git.
 *
 * ENCRYPTION_KEY must be exactly 32 random bytes, base64-encoded (e.g. `openssl rand -base64 32`).
 * The AES-256-GCM key is derived from it with HKDF-SHA256 and a fixed purpose label, so the same
 * secret can never be confused with a key used for anything else.
 *
 * Ciphertext format: "v2:" + base64(iv[12] || ciphertext+tag). The version prefix means a value
 * written under the old scheme (raw string key padded to 32 chars) is rejected loudly instead of
 * failing as a confusing GCM authentication error.
 *
 * ROTATION: changing ENCRYPTION_KEY makes every stored token undecryptable, which forces each
 * organisation to re-authorise HMRC. That is the intended, safe failure mode.
 */

const PREFIX = 'v2:';
const HKDF_INFO = new TextEncoder().encode('accountancyos/oauth-token-encryption/v2');
const HKDF_SALT = new Uint8Array(32); // fixed zero salt: the input key is already uniformly random

export class TokenCryptoNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenCryptoNotConfiguredError';
  }
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function readKeyMaterial(): Uint8Array {
  const raw = Deno.env.get('ENCRYPTION_KEY');
  if (!raw || raw.trim().length === 0) {
    throw new TokenCryptoNotConfiguredError('ENCRYPTION_KEY is not set');
  }
  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(raw.trim());
  } catch {
    throw new TokenCryptoNotConfiguredError('ENCRYPTION_KEY is not valid base64');
  }
  if (bytes.length !== 32) {
    throw new TokenCryptoNotConfiguredError('ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
  return bytes;
}

/** Throws TokenCryptoNotConfiguredError when the key is missing or malformed. */
export function assertTokenCryptoConfigured(): void {
  readKeyMaterial();
}

async function deriveKey(usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  const material = new Uint8Array(readKeyMaterial()).buffer as ArrayBuffer;
  const ikm = await crypto.subtle.importKey('raw', material, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: HKDF_INFO },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

export async function encryptToken(plaintext: string): Promise<string> {
  const key = await deriveKey('encrypt');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)),
  );
  const combined = new Uint8Array(iv.length + ct.length);
  combined.set(iv);
  combined.set(ct, iv.length);
  return PREFIX + encodeBase64(combined);
}

export async function decryptToken(stored: string): Promise<string> {
  if (!stored.startsWith(PREFIX)) {
    throw new Error('Stored token uses an unsupported encryption format; the connection must be re-authorised');
  }
  const key = await deriveKey('decrypt');
  const combined = decodeBase64(stored.slice(PREFIX.length));
  const iv = combined.slice(0, 12);
  const ct = combined.slice(12);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

/** Standard 503 body for a function that cannot run because a required secret is missing. */
export function notConfiguredResponse(headers: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: 'not_configured' }), {
    status: 503,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
