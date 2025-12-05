/**
 * Matching Service - Bank Transaction Matching Engine
 * Auto-matches bank transactions to invoices, bills, credit notes, and overpayments
 */

import { supabase } from "@/integrations/supabase/client";
import { postToLedger, getControlAccount, LedgerEntry } from "./posting-service";

export interface MatchCandidate {
  id: string;
  type: "invoice" | "bill" | "credit_note" | "overpayment";
  documentNumber: string;
  contactName: string;
  documentDate: string;
  dueDate?: string;
  totalAmount: number;
  outstandingAmount: number;
  proposedAllocation: number;
  confidence: number;
  explanation: string;
}

export interface MatchPlan {
  allocations: {
    documentId: string;
    documentType: "invoice" | "bill" | "credit_note" | "overpayment";
    amount: number;
  }[];
}

/**
 * Find matching candidates for a bank transaction
 */
export async function findMatchingCandidates(
  transactionId: string
): Promise<{ candidates: MatchCandidate[]; transaction: any }> {
  // Fetch transaction
  const { data: transaction } = await supabase
    .from("bank_transactions")
    .select("*, bank_account:bank_accounts(*)")
    .eq("id", transactionId)
    .single();

  if (!transaction) {
    return { candidates: [], transaction: null };
  }

  const candidates: MatchCandidate[] = [];
  const isMoneyIn = transaction.amount > 0;
  const absAmount = Math.abs(transaction.amount);
  const transactionDate = new Date(transaction.transaction_date);

  if (isMoneyIn) {
    // Money in - look for open sales invoices
    const query = supabase
      .from("invoices")
      .select("*, customer:customers(*)")
      .eq("organization_id", transaction.organization_id)
      .eq("invoice_type", "SALES")
      .eq("is_posted", true)
      .in("status", ["AWAITING_PAYMENT", "PART_PAID"]);

    if (transaction.company_id) {
      query.eq("company_id", transaction.company_id);
    } else if (transaction.client_id) {
      query.eq("client_id", transaction.client_id);
    }

    const { data: invoices } = await query;

    for (const inv of invoices || []) {
      const outstanding = Number(inv.total_gross) - Number(inv.amount_paid || 0);
      if (outstanding <= 0) continue;

      const confidence = calculateConfidence(
        absAmount,
        outstanding,
        transaction.description,
        inv.contact_name || inv.customer?.name || "",
        inv.invoice_number || "",
        transactionDate,
        new Date(inv.due_date)
      );

      candidates.push({
        id: inv.id,
        type: "invoice",
        documentNumber: inv.invoice_number || inv.id.substring(0, 8),
        contactName: inv.contact_name || inv.customer?.name || "Unknown",
        documentDate: inv.issue_date,
        dueDate: inv.due_date,
        totalAmount: Number(inv.total_gross),
        outstandingAmount: outstanding,
        proposedAllocation: Math.min(absAmount, outstanding),
        confidence,
        explanation: getConfidenceExplanation(confidence, absAmount, outstanding),
      });
    }
  } else {
    // Money out - look for open bills
    const query = supabase
      .from("bills")
      .select("*, supplier:suppliers(*)")
      .eq("organization_id", transaction.organization_id)
      .eq("is_posted", true)
      .in("status", ["AWAITING_PAYMENT", "PART_PAID"]);

    if (transaction.company_id) {
      query.eq("company_id", transaction.company_id);
    } else if (transaction.client_id) {
      query.eq("client_id", transaction.client_id);
    }

    const { data: bills } = await query;

    for (const bill of bills || []) {
      const outstanding = Number(bill.total_gross) - Number(bill.amount_paid || 0);
      if (outstanding <= 0) continue;

      const confidence = calculateConfidence(
        absAmount,
        outstanding,
        transaction.description,
        bill.supplier?.name || "",
        bill.bill_number || "",
        transactionDate,
        new Date(bill.due_date)
      );

      candidates.push({
        id: bill.id,
        type: "bill",
        documentNumber: bill.bill_number || bill.id.substring(0, 8),
        contactName: bill.supplier?.name || "Unknown",
        documentDate: bill.issue_date,
        dueDate: bill.due_date,
        totalAmount: Number(bill.total_gross),
        outstandingAmount: outstanding,
        proposedAllocation: Math.min(absAmount, outstanding),
        confidence,
        explanation: getConfidenceExplanation(confidence, absAmount, outstanding),
      });
    }
  }

  // Sort by confidence descending
  candidates.sort((a, b) => b.confidence - a.confidence);

  return { candidates, transaction };
}

