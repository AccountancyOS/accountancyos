/**
 * Bills Service - Accounts Payable
 * Handles purchase bills, credit notes, and supplier payments
 */

import { supabase } from "@/integrations/supabase/client";
import {
  postToLedger,
  isPeriodLocked,
  getControlAccount,
  LedgerEntry,
  PostingContext,
} from "./posting-service";

export interface BillInput {
  supplierId?: string;
  billNumber?: string;
  reference?: string;
  issueDate: string;
  dueDate: string;
  currency?: string;
  fxRate?: number;
  notes?: string;
  lines: BillLineInput[];
}

export interface BillLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  accountId: string;
  vatCodeId?: string;
  vatRate: number;
}

export interface BillPaymentInput {
  amount: number;
  paymentDate: string;
  bankAccountId?: string;
  bankTransactionId?: string;
  reference?: string;
  paymentMethod?: string;
}

/**
 * Create a draft bill
 */
export async function createDraftBill(
  organizationId: string,
  entityType: "client" | "company",
  entityId: string,
  input: BillInput,
  userId?: string
): Promise<{ success: boolean; billId?: string; error?: string }> {
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

    // Insert bill
    const { data: bill, error: billError } = await supabase
      .from("bills")
      .insert({
        organization_id: organizationId,
        client_id: entityType === "client" ? entityId : null,
        company_id: entityType === "company" ? entityId : null,
        supplier_id: input.supplierId || null,
        bill_number: input.billNumber || null,
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

    if (billError) {
      return { success: false, error: billError.message };
    }

    // Insert lines
    const linesWithBillId = lines.map((l) => ({ ...l, bill_id: bill.id }));
    const { error: linesError } = await supabase.from("bill_lines").insert(linesWithBillId);

    if (linesError) {
      await supabase.from("bills").delete().eq("id", bill.id);
      return { success: false, error: linesError.message };
    }

    return { success: true, billId: bill.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Update a draft bill
 */
export async function updateDraftBill(
  billId: string,
  input: Partial<BillInput>,
  userId?: string
): Promise<{ success: boolean; error?: string }> {
  const { data: bill } = await supabase
    .from("bills")
    .select("status, is_posted")
    .eq("id", billId)
    .single();

  if (!bill) {
    return { success: false, error: "Bill not found" };
  }

  if (bill.status !== "DRAFT" || bill.is_posted) {
    return { success: false, error: "Can only update draft bills" };
  }

  const updates: any = {};
  if (input.supplierId !== undefined) updates.supplier_id = input.supplierId;
  if (input.billNumber !== undefined) updates.bill_number = input.billNumber;
  if (input.reference !== undefined) updates.reference = input.reference;
  if (input.issueDate) updates.issue_date = input.issueDate;
  if (input.dueDate) updates.due_date = input.dueDate;
  if (input.currency) updates.currency = input.currency;
  if (input.fxRate !== undefined) updates.exchange_rate = input.fxRate;
  if (input.notes !== undefined) updates.notes = input.notes;

  const { error: updateError } = await supabase
    .from("bills")
    .update(updates)
    .eq("id", billId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  if (input.lines) {
    await supabase.from("bill_lines").delete().eq("bill_id", billId);

    const lines = input.lines.map((line, idx) => {
      const netAmount = line.quantity * line.unitPrice;
      const vatAmount = netAmount * (line.vatRate / 100);
      return {
        bill_id: billId,
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

    const { error: linesError } = await supabase.from("bill_lines").insert(lines);
    if (linesError) {
      return { success: false, error: linesError.message };
    }
  }

  return { success: true };
}

/**
 * Approve and post a bill to the ledger
 */
export async function approveBill(
  billId: string,
  userId: string
): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { data: bill, error: fetchError } = await supabase
    .from("bills")
    .select(`
      *,
      bill_lines(*)
    `)
    .eq("id", billId)
    .single();

  if (fetchError || !bill) {
    return { success: false, error: "Bill not found" };
  }

  if (bill.status !== "DRAFT") {
    return { success: false, error: "Bill is not in draft status" };
  }

  if (bill.is_posted) {
    return { success: false, error: "Bill already posted" };
  }

  const entityType = bill.client_id ? "client" : "company";
  const entityId = bill.client_id || bill.company_id;

  const lockCheck = await isPeriodLocked(
    bill.organization_id,
    entityType as "client" | "company",
    entityId,
    bill.issue_date
  );

  if (lockCheck.locked) {
    return { success: false, error: `Period locked until ${lockCheck.lockDate}` };
  }

  const creditorsAccountId = await getControlAccount(
    bill.organization_id,
    entityType as "client" | "company",
    entityId,
    "TRADE_CREDITORS"
  );

  const vatAccountId = await getControlAccount(
    bill.organization_id,
    entityType as "client" | "company",
    entityId,
    "VAT_CONTROL"
  );

  if (!creditorsAccountId) {
    return { success: false, error: "Trade Creditors control account not found" };
  }

  // Build ledger entries per CTO spec:
  // DR Expense/COS accounts (net per line)
  // DR VAT Control (total VAT)
  // CR Trade Creditors (gross)
  const entries: LedgerEntry[] = [];

  // DR Expense accounts for each line (net)
  for (const line of bill.bill_lines || []) {
    entries.push({
      accountId: line.account_id,
      debit: line.net_amount,
      credit: null,
      description: `Bill ${bill.bill_number || billId.substring(0, 8)}: ${line.description}`,
      vatCodeId: line.vat_code_id,
    });
  }

  // DR VAT Control for total VAT
  if (bill.total_vat > 0 && vatAccountId) {
    entries.push({
      accountId: vatAccountId,
      debit: bill.total_vat,
      credit: null,
      description: `VAT on Bill ${bill.bill_number || billId.substring(0, 8)}`,
    });
  }

  // CR Trade Creditors for gross
  entries.push({
    accountId: creditorsAccountId,
    debit: null,
    credit: bill.total_gross,
    description: `Bill ${bill.bill_number || billId.substring(0, 8)}`,
  });

  const postingContext: PostingContext = {
    organizationId: bill.organization_id,
    entityType: entityType as "client" | "company",
    entityId,
    transactionDate: bill.issue_date,
    reference: bill.bill_number || undefined,
    sourceType: "BILL",
    sourceId: billId,
    currency: bill.currency || "GBP",
    fxRate: Number(bill.exchange_rate) || 1.0,
    userId,
  };

  const postResult = await postToLedger(postingContext, entries);

  if (!postResult.success) {
    return { success: false, error: postResult.error };
  }

  const { error: updateError } = await supabase
    .from("bills")
    .update({
      status: "AWAITING_PAYMENT",
      is_posted: true,
      posted_at: new Date().toISOString(),
      posted_by: userId,
    })
    .eq("id", billId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true, journalId: postResult.journalId };
}

/**
 * Void a bill
 */
export async function voidBill(
  billId: string,
  userId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const { data: bill } = await supabase
    .from("bills")
    .select("*")
    .eq("id", billId)
    .single();

  if (!bill) {
    return { success: false, error: "Bill not found" };
  }

  if (bill.status === "VOIDED") {
    return { success: false, error: "Bill already voided" };
  }

  if (Number(bill.amount_paid || 0) > 0) {
    return { success: false, error: "Cannot void bill with payments. Refund first." };
  }

  const { error } = await supabase
    .from("bills")
    .update({
      status: "VOIDED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", billId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Record a payment against a bill
 */
export async function recordBillPayment(
  billId: string,
  payment: BillPaymentInput,
  userId: string
): Promise<{ success: boolean; paymentId?: string; error?: string }> {
  const { data: bill } = await supabase
    .from("bills")
    .select("*")
    .eq("id", billId)
    .single();

  if (!bill) {
    return { success: false, error: "Bill not found" };
  }

  if (!bill.is_posted) {
    return { success: false, error: "Bill must be posted before recording payment" };
  }

  const entityType = bill.client_id ? "client" : "company";
  const entityId = bill.client_id || bill.company_id;

  const lockCheck = await isPeriodLocked(
    bill.organization_id,
    entityType as "client" | "company",
    entityId,
    payment.paymentDate
  );

  if (lockCheck.locked) {
    return { success: false, error: `Period locked until ${lockCheck.lockDate}` };
  }

  const remainingBalance = Number(bill.remaining_balance || bill.total_gross) - Number(bill.amount_paid || 0);
  const isOverpayment = payment.amount > remainingBalance;
  const allocationAmount = Math.min(payment.amount, remainingBalance);
  const overpaymentAmount = isOverpayment ? payment.amount - remainingBalance : 0;

  const creditorsAccountId = await getControlAccount(
    bill.organization_id,
    entityType as "client" | "company",
    entityId,
    "TRADE_CREDITORS"
  );

  if (!creditorsAccountId) {
    return { success: false, error: "Trade Creditors account not found" };
  }

  const { data: paymentRecord, error: paymentError } = await supabase
    .from("bill_payments")
    .insert({
      bill_id: billId,
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

  // Post ledger entries: DR Trade Creditors, CR Bank
  if (payment.bankAccountId) {
    const entries: LedgerEntry[] = [
      {
        accountId: creditorsAccountId,
        debit: isOverpayment ? payment.amount : allocationAmount,
        credit: null,
        description: `Payment: Bill ${bill.bill_number || billId.substring(0, 8)}`,
      },
      {
        accountId: payment.bankAccountId,
        debit: null,
        credit: payment.amount,
        description: `Payment: Bill ${bill.bill_number || billId.substring(0, 8)}`,
      },
    ];

    const postResult = await postToLedger(
      {
        organizationId: bill.organization_id,
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
      await supabase.from("bill_payments").delete().eq("id", paymentRecord.id);
      return { success: false, error: postResult.error };
    }
  }

  const newAmountPaid = Number(bill.amount_paid || 0) + allocationAmount;
  const newRemainingBalance = Number(bill.total_gross) - newAmountPaid;
  const newStatus = newRemainingBalance <= 0 ? "PAID" : "PART_PAID";

  await supabase
    .from("bills")
    .update({
      amount_paid: newAmountPaid,
      remaining_balance: newRemainingBalance,
      status: newStatus,
    })
    .eq("id", billId);

  return { success: true, paymentId: paymentRecord.id };
}

/**
 * Get aged payables report
 */
export async function getAgedPayables(
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
  bills: any[];
}> {
  const asOf = asOfDate ? new Date(asOfDate) : new Date();

  const query = supabase
    .from("bills")
    .select("*, supplier:suppliers(*)")
    .eq("organization_id", organizationId)
    .eq("is_posted", true)
    .neq("status", "PAID")
    .neq("status", "VOIDED")
    .lte("issue_date", asOf.toISOString().split("T")[0]);

  if (entityType === "client") {
    query.eq("client_id", entityId);
  } else {
    query.eq("company_id", entityId);
  }

  const { data: bills } = await query;

  const result = {
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    over90: 0,
    total: 0,
    bills: bills || [],
  };

  for (const bill of bills || []) {
    const outstanding = Number(bill.total_gross) - Number(bill.amount_paid || 0);
    const dueDate = new Date(bill.due_date);
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
 * Get supplier statement data
 */
export async function getSupplierStatementData(
  supplierId: string,
  startDate?: string,
  endDate?: string
): Promise<{
  supplier: any;
  openingBalance: number;
  transactions: any[];
  closingBalance: number;
}> {
  const { data: supplier } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", supplierId)
    .single();

  if (!supplier) {
    return { supplier: null, openingBalance: 0, transactions: [], closingBalance: 0 };
  }

  let billsQuery = supabase
    .from("bills")
    .select("*, bill_payments(*)")
    .eq("supplier_id", supplierId)
    .eq("is_posted", true)
    .neq("status", "VOIDED");

  if (startDate) {
    billsQuery = billsQuery.gte("issue_date", startDate);
  }
  if (endDate) {
    billsQuery = billsQuery.lte("issue_date", endDate);
  }

  const { data: bills } = await billsQuery.order("issue_date");

  const transactions: any[] = [];
  let runningBalance = 0;

  for (const bill of bills || []) {
    transactions.push({
      date: bill.issue_date,
      type: "BILL",
      reference: bill.bill_number,
      description: `Bill ${bill.bill_number}`,
      debit: null,
      credit: bill.total_gross,
      balance: runningBalance + Number(bill.total_gross),
    });
    runningBalance += Number(bill.total_gross);

    for (const payment of bill.bill_payments || []) {
      transactions.push({
        date: payment.payment_date,
        type: "PAYMENT",
        reference: payment.reference,
        description: `Payment made`,
        debit: payment.amount,
        credit: null,
        balance: runningBalance - Number(payment.amount),
      });
      runningBalance -= Number(payment.amount);
    }
  }

  return {
    supplier,
    openingBalance: 0,
    transactions,
    closingBalance: runningBalance,
  };
}
