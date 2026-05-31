/**
 * Application Configuration
 * Resolves the canonical app base URL for auth redirects, Stripe URLs,
 * and any other place we need an absolute URL back into the product.
 *
 * Rule:
 *  - Production custom domain (`app.accountancyos.com` or apex) -> always
 *    `https://app.accountancyos.com` (NEVER fall through to a preview URL).
 *  - Lovable preview / lovable.app / localhost -> the current `window.origin`
 *    so developers and preview sandboxes work normally.
 *  - Any other / non-browser context -> the production URL as the safe default.
 */
const PRODUCTION_APP_URL = "https://app.accountancyos.com";

function isDevOrPreviewHost(hostname: string): boolean {
  if (!hostname) return false;
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  if (hostname.endsWith(".lovable.app")) return true;
  if (hostname.endsWith(".lovableproject.com")) return true;
  return false;
}

export function getAppBaseUrl(): string {
  // Explicit override always wins (used by edge functions / SSR).
  const envUrl =
    typeof import.meta !== "undefined" ? import.meta.env?.VITE_APP_URL : undefined;
  if (envUrl) return envUrl;

  if (typeof window !== "undefined" && window.location?.hostname) {
    const host = window.location.hostname;
    if (
      host === "app.accountancyos.com" ||
      host === "accountancyos.com" ||
      host === "www.accountancyos.com"
    ) {
      return PRODUCTION_APP_URL;
    }
    if (isDevOrPreviewHost(host)) {
      return window.location.origin;
    }
  }

  return PRODUCTION_APP_URL;
}

/**
 * Alias used by auth/redirect code paths. Same value as getAppBaseUrl but
 * named for readability at call sites.
 */
export function getAppUrl(): string {
  const url = getAppBaseUrl();
  console.log("[app-config] Resolved app base URL:", url);
  return url;
}

/**
 * Build a portal URL for client-facing links (filing approvals, etc.)
 */
export function buildPortalUrl(path: string, params?: Record<string, string>): string {
  const base = getAppBaseUrl();
  const url = new URL(path, base);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}
