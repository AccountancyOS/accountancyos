import { assert, assertEquals, assertNotEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import {
  assertTokenCryptoConfigured,
  decryptToken,
  encryptToken,
  TokenCryptoNotConfiguredError,
} from "./token-crypto.ts";

function randomKey(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
}

function withKey(value: string | undefined, fn: () => Promise<void> | void) {
  return async () => {
    const before = Deno.env.get("ENCRYPTION_KEY");
    if (value === undefined) Deno.env.delete("ENCRYPTION_KEY");
    else Deno.env.set("ENCRYPTION_KEY", value);
    try {
      await fn();
    } finally {
      if (before === undefined) Deno.env.delete("ENCRYPTION_KEY");
      else Deno.env.set("ENCRYPTION_KEY", before);
    }
  };
}

Deno.test("refuses when ENCRYPTION_KEY is missing", withKey(undefined, async () => {
  assertThrows(() => assertTokenCryptoConfigured(), TokenCryptoNotConfiguredError);
  await assertRejects(() => encryptToken("x"), TokenCryptoNotConfiguredError);
}));

Deno.test("refuses a key that is not exactly 32 bytes", withKey(btoa("too-short"), () => {
  assertThrows(() => assertTokenCryptoConfigured(), TokenCryptoNotConfiguredError);
}));

Deno.test("refuses the old published fallback literal", withKey("default-dev-key-change-in-production", () => {
  assertThrows(() => assertTokenCryptoConfigured(), TokenCryptoNotConfiguredError);
}));

Deno.test("round-trips with a versioned ciphertext and a random IV", withKey(randomKey(), async () => {
  const a = await encryptToken("hmrc-access-token-123");
  const b = await encryptToken("hmrc-access-token-123");
  assert(a.startsWith("v2:"));
  assertNotEquals(a, b);
  assertEquals(await decryptToken(a), "hmrc-access-token-123");
}));

Deno.test("rejects ciphertext written under the old, unversioned scheme", withKey(randomKey(), async () => {
  const ct = await encryptToken("x");
  await assertRejects(() => decryptToken(ct.slice("v2:".length)));
}));

Deno.test("a rotated key cannot decrypt existing tokens (forces re-authorisation)", async () => {
  let ct = "";
  await withKey(randomKey(), async () => {
    ct = await encryptToken("secret");
  })();
  await withKey(randomKey(), async () => {
    await assertRejects(() => decryptToken(ct));
  })();
});
