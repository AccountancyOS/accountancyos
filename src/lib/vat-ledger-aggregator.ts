// VAT Ledger Aggregator
// Computes VAT boxes from ACTUAL POSTED VAT amounts — never re-derives from net.
// Provides full audit trail from boxes to tax codes to transactions.

import { supabase } from "@/integrations/supabase/client";

export interface VATTransactionLine {
  id: string;
  transaction_date: string;
  description: string;
  account_code: string;
  account_name: string;
  vat_code: string;
  vat_rate: number;
  net_amount: number;
  vat_amount: number;
  gross_amount: number;
  source_type: 'invoice' | 'bill' | 'journal' | 'bank_transaction';
  source_id: string;
}

export interface VATCodeAggregate {
  vat_code: string;
  vat_rate: number;
  vat_type: 'OUTPUT' | 'INPUT' | 'ZERO' | 'EXEMPT';
  transaction_count: number;
  total_net: number;
  total_vat: number;
  transactions: VATTransactionLine[];
}

export interface VATBoxBreakdown {
  box_number: number;
  box_name: string;
  value: number;
  vat_codes: VATCodeAggregate[];
}

export interface VATReportModel {
  vrn: string;
  period_start: string;
  period_end: string;
  period_key: string;
  box1_vat_on_sales: number;
  box2_vat_on_acquisitions: number;
  box3_total_vat_due: number;
  box4_vat_reclaimed: number;
  box5_net_vat_due: number;
  box6_total_sales_ex_vat: number;
  box7_total_purchases_ex_vat: number;
  box8_goods_supplied_ex_vat: number;
  box9_acquisitions_ex_vat: number;
  box_breakdowns: VATBoxBreakdown[];
  source_ledger_version: string;
  generated_at: string;
  generator_version: string;
}

// HMRC-compliant rounding
function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundToWholePounds(value: number): number {
  return Math.round(value);
}

// VAT code to box mapping
const VAT_CODE_BOX_MAPPING: Record<string, { outputBox?: number; inputBox?: number; salesBox: number; purchasesBox: number }> = {
  'S20': { outputBox: 1, salesBox: 6, purchasesBox: 7 },
  'S5': { outputBox: 1, salesBox: 6, purchasesBox: 7 },
  'Z': { salesBox: 6, purchasesBox: 7 },
  'E': { salesBox: 6, purchasesBox: 7 },
  'P20': { inputBox: 4, salesBox: 6, purchasesBox: 7 },
  'P5': { inputBox: 4, salesBox: 6, purchasesBox: 7 },
  'NV': { salesBox: 6, purchasesBox: 7 },
  'RC': { inputBox: 4, outputBox: 1, salesBox: 6, purchasesBox: 7 },
  'EU_GOODS': { outputBox: 2, inputBox: 4, salesBox: 8, purchasesBox: 9 },
};

// ==================== PAGINATION HELPER ====================
const PAGE_SIZE = 1000;

async function fetchAllPaginated<T>(
  buildQuery: (offset: number, limit: number) => any
): Promise<T[]> {
  const results: T[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await buildQuery(offset, PAGE_SIZE);
    if (error) throw new Error(`Paginated fetch failed: ${error.message}`);
    if (!data || data.length === 0) break;
    results.push(...data);
    hasMore = data.length === PAGE_SIZE;
    offset += PAGE_SIZE;
  }

  return results;
}

/**
 * Aggregate VAT from source documents (invoices + bills) for a given period.
 * Uses ACTUAL VAT amounts from invoice_lines and bill_lines — never re-derives from net × rate.
 */
