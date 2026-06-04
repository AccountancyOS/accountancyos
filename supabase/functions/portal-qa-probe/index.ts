// Runs RLS probes against the portal as each of the 4 seeded test users.
// Gated to org-owner caller (same pattern as seed-portal-test-users).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ORG = "a857a12c-a125-41de-bb45-9eb556d5b467";
const CLIENT_A = "5af184f0-6912-4d56-af1a-1ce324146fa0";
const CLIENT_B = "7a43f7bf-c49e-4716-97f6-8f85d2a7a45e";
const COMPANY_C1 = "84bd9448-1e76-4ae3-9ee6-5e0afa59e759";
const COMPANY_C2 = "e1f4ebf7-9d99-4ca8-a2aa-61c4e804626f";
const COMPANY_D = "e8bb1202-fa75-477f-b98c-26404468f1f5";

const USERS = {
  A: "portal-a@accountancyos.test",
  B: "portal-b@accountancyos.test",
  C: "portal-c@accountancyos.test",
  D: "portal-d@accountancyos.test",
};
const PW = "PortalQA!2026";

async function withUser(email: string) {
  const c = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data, error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`signin ${email}: ${error.message}`);
  return { client: c, userId: data.user!.id };
}

async function probe(label: string, fn: () => Promise<{ rows: number; sample?: any; err?: string }>) {
  try {
    const r = await fn();
    return { label, ok: true, rows: r.rows, sample: r.sample, err: r.err };
  } catch (e: any) {
    return { label, ok: false, err: String(e?.message ?? e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    const sr = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: u } = await sr.auth.getUser(token);
    if (!u?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    const { data: m } = await sr.from("organization_users").select("user_id").eq("organization_id", ORG).eq("user_id", u.user.id).limit(1);
    if (!m?.[0]) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

    const results: any = {};

    // === User A ===
    {
      const { client: a } = await withUser(USERS.A);
      results.A = [];
      results.A.push(await probe("A: own tasks (should show only client_visible for client A)", async () => {
        const { data, error } = await a.from("client_tasks").select("id,title,visibility,status").eq("client_id", CLIENT_A);
        return { rows: data?.length ?? 0, sample: data?.map((r: any) => r.title), err: error?.message };
      }));
      results.A.push(await probe("A: cross-tenant tasks for client B (must be 0)", async () => {
        const { data, error } = await a.from("client_tasks").select("id").eq("client_id", CLIENT_B);
        return { rows: data?.length ?? 0, err: error?.message };
      }));
      results.A.push(await probe("A: own messages (should hide internal_only)", async () => {
        const { data, error } = await a.from("client_messages").select("id,subject,visibility").eq("client_id", CLIENT_A);
        return { rows: data?.length ?? 0, sample: data, err: error?.message };
      }));
      results.A.push(await probe("A: cross-tenant messages for client B (must be 0)", async () => {
        const { data, error } = await a.from("client_messages").select("id").eq("client_id", CLIENT_B);
        return { rows: data?.length ?? 0, err: error?.message };
      }));
      results.A.push(await probe("A: own invoices", async () => {
        const { data, error } = await a.from("invoices").select("id,invoice_number,status").eq("client_id", CLIENT_A);
        return { rows: data?.length ?? 0, sample: data, err: error?.message };
      }));
      results.A.push(await probe("A: cross-tenant invoices for client B (must be 0)", async () => {
        const { data, error } = await a.from("invoices").select("id").eq("client_id", CLIENT_B);
        return { rows: data?.length ?? 0, err: error?.message };
      }));
      results.A.push(await probe("A: cross-tenant invoices for company C1 (must be 0)", async () => {
        const { data, error } = await a.from("invoices").select("id").eq("company_id", COMPANY_C1);
        return { rows: data?.length ?? 0, err: error?.message };
      }));
      results.A.push(await probe("A: portal_visibility own (should return row with revenue=true)", async () => {
        const { data, error } = await a.from("portal_visibility_settings").select("*").eq("client_id", CLIENT_A);
        return { rows: data?.length ?? 0, sample: data, err: error?.message };
      }));
      results.A.push(await probe("A: portal_visibility for client B (must be 0)", async () => {
        const { data, error } = await a.from("portal_visibility_settings").select("*").eq("client_id", CLIENT_B);
        return { rows: data?.length ?? 0, err: error?.message };
      }));
      results.A.push(await probe("A: clients table - own client only", async () => {
        const { data, error } = await a.from("clients").select("id,first_name").in("id", [CLIENT_A, CLIENT_B]);
        return { rows: data?.length ?? 0, sample: data, err: error?.message };
      }));
      results.A.push(await probe("A: send message via RPC for own client", async () => {
        const { data, error } = await a.rpc("portal_send_message", { p_client_id: CLIENT_A, p_company_id: null, p_subject: "[QA-A] portal probe", p_content: "hello", p_parent_message_id: null });
        return { rows: data ? 1 : 0, sample: data, err: error?.message };
      }));
      results.A.push(await probe("A: send message via RPC for OTHER client B (must error)", async () => {
        const { data, error } = await a.rpc("portal_send_message", { p_client_id: CLIENT_B, p_company_id: null, p_subject: "[QA-A] should fail", p_content: "x", p_parent_message_id: null });
        return { rows: data ? 1 : 0, sample: data, err: error?.message };
      }));
    }

    // === User B === (mirror)
    {
      const { client: b } = await withUser(USERS.B);
      results.B = [];
      results.B.push(await probe("B: own tasks", async () => {
        const { data, error } = await b.from("client_tasks").select("id,title").eq("client_id", CLIENT_B);
        return { rows: data?.length ?? 0, sample: data?.map((r: any) => r.title), err: error?.message };
      }));
      results.B.push(await probe("B: cross-tenant tasks for client A (must be 0)", async () => {
        const { data, error } = await b.from("client_tasks").select("id").eq("client_id", CLIENT_A);
        return { rows: data?.length ?? 0, err: error?.message };
      }));
      results.B.push(await probe("B: cross-tenant invoices for client A (must be 0)", async () => {
        const { data, error } = await b.from("invoices").select("id").eq("client_id", CLIENT_A);
        return { rows: data?.length ?? 0, err: error?.message };
      }));
      results.B.push(await probe("B: cross-tenant docs for company C1 (must be 0)", async () => {
        const { data, error } = await b.from("job_documents").select("id").eq("company_id", COMPANY_C1);
        return { rows: data?.length ?? 0, err: error?.message };
      }));
    }

    // === User C (multi-entity) ===
    {
      const { client: c } = await withUser(USERS.C);
      results.C = [];
      results.C.push(await probe("C: tasks for entity C1", async () => {
        const { data, error } = await c.from("client_tasks").select("id,title").eq("company_id", COMPANY_C1);
        return { rows: data?.length ?? 0, sample: data?.map((r: any) => r.title), err: error?.message };
      }));
      results.C.push(await probe("C: tasks for entity C2", async () => {
        const { data, error } = await c.from("client_tasks").select("id,title").eq("company_id", COMPANY_C2);
        return { rows: data?.length ?? 0, sample: data?.map((r: any) => r.title), err: error?.message };
      }));
      results.C.push(await probe("C: visibility for C1 (should have show_cash=true)", async () => {
        const { data, error } = await c.from("portal_visibility_settings").select("*").eq("company_id", COMPANY_C1);
        return { rows: data?.length ?? 0, sample: data, err: error?.message };
      }));
      results.C.push(await probe("C: visibility for C2 (no seeded row -> 0 expected; portal should use conservative defaults)", async () => {
        const { data, error } = await c.from("portal_visibility_settings").select("*").eq("company_id", COMPANY_C2);
        return { rows: data?.length ?? 0, sample: data, err: error?.message };
      }));
      results.C.push(await probe("C: cross-tenant tasks for client A (must be 0)", async () => {
        const { data, error } = await c.from("client_tasks").select("id").eq("client_id", CLIENT_A);
        return { rows: data?.length ?? 0, err: error?.message };
      }));
      results.C.push(await probe("C: cross-tenant invoices for company D (must be 0)", async () => {
        const { data, error } = await c.from("invoices").select("id").eq("company_id", COMPANY_D);
        return { rows: data?.length ?? 0, err: error?.message };
      }));
    }

    // === User D (revoked) ===
    {
      const { client: d } = await withUser(USERS.D);
      results.D = [];
      results.D.push(await probe("D: portal_access self-read (revoked record may still show; portal must block)", async () => {
        const { data, error } = await d.from("portal_access").select("id,status,is_active").eq("company_id", COMPANY_D);
        return { rows: data?.length ?? 0, sample: data, err: error?.message };
      }));
      results.D.push(await probe("D: tasks for own (revoked) company (must be 0)", async () => {
        const { data, error } = await d.from("client_tasks").select("id").eq("company_id", COMPANY_D);
        return { rows: data?.length ?? 0, err: error?.message };
      }));
      results.D.push(await probe("D: invoices for own (revoked) company (must be 0)", async () => {
        const { data, error } = await d.from("invoices").select("id").eq("company_id", COMPANY_D);
        return { rows: data?.length ?? 0, err: error?.message };
      }));
      results.D.push(await probe("D: send message via RPC for revoked company (must error)", async () => {
        const { data, error } = await d.rpc("portal_send_message", { p_client_id: null, p_company_id: COMPANY_D, p_subject: "[QA-D] should fail", p_content: "x", p_parent_message_id: null });
        return { rows: data ? 1 : 0, sample: data, err: error?.message };
      }));
      results.D.push(await probe("D: cross-tenant tasks for client A (must be 0)", async () => {
        const { data, error } = await d.from("client_tasks").select("id").eq("client_id", CLIENT_A);
        return { rows: data?.length ?? 0, err: error?.message };
      }));
    }

    return new Response(JSON.stringify({ ok: true, results }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});