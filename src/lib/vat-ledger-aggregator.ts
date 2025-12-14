// VAT Ledger Aggregator
// Computes VAT boxes from ledger transactions with tax codes
// Provides full audit trail from boxes to tax codes to transactions

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
  
  // The 9 VAT boxes
  box1_vat_on_sales: number; // VAT due on sales
  box2_vat_on_acquisitions: number; // VAT due on acquisitions from EU
  box3_total_vat_due: number; // Total VAT due (box1 + box2)
  box4_vat_reclaimed: number; // VAT reclaimed on purchases
  box5_net_vat_due: number; // Net VAT due/refund |box3 - box4|
  box6_total_sales_ex_vat: number; // Total value of sales ex VAT (whole pounds)
  box7_total_purchases_ex_vat: number; // Total value of purchases ex VAT (whole pounds)
  box8_goods_supplied_ex_vat: number; // Total value of goods supplied to EU ex VAT
  box9_acquisitions_ex_vat: number; // Total value of acquisitions from EU ex VAT
  
  // Full audit trail
  box_breakdowns: VATBoxBreakdown[];
  
  // Metadata
  source_ledger_version: string;
  generated_at: string;
  generator_version: string;
}

// HMRC-compliant rounding rules
// Boxes 1-5: 2 decimal places (pence)
// Boxes 6-9: whole pounds (rounded)
function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundToWholePounds(value: number): number {
  return Math.round(value);
}

// VAT code to box mapping based on UK VAT return structure
const VAT_CODE_BOX_MAPPING: Record<string, { outputBox?: number; inputBox?: number; salesBox: number; purchasesBox: number }> = {
  'S20': { outputBox: 1, salesBox: 6, purchasesBox: 7 }, // Standard rate 20% - output
  'S5': { outputBox: 1, salesBox: 6, purchasesBox: 7 },  // Reduced rate 5% - output
  'Z': { salesBox: 6, purchasesBox: 7 },                  // Zero rated - no VAT but counts in totals
  'E': { salesBox: 6, purchasesBox: 7 },                  // Exempt - counts in totals
  'P20': { inputBox: 4, salesBox: 6, purchasesBox: 7 },  // Standard rate 20% - input
  'P5': { inputBox: 4, salesBox: 6, purchasesBox: 7 },   // Reduced rate 5% - input
  'NV': { salesBox: 6, purchasesBox: 7 },                  // No VAT - outside scope
  'RC': { inputBox: 4, outputBox: 1, salesBox: 6, purchasesBox: 7 }, // Reverse charge
  'EU_GOODS': { outputBox: 2, inputBox: 4, salesBox: 8, purchasesBox: 9 }, // EU goods (acquisition)
};

/**
 * Aggregate VAT from ledger for a given period
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
  // Fetch all VAT-coded transactions for the period
  const entityFilter = entityType === 'company' 
    ? { company_id: entityId }
    : { client_id: entityId };

  // Get ledger entries with VAT information
  const { data: entries, error } = await supabase
    .from('ledger_entries')
    .select(`
      id,
      transaction_date,
      description,
      debit,
      credit,
      vat_code_id,
      account_id,
      source_type,
      source_id,
      bookkeeping_accounts!inner(id, code, name),
      vat_codes(code, rate, vat_type)
    `)
    .eq('organization_id', organizationId)
    .gte('transaction_date', periodStart)
    .lte('transaction_date', periodEnd)
    .match(entityFilter)
    .not('vat_code_id', 'is', null);

  if (error) {
    console.error('Error fetching ledger entries:', error);
    throw new Error(`Failed to fetch ledger entries: ${error.message}`);
  }

  // Initialize boxes
  const boxes = {
    box1: 0, // VAT on sales
    box2: 0, // VAT on EU acquisitions
    box4: 0, // VAT reclaimed
    box6: 0, // Total sales ex VAT
    box7: 0, // Total purchases ex VAT
    box8: 0, // EU goods supplied ex VAT
    box9: 0, // EU acquisitions ex VAT
  };

  // Group by VAT code for audit trail
  const vatCodeAggregates: Record<string, VATCodeAggregate> = {};

  for (const entry of (entries || []) as any[]) {
    const vatCode = entry.vat_codes?.code || 'UNKNOWN';
    const vatRate = entry.vat_codes?.rate || 0;
    const vatType = entry.vat_codes?.vat_type || 'OUTPUT';
    const account = entry.bookkeeping_accounts;
    
    // Calculate net amount and derive VAT from rate
    const netAmount = entry.credit - entry.debit;
    const vatAmount = Math.abs(netAmount) * (vatRate / 100);
    
    // Build transaction line
    const txLine: VATTransactionLine = {
      id: entry.id,
      transaction_date: entry.transaction_date,
      description: entry.description || '',
      account_code: account?.code || '',
      account_name: account?.name || '',
      vat_code: vatCode,
      vat_rate: vatRate,
      net_amount: Math.abs(netAmount),
      vat_amount: vatAmount,
      gross_amount: Math.abs(netAmount) + vatAmount,
      source_type: entry.source_type || 'journal',
      source_id: entry.source_id || '',
    };

    // Initialize aggregate if needed
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
    vatCodeAggregates[vatCode].total_net += txLine.net_amount;
    vatCodeAggregates[vatCode].total_vat += txLine.vat_amount;
    vatCodeAggregates[vatCode].transactions.push(txLine);

    // Map to boxes based on VAT code and type
    const mapping = VAT_CODE_BOX_MAPPING[vatCode];
    if (mapping) {
      if (vatType === 'OUTPUT' || vatType === 'ZERO') {
        // Sales VAT
        if (mapping.outputBox === 1) boxes.box1 += Math.abs(vatAmount);
        if (mapping.outputBox === 2) boxes.box2 += Math.abs(vatAmount);
        boxes.box6 += Math.abs(netAmount);
        if (mapping.salesBox === 8) boxes.box8 += Math.abs(netAmount);
      } else if (vatType === 'INPUT') {
        // Purchase VAT
        if (mapping.inputBox === 4) boxes.box4 += Math.abs(vatAmount);
        boxes.box7 += Math.abs(netAmount);
        if (mapping.purchasesBox === 9) boxes.box9 += Math.abs(netAmount);
      }
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
    generator_version: '1.0.0',
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