export async function aggregateVATFromLedger(
  organizationId: string,
  entityId: string,
  entityType: 'company' | 'client',
  periodStart: string,
  periodEnd: string,
  vrn: string,
  periodKey: string
): Promise<VATReportModel> {
  const entityFilter = entityType === 'company'
    ? { company_id: entityId }
    : { client_id: entityId };

  // 1. Fetch OUTPUT VAT from invoice lines (sales)
  const invoiceLines = await fetchAllPaginated<any>((offset, limit) =>
    supabase
      .from('invoice_lines')
      .select(`
        id,
        net_amount,
        vat_amount,
        gross_amount,
        vat_rate,
        vat_code_id,
        invoice_id,
        description,
        invoices!inner(id, issue_date, invoice_number, organization_id, client_id, company_id, is_posted),
        vat_codes(code, rate, vat_type)
      `)
      .eq('invoices.organization_id', organizationId)
      .eq('invoices.is_posted', true)
      .gte('invoices.issue_date', periodStart)
      .lte('invoices.issue_date', periodEnd)
      .match(Object.fromEntries(Object.entries(entityFilter).map(([k, v]) => [`invoices.${k}`, v])))
      .range(offset, offset + limit - 1)
  );

  // 2. Fetch INPUT VAT from bill lines (purchases)
  const billLines = await fetchAllPaginated<any>((offset, limit) =>
    supabase
      .from('bill_lines')
      .select(`
        id,
        net_amount,
        vat_amount,
        gross_amount,
        vat_rate,
        vat_code_id,
        bill_id,
        description,
        bills!inner(id, issue_date, bill_number, organization_id, client_id, company_id, is_posted),
        vat_codes(code, rate, vat_type)
      `)
      .eq('bills.organization_id', organizationId)
      .eq('bills.is_posted', true)
      .gte('bills.issue_date', periodStart)
      .lte('bills.issue_date', periodEnd)
      .match(Object.fromEntries(Object.entries(entityFilter).map(([k, v]) => [`bills.${k}`, v])))
      .range(offset, offset + limit - 1)
  );

  // Initialize boxes
  const boxes = {
    box1: 0,
    box2: 0,
    box4: 0,
    box6: 0,
    box7: 0,
    box8: 0,
    box9: 0,
  };

  const vatCodeAggregates: Record<string, VATCodeAggregate> = {};

  // Process invoice lines (OUTPUT / sales)
  for (const line of invoiceLines) {
    const vatCode = line.vat_codes?.code || 'UNKNOWN';
    const vatRate = line.vat_codes?.rate || line.vat_rate || 0;
    const vatType = (line.vat_codes?.vat_type || 'OUTPUT') as 'OUTPUT' | 'INPUT' | 'ZERO' | 'EXEMPT';
    const invoice = line.invoices;

    // Use ACTUAL posted VAT amount — never re-derive
    const netAmount = Math.abs(line.net_amount || 0);
    const vatAmount = Math.abs(line.vat_amount || 0);

    const txLine: VATTransactionLine = {
      id: line.id,
      transaction_date: invoice?.issue_date || '',
      description: line.description || `Invoice ${invoice?.invoice_number || ''}`,
      account_code: '',
      account_name: '',
      vat_code: vatCode,
      vat_rate: vatRate,
      net_amount: netAmount,
      vat_amount: vatAmount,
      gross_amount: Math.abs(line.gross_amount || netAmount + vatAmount),
      source_type: 'invoice',
      source_id: line.invoice_id || '',
    };

    if (!vatCodeAggregates[vatCode]) {
      vatCodeAggregates[vatCode] = {
        vat_code: vatCode,
        vat_rate: vatRate,
        vat_type: vatType,
        transaction_count: 0,
        total_net: 0,
        total_vat: 0,
        transactions: [],
      };
    }

    vatCodeAggregates[vatCode].transaction_count++;
    vatCodeAggregates[vatCode].total_net += netAmount;
    vatCodeAggregates[vatCode].total_vat += vatAmount;
    vatCodeAggregates[vatCode].transactions.push(txLine);

    const mapping = VAT_CODE_BOX_MAPPING[vatCode];
    if (mapping) {
      if (mapping.outputBox === 1) boxes.box1 += vatAmount;
      if (mapping.outputBox === 2) boxes.box2 += vatAmount;
      boxes.box6 += netAmount;
      if (mapping.salesBox === 8) boxes.box8 += netAmount;
    }
  }

  // Process bill lines (INPUT / purchases)
  for (const line of billLines) {
    const vatCode = line.vat_codes?.code || 'UNKNOWN';
    const vatRate = line.vat_codes?.rate || line.vat_rate || 0;
    const vatType = (line.vat_codes?.vat_type || 'INPUT') as 'OUTPUT' | 'INPUT' | 'ZERO' | 'EXEMPT';
    const bill = line.bills;

    // Use ACTUAL posted VAT amount — never re-derive
    const netAmount = Math.abs(line.net_amount || 0);
    const vatAmount = Math.abs(line.vat_amount || 0);

    const txLine: VATTransactionLine = {
      id: line.id,
      transaction_date: bill?.issue_date || '',
      description: line.description || `Bill ${bill?.bill_number || ''}`,
      account_code: '',
      account_name: '',
      vat_code: vatCode,
      vat_rate: vatRate,
      net_amount: netAmount,
      vat_amount: vatAmount,
      gross_amount: Math.abs(line.gross_amount || netAmount + vatAmount),
      source_type: 'bill',
      source_id: line.bill_id || '',
    };

    const inputVatCode = vatCode.startsWith('P') ? vatCode : `P_${vatCode}`;
    const aggKey = vatType === 'INPUT' ? inputVatCode : vatCode;

    if (!vatCodeAggregates[aggKey]) {
      vatCodeAggregates[aggKey] = {
        vat_code: aggKey,
        vat_rate: vatRate,
        vat_type: vatType,
        transaction_count: 0,
        total_net: 0,
        total_vat: 0,
        transactions: [],
      };
    }

    vatCodeAggregates[aggKey].transaction_count++;
    vatCodeAggregates[aggKey].total_net += netAmount;
    vatCodeAggregates[aggKey].total_vat += vatAmount;
    vatCodeAggregates[aggKey].transactions.push(txLine);

    const mapping = VAT_CODE_BOX_MAPPING[vatCode] || VAT_CODE_BOX_MAPPING[inputVatCode];
    if (mapping) {
      if (mapping.inputBox === 4) boxes.box4 += vatAmount;
      boxes.box7 += netAmount;
      if (mapping.purchasesBox === 9) boxes.box9 += netAmount;
    }
  }

  // Calculate derived boxes
  const box3 = roundToTwoDecimals(boxes.box1 + boxes.box2);
  const box5 = roundToTwoDecimals(Math.abs(box3 - boxes.box4));

  // Build box breakdowns for audit trail
  const boxBreakdowns: VATBoxBreakdown[] = [
    { box_number: 1, box_name: 'VAT due on sales', value: roundToTwoDecimals(boxes.box1), vat_codes: [] },
    { box_number: 2, box_name: 'VAT due on EU acquisitions', value: roundToTwoDecimals(boxes.box2), vat_codes: [] },
    { box_number: 3, box_name: 'Total VAT due (Box 1 + Box 2)', value: box3, vat_codes: [] },
    { box_number: 4, box_name: 'VAT reclaimed on purchases', value: roundToTwoDecimals(boxes.box4), vat_codes: [] },
    { box_number: 5, box_name: 'Net VAT due/payable', value: box5, vat_codes: [] },
    { box_number: 6, box_name: 'Total sales ex VAT', value: roundToWholePounds(boxes.box6), vat_codes: [] },
    { box_number: 7, box_name: 'Total purchases ex VAT', value: roundToWholePounds(boxes.box7), vat_codes: [] },
    { box_number: 8, box_name: 'Total EU goods supplied ex VAT', value: roundToWholePounds(boxes.box8), vat_codes: [] },
    { box_number: 9, box_name: 'Total EU acquisitions ex VAT', value: roundToWholePounds(boxes.box9), vat_codes: [] },
  ];

  // Attach VAT code aggregates to relevant boxes
  for (const code in vatCodeAggregates) {
    const agg = vatCodeAggregates[code];
    const mapping = VAT_CODE_BOX_MAPPING[code];

    if (mapping?.outputBox === 1) boxBreakdowns[0].vat_codes.push(agg);
    if (mapping?.outputBox === 2) boxBreakdowns[1].vat_codes.push(agg);
    if (mapping?.inputBox === 4) boxBreakdowns[3].vat_codes.push(agg);
    if (mapping?.salesBox === 6) boxBreakdowns[5].vat_codes.push(agg);
    if (mapping?.purchasesBox === 7) boxBreakdowns[6].vat_codes.push(agg);
    if (mapping?.salesBox === 8) boxBreakdowns[7].vat_codes.push(agg);
    if (mapping?.purchasesBox === 9) boxBreakdowns[8].vat_codes.push(agg);
  }

  return {
    vrn,
    period_start: periodStart,
    period_end: periodEnd,
    period_key: periodKey,
    box1_vat_on_sales: roundToTwoDecimals(boxes.box1),
    box2_vat_on_acquisitions: roundToTwoDecimals(boxes.box2),
    box3_total_vat_due: box3,
    box4_vat_reclaimed: roundToTwoDecimals(boxes.box4),
    box5_net_vat_due: box5,
    box6_total_sales_ex_vat: roundToWholePounds(boxes.box6),
    box7_total_purchases_ex_vat: roundToWholePounds(boxes.box7),
    box8_goods_supplied_ex_vat: roundToWholePounds(boxes.box8),
    box9_acquisitions_ex_vat: roundToWholePounds(boxes.box9),
    box_breakdowns: boxBreakdowns,
    source_ledger_version: new Date().toISOString(),
    generated_at: new Date().toISOString(),
    generator_version: '2.0.0',
  };
}

