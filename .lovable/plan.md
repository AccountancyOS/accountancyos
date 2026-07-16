# No changes required

Claude's suggestion to pass `--header "Authorization: Bearer <TOKEN>"` does not apply to this MCP server. Here is why, and what to run instead.

## How the MCP endpoint is protected

- The Supabase Edge Function `mcp` is deployed with the Lovable Cloud default `verify_jwt = false` (no `[functions.mcp]` override exists in `supabase/config.toml`). The transport layer does not require a Supabase key.
- Auth is enforced **inside** the function by `@lovable.dev/mcp-js`. It validates an **OAuth 2.1 access token** issued by Supabase Auth (`https://moxpdejnucjjcplleefn.supabase.co/auth/v1`) for this project, with `audience = authenticated` and a `client_id` claim.
- The server publishes `/.well-known/oauth-protected-resource`, and Supabase Auth publishes `/.well-known/oauth-authorization-server` with dynamic client registration enabled. Any spec-compliant MCP client (Claude, Cursor, Codex, ChatGPT connectors) discovers these automatically and walks the OAuth flow.

## What Claude Code should run

```text
claude mcp add lovable-accountancyos --transport http \
  https://moxpdejnucjjcplleefn.supabase.co/functions/v1/mcp
```

On first tool use Claude will:
1. Register itself dynamically with Supabase Auth.
2. Open the browser at `https://app.accountancyos.com/.lovable/oauth/consent?authorization_id=...` (the app's consent route).
3. Prompt sign-in if needed (`/auth?next=...` returns the user to the consent page).
4. Exchange the authorization code for a user-scoped access token and store it itself.
5. Send that token on every MCP request; each tool call then runs as that user, with RLS applied inside the tool handlers.

## Why NOT to pass a bearer header

- The Supabase **publishable/anon key** is not an OAuth access token, has no `client_id` claim, and mcp-js will reject it with 401.
- A copied **app-session JWT** (e.g. `access_token` from the browser localStorage) also lacks the OAuth `client_id` claim and is not the integration mechanism — mcp-js rejects it by design.
- Passing any static bearer token bypasses the per-user OAuth flow, which defeats the whole point of the setup you just approved.

## Only case where a manual token would apply

If — and only if — the user later chooses to disable OAuth and expose the MCP server publicly (rejected earlier in this thread), a static bearer would still not be needed: it would simply be unauthenticated. Skip.

## Action

None. Reply to Claude that the endpoint is OAuth-protected via the MCP spec's built-in discovery flow, and connect with the plain `claude mcp add ... --transport http <URL>` command above.
