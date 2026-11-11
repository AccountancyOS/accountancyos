/**
 * Browser origins this deployment trusts — sourced ONLY from the ALLOWED_ORIGINS env var.
 *
 * Nothing is hard-coded here on purpose. Hosting domains change at cutover (the Lovable preview
 * hosts are gone), and a domain baked into code outlives the decision that put it there. An
 * origin is trusted only if an operator listed it, exactly, for this project.
 *
 * ALLOWED_ORIGINS: comma-separated exact origins, e.g.
 *   "https://app.example.com,https://client.example.com"
 */

function normalise(origin: string): string {
  return origin.trim().replace(/\/+$/, '').toLowerCase();
}

export function allowedOrigins(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS') ?? '';
  return raw.split(',').map(normalise).filter((o: string) => o.length > 0);
}

/** Exact match against ALLOWED_ORIGINS. No wildcards, no suffix matching. */
export function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  return allowedOrigins().includes(normalise(origin));
}

/**
 * Base URL to send a browser back to after a hosted flow (e.g. Stripe Checkout).
 *
 * The caller's Origin is used only when it is in ALLOWED_ORIGINS, so a redirect can never be
 * pointed at an arbitrary site. Otherwise the named env var (default APP_PUBLIC_URL) is used.
 * Returns null when neither is configured — callers must fail closed (503 not_configured)
 * rather than invent a URL.
 */
export function resolveAppBaseUrl(req: Request, fallbackEnv = 'APP_PUBLIC_URL'): string | null {
  const origin = req.headers.get('origin');
  if (origin && isAllowedOrigin(origin)) return origin.trim().replace(/\/+$/, '');
  const fallback = Deno.env.get(fallbackEnv);
  if (fallback && fallback.trim().length > 0) return fallback.trim().replace(/\/+$/, '');
  return null;
}
