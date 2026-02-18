/**
 * Invoice Service - Accounts Receivable
 * Handles sales invoices, credit notes, and customer payments
 */

import { supabase } from "@/integrations/supabase/client";
import {
  postToLedger,
  reverseLedgerEntries,
  isPeriodLocked,
  getControlAccount,
  calculateFXGainLoss,
  LedgerEntry,
  PostingContext,
} from "./posting-service";

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
  // Fetch invoice with lines
  const { data: invoice, error: fetchError } = await supabase
    .from("invoices")
    .select(`
      *,
      invoice_lines(*)
    `)
    .eq("id", invoiceId)
    .single();

  if (fetchError || !invoice) {
    return { success: false, error: "Invoice not found" };
  }

  if (invoice.status !== "DRAFT") {
    return { success: false, error: "Invoice is not in draft status" };
  }

  if (invoice.is_posted) {
    return { success: false, error: "Invoice already posted" };
  }

  const entityType = invoice.client_id ? "client" : "company";
  const entityId = invoice.client_id || invoice.company_id;

  // Check period lock
  const lockCheck = await isPeriodLocked(
    invoice.organization_id,
    entityType as "client" | "company",
    entityId,
    invoice.issue_date
  );

  if (lockCheck.locked) {
    return { success: false, error: `Period locked until ${lockCheck.lockDate}` };
  }

  // Get control accounts
  const debtorsAccountId = await getControlAccount(
    invoice.organization_id,
    entityType as "client" | "company",
    entityId,
    "TRADE_DEBTORS"
  );

  const vatAccountId = await getControlAccount(
    invoice.organization_id,
    entityType as "client" | "company",
    entityId,
    "VAT_CONTROL"
  );

  if (!debtorsAccountId) {
    return { success: false, error: "Trade Debtors control account not found" };
  }

  // Build ledger entries per CTO spec:
  // DR Trade Debtors (gross)
  // CR Sales accounts (net per line)
  // CR VAT Control (total VAT)
  const entries: LedgerEntry[] = [];

  // DR Trade Debtors for gross
  entries.push({
    accountId: debtorsAccountId,
    debit: invoice.total_gross,
    credit: null,
    description: `Sales Invoice ${invoice.invoice_number || invoiceId.substring(0, 8)}: ${invoice.contact_name}`,
  });

  // CR Sales accounts for each line (net)
  for (const line of invoice.invoice_lines || []) {
    entries.push({
      accountId: line.account_id,
      debit: null,
      credit: line.net_amount,
      description: `${invoice.invoice_number || ""}: ${line.description}`,
      vatCodeId: line.vat_code_id,
    });
  }

  // CR VAT Control for total VAT
  if (invoice.total_vat > 0 && vatAccountId) {
    entries.push({
      accountId: vatAccountId,
      debit: null,
      credit: invoice.total_vat,
      description: `VAT on Invoice ${invoice.invoice_number || invoiceId.substring(0, 8)}`,
    });
  }

  // Post to ledger
  const postingContext: PostingContext = {
    organizationId: invoice.organization_id,
    entityType: entityType as "client" | "company",
    entityId,
    transactionDate: invoice.issue_date,
    reference: invoice.invoice_number || undefined,
    sourceType: "INVOICE",
    sourceId: invoiceId,
    currency: invoice.currency || "GBP",
    fxRate: Number(invoice.exchange_rate) || 1.0,
    userId,
  };

  const postResult = await postToLedger(postingContext, entries);

  if (!postResult.success) {
    return { success: false, error: postResult.error };
  }

  // Update invoice status
  const { error: updateError } = await supabase
    .from("invoices")
    .update({
      status: "AWAITING_PAYMENT",
      is_posted: true,
      posted_at: new Date().toISOString(),
      posted_by: userId,
    })
    .eq("id", invoiceId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true, journalId: postResult.journalId };
}

/**
 * Void an invoice
 */
