import { supabase } from "@/integrations/supabase/client";

/**
 * Generate the branded invoice PDF (server-side, via the generate-invoice-pdf edge
 * function) and trigger a download in the browser. Same function is reused by the
 * "send to customer" flow (Stage 4) to attach the PDF.
 */
export async function downloadInvoicePdf(invoiceId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("generate-invoice-pdf", {
    body: { invoice_id: invoiceId },
  });
  if (error) throw error;
  if (!data?.pdf_base64) throw new Error(data?.error || "Could not generate the invoice PDF");

  const bytes = Uint8Array.from(atob(data.pdf_base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = data.filename || `Invoice-${invoiceId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Send the invoice to its customer: issues it (posts to Trade Debtors) if still a draft,
 * generates the branded PDF, and emails the customer the customisable message with a
 * secure download link (+ best-effort PDF attachment). Marks the invoice Sent.
 */
export async function sendInvoice(invoiceId: string): Promise<{ sent_to?: string }> {
  const { data, error } = await supabase.functions.invoke("send-invoice", {
    body: { invoice_id: invoiceId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data ?? {};
}
