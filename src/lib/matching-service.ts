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
  // All matching now routes through the hardened apply_bank_match RPC,
  // which posts the journal via post_to_ledger and updates the documents
  // atomically server-side.
  try {
    const allocations = matchPlan.allocations
      .filter((a) => a.documentType === "invoice" || a.documentType === "bill")
      .map((a) => ({
        document_id: a.documentId,
        document_type: a.documentType,
        amount: a.amount,
      }));

    if (allocations.length === 0) {
      return { success: false, error: "No supported allocations in match plan" };
    }

    const { data, error } = await supabase.rpc("apply_bank_match", {
      p_bank_transaction_id: transactionId,
      p_allocations: allocations as any,
    });

    if (error) return { success: false, error: error.message };
    if (data && typeof data === "object" && (data as any).success === false) {
      return { success: false, error: (data as any).error || "Match failed" };
    }
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