export async function voidInvoice(
  invoiceId: string,
  userId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();

  if (!invoice) {
    return { success: false, error: "Invoice not found" };
  }

  if (invoice.status === "VOIDED") {
    return { success: false, error: "Invoice already voided" };
  }

  if (Number(invoice.amount_paid || 0) > 0) {
    return { success: false, error: "Cannot void invoice with payments. Refund first." };
  }

  // If posted, create reversing ledger entries to maintain TB integrity
  if (invoice.is_posted) {
    // Find the journal created when this invoice was posted
    const { data: ledgerEntries } = await supabase
      .from("ledger_entries")
      .select("journal_id")
      .eq("source_type", "INVOICE")
      .eq("source_id", invoiceId)
      .limit(1);

    const journalId = ledgerEntries?.[0]?.journal_id;

    if (journalId) {
      const entityType = invoice.client_id ? "client" : "company";
      const entityId = invoice.client_id || invoice.company_id;

      const reverseResult = await reverseLedgerEntries(
        journalId,
        {
          organizationId: invoice.organization_id,
          entityType: entityType as "client" | "company",
          entityId,
          transactionDate: new Date().toISOString().split("T")[0],
          reference: `VOID-${invoice.invoice_number || invoiceId.substring(0, 8)}`,
          sourceType: "INVOICE",
          currency: invoice.currency || "GBP",
          fxRate: Number(invoice.exchange_rate) || 1.0,
          userId,
        },
        reason || "Invoice voided"
      );

      if (!reverseResult.success) {
        return { success: false, error: `Failed to reverse ledger entries: ${reverseResult.error}` };
      }
    }
  }

  const { error } = await supabase
    .from("invoices")
    .update({
      status: "VOIDED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);

  if (error) {
    return { success: false, error: error.message };
  }

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
  // Fetch invoice
  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();

  if (!invoice) {
    return { success: false, error: "Invoice not found" };
  }

  if (!invoice.is_posted) {
    return { success: false, error: "Invoice must be posted before recording payment" };
  }

  const entityType = invoice.client_id ? "client" : "company";
  const entityId = invoice.client_id || invoice.company_id;

  // Check period lock
  const lockCheck = await isPeriodLocked(
    invoice.organization_id,
    entityType as "client" | "company",
    entityId,
    payment.paymentDate
  );

  if (lockCheck.locked) {
    return { success: false, error: `Period locked until ${lockCheck.lockDate}` };
  }

  const remainingBalance = Number(invoice.remaining_balance || invoice.total_gross) - Number(invoice.amount_paid || 0);
  const isOverpayment = payment.amount > remainingBalance;
  const allocationAmount = Math.min(payment.amount, remainingBalance);
  const overpaymentAmount = isOverpayment ? payment.amount - remainingBalance : 0;

  // Get control accounts
  const debtorsAccountId = await getControlAccount(
    invoice.organization_id,
    entityType as "client" | "company",
    entityId,
    "TRADE_DEBTORS"
  );

  if (!debtorsAccountId) {
    return { success: false, error: "Trade Debtors account not found" };
  }

  // Create payment record
  const { data: paymentRecord, error: paymentError } = await supabase
    .from("invoice_payments")
    .insert({
      invoice_id: invoiceId,
      amount: payment.amount,
      payment_date: payment.paymentDate,
      bank_account_id: payment.bankAccountId || null,
      bank_transaction_id: payment.bankTransactionId || null,
      reference: payment.reference || null,
      payment_method: payment.paymentMethod || null,
      payment_type: isOverpayment ? "overpayment" : "normal",
      unallocated_amount: overpaymentAmount,
      created_by: userId,
    })
    .select("id")
    .single();

  if (paymentError) {
    return { success: false, error: paymentError.message };
  }

  // Post ledger entries: DR Bank, CR Trade Debtors
  if (payment.bankAccountId) {
    const entries: LedgerEntry[] = [
      {
        accountId: payment.bankAccountId,
        debit: payment.amount,
        credit: null,
        description: `Payment received: Invoice ${invoice.invoice_number || invoiceId.substring(0, 8)}`,
      },
      {
        accountId: debtorsAccountId,
        debit: null,
        credit: allocationAmount,
        description: `Payment received: Invoice ${invoice.invoice_number || invoiceId.substring(0, 8)}`,
      },
    ];

    // If overpayment, credit the debtors for the full amount (creates credit balance)
    if (overpaymentAmount > 0) {
      entries[1].credit = payment.amount;
    }

    const postResult = await postToLedger(
      {
        organizationId: invoice.organization_id,
        entityType: entityType as "client" | "company",
        entityId,
        transactionDate: payment.paymentDate,
        reference: payment.reference,
        sourceType: "PAYMENT",
        sourceId: paymentRecord.id,
        userId,
      },
      entries
    );

    if (!postResult.success) {
      // Rollback payment record
      await supabase.from("invoice_payments").delete().eq("id", paymentRecord.id);
      return { success: false, error: postResult.error };
    }
  }

  // Update invoice balances (trigger should handle this, but explicit update for safety)
  const newAmountPaid = Number(invoice.amount_paid || 0) + allocationAmount;
  const newRemainingBalance = Number(invoice.total_gross) - newAmountPaid;
  const newStatus = newRemainingBalance <= 0 ? "PAID" : "PART_PAID";

  await supabase
    .from("invoices")
    .update({
      amount_paid: newAmountPaid,
      remaining_balance: newRemainingBalance,
      status: newStatus,
    })
    .eq("id", invoiceId);

  return { success: true, paymentId: paymentRecord.id };
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
