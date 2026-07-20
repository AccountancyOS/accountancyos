import { describe, it, expect } from "vitest";
import {
  isMailboxTokenStale,
  isOAuthMailbox,
  shouldOfferReconnect,
} from "@/lib/mailbox-health";

const NOW = new Date("2026-07-20T12:00:00.000Z");

describe("isMailboxTokenStale", () => {
  it("is true for an expired token (the leon@ mailbox: expired 2026-06-25)", () => {
    expect(isMailboxTokenStale("2026-06-25T11:23:46.000Z", NOW)).toBe(true);
  });

  it("is false for a token still in the future", () => {
    expect(isMailboxTokenStale("2026-07-20T12:30:00.000Z", NOW)).toBe(false);
  });

  it("does not cry wolf when the expiry is unknown or unparseable", () => {
    expect(isMailboxTokenStale(null, NOW)).toBe(false);
    expect(isMailboxTokenStale(undefined, NOW)).toBe(false);
    expect(isMailboxTokenStale("not-a-date", NOW)).toBe(false);
  });
});

describe("shouldOfferReconnect / isOAuthMailbox", () => {
  it("always offers Reconnect for OAuth providers, regardless of status", () => {
    // The bug: a stale-but-'active' gmail mailbox showed only Sync. Reconnect must not depend on
    // status — only on the provider being OAuth.
    expect(shouldOfferReconnect("gmail")).toBe(true);
    expect(shouldOfferReconnect("outlook")).toBe(true);
  });

  it("does not offer Reconnect for non-OAuth providers", () => {
    expect(shouldOfferReconnect("postmark")).toBe(false);
    expect(shouldOfferReconnect(null)).toBe(false);
  });

  it("recognises the OAuth providers", () => {
    expect(isOAuthMailbox("gmail")).toBe(true);
    expect(isOAuthMailbox("outlook")).toBe(true);
    expect(isOAuthMailbox("imap")).toBe(false);
  });
});
