/**
 * Bank Rules Service
 * Handles rule CRUD, evaluation, and application for bank transaction automation
 */

import { supabase } from "@/integrations/supabase/client";
import { postToLedger, PostingContext } from "./posting-service";

export interface RuleCondition {
  field: "description" | "amount" | "direction" | "bank_account";
  operator: "contains" | "starts_with" | "ends_with" | "equals" | "greater_than" | "less_than" | "between";
  value: string | number;
  value2?: number; // For "between" operator
}

export interface RuleAction {
  type: "set_account" | "set_vat_code" | "set_category";
  value: string;
}

export interface BankRuleInput {
  ruleName: string;
  description?: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
  priority?: number;
  isActive?: boolean;
}

export interface BankRule {
  id: string;
  organizationId: string;
  clientId?: string;
  companyId?: string;
  ruleName: string;
  description?: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
  priority: number;
  isActive: boolean;
  timesApplied: number;
  lastAppliedAt?: string;
  createdAt: string;
}

/**
 * Create a new bank rule
 */
export async function createBankRule(
  organizationId: string,
  entityType: "client" | "company",
  entityId: string,
  input: BankRuleInput,
  userId?: string
): Promise<{ success: boolean; ruleId?: string; error?: string }> {
  try {
    // Get max priority for ordering
    const { data: existingRules } = await supabase
      .from("bank_rules")
      .select("priority")
      .eq("organization_id", organizationId)
      .eq(entityType === "company" ? "company_id" : "client_id", entityId)
      .order("priority", { ascending: false })
      .limit(1);

    const nextPriority = input.priority ?? ((existingRules?.[0]?.priority ?? 0) + 1);

    const { data, error } = await supabase
      .from("bank_rules")
      .insert({
        organization_id: organizationId,
        client_id: entityType === "client" ? entityId : null,
        company_id: entityType === "company" ? entityId : null,
        rule_name: input.ruleName,
        description: input.description,
        conditions: input.conditions as any,
        actions: input.actions as any,
        priority: nextPriority,
        is_active: input.isActive ?? true,
        created_by: userId,
      })
      .select("id")
      .single();

    if (error) throw error;

    return { success: true, ruleId: data.id };
  } catch (error: any) {
    console.error("Failed to create bank rule:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Update an existing bank rule
 */
export async function updateBankRule(
  ruleId: string,
  input: Partial<BankRuleInput>
): Promise<{ success: boolean; error?: string }> {
  try {
    const updateData: any = {};
    if (input.ruleName !== undefined) updateData.rule_name = input.ruleName;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.conditions !== undefined) updateData.conditions = input.conditions;
    if (input.actions !== undefined) updateData.actions = input.actions;
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.isActive !== undefined) updateData.is_active = input.isActive;

    const { error } = await supabase
      .from("bank_rules")
      .update(updateData)
      .eq("id", ruleId);

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error("Failed to update bank rule:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a bank rule
 */
export async function deleteBankRule(
  ruleId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("bank_rules")
      .delete()
      .eq("id", ruleId);

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error("Failed to delete bank rule:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all bank rules for an entity
 */
export async function getBankRules(
  organizationId: string,
  entityType: "client" | "company",
  entityId: string
): Promise<BankRule[]> {
  const { data, error } = await supabase
    .from("bank_rules")
    .select("*")
    .eq("organization_id", organizationId)
    .eq(entityType === "company" ? "company_id" : "client_id", entityId)
    .order("priority", { ascending: true });

  if (error) {
    console.error("Failed to fetch bank rules:", error);
    return [];
  }

  return (data || []).map((rule) => ({
    id: rule.id,
    organizationId: rule.organization_id,
    clientId: rule.client_id ?? undefined,
    companyId: rule.company_id ?? undefined,
    ruleName: rule.rule_name,
    description: rule.description ?? undefined,
    conditions: (rule.conditions as any) || [],
    actions: (rule.actions as any) || [],
    priority: rule.priority ?? 0,
    isActive: rule.is_active ?? true,
    timesApplied: rule.times_applied ?? 0,
    lastAppliedAt: rule.last_applied_at ?? undefined,
    createdAt: rule.created_at ?? "",
  }));
}

/**
 * Evaluate if a transaction matches a rule's conditions
 */
function evaluateConditions(
  transaction: { description: string; amount: number; bank_account_id: string },
  conditions: RuleCondition[]
): boolean {
  for (const condition of conditions) {
    let matches = false;

    switch (condition.field) {
      case "description":
        const desc = transaction.description.toLowerCase();
        const val = String(condition.value).toLowerCase();
        switch (condition.operator) {
          case "contains":
            matches = desc.includes(val);
            break;
          case "starts_with":
            matches = desc.startsWith(val);
            break;
          case "ends_with":
            matches = desc.endsWith(val);
            break;
          case "equals":
            matches = desc === val;
            break;
        }
        break;

      case "amount":
        const amt = Math.abs(transaction.amount);
        const target = Number(condition.value);
        switch (condition.operator) {
          case "equals":
            matches = Math.abs(amt - target) < 0.01;
            break;
          case "greater_than":
            matches = amt > target;
            break;
          case "less_than":
            matches = amt < target;
            break;
          case "between":
            matches = amt >= target && amt <= (condition.value2 ?? target);
            break;
        }
        break;

      case "direction":
        if (condition.value === "in") {
          matches = transaction.amount > 0;
        } else if (condition.value === "out") {
          matches = transaction.amount < 0;
        }
        break;

      case "bank_account":
        matches = transaction.bank_account_id === condition.value;
        break;
    }

    if (!matches) return false;
  }

  return true;
}

/**
 * Find matching rules for a transaction
 */
export async function evaluateRulesForTransaction(
  organizationId: string,
  entityType: "client" | "company",
  entityId: string,
  transaction: { id: string; description: string; amount: number; bank_account_id: string }
): Promise<{ rule: BankRule; matchedConditions: RuleCondition[] }[]> {
  const rules = await getBankRules(organizationId, entityType, entityId);
  const matches: { rule: BankRule; matchedConditions: RuleCondition[] }[] = [];

  for (const rule of rules) {
    if (!rule.isActive) continue;

    if (evaluateConditions(transaction, rule.conditions)) {
      matches.push({ rule, matchedConditions: rule.conditions });
    }
  }

  return matches;
}

/**
 * Apply a rule to a transaction
 */
export async function applyRuleToTransaction(
  ruleId: string,
  transactionId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Fetch rule
    const { data: rule, error: ruleError } = await supabase
      .from("bank_rules")
      .select("*")
      .eq("id", ruleId)
      .single();

    if (ruleError || !rule) {
      return { success: false, error: "Rule not found" };
    }

    // Fetch transaction
    const { data: transaction, error: txError } = await supabase
      .from("bank_transactions")
      .select("*, bank_accounts!inner(account_id)")
      .eq("id", transactionId)
      .single();

    if (txError || !transaction) {
      return { success: false, error: "Transaction not found" };
    }

    // Already categorized?
    if (transaction.status !== "UNREVIEWED") {
      return { success: false, error: "Transaction already categorized" };
    }

    const actions = rule.actions as unknown as RuleAction[];
    let accountId: string | null = null;
    let vatCodeId: string | null = null;
    let category: string | null = null;

    for (const action of actions) {
      switch (action.type) {
        case "set_account":
          accountId = action.value;
          break;
        case "set_vat_code":
          vatCodeId = action.value;
          break;
        case "set_category":
          category = action.value;
          break;
      }
    }

    if (!accountId) {
      return { success: false, error: "Rule must have a set_account action" };
    }

    // Get bank account's GL account
    const bankGLAccountId = (transaction.bank_accounts as any)?.account_id;
    if (!bankGLAccountId) {
      return { success: false, error: "Bank account not linked to GL account" };
    }

    // Create posting context
    const context: PostingContext = {
      organizationId: transaction.organization_id,
      entityType: transaction.company_id ? "company" : "client",
      entityId: transaction.company_id || transaction.client_id,
      transactionDate: transaction.transaction_date,
      sourceType: "BANK_TRANSACTION",
      sourceId: transactionId,
      userId,
    };

    // Determine debit/credit based on amount
    const isMoneyIn = transaction.amount > 0;
    const absAmount = Math.abs(transaction.amount);

    const ledgerEntries = isMoneyIn
      ? [
          { accountId: bankGLAccountId, debit: absAmount, credit: null, description: transaction.description, vatCodeId },
          { accountId, debit: null, credit: absAmount, description: transaction.description, vatCodeId },
        ]
      : [
          { accountId, debit: absAmount, credit: null, description: transaction.description, vatCodeId },
          { accountId: bankGLAccountId, debit: null, credit: absAmount, description: transaction.description, vatCodeId },
        ];

    // Post to ledger
    const postResult = await postToLedger(context, ledgerEntries);
    if (!postResult.success) {
      return { success: false, error: postResult.error };
    }

    // Update transaction status
    await supabase
      .from("bank_transactions")
      .update({
        status: "CATEGORIZED",
        category: category || null,
        rule_id: ruleId,
        matched_ledger_entry_id: postResult.journalId,
      })
      .eq("id", transactionId);

    // Record rule execution
    await supabase.from("bank_rule_executions").insert([{
      organization_id: transaction.organization_id,
      bank_rule_id: ruleId,
      bank_transaction_id: transactionId,
      executed_by: userId,
      matched_conditions: rule.conditions as any,
      applied_actions: actions as any,
      result: "success",
    }]);

    // Update rule stats
    await supabase
      .from("bank_rules")
      .update({
        times_applied: (rule.times_applied ?? 0) + 1,
        last_applied_at: new Date().toISOString(),
      })
      .eq("id", ruleId);

    return { success: true };
  } catch (error: any) {
    console.error("Failed to apply rule:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Test run a rule - show which transactions would match (dry run)
 */
export async function testRunRule(
  ruleId: string,
  organizationId: string,
  entityType: "client" | "company",
  entityId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<{ transactions: any[]; error?: string }> {
  try {
    // Fetch rule
    const { data: rule, error: ruleError } = await supabase
      .from("bank_rules")
      .select("*")
      .eq("id", ruleId)
      .single();

    if (ruleError || !rule) {
      return { transactions: [], error: "Rule not found" };
    }

    // Fetch unreviewed transactions
    let query = supabase
      .from("bank_transactions")
      .select("*")
      .eq("organization_id", organizationId)
      .eq(entityType === "company" ? "company_id" : "client_id", entityId)
      .eq("status", "UNREVIEWED");

    if (dateFrom) {
      query = query.gte("transaction_date", dateFrom);
    }
    if (dateTo) {
      query = query.lte("transaction_date", dateTo);
    }

    const { data: transactions, error: txError } = await query.order("transaction_date", { ascending: false });

    if (txError) {
      return { transactions: [], error: txError.message };
    }

    const conditions = (rule.conditions as unknown) as RuleCondition[];
    const matchingTransactions = (transactions || []).filter((tx) =>
      evaluateConditions(
        { description: tx.description, amount: tx.amount, bank_account_id: tx.bank_account_id },
        conditions
      )
    );

    return { transactions: matchingTransactions };
  } catch (error: any) {
    console.error("Failed to test run rule:", error);
    return { transactions: [], error: error.message };
  }
}

/**
 * Auto-apply all matching rules to unreviewed transactions
 */
export async function autoApplyRules(
  organizationId: string,
  entityType: "client" | "company",
  entityId: string,
  userId: string
): Promise<{ applied: number; errors: number }> {
  let applied = 0;
  let errors = 0;

  // Get unreviewed transactions
  const { data: transactions } = await supabase
    .from("bank_transactions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq(entityType === "company" ? "company_id" : "client_id", entityId)
    .eq("status", "UNREVIEWED");

  if (!transactions?.length) {
    return { applied: 0, errors: 0 };
  }

  // Get active rules ordered by priority
  const rules = await getBankRules(organizationId, entityType, entityId);
  const activeRules = rules.filter((r) => r.isActive);

  for (const tx of transactions) {
    // Find first matching rule (priority order)
    for (const rule of activeRules) {
      if (
        evaluateConditions(
          { description: tx.description, amount: tx.amount, bank_account_id: tx.bank_account_id },
          rule.conditions
        )
      ) {
        const result = await applyRuleToTransaction(rule.id, tx.id, userId);
        if (result.success) {
          applied++;
        } else {
          errors++;
        }
        break; // Only apply first matching rule
      }
    }
  }

  return { applied, errors };
}
