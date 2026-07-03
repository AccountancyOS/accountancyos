import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const money = (n: number, ccy?: string | null) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: ccy || "GBP" }).format(Number(n || 0));
const dt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB") : "—");

// Chunked base64 — btoa(String.fromCharCode(...bytes)) overflows the argument limit on
// any PDF over ~64KB (i.e. as soon as a logo is embedded).
function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const { invoice_id } = await req.json();
    if (!invoice_id) {
      return json({ error: "Missing invoice_id" }, 400);
    }

    // Authenticated, caller-scoped client — RLS is authoritative end-to-end.
    const supa = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { data: invoice } = await supa
      .from("invoices")
      .select("*")
      .eq("id", invoice_id)
      .maybeSingle();
    if (!invoice) return json({ error: "Invoice not found or access denied" }, 404);

    const { data: lines } = await supa
      .from("invoice_lines").select("*").eq("invoice_id", invoice_id).order("line_number");

    const entityCol = invoice.client_id ? "client_id" : "company_id";
    const { data: settings } = await supa
      .from("invoice_settings").select("*").eq(entityCol, invoice.client_id || invoice.company_id).maybeSingle();

    // Business (the sender) name.
    let businessName = "";
    if (invoice.client_id) {
      const { data: c } = await supa.from("clients").select("first_name,last_name").eq("id", invoice.client_id).maybeSingle();
      businessName = [c?.first_name, c?.last_name].filter(Boolean).join(" ");
    } else {
      const { data: co } = await supa.from("companies").select("company_name").eq("id", invoice.company_id).maybeSingle();
      businessName = co?.company_name || "";
    }

    // Logo bytes (private bucket → caller-scoped download → embed).
    let logoImg: any = null;
    const pdf = await PDFDocument.create();
    if (settings?.logo_url && !String(settings.logo_url).startsWith("http")) {
      const { data: blob } = await supa.storage.from("invoice-branding").download(settings.logo_url);
      if (blob) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        try {
          logoImg = String(settings.logo_url).toLowerCase().endsWith(".png")
            ? await pdf.embedPng(bytes)
            : await pdf.embedJpg(bytes);
        } catch { logoImg = null; }
      }
    }

    // ---- Build the page ----
    let page = pdf.addPage([595, 842]); // A4 portrait
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const ink = rgb(0.1, 0.1, 0.12);
    const grey = rgb(0.42, 0.45, 0.5);
    const line = rgb(0.85, 0.86, 0.88);
    let y = 800;
    const L = 40, R = 555;
    const text = (s: string, x: number, yy: number, size = 10, f = font, color = ink) =>
      page.drawText(String(s ?? ""), { x, y: yy, size, font: f, color });
    const right = (s: string, xr: number, yy: number, size = 10, f = font, color = ink) =>
      page.drawText(String(s ?? ""), { x: xr - f.widthOfTextAtSize(String(s ?? ""), size), y: yy, size, font: f, color });

    if (logoImg) {
      const w = 120, scale = w / logoImg.width, h = logoImg.height * scale;
      page.drawImage(logoImg, { x: L, y: y - h + 10, width: w, height: Math.min(h, 60) });
    } else {
      text(businessName, L, y, 15, bold);
    }
    right("INVOICE", R, y + 4, 22, bold, ink);
    right(businessName, R, y - 16, 10, font, grey);
    y -= 60;

    // Meta
    text("Invoice number", L, y, 9, font, grey); text(invoice.invoice_number || "—", L + 90, y, 10, bold);
    right("Issue date", R - 120, y, 9, font, grey); right(dt(invoice.issue_date), R, y, 10);
    y -= 15;
    right("Due date", R - 120, y, 9, font, grey); right(dt(invoice.due_date), R, y, 10);
    y -= 26;

    // Bill to
    text("BILL TO", L, y, 9, bold, grey); y -= 15;
    text(invoice.contact_name || "Customer", L, y, 11, bold); y -= 26;

    // Table header
    page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: line }); y -= 14;
    text("Description", L, y, 9, bold, grey);
    right("Qty", 330, y, 9, bold, grey);
    right("Unit", 410, y, 9, bold, grey);
    right("VAT", 470, y, 9, bold, grey);
    right("Amount", R, y, 9, bold, grey);
    y -= 6;
    page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: line }); y -= 16;

    for (const ln of lines || []) {
      text(String(ln.description || "").slice(0, 60), L, y, 10);
      right(String(ln.quantity ?? ""), 330, y, 10);
      right(money(ln.unit_price, invoice.currency), 410, y, 10);
      right(`${Number(ln.vat_rate || 0)}%`, 470, y, 10);
      right(money(ln.net_amount, invoice.currency), R, y, 10);
      y -= 18;
      if (y < 160) { page = pdf.addPage([595, 842]); y = 800; } // continue on a fresh page
    }

    // Totals
    y -= 6;
    page.drawLine({ start: { x: 360, y }, end: { x: R, y }, thickness: 1, color: line }); y -= 16;
    right("Subtotal", 470, y, 10, font, grey); right(money(invoice.total_net, invoice.currency), R, y, 10); y -= 16;
    right("VAT", 470, y, 10, font, grey); right(money(invoice.total_vat, invoice.currency), R, y, 10); y -= 18;
    right("Total", 470, y, 12, bold); right(money(invoice.total_gross, invoice.currency), R, y, 12, bold); y -= 34;

    // How to pay
    if (settings?.bank_account_name || settings?.bank_account_number) {
      text("HOW TO PAY", L, y, 9, bold, grey); y -= 15;
      const pay = [
        settings.bank_account_name && `Account name: ${settings.bank_account_name}`,
        settings.bank_sort_code && `Sort code: ${settings.bank_sort_code}`,
        settings.bank_account_number && `Account number: ${settings.bank_account_number}`,
        settings.bank_reference && `Reference: ${settings.bank_reference}`,
      ].filter(Boolean) as string[];
      for (const p of pay) { text(p, L, y, 10); y -= 15; }
      y -= 12;
    }

    // Footer
    if (settings?.invoice_footer) {
      text(String(settings.invoice_footer).slice(0, 300), L, Math.max(y, 50), 9, font, grey);
    }

    const pdfBytes = await pdf.save();
    const b64 = toBase64(pdfBytes);
    return json({
      success: true,
      filename: `Invoice-${invoice.invoice_number || invoice_id}.pdf`,
      pdf_base64: b64,
    });
  } catch (e) {
    console.error("[generate-invoice-pdf]", e);
    return json({ error: String((e as Error).message || e) }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