/**
 * Create a VAT snapshot from the report model
 */
export function createVATSnapshot(model: VATReportModel): {
  snapshot_type: string;
  period_start: string;
  period_end: string;
  snapshot_data: object;
  source_ledger_version: string;
  generator_version: string;
} {
  return {
    snapshot_type: 'VAT_RETURN',
    period_start: model.period_start,
    period_end: model.period_end,
    snapshot_data: {
      vrn: model.vrn,
      period_key: model.period_key,
      box1_vat_on_sales: model.box1_vat_on_sales,
      box2_vat_on_acquisitions: model.box2_vat_on_acquisitions,
      box3_total_vat_due: model.box3_total_vat_due,
      box4_vat_reclaimed: model.box4_vat_reclaimed,
      box5_net_vat_due: model.box5_net_vat_due,
      box6_total_sales_ex_vat: model.box6_total_sales_ex_vat,
      box7_total_purchases_ex_vat: model.box7_total_purchases_ex_vat,
      box8_goods_supplied_ex_vat: model.box8_goods_supplied_ex_vat,
      box9_acquisitions_ex_vat: model.box9_acquisitions_ex_vat,
      box_breakdowns: model.box_breakdowns,
      generated_at: model.generated_at,
    },
    source_ledger_version: model.source_ledger_version,
    generator_version: model.generator_version,
  };
}
