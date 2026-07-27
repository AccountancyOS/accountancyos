/**
 * Turn a supabase-js edge-function error into something a human can act on.
 *
 * `supabase.functions.invoke` reports ANY non-2xx as a FunctionsHttpError whose
 * `.message` is the useless "Edge Function returned a non-2xx status code". The body the
 * function deliberately returned — `{ error: "..." }`, often with extra context — is only
 * reachable through `error.context`, which is the raw Response.
 *
 * Surfacing it matters more than it sounds: a failed deploy, a missing secret, a
 * misconfigured OAuth app and a genuine upstream outage all produce that same opaque
 * sentence, so every one of them looks identical in the UI and costs a debugging round
 * trip. Always route invoke() failures through this.
 */
export async function describeFunctionError(
  error: unknown,
  fallbackMessage = "The request failed",
): Promise<string> {
  const generic = (error as { message?: string })?.message;
  // supabase-js's placeholder carries no information — prefer the caller's wording.
  const fallback =
    !generic || /non-2xx status code/i.test(generic) ? fallbackMessage : generic;

  const context = (error as { context?: unknown })?.context as
    | { json?: () => Promise<unknown>; status?: number }
    | undefined;

  if (!context || typeof context.json !== "function") return fallback;

  const withStatus = (message: string) =>
    context.status ? `${message} (HTTP ${context.status})` : message;

  try {
    const body = (await context.json()) as
      | { error?: string; message?: string; ch_status?: number }
      | null;
    const reported = body?.error ?? body?.message;
    if (!reported) return withStatus(fallback);
    // Upstream status codes (e.g. Companies House) are worth keeping visible.
    return body?.ch_status ? `${reported} (Companies House ${body.ch_status})` : reported;
  } catch {
    // Body already consumed, empty, or not JSON — the status is all we have.
    return withStatus(fallback);
  }
}
