// Centralised TrueLayer config used by every truelayer-* edge function.
// Env-driven: TRUELAYER_ENV (sandbox|live) plus optional overrides for
// providers and redirect URI so we can adjust without redeploying code.

export type TrueLayerEnv = "sandbox" | "live";

export interface TrueLayerConfig {
  env: TrueLayerEnv;
  authBase: string;
  apiBase: string;
  providers: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export class TrueLayerConfigError extends Error {
  readonly code = "not_configured";
  readonly clientMessage = "Open Banking is not configured for this environment.";
  constructor(missing: string) {
    // Never include secret values; only the missing key name.
    super(`TrueLayer config missing: ${missing}`);
    this.name = "TrueLayerConfigError";
  }
}

const DEFAULTS: Record<TrueLayerEnv, { authBase: string; apiBase: string; providers: string }> = {
  sandbox: {
    authBase: "https://auth.truelayer-sandbox.com",
    apiBase: "https://api.truelayer-sandbox.com",
    // Includes the sandbox mock provider for end-to-end testing.
    providers: "uk-cs-mock uk-ob-all uk-oauth-all",
  },
  live: {
    authBase: "https://auth.truelayer.com",
    apiBase: "https://api.truelayer.com",
    // Verified against current TrueLayer Data API live providers; can be
    // overridden at runtime via the TRUELAYER_PROVIDERS env variable.
    providers: "uk-ob-all uk-oauth-all",
  },
};

export function getTrueLayerConfig(): TrueLayerConfig {
  const rawEnv = (Deno.env.get("TRUELAYER_ENV") || "").toLowerCase().trim();
  if (rawEnv !== "sandbox" && rawEnv !== "live") {
    throw new TrueLayerConfigError("TRUELAYER_ENV");
  }
  const env = rawEnv as TrueLayerEnv;

  const clientId = Deno.env.get("TRUELAYER_CLIENT_ID");
  if (!clientId) throw new TrueLayerConfigError("TRUELAYER_CLIENT_ID");

  const clientSecret = Deno.env.get("TRUELAYER_CLIENT_SECRET");
  if (!clientSecret) throw new TrueLayerConfigError("TRUELAYER_CLIENT_SECRET");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) throw new TrueLayerConfigError("SUPABASE_URL");

  const defaults = DEFAULTS[env];
  const providersOverride = Deno.env.get("TRUELAYER_PROVIDERS");
  const redirectOverride = Deno.env.get("TRUELAYER_REDIRECT_URI");

  return {
    env,
    authBase: defaults.authBase,
    apiBase: defaults.apiBase,
    providers: providersOverride && providersOverride.trim().length > 0
      ? providersOverride.trim()
      : defaults.providers,
    clientId,
    clientSecret,
    redirectUri: redirectOverride && redirectOverride.trim().length > 0
      ? redirectOverride.trim()
      : `${supabaseUrl}/functions/v1/truelayer-callback`,
  };
}

// Resolve the front-end app base URL for the accountant surface.
// APP_PUBLIC_URL is the canonical production hostname; fall back gracefully.
export function getAppBaseUrl(): string {
  return Deno.env.get("APP_PUBLIC_URL") || "https://app.accountancyos.com";
}

// Resolve the front-end base URL for the client portal surface.
export function getPortalBaseUrl(): string {
  return (
    Deno.env.get("PORTAL_PUBLIC_URL") ||
    Deno.env.get("APP_PUBLIC_URL") ||
    "https://app.accountancyos.com"
  );
}

// Pick the correct surface base URL from a validated, relative return path.
// `/portal/*` -> portal base; everything else -> accountant base.
export function getBaseUrlForReturnPath(returnPath: string): string {
  if (typeof returnPath === "string" && returnPath.startsWith("/portal/")) {
    return getPortalBaseUrl();
  }
  return getAppBaseUrl();
}

// Validate that a stored return_url is a safe internal relative path.
// Rejects absolute URLs, protocol-relative URLs, backslash variants and
// any path outside the bookkeeping/portal allow-list. Falls back to a
// safe default that surfaces a failure state in the accountant app.
const SAFE_FALLBACK = "/bookkeeping?tab=banking&connection=failed";
const ALLOWED_PREFIXES = ["/portal/bookkeeping", "/bookkeeping"];

export function safeReturnPath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return SAFE_FALLBACK;

  let decoded = value;
  try {
    // Decode once to catch encoded protocol-relative attacks like %2f%2fevil.com
    decoded = decodeURIComponent(value);
  } catch {
    return SAFE_FALLBACK;
  }

  if (!decoded.startsWith("/")) return SAFE_FALLBACK;
  if (decoded.startsWith("//")) return SAFE_FALLBACK;
  if (decoded.includes("\\")) return SAFE_FALLBACK;
  if (/^\/\s*\/+/.test(decoded)) return SAFE_FALLBACK;
  // Block javascript:, data:, etc. (any scheme) — already excluded by the
  // leading-slash check, but be explicit for defence in depth.
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(decoded)) return SAFE_FALLBACK;

  if (!ALLOWED_PREFIXES.some((prefix) => decoded === prefix || decoded.startsWith(prefix + "?") || decoded.startsWith(prefix + "/") || decoded.startsWith(prefix + "#"))) {
    return SAFE_FALLBACK;
  }

  return decoded;
}