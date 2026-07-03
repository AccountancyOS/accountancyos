import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const money = (n: number, ccy?: string | null) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: ccy || "GBP" }).format(Number(n || 0));
const dt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB") : "—");
const esc = (s: string) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const { invoice_id } = await req.json();
    if (!invoice_id) return json({ error: "Missing invoice_id" }, 400);

    // Authenticated, caller-scoped client — RLS gates which invoices the user can touch.
    const supa = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    let { data: invoice } = await supa.from("invoices").select("*").eq("id", invoice_id).maybeSingle();
    if (!invoice) return json({ error: "Invoice not found or access denied" }, 404);
    if (!invoice.contact_email) return json({ error: "This invoice has no customer email address" }, 400);

    // Issue (post to Trade Debtors) if still a draft — via the user client so permissions apply.
    if (invoice.status === "DRAFT") {
      const { data: issued, error: issErr } = await supa.rpc("issue_invoice_safe", { p_invoice_id: invoice_id });
      if (issErr) return json({ error: `Could not issue invoice: ${issErr.message}` }, 400);
      if (issued && (issued as any).success === false) return json({ error: (issued as any).error || "Could not issue invoice" }, 400);
      const r = await supa.from("invoices").select("*").eq("id", invoice_id).maybeSingle();
      invoice = r.data;
    }

    // Generate the branded PDF (forward the user's JWT so its auth gate passes).
    const pdfRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-invoice-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader, apikey: ANON_KEY },
      body: JSON.stringify({ invoice_id }),
    });
    const pdfJson = await pdfRes.json();
    if (!pdfJson?.pdf_base64) return json({ error: pdfJson?.error || "Could not generate the invoice PDF" }, 500);

    // Store the PDF + mint a long-lived signed URL (customer is external/unauthenticated).
    const svc = createClient(SUPABASE_URL, SERVICE_KEY);
    const pdfBytes = Uint8Array.from(atob(pdfJson.pdf_base64), (c) => c.charCodeAt(0));
    const path = `${invoice_id}.pdf`;
    const { error: upErr } = await svc.storage.from("invoice-pdfs").upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (upErr) return json({ error: `Could not store the invoice PDF: ${upErr.message}` }, 500);
    const { data: signed, error: signErr } = await svc.storage.from("invoice-pdfs").createSignedUrl(path, 60 * 60 * 24 * 90);
    if (signErr || !signed?.signedUrl) return json({ error: "Could not create the invoice download link" }, 500);
    const link = signed.signedUrl;

    // Business name + email template.
    const entityCol = invoice.client_id ? "client_id" : "company_id";
    const { data: settings } = await svc.from("invoice_settings").select("*").eq(entityCol, invoice.client_id || invoice.company_id).maybeSingle();
    let businessName = "";
    if (invoice.client_id) {
      const { data: c } = await svc.from("clients").select("first_name,last_name").eq("id", invoice.client_id).maybeSingle();
      businessName = [c?.first_name, c?.last_name].filter(Boolean).join(" ");
    } else {
      const { data: co } = await svc.from("companies").select("company_name").eq("id", invoice.company_id).maybeSingle();
      businessName = co?.company_name || "";
    }

    const fill = (t: string) => String(t || "")
      .replaceAll("{{customer_name}}", invoice!.contact_name || "there")
      .replaceAll("{{invoice_number}}", invoice!.invoice_number || "")
      .replaceAll("{{amount}}", money(invoice!.total_gross, invoice!.currency))
      .replaceAll("{{due_date}}", dt(invoice!.due_date))
      .replaceAll("{{business_name}}", businessName);

    const subject = fill(settings?.email_subject || `Invoice ${invoice.invoice_number || ""} from ${businessName}`);
    const bodyText = fill(settings?.email_body || "Please find your invoice attached.");
    const bodyHtml = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;color:#1a1a1a">
      ${bodyText.split("\n").map((l) => `<p style="margin:0 0 10px">${esc(l) || "&nbsp;"}</p>`).join("")}
      <p style="margin:24px 0"><a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:500">View / Download Invoice (PDF)</a></p>
    </div>`;

    // Queue via the canonical email pipeline. Attachment is best-effort; the link always works.
    const { error: qErr } = await svc.from("email_queue").insert({
      organization_id: invoice.organization_id,
      to_email: invoice.contact_email,
      to_name: invoice.contact_name,
      subject,
      body_html: bodyHtml,
      context: "invoice",
      entity_type: "invoice",
      entity_id: invoice_id,
      attachments: [{
        filename: pdfJson.filename || `Invoice-${invoice.invoice_number || invoice_id}.pdf`,
        content: pdfJson.pdf_base64,
        contentType: "application/pdf",
      }],
      status: "pending",
    });
    if (qErr) return json({ error: `Could not queue the email: ${qErr.message}` }, 500);

    await svc.from("invoices").update({ sent_at: new Date().toISOString() }).eq("id", invoice_id);

    return json({ success: true, sent_to: invoice.contact_email });
  } catch (e) {
    console.error("[send-invoice]", e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
