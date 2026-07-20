/**
 * Pure helpers for connected-mailbox health in Settings. Extracted so the "is the token stale" and
 * "should we offer Reconnect" rules are testable and cannot silently regress.
 *
 * Context: a mailbox whose OAuth token has expired can still be stamped status='active' (nothing
 * flips it until a send/sync actually fails and writes the row). The old UI only showed Reconnect
 * when status !== 'active', so a stale-but-active mailbox offered only Sync and no way to
 * re-consent. These make the token expiry visible and always offer Reconnect for OAuth providers.
 */

export const OAUTH_MAILBOX_PROVIDERS = ["gmail", "outlook"] as const;

export function isOAuthMailbox(provider: string | null | undefined): boolean {
  return provider === "gmail" || provider === "outlook";
}

/** True when the mailbox's access token has expired (or is missing an expiry). */
export function isMailboxTokenStale(
  tokenExpiresAt: string | null | undefined,
  now: Date,
): boolean {
  if (!tokenExpiresAt) return false; // unknown expiry — don't cry wolf
  const expiry = new Date(tokenExpiresAt);
  if (Number.isNaN(expiry.getTime())) return false;
  return expiry.getTime() <= now.getTime();
}

/**
 * Reconnect must always be available for an OAuth mailbox — not only when the row already shows a
 * non-active status or an error. The token can rot while the row still says 'active', and the user
 * needs a path to re-consent regardless.
 */
export function shouldOfferReconnect(provider: string | null | undefined): boolean {
  return isOAuthMailbox(provider);
}