/**
 * Calculate confidence score for a match
 */
function calculateConfidence(
  transactionAmount: number,
  documentAmount: number,
  transactionDescription: string,
  contactName: string,
  documentNumber: string,
  transactionDate: Date,
  dueDate: Date
): number {
  let score = 0;

  // Exact amount match: +50 points
  if (Math.abs(transactionAmount - documentAmount) < 0.01) {
    score += 50;
  } else {
    // Partial match based on how close
    const ratio = Math.min(transactionAmount, documentAmount) / Math.max(transactionAmount, documentAmount);
    score += ratio * 30;
  }

  // Description contains contact name: +20 points
  const descLower = transactionDescription.toLowerCase();
  if (contactName && descLower.includes(contactName.toLowerCase())) {
    score += 20;
  }

  // Description contains document number: +20 points
  if (documentNumber && descLower.includes(documentNumber.toLowerCase())) {
    score += 20;
  }

  // Date proximity to due date: +10 points if within 7 days
  const daysDiff = Math.abs(transactionDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff <= 7) {
    score += 10;
  } else if (daysDiff <= 30) {
    score += 5;
  }

  return Math.min(100, Math.round(score));
}

/**
 * Get human-readable explanation for confidence
 */
function getConfidenceExplanation(
  confidence: number,
  transactionAmount: number,
  documentAmount: number
): string {
  const reasons: string[] = [];

  if (Math.abs(transactionAmount - documentAmount) < 0.01) {
    reasons.push("Exact amount match");
  } else if (transactionAmount < documentAmount) {
    reasons.push("Partial payment");
  } else {
    reasons.push("Amount exceeds outstanding");
  }

  if (confidence >= 90) {
    reasons.push("High confidence match");
  } else if (confidence >= 70) {
    reasons.push("Good match");
  } else if (confidence >= 50) {
    reasons.push("Possible match");
  } else {
    reasons.push("Low confidence");
  }

  return reasons.join(". ");
}

/**
 * Apply a match plan to a bank transaction
 */
