import { assert, assertEquals } from "jsr:@std/assert@1";
import { allowedOrigins, isAllowedOrigin, resolveAppBaseUrl } from "./origins.ts";

const VARS = ["ALLOWED_ORIGINS", "APP_PUBLIC_URL", "PORTAL_PUBLIC_URL"] as const;

function withEnv(env: Partial<Record<(typeof VARS)[number], string>>, fn: () => void) {
  return () => {
    const before = Object.fromEntries(VARS.map((k) => [k, Deno.env.get(k)]));
    for (const k of VARS) {
      const v = env[k];
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
    try {
      fn();
    } finally {
      for (const k of VARS) {
        const v = before[k];
        if (v === undefined) Deno.env.delete(k);
        else Deno.env.set(k, v);
      }
    }
  };
}

const req = (origin?: string) => new Request("https://fn.example", { headers: origin ? { origin } : {} });

Deno.test("nothing is trusted when ALLOWED_ORIGINS is unset", withEnv({}, () => {
  assertEquals(allowedOrigins(), []);
  assert(!isAllowedOrigin("https://app.example.com"));
  assertEquals(resolveAppBaseUrl(req("https://app.example.com")), null);
}));

Deno.test("exact, normalised match only", withEnv({ ALLOWED_ORIGINS: " https://app.example.com/ , https://client.example.com" }, () => {
  assertEquals(allowedOrigins(), ["https://app.example.com", "https://client.example.com"]);
  assert(isAllowedOrigin("https://APP.example.com"));
  assert(!isAllowedOrigin("https://app.example.com.evil.example")); // no suffix tricks
  assert(!isAllowedOrigin("https://evil.example"));
  assert(!isAllowedOrigin(null));
}));

Deno.test("redirect base: allow-listed origin, else the named fallback, else null", withEnv({
  ALLOWED_ORIGINS: "https://client.example.com",
  APP_PUBLIC_URL: "https://app.example.com/",
  PORTAL_PUBLIC_URL: "https://portal.example.com",
}, () => {
  assertEquals(resolveAppBaseUrl(req("https://client.example.com")), "https://client.example.com");
  assertEquals(resolveAppBaseUrl(req("https://evil.example")), "https://app.example.com");
  assertEquals(resolveAppBaseUrl(req(), "PORTAL_PUBLIC_URL"), "https://portal.example.com");
  assertEquals(resolveAppBaseUrl(req("https://evil.example"), "UNSET_FALLBACK"), null);
}));
