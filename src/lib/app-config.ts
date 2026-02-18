/**
 * Application Configuration
 * Environment-driven config for domain services — no browser globals.
 */

/**
 * Get the application base URL.
 * Uses VITE_APP_URL env var first, falls back to window.location.origin in browser contexts.
 * Safe to call from edge functions / SSR where window is unavailable.
 */
export function getAppBaseUrl(): string {
  // Prefer explicit env var (works in all contexts)
  const envUrl = import.meta.env.VITE_APP_URL;
  if (envUrl) return envUrl;

  // Browser fallback
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  // Final fallback — published URL
  return 'https://accountancyos.lovable.app';
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