export async function applyMatch(
  transactionId: string,
  matchPlan: MatchPlan,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const { data: transaction } = await supabase
    .from("bank_transactions")
    .select("*")
    .eq("id", transactionId)
    .single();

  if (!transaction) {
    return { success: false, error: "Transaction not found" };
  }

  if (transaction.status === "MATCHED") {
    return { success: false, error: "Transaction already matched" };
  }

  const entityType = transaction.client_id ? "client" : "company";
  const entityId = transaction.client_id || transaction.company_id;
  const isMoneyIn = transaction.amount > 0;

  try {
    for (const allocation of matchPlan.allocations) {
      if (allocation.documentType === "invoice") {
        // Record payment against invoice
        const { data: invoice } = await supabase
          .from("invoices")
          .select("*")
          .eq("id", allocation.documentId)
          .single();

        if (!invoice) continue;

        // Create payment record
        await supabase.from("invoice_payments").insert({
          invoice_id: allocation.documentId,
          amount: allocation.amount,
          payment_date: transaction.transaction_date,
          bank_account_id: transaction.bank_account_id,
          bank_transaction_id: transactionId,
          reference: `Bank: ${transaction.description?.substring(0, 50)}`,
          payment_type: "normal",
          created_by: userId,
        });

        // Update invoice
        const newPaid = Number(invoice.amount_paid || 0) + allocation.amount;
        const newRemaining = Number(invoice.total_gross) - newPaid;
        await supabase.from("invoices").update({
          amount_paid: newPaid,
          remaining_balance: newRemaining,
          status: newRemaining <= 0 ? "PAID" : "PART_PAID",
        }).eq("id", allocation.documentId);

        // Post ledger entry
        const debtorsAccountId = await getControlAccount(
          transaction.organization_id,
          entityType as "client" | "company",
          entityId,
          "TRADE_DEBTORS"
        );

        if (debtorsAccountId) {
          const entries: LedgerEntry[] = [
            {
              accountId: transaction.bank_account_id,
              debit: allocation.amount,
              credit: null,
              description: `Payment: Invoice ${invoice.invoice_number || allocation.documentId.substring(0, 8)}`,
            },
            {
              accountId: debtorsAccountId,
              debit: null,
              credit: allocation.amount,
              description: `Payment: Invoice ${invoice.invoice_number || allocation.documentId.substring(0, 8)}`,
            },
          ];

          await postToLedger({
            organizationId: transaction.organization_id,
            entityType: entityType as "client" | "company",
            entityId,
            transactionDate: transaction.transaction_date,
            sourceType: "BANK_TRANSACTION",
            sourceId: transactionId,
            userId,
          }, entries);
        }
      } else if (allocation.documentType === "bill") {
        // Record payment against bill
        const { data: bill } = await supabase
          .from("bills")
          .select("*")
          .eq("id", allocation.documentId)
          .single();

        if (!bill) continue;

        await supabase.from("bill_payments").insert({
          bill_id: allocation.documentId,
          amount: allocation.amount,
          payment_date: transaction.transaction_date,
          bank_account_id: transaction.bank_account_id,
          bank_transaction_id: transactionId,
          reference: `Bank: ${transaction.description?.substring(0, 50)}`,
          payment_type: "normal",
          created_by: userId,
        });

        const newPaid = Number(bill.amount_paid || 0) + allocation.amount;
        const newRemaining = Number(bill.total_gross) - newPaid;
        await supabase.from("bills").update({
          amount_paid: newPaid,
          remaining_balance: newRemaining,
          status: newRemaining <= 0 ? "PAID" : "PART_PAID",
        }).eq("id", allocation.documentId);

        const creditorsAccountId = await getControlAccount(
          transaction.organization_id,
          entityType as "client" | "company",
          entityId,
          "TRADE_CREDITORS"
        );

        if (creditorsAccountId) {
          const entries: LedgerEntry[] = [
            {
              accountId: creditorsAccountId,
              debit: allocation.amount,
              credit: null,
              description: `Payment: Bill ${bill.bill_number || allocation.documentId.substring(0, 8)}`,
            },
            {
              accountId: transaction.bank_account_id,
              debit: null,
              credit: allocation.amount,
              description: `Payment: Bill ${bill.bill_number || allocation.documentId.substring(0, 8)}`,
            },
          ];

          await postToLedger({
            organizationId: transaction.organization_id,
            entityType: entityType as "client" | "company",
            entityId,
            transactionDate: transaction.transaction_date,
            sourceType: "BANK_TRANSACTION",
            sourceId: transactionId,
            userId,
          }, entries);
        }
      }
    }

    // Mark transaction as matched
    await supabase
      .from("bank_transactions")
      .update({ status: "MATCHED" })
      .eq("id", transactionId);

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Auto-match high confidence transactions (100% only)
 */
export async function autoMatchHighConfidence(
  organizationId: string,
  entityType: "client" | "company",
  entityId: string,
  userId: string
): Promise<{ matched: number; skipped: number }> {
  const query = supabase
    .from("bank_transactions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("status", "PENDING");

  if (entityType === "client") {
    query.eq("client_id", entityId);
  } else {
    query.eq("company_id", entityId);
  }

  const { data: transactions } = await query;

  let matched = 0;
  let skipped = 0;

  for (const txn of transactions || []) {
    const { candidates } = await findMatchingCandidates(txn.id);

    // Only auto-match if exactly one 100% confidence match
    const perfectMatches = candidates.filter((c) => c.confidence === 100);

    if (perfectMatches.length === 1) {
      const result = await applyMatch(txn.id, {
        allocations: [{
          documentId: perfectMatches[0].id,
          documentType: perfectMatches[0].type,
          amount: perfectMatches[0].proposedAllocation,
        }],
      }, userId);

      if (result.success) {
        matched++;
      } else {
        skipped++;
      }
    } else {
      skipped++;
    }
  }

  return { matched, skipped };
}

/**
 * Store a matching candidate for later review
 */
export async function storeMatchingCandidate(
  organizationId: string,
  transactionId: string,
  candidate: MatchCandidate
): Promise<void> {
  await supabase.from("matching_candidates").upsert({
    organization_id: organizationId,
    bank_transaction_id: transactionId,
    candidate_type: candidate.type.toUpperCase(),
    candidate_id: candidate.id,
    confidence_score: candidate.confidence,
    match_reasons: { reason: candidate.explanation },
  });
}
