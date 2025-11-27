import { supabase } from "@/integrations/supabase/client";

export interface KPIResult {
  value: number | null;
  label: string;
  isCalculated: boolean;
}

export interface PeriodRange {
  start: Date;
  end: Date;
}

export type PeriodOption = 'current_month' | 'current_quarter' | 'ytd' | 'last_12_months' | 'custom';

export function getPeriodDates(option: PeriodOption, customStart?: Date, customEnd?: Date): PeriodRange {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  
  switch (option) {
    case 'current_month':
      return {
        start: new Date(currentYear, currentMonth, 1),
        end: new Date(currentYear, currentMonth + 1, 0)
      };
    case 'current_quarter': {
      const quarterStart = Math.floor(currentMonth / 3) * 3;
      return {
        start: new Date(currentYear, quarterStart, 1),
        end: new Date(currentYear, quarterStart + 3, 0)
      };
    }
    case 'ytd':
      return {
        start: new Date(currentYear, 0, 1),
        end: now
      };
    case 'last_12_months':
      return {
        start: new Date(currentYear - 1, currentMonth, 1),
        end: now
      };
    case 'custom':
      return {
        start: customStart || new Date(currentYear, 0, 1),
        end: customEnd || now
      };
    default:
      return {
        start: new Date(currentYear, currentMonth, 1),
        end: now
      };
  }
}

