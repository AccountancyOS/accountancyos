/**
 * Invoice Service - Accounts Receivable
 * Handles sales invoices, credit notes, and customer payments
 */

import { supabase } from "@/integrations/supabase/client";
// Posting now goes through atomic Phase 3 RPCs:
// approve_invoice, record_invoice_payment, void_invoice.
// Legacy helpers retained only for non-posting reads.

export interface InvoiceInput {
  customerId?: string;
  contactName: string;
  contactEmail?: string;
  invoiceNumber?: string;
  reference?: string;
  issueDate: string;
  dueDate: string;
  currency?: string;
  fxRate?: number;
  notes?: string;
  lines: InvoiceLineInput[];
}

export interface InvoiceLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  accountId: string;
  vatCodeId?: string;
  vatRate: number;
}

export interface PaymentInput {
  amount: number;
  paymentDate: string;
  bankAccountId?: string;
  bankTransactionId?: string;
  reference?: string;
  paymentMethod?: string;
}

/**
 * Create a draft sales invoice
 */
export async function createDraftInvoice(
  organizationId: string,
  entityType: "client" | "company",
  entityId: string,
  input: InvoiceInput,
  userId?: string
): Promise<{ success: boolean; invoiceId?: string; error?: string }> {
  try {
    // Calculate line totals
    const lines = input.lines.map((line, idx) => {
      const netAmount = line.quantity * line.unitPrice;
      const vatAmount = netAmount * (line.vatRate / 100);
      return {
        line_number: idx + 1,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        account_id: line.accountId,
        vat_code_id: line.vatCodeId || null,
        vat_rate: line.vatRate,
        net_amount: netAmount,
        vat_amount: vatAmount,
        gross_amount: netAmount + vatAmount,
      };
    });

    const totalNet = lines.reduce((sum, l) => sum + l.net_amount, 0);
    const totalVat = lines.reduce((sum, l) => sum + l.vat_amount, 0);
    const totalGross = lines.reduce((sum, l) => sum + l.gross_amount, 0);

    // Insert invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        organization_id: organizationId,
        client_id: entityType === "client" ? entityId : null,
        company_id: entityType === "company" ? entityId : null,
        customer_id: input.customerId || null,
        invoice_type: "SALES",
        contact_name: input.contactName,
        contact_email: input.contactEmail || null,
        invoice_number: input.invoiceNumber || null,
        reference: input.reference || null,
        issue_date: input.issueDate,
        due_date: input.dueDate,
        currency: input.currency || "GBP",
        exchange_rate: input.fxRate || 1.0,
        notes: input.notes || null,
        status: "DRAFT",
        is_posted: false,
        total_net: totalNet,
        total_vat: totalVat,
        total_gross: totalGross,
        remaining_balance: totalGross,
        amount_paid: 0,
      })
      .select("id")
      .single();

    if (invoiceError) {
      return { success: false, error: invoiceError.message };
    }

    // Insert lines
    const linesWithInvoiceId = lines.map((l) => ({ ...l, invoice_id: invoice.id }));
    const { error: linesError } = await supabase.from("invoice_lines").insert(linesWithInvoiceId);

    if (linesError) {
      await supabase.from("invoices").delete().eq("id", invoice.id);
      return { success: false, error: linesError.message };
    }

    return { success: true, invoiceId: invoice.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Update a draft invoice
 */
export async function updateDraftInvoice(
  invoiceId: string,
  input: Partial<InvoiceInput>,
  userId?: string
): Promise<{ success: boolean; error?: string }> {
  // Check status
  const { data: invoice } = await supabase
    .from("invoices")
    .select("status, is_posted")
    .eq("id", invoiceId)
    .single();

  if (!invoice) {
    return { success: false, error: "Invoice not found" };
  }

  if (invoice.status !== "DRAFT" || invoice.is_posted) {
    return { success: false, error: "Can only update draft invoices" };
  }

  const updates: any = {};
  if (input.customerId !== undefined) updates.customer_id = input.customerId;
  if (input.contactName) updates.contact_name = input.contactName;
  if (input.contactEmail !== undefined) updates.contact_email = input.contactEmail;
  if (input.invoiceNumber !== undefined) updates.invoice_number = input.invoiceNumber;
  if (input.reference !== undefined) updates.reference = input.reference;
  if (input.issueDate) updates.issue_date = input.issueDate;
  if (input.dueDate) updates.due_date = input.dueDate;
  if (input.currency) updates.currency = input.currency;
  if (input.fxRate !== undefined) updates.exchange_rate = input.fxRate;
  if (input.notes !== undefined) updates.notes = input.notes;

  const { error: updateError } = await supabase
    .from("invoices")
    .update(updates)
    .eq("id", invoiceId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Update lines if provided
  if (input.lines) {
    await supabase.from("invoice_lines").delete().eq("invoice_id", invoiceId);

    const lines = input.lines.map((line, idx) => {
      const netAmount = line.quantity * line.unitPrice;
      const vatAmount = netAmount * (line.vatRate / 100);
      return {
        invoice_id: invoiceId,
        line_number: idx + 1,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        account_id: line.accountId,
        vat_code_id: line.vatCodeId || null,
        vat_rate: line.vatRate,
        net_amount: netAmount,
        vat_amount: vatAmount,
        gross_amount: netAmount + vatAmount,
      };
    });

    const { error: linesError } = await supabase.from("invoice_lines").insert(lines);
    if (linesError) {
      return { success: false, error: linesError.message };
    }
  }

  return { success: true };
}

/**
 * Approve and post a sales invoice to the ledger
 */
export async function approveInvoice(
  invoiceId: string,
  userId: string
): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { data, error } = await supabase.rpc("approve_invoice", {
    p_invoice_id: invoiceId,
    p_user_id: userId,
  });
  if (error) return { success: false, error: error.message };
  const result = data as { success: boolean; journal_id?: string; error_message?: string };
  if (!result?.success) return { success: false, error: result?.error_message || "Invoice approval failed" };
  return { success: true, journalId: result.journal_id };
}

/**
 * Void an invoice
 */
export async function voidInvoice(
  invoiceId: string,
  userId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("void_invoice", {
    p_invoice_id: invoiceId,
    p_reason: reason ?? null,
    p_user_id: userId,
  });
  if (error) return { success: false, error: error.message };
  const result = data as { success: boolean; error_message?: string };
  if (!result?.success) return { success: false, error: result?.error_message || "Void failed" };
  return { success: true };
}

/**
 * Record a payment against an invoice
 */
export async function recordInvoicePayment(
  invoiceId: string,
  payment: PaymentInput,
  userId: string
): Promise<{ success: boolean; paymentId?: string; error?: string }> {
  const { data, error } = await supabase.rpc("record_invoice_payment", {
    p_invoice_id: invoiceId,
    p_amount: payment.amount,
    p_payment_date: payment.paymentDate,
    p_bank_account_id: payment.bankAccountId ?? null,
    p_bank_transaction_id: payment.bankTransactionId ?? null,
    p_reference: payment.reference ?? null,
    p_payment_method: payment.paymentMethod ?? null,
    p_user_id: userId,
  });
  if (error) return { success: false, error: error.message };
  const result = data as { success: boolean; payment_id?: string; error_message?: string };
  if (!result?.success) return { success: false, error: result?.error_message || "Payment failed" };
  return { success: true, paymentId: result.payment_id };
}

/**
 * Get aged receivables report
 */
export async function getAgedReceivables(
  organizationId: string,
  entityType: "client" | "company",
  entityId: string,
  asOfDate?: string
): Promise<{
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  over90: number;
  total: number;
  invoices: any[];
}> {
  const asOf = asOfDate ? new Date(asOfDate) : new Date();

  const query = supabase
    .from("invoices")
    .select("*, customer:customers(*)")
    .eq("organization_id", organizationId)
    .eq("invoice_type", "SALES")
    .eq("is_posted", true)
    .neq("status", "PAID")
    .neq("status", "VOIDED")
    .lte("issue_date", asOf.toISOString().split("T")[0]);

  if (entityType === "client") {
    query.eq("client_id", entityId);
  } else {
    query.eq("company_id", entityId);
  }

  const { data: invoices } = await query;

  const result = {
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    over90: 0,
    total: 0,
    invoices: invoices || [],
  };

  for (const inv of invoices || []) {
    const outstanding = Number(inv.total_gross) - Number(inv.amount_paid || 0);
    const dueDate = new Date(inv.due_date);
    const daysPastDue = Math.floor((asOf.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysPastDue <= 0) {
      result.current += outstanding;
    } else if (daysPastDue <= 30) {
      result.days1to30 += outstanding;
    } else if (daysPastDue <= 60) {
      result.days31to60 += outstanding;
    } else if (daysPastDue <= 90) {
      result.days61to90 += outstanding;
    } else {
      result.over90 += outstanding;
    }
    result.total += outstanding;
  }

  return result;
}

/**
 * Get customer statement data
 */
export async function getCustomerStatementData(
  customerId: string,
  startDate?: string,
  endDate?: string
): Promise<{
  customer: any;
  openingBalance: number;
  transactions: any[];
  closingBalance: number;
}> {
  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .single();

  if (!customer) {
    return { customer: null, openingBalance: 0, transactions: [], closingBalance: 0 };
  }

  // Fetch invoices and payments
  let invoicesQuery = supabase
    .from("invoices")
    .select("*, invoice_payments(*)")
    .eq("customer_id", customerId)
    .eq("is_posted", true)
    .neq("status", "VOIDED");

  if (startDate) {
    invoicesQuery = invoicesQuery.gte("issue_date", startDate);
  }
  if (endDate) {
    invoicesQuery = invoicesQuery.lte("issue_date", endDate);
  }

  const { data: invoices } = await invoicesQuery.order("issue_date");

  // Build transaction list
  const transactions: any[] = [];
  let runningBalance = 0;

  for (const inv of invoices || []) {
    // Invoice entry
    transactions.push({
      date: inv.issue_date,
      type: "INVOICE",
      reference: inv.invoice_number,
      description: `Invoice ${inv.invoice_number}`,
      debit: inv.total_gross,
      credit: null,
      balance: runningBalance + Number(inv.total_gross),
    });
    runningBalance += Number(inv.total_gross);

    // Payment entries
    for (const payment of inv.invoice_payments || []) {
      transactions.push({
        date: payment.payment_date,
        type: "PAYMENT",
        reference: payment.reference,
        description: `Payment received`,
        debit: null,
        credit: payment.amount,
        balance: runningBalance - Number(payment.amount),
      });
      runningBalance -= Number(payment.amount);
    }
  }

  return {
    customer,
    openingBalance: 0,
    transactions,
    closingBalance: runningBalance,
  };
}
