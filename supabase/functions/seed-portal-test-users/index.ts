// One-shot seed for portal QA test users. Requires header
//   x-seed-secret: <PORTAL_SEED_SECRET>
// Idempotent: safe to re-run; users are upserted by email.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-seed-secret",
};

const ORG = "a857a12c-a125-41de-bb45-9eb556d5b467"; // Blue Tick
const CLIENT_A = "5af184f0-6912-4d56-af1a-1ce324146fa0"; // E2E Acceptor
const CLIENT_B = "7a43f7bf-c49e-4716-97f6-8f85d2a7a45e"; // Amy-Lee Stevens
const COMPANY_C1 = "84bd9448-1e76-4ae3-9ee6-5e0afa59e759"; // Bassage Eyes
const COMPANY_C2 = "e1f4ebf7-9d99-4ca8-a2aa-61c4e804626f"; // Churchills London
const COMPANY_D = "e8bb1202-fa75-477f-b98c-26404468f1f5"; // E2E Test Ltd
const JOB_A = "761d1322-8459-446c-839c-d436e8f1b08a"; // job for client A
const JOB_B = "77562d18-5b22-41dc-bd97-dbcb12530a5d"; // job for client B
const JOB_C1 = "40827b1f-3efd-4089-a698-b1b1781c5196"; // job for company C1

const PW = "PortalQA!2026";

type SR = ReturnType<typeof createClient>;