export async function calculateRevenue(
  entityType: 'client' | 'company',
  entityId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<number> {
  const { data, error } = await supabase
    .from('ledger_entries')
    .select(`
      debit,
      credit,
      bookkeeping_accounts!inner(account_type, is_revenue_account)
    `)
    .eq(entityType === 'client' ? 'client_id' : 'company_id', entityId)
    .eq('bookkeeping_accounts.account_type', 'INCOME')
    .gte('entry_date', periodStart.toISOString().split('T')[0])
    .lte('entry_date', periodEnd.toISOString().split('T')[0]);

  if (error) {
    console.error('Error calculating revenue:', error);
    return 0;
  }

  // For INCOME accounts, credits increase the balance
  return (data || []).reduce((sum, entry) => {
    return sum + ((entry.credit || 0) - (entry.debit || 0));
  }, 0);
}

export async function calculateNetProfit(
  entityType: 'client' | 'company',
  entityId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<number> {
  const { data, error } = await supabase
    .from('ledger_entries')
    .select(`
      debit,
      credit,
      bookkeeping_accounts!inner(account_type)
    `)
    .eq(entityType === 'client' ? 'client_id' : 'company_id', entityId)
    .in('bookkeeping_accounts.account_type', ['INCOME', 'EXPENSE'])
    .gte('entry_date', periodStart.toISOString().split('T')[0])
    .lte('entry_date', periodEnd.toISOString().split('T')[0]);

  if (error) {
    console.error('Error calculating net profit:', error);
    return 0;
  }

  let income = 0;
  let expenses = 0;

  (data || []).forEach((entry: any) => {
    const accountType = entry.bookkeeping_accounts?.account_type;
    if (accountType === 'INCOME') {
      income += (entry.credit || 0) - (entry.debit || 0);
    } else if (accountType === 'EXPENSE') {
      expenses += (entry.debit || 0) - (entry.credit || 0);
    }
  });

  return income - expenses;
}

export async function calculateCashAtBank(
  entityType: 'client' | 'company',
  entityId: string
): Promise<number> {
  const { data, error } = await supabase
    .from('ledger_entries')
    .select(`
      debit,
      credit,
      bookkeeping_accounts!inner(is_bank_account)
    `)
    .eq(entityType === 'client' ? 'client_id' : 'company_id', entityId)
    .eq('bookkeeping_accounts.is_bank_account', true);

  if (error) {
    console.error('Error calculating cash at bank:', error);
    return 0;
  }

  // For ASSET accounts (bank), debits increase the balance
  return (data || []).reduce((sum, entry) => {
    return sum + ((entry.debit || 0) - (entry.credit || 0));
  }, 0);
}

export async function calculateVATPosition(
  entityType: 'client' | 'company',
  entityId: string
): Promise<{ amount: number; isEstimate: boolean }> {
  // Try to get from latest VAT return
  const { data: vatReturn, error } = await supabase
    .from('vat_returns')
    .select('*')
    .eq(entityType === 'client' ? 'client_id' : 'company_id', entityId)
    .order('period_end', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (vatReturn && !error) {
    const vatDue = vatReturn.box_5_net_vat || 0;
    return { amount: vatDue, isEstimate: vatReturn.status === 'draft' };
  }

  // If no VAT return, return 0 with estimate flag
  return { amount: 0, isEstimate: true };
}

export async function getCTEstimate(
  entityType: 'client' | 'company',
  entityId: string
): Promise<{ amount: number | null; status: 'finalised' | 'not_calculated' }> {
  const { data, error } = await supabase
    .from('workpaper_instances')
    .select('status, computed_data')
    .eq(entityType === 'client' ? 'client_id' : 'company_id', entityId)
    .eq('status', 'finalised')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { amount: null, status: 'not_calculated' };
  }

  const computedData = data.computed_data as any;
  const taxLiability = computedData?.tax_liability || computedData?.ct_liability || null;

  return {
    amount: taxLiability,
    status: 'finalised'
  };
}

export async function getUnreconciledCount(
  entityType: 'client' | 'company',
  entityId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('bank_transactions')
    .select('*', { count: 'exact', head: true })
    .eq(entityType === 'client' ? 'client_id' : 'company_id', entityId)
    .eq('status', 'UNREVIEWED');

  if (error) {
    console.error('Error getting unreconciled count:', error);
    return 0;
  }

  return count || 0;
}

export async function getAgedReceivables(
  entityType: 'client' | 'company',
  entityId: string
): Promise<{ current: number; days30: number; days60: number; days90Plus: number; total: number }> {
  const { data, error } = await supabase
    .from('invoices')
    .select('total_gross, amount_paid, due_date')
    .eq(entityType === 'client' ? 'client_id' : 'company_id', entityId)
    .eq('invoice_type', 'SALES')
    .neq('status', 'PAID')
    .neq('status', 'VOID');

  if (error) {
    console.error('Error getting aged receivables:', error);
    return { current: 0, days30: 0, days60: 0, days90Plus: 0, total: 0 };
  }

  const now = new Date();
  const result = { current: 0, days30: 0, days60: 0, days90Plus: 0, total: 0 };

  (data || []).forEach((invoice) => {
    const outstanding = invoice.total_gross - invoice.amount_paid;
    const dueDate = new Date(invoice.due_date);
    const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    result.total += outstanding;

    if (daysOverdue <= 0) {
      result.current += outstanding;
    } else if (daysOverdue <= 30) {
      result.days30 += outstanding;
    } else if (daysOverdue <= 60) {
      result.days60 += outstanding;
    } else {
      result.days90Plus += outstanding;
    }
  });

  return result;
}

export async function getAgedPayables(
  entityType: 'client' | 'company',
  entityId: string
): Promise<{ current: number; days30: number; days60: number; days90Plus: number; total: number }> {
  const { data, error } = await supabase
    .from('invoices')
    .select('total_gross, amount_paid, due_date')
    .eq(entityType === 'client' ? 'client_id' : 'company_id', entityId)
    .eq('invoice_type', 'PURCHASE')
    .neq('status', 'PAID')
    .neq('status', 'VOID');

  if (error) {
    console.error('Error getting aged payables:', error);
    return { current: 0, days30: 0, days60: 0, days90Plus: 0, total: 0 };
  }

  const now = new Date();
  const result = { current: 0, days30: 0, days60: 0, days90Plus: 0, total: 0 };

  (data || []).forEach((invoice) => {
    const outstanding = invoice.total_gross - invoice.amount_paid;
    const dueDate = new Date(invoice.due_date);
    const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    result.total += outstanding;

    if (daysOverdue <= 0) {
      result.current += outstanding;
    } else if (daysOverdue <= 30) {
      result.days30 += outstanding;
    } else if (daysOverdue <= 60) {
      result.days60 += outstanding;
    } else {
      result.days90Plus += outstanding;
    }
  });

  return result;
}

export async function getRecentBankTransactions(
  entityType: 'client' | 'company',
  entityId: string,
  limit: number = 20
): Promise<Array<{
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
}>> {
  // First get bank account IDs for this entity
  const { data: bankAccounts } = await supabase
    .from('bookkeeping_accounts')
    .select('id')
    .eq(entityType === 'client' ? 'client_id' : 'company_id', entityId)
    .eq('is_bank_account', true);

  if (!bankAccounts || bankAccounts.length === 0) {
    return [];
  }

  const bankAccountIds = bankAccounts.map(a => a.id);

  // Get ledger entries for those bank accounts
  const { data, error } = await supabase
    .from('ledger_entries')
    .select('id, transaction_date, description, debit, credit, source_id, account_id')
    .eq(entityType === 'client' ? 'client_id' : 'company_id', entityId)
    .in('account_id', bankAccountIds)
    .order('transaction_date', { ascending: false })
    .limit(limit);

  if (error || !data) {
    console.error('Error getting recent transactions:', error);
    return [];
  }

  // Build transactions with categories
  const transactions: Array<{
    id: string;
    date: string;
    description: string;
    category: string;
    amount: number;
  }> = [];

  for (const entry of data) {
    let category = 'Uncategorised';
    
    if (entry.source_id) {
      // Find the counterparty account (other entries with same source_id)
      const { data: counterEntries } = await supabase
        .from('ledger_entries')
        .select('account_id')
        .eq('source_id', entry.source_id)
        .neq('id', entry.id)
        .limit(1);
      
      if (counterEntries && counterEntries.length > 0) {
        const { data: acct } = await supabase
          .from('bookkeeping_accounts')
          .select('name')
          .eq('id', counterEntries[0].account_id)
          .maybeSingle();
        category = acct?.name || 'Uncategorised';
      }
    }

    transactions.push({
      id: entry.id,
      date: entry.transaction_date,
      description: entry.description || 'No description',
      category,
      amount: (entry.debit || 0) - (entry.credit || 0)
    });
  }

  return transactions;
}

export async function getEntityDeadlinesAndJobs(
  entityType: 'client' | 'company',
  entityId: string
): Promise<{
  deadlines: Array<{ id: string; name: string; due_date: string; status: string }>;
  jobs: Array<{ id: string; job_name: string; status: string; service_type: string }>;
}> {
  const { data: deadlinesData } = await supabase
    .from('deadlines')
    .select('id, name, due_date, status')
    .eq(entityType === 'client' ? 'client_id' : 'company_id', entityId)
    .in('status', ['pending', 'in_progress'])
    .order('due_date', { ascending: true })
    .limit(5);

  const { data: jobsData } = await supabase
    .from('jobs')
    .select('id, job_name, status, service_type')
    .eq(entityType === 'client' ? 'client_id' : 'company_id', entityId)
    .in('status', ['not_started', 'in_progress', 'review'])
    .order('created_at', { ascending: false })
    .limit(5);

  return {
    deadlines: deadlinesData || [],
    jobs: jobsData || []
  };
}