async function upsertUser(sr: SR, email: string) {
  const { data: list } = await sr.auth.admin.listUsers();
  const existing = list?.users?.find((u: any) => u.email === email);
  if (existing) return existing.id;
  const { data, error } = await sr.auth.admin.createUser({
    email,
    password: PW,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return data.user!.id;
}

async function upsertPortalAccess(sr: SR, params: {
  user_id: string;
  client_id: string | null;
  company_id: string | null;
  status: "active" | "revoked";
}) {
  // Match on (user_id, client_id|company_id)
  const q = sr.from("portal_access")
    .select("id")
    .eq("organization_id", ORG)
    .eq("user_id", params.user_id);
  if (params.client_id) q.eq("client_id", params.client_id);
  if (params.company_id) q.eq("company_id", params.company_id);
  const { data: existing } = await q.limit(1);
  if (existing && existing[0]) {
    await sr.from("portal_access").update({
      status: params.status,
      is_active: params.status === "active",
      accepted_at: params.status === "active" ? new Date().toISOString() : null,
      revoked_at: params.status === "revoked" ? new Date().toISOString() : null,
    }).eq("id", existing[0].id);
    return existing[0].id;
  }
  const { data, error } = await sr.from("portal_access").insert({
    organization_id: ORG,
    user_id: params.user_id,
    client_id: params.client_id,
    company_id: params.company_id,
    status: params.status,
    is_active: params.status === "active",
    role: "primary_contact",
    accepted_at: params.status === "active" ? new Date().toISOString() : null,
    revoked_at: params.status === "revoked" ? new Date().toISOString() : null,
  }).select("id").single();
  if (error) throw new Error(`portal_access: ${error.message}`);
  return data!.id;
}

async function seedTasks(sr: SR, scope: { client_id?: string | null; company_id?: string | null; label: string }) {
  // Wipe existing seed tasks for that scope first (by title prefix).
  const titlePrefix = `[QA-${scope.label}]`;
  let del = sr.from("client_tasks").delete().eq("organization_id", ORG).like("title", `${titlePrefix}%`);
  if (scope.client_id) del = del.eq("client_id", scope.client_id);
  if (scope.company_id) del = del.eq("company_id", scope.company_id);
  await del;
  const now = Date.now();
  const rows = [
    { title: `${titlePrefix} Open task`, status: "pending", visibility: "client_visible", due_date: new Date(now + 7 * 86400e3).toISOString() },
    { title: `${titlePrefix} Overdue task`, status: "pending", visibility: "client_visible", due_date: new Date(now - 3 * 86400e3).toISOString() },
    { title: `${titlePrefix} Completed task`, status: "completed", visibility: "client_visible", completed_at: new Date(now - 86400e3).toISOString() },
    { title: `${titlePrefix} Internal task (must NOT show)`, status: "pending", visibility: "internal" },
  ].map((r) => ({
    ...r,
    organization_id: ORG,
    client_id: scope.client_id ?? null,
    company_id: scope.company_id ?? null,
  }));
  const { error } = await sr.from("client_tasks").insert(rows);
  if (error) throw new Error(`tasks ${scope.label}: ${error.message}`);
}

async function seedMessages(sr: SR, accountantUserId: string, scope: { client_id?: string | null; company_id?: string | null; label: string }) {
  const subjPrefix = `[QA-${scope.label}]`;
  let del = sr.from("client_messages").delete().eq("organization_id", ORG).like("subject", `${subjPrefix}%`);
  if (scope.client_id) del = del.eq("client_id", scope.client_id);
  if (scope.company_id) del = del.eq("company_id", scope.company_id);
  await del;
  const rows = [
    { subject: `${subjPrefix} Welcome`, content: "Hello from your accountant.", sender_type: "accountant", visibility: "client_visible", message_type: "message", sender_id: accountantUserId },
    { subject: `${subjPrefix} Internal note (must NOT show)`, content: "Internal accountant note.", sender_type: "accountant", visibility: "internal", message_type: "note", sender_id: accountantUserId },
  ].map((r) => ({
    ...r,
    organization_id: ORG,
    client_id: scope.client_id ?? null,
    company_id: scope.company_id ?? null,
  }));
  const { error } = await sr.from("client_messages").insert(rows);
  if (error) throw new Error(`messages ${scope.label}: ${error.message}`);
}

async function seedInvoices(sr: SR, scope: { client_id?: string | null; company_id?: string | null; label: string }) {
  const refPrefix = `QA-${scope.label}-`;
  // delete prior seed invoice_payments + invoices
  const { data: prior } = await sr.from("invoices").select("id").eq("organization_id", ORG).like("reference", `${refPrefix}%`);
  const ids = (prior ?? []).map((r: any) => r.id);
  if (ids.length) {
    await sr.from("invoice_payments").delete().in("invoice_id", ids);
    await sr.from("invoices").delete().in("id", ids);
  }
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 14 * 86400e3).toISOString().slice(0, 10);
  const baseInv = {
    organization_id: ORG,
    client_id: scope.client_id ?? null,
    company_id: scope.company_id ?? null,
    invoice_type: "sales",
    issue_date: today,
    due_date: due,
    currency: "GBP",
  };
  const { data: unpaid, error: e1 } = await sr.from("invoices").insert({
    ...baseInv,
    invoice_number: `${refPrefix}001`,
    reference: `${refPrefix}001`,
    total_net: 1000, total_vat: 200, total_gross: 1200, amount_paid: 0, status: "sent",
  }).select("id").single();
  if (e1) throw new Error(`invoice unpaid ${scope.label}: ${e1.message}`);
  const { data: paid, error: e2 } = await sr.from("invoices").insert({
    ...baseInv,
    invoice_number: `${refPrefix}002`,
    reference: `${refPrefix}002`,
    total_net: 500, total_vat: 100, total_gross: 600, amount_paid: 600, status: "paid",
  }).select("id").single();
  if (e2) throw new Error(`invoice paid ${scope.label}: ${e2.message}`);
  const { error: e3 } = await sr.from("invoice_payments").insert({
    invoice_id: paid!.id, payment_date: today, amount: 600, payment_method: "bank_transfer", reference: `${refPrefix}PAY`,
  });
  if (e3) throw new Error(`payment ${scope.label}: ${e3.message}`);
}

async function seedJobDocs(sr: SR, jobId: string, label: string) {
  await sr.from("job_documents").delete().eq("job_id", jobId).like("file_name", `QA-${label}-%`);
  const rows = [
    { file_name: `QA-${label}-visible.pdf`, file_path: `qa/${label}/visible.pdf`, mime_type: "application/pdf", client_visible: true, archived: false, version: 1 },
    { file_name: `QA-${label}-hidden.pdf`, file_path: `qa/${label}/hidden.pdf`, mime_type: "application/pdf", client_visible: false, archived: false, version: 1 },
  ].map((r) => ({ ...r, organization_id: ORG, job_id: jobId }));
  const { error } = await sr.from("job_documents").insert(rows);
  if (error) throw new Error(`job_documents ${label}: ${error.message}`);
}

async function seedVisibility(sr: SR, scope: { client_id?: string | null; company_id?: string | null }, flags: Record<string, boolean>) {
  let q = sr.from("portal_visibility_settings").delete().eq("organization_id", ORG);
  if (scope.client_id) q = q.eq("client_id", scope.client_id);
  if (scope.company_id) q = q.eq("company_id", scope.company_id);
  await q;
  await sr.from("portal_visibility_settings").insert({
    organization_id: ORG,
    client_id: scope.client_id ?? null,
    company_id: scope.company_id ?? null,
    ...flags,
  });
}

async function seedQuestionnaire(sr: SR, scope: { client_id?: string | null; company_id?: string | null; label: string }) {
  const namePrefix = `[QA-${scope.label}]`;
  let del = sr.from("questionnaire_instances").delete().eq("organization_id", ORG).like("name", `${namePrefix}%`);
  if (scope.client_id) del = del.eq("client_id", scope.client_id);
  if (scope.company_id) del = del.eq("company_id", scope.company_id);
  await del;
  const rows = [
    { name: `${namePrefix} In Progress`, status: "in_progress", questions: [] },
    { name: `${namePrefix} Submitted`, status: "submitted", submitted_at: new Date().toISOString(), questions: [] },
  ].map((r) => ({
    ...r,
    organization_id: ORG,
    client_id: scope.client_id ?? null,
    company_id: scope.company_id ?? null,
  }));
  const { error } = await sr.from("questionnaire_instances").insert(rows);
  if (error) throw new Error(`questionnaires ${scope.label}: ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const secret = req.headers.get("x-seed-secret");
    const expected = Deno.env.get("PORTAL_SEED_SECRET");
    if (!expected || secret !== expected) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const sr = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Pick any existing accountant user in org for sender_id of accountant-originated messages.
    const { data: orgUsers } = await sr.from("organization_users").select("user_id").eq("organization_id", ORG).limit(1);
    const accountantUserId = orgUsers?.[0]?.user_id;
    if (!accountantUserId) throw new Error("no accountant user in org");

    const emails = {
      A: "portal-a@accountancyos.test",
      B: "portal-b@accountancyos.test",
      C: "portal-c@accountancyos.test",
      D: "portal-d@accountancyos.test",
    };
    const uidA = await upsertUser(sr, emails.A);
    const uidB = await upsertUser(sr, emails.B);
    const uidC = await upsertUser(sr, emails.C);
    const uidD = await upsertUser(sr, emails.D);

    await upsertPortalAccess(sr, { user_id: uidA, client_id: CLIENT_A, company_id: null, status: "active" });
    await upsertPortalAccess(sr, { user_id: uidB, client_id: CLIENT_B, company_id: null, status: "active" });
    await upsertPortalAccess(sr, { user_id: uidC, client_id: null, company_id: COMPANY_C1, status: "active" });
    await upsertPortalAccess(sr, { user_id: uidC, client_id: null, company_id: COMPANY_C2, status: "active" });
    await upsertPortalAccess(sr, { user_id: uidD, client_id: null, company_id: COMPANY_D, status: "revoked" });

    // Tasks
    await seedTasks(sr, { client_id: CLIENT_A, label: "A" });
    await seedTasks(sr, { client_id: CLIENT_B, label: "B" });
    await seedTasks(sr, { company_id: COMPANY_C1, label: "C1" });
    await seedTasks(sr, { company_id: COMPANY_C2, label: "C2" });

    // Messages
    await seedMessages(sr, accountantUserId, { client_id: CLIENT_A, label: "A" });
    await seedMessages(sr, accountantUserId, { client_id: CLIENT_B, label: "B" });
    await seedMessages(sr, accountantUserId, { company_id: COMPANY_C1, label: "C1" });

    // Invoices
    await seedInvoices(sr, { client_id: CLIENT_A, label: "A" });
    await seedInvoices(sr, { client_id: CLIENT_B, label: "B" });
    await seedInvoices(sr, { company_id: COMPANY_C1, label: "C1" });
    await seedInvoices(sr, { company_id: COMPANY_C2, label: "C2" });

    // Job documents (link to existing jobs)
    await seedJobDocs(sr, JOB_A, "A");
    await seedJobDocs(sr, JOB_B, "B");
    await seedJobDocs(sr, JOB_C1, "C1");

    // Visibility: A gets revenue+profit, B gets nothing (conservative defaults), C1 gets cash only, C2 has no row (test defaults)
    await seedVisibility(sr, { client_id: CLIENT_A }, { show_revenue: true, show_profit: true, show_cash: false, show_invoices: true, show_trial_balance: false });
    await seedVisibility(sr, { client_id: CLIENT_B }, { show_revenue: false, show_profit: false, show_cash: false, show_invoices: true, show_trial_balance: false });
    await seedVisibility(sr, { company_id: COMPANY_C1 }, { show_revenue: false, show_profit: false, show_cash: true, show_invoices: true, show_trial_balance: false });
    // intentionally no row for COMPANY_C2 to test conservative defaults

    // Questionnaires
    await seedQuestionnaire(sr, { client_id: CLIENT_A, label: "A" });
    await seedQuestionnaire(sr, { client_id: CLIENT_B, label: "B" });
    await seedQuestionnaire(sr, { company_id: COMPANY_C1, label: "C1" });

    return new Response(JSON.stringify({
      ok: true,
      users: { A: { email: emails.A, id: uidA }, B: { email: emails.B, id: uidB }, C: { email: emails.C, id: uidC }, D: { email: emails.D, id: uidD } },
      password: PW,
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});