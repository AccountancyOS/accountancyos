import { FRS105AccountsModel, FRS105BalanceSheet } from "./frs105-accounts-model";
import { CTComputationResult } from "./ct-computation-engine";

// FRS 105 iXBRL Taxonomy namespaces
const NAMESPACES = {
  xbrli: 'http://www.xbrl.org/2003/instance',
  link: 'http://www.xbrl.org/2003/linkbase',
  xlink: 'http://www.w3.org/1999/xlink',
  iso4217: 'http://www.xbrl.org/2003/iso4217',
  'uk-bus': 'http://xbrl.frc.org.uk/reports/2022-01-01/uk-bus',
  'uk-core': 'http://xbrl.frc.org.uk/reports/2022-01-01/uk-core',
  'uk-direp': 'http://xbrl.frc.org.uk/reports/2022-01-01/uk-direp',
  'uk-gaap': 'http://xbrl.frc.org.uk/reports/2022-01-01/uk-gaap',
  'uk-aurep': 'http://xbrl.frc.org.uk/reports/2022-01-01/uk-aurep',
} as const;

// Context IDs
function generateContextId(periodType: 'instant' | 'duration', date: string, endDate?: string): string {
  if (periodType === 'instant') {
    return `AsOf${date.replace(/-/g, '')}`;
  }
  return `From${date.replace(/-/g, '')}To${endDate!.replace(/-/g, '')}`;
}

// Generate iXBRL for FRS 105 Accounts
export function generateFRS105iXBRL(model: FRS105AccountsModel): string {
  const currentPeriodContextId = generateContextId('instant', model.period_end);
  const durationContextId = generateContextId('duration', model.period_start, model.period_end);
  
  const escapeXml = (text: string): string => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const formatNumber = (num: number): string => {
    return num.toFixed(0);
  };

  const ixbrl = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"
      xmlns:ixt="http://www.xbrl.org/inlineXBRL/transformation/2020-02-12"
      xmlns:xbrli="${NAMESPACES.xbrli}"
      xmlns:link="${NAMESPACES.link}"
      xmlns:xlink="${NAMESPACES.xlink}"
      xmlns:iso4217="${NAMESPACES.iso4217}"
      xmlns:uk-bus="${NAMESPACES['uk-bus']}"
      xmlns:uk-core="${NAMESPACES['uk-core']}"
      xmlns:uk-direp="${NAMESPACES['uk-direp']}"
      xmlns:uk-gaap="${NAMESPACES['uk-gaap']}"
      xml:lang="en">
<head>
  <title>${escapeXml(model.company_name)} - Annual Accounts</title>
  <meta charset="UTF-8"/>
  <style type="text/css">
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { font-size: 18pt; }
    h2 { font-size: 14pt; margin-top: 20px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
    td.amount { text-align: right; }
    .total { font-weight: bold; border-top: 2px solid #000; }
    .notes { margin-top: 30px; font-size: 10pt; }
    .signature { margin-top: 40px; }
  </style>
</head>
<body>
<ix:header>
  <ix:hidden>
    <ix:nonNumeric contextRef="${durationContextId}" name="uk-bus:EntityCurrentLegalOrRegisteredName">${escapeXml(model.company_name)}</ix:nonNumeric>
    <ix:nonNumeric contextRef="${durationContextId}" name="uk-bus:UKCompaniesHouseRegisteredNumber">${escapeXml(model.company_number)}</ix:nonNumeric>
    <ix:nonNumeric contextRef="${durationContextId}" name="uk-bus:StartDateForPeriodCoveredByReport" format="ixt:datedaymonthyearfull">${model.period_start}</ix:nonNumeric>
    <ix:nonNumeric contextRef="${durationContextId}" name="uk-bus:EndDateForPeriodCoveredByReport" format="ixt:datedaymonthyearfull">${model.period_end}</ix:nonNumeric>
    <ix:nonNumeric contextRef="${durationContextId}" name="uk-bus:AccountsTypeFullOrAbbreviated">Micro-entity</ix:nonNumeric>
    <ix:nonNumeric contextRef="${durationContextId}" name="uk-bus:AccountingStandardsApplied">FRS 105</ix:nonNumeric>
    <ix:nonNumeric contextRef="${durationContextId}" name="uk-bus:AccountsStatusAuditedOrUnaudited">Unaudited</ix:nonNumeric>
  </ix:hidden>
  <ix:references>
    <link:schemaRef xlink:href="https://xbrl.frc.org.uk/FRS-105/2022-01-01/FRS-105-2022-01-01.xsd" xlink:type="simple"/>
  </ix:references>
  <ix:resources>
    <xbrli:context id="${currentPeriodContextId}">
      <xbrli:entity>
        <xbrli:identifier scheme="http://www.companieshouse.gov.uk/">${model.company_number}</xbrli:identifier>
      </xbrli:entity>
      <xbrli:period>
        <xbrli:instant>${model.period_end}</xbrli:instant>
      </xbrli:period>
    </xbrli:context>
    <xbrli:context id="${durationContextId}">
      <xbrli:entity>
        <xbrli:identifier scheme="http://www.companieshouse.gov.uk/">${model.company_number}</xbrli:identifier>
      </xbrli:entity>
      <xbrli:period>
        <xbrli:startDate>${model.period_start}</xbrli:startDate>
        <xbrli:endDate>${model.period_end}</xbrli:endDate>
      </xbrli:period>
    </xbrli:context>
    <xbrli:unit id="GBP">
      <xbrli:measure>iso4217:GBP</xbrli:measure>
    </xbrli:unit>
  </ix:resources>
</ix:header>

<h1>${escapeXml(model.company_name)}</h1>
<p>Company Registration Number: ${escapeXml(model.company_number)}</p>
<p>Micro-entity Accounts for the period from ${model.period_start} to ${model.period_end}</p>

<h2>Statement of Financial Position as at ${model.period_end}</h2>

<table>
  <tr>
    <th></th>
    <th class="amount">£</th>
    <th class="amount">£</th>
  </tr>
  
  <tr>
    <td colspan="3"><strong>Fixed Assets</strong></td>
  </tr>
  <tr>
    <td>Tangible assets</td>
    <td class="amount"><ix:nonFraction contextRef="${currentPeriodContextId}" name="uk-gaap:TangibleFixedAssets" unitRef="GBP" decimals="0">${formatNumber(model.balance_sheet.tangible_assets)}</ix:nonFraction></td>
    <td class="amount">${formatNumber(model.balance_sheet.tangible_assets)}</td>
  </tr>
  
  <tr>
    <td colspan="3"><strong>Current Assets</strong></td>
  </tr>
  <tr>
    <td>Debtors</td>
    <td class="amount"><ix:nonFraction contextRef="${currentPeriodContextId}" name="uk-gaap:Debtors" unitRef="GBP" decimals="0">${formatNumber(model.balance_sheet.debtors)}</ix:nonFraction></td>
    <td class="amount"></td>
  </tr>
  <tr>
    <td>Cash at bank and in hand</td>
    <td class="amount"><ix:nonFraction contextRef="${currentPeriodContextId}" name="uk-gaap:CashBankInHand" unitRef="GBP" decimals="0">${formatNumber(model.balance_sheet.cash_at_bank)}</ix:nonFraction></td>
    <td class="amount"></td>
  </tr>
  <tr>
    <td></td>
    <td class="amount"></td>
    <td class="amount">${formatNumber(model.balance_sheet.debtors + model.balance_sheet.cash_at_bank)}</td>
  </tr>
  
  <tr>
    <td colspan="3"><strong>Creditors: amounts falling due within one year</strong></td>
  </tr>
  <tr>
    <td></td>
    <td class="amount"><ix:nonFraction contextRef="${currentPeriodContextId}" name="uk-gaap:CreditorsDueWithinOneYear" unitRef="GBP" decimals="0" sign="-">${formatNumber(model.balance_sheet.creditors_within_one_year)}</ix:nonFraction></td>
    <td class="amount">(${formatNumber(model.balance_sheet.creditors_within_one_year)})</td>
  </tr>
  
  <tr>
    <td><strong>Net Current Assets</strong></td>
    <td class="amount"></td>
    <td class="amount"><ix:nonFraction contextRef="${currentPeriodContextId}" name="uk-gaap:NetCurrentAssetsLiabilities" unitRef="GBP" decimals="0">${formatNumber(model.balance_sheet.net_current_assets)}</ix:nonFraction></td>
  </tr>
  
  <tr class="total">
    <td><strong>Total Assets Less Current Liabilities</strong></td>
    <td class="amount"></td>
    <td class="amount"><ix:nonFraction contextRef="${currentPeriodContextId}" name="uk-gaap:TotalAssetsLessCurrentLiabilities" unitRef="GBP" decimals="0">${formatNumber(model.balance_sheet.total_assets_less_current_liabilities)}</ix:nonFraction></td>
  </tr>

  ${model.balance_sheet.creditors_after_one_year > 0 ? `
  <tr>
    <td colspan="3"><strong>Creditors: amounts falling due after more than one year</strong></td>
  </tr>
  <tr>
    <td></td>
    <td class="amount"></td>
    <td class="amount"><ix:nonFraction contextRef="${currentPeriodContextId}" name="uk-gaap:CreditorsDueAfterOneYear" unitRef="GBP" decimals="0" sign="-">(${formatNumber(model.balance_sheet.creditors_after_one_year)})</ix:nonFraction></td>
  </tr>
  ` : ''}
  
  <tr class="total">
    <td><strong>Net Assets</strong></td>
    <td class="amount"></td>
    <td class="amount"><ix:nonFraction contextRef="${currentPeriodContextId}" name="uk-gaap:NetAssetsLiabilities" unitRef="GBP" decimals="0">${formatNumber(model.balance_sheet.net_assets)}</ix:nonFraction></td>
  </tr>
  
  <tr>
    <td colspan="3"><strong>Capital and Reserves</strong></td>
  </tr>
  <tr>
    <td>Called up share capital</td>
    <td class="amount"></td>
    <td class="amount"><ix:nonFraction contextRef="${currentPeriodContextId}" name="uk-gaap:CalledUpShareCapital" unitRef="GBP" decimals="0">${formatNumber(model.balance_sheet.share_capital)}</ix:nonFraction></td>
  </tr>
  <tr>
    <td>Profit and loss account</td>
    <td class="amount"></td>
    <td class="amount"><ix:nonFraction contextRef="${currentPeriodContextId}" name="uk-gaap:ProfitLossAccountReserve" unitRef="GBP" decimals="0">${formatNumber(model.balance_sheet.retained_earnings)}</ix:nonFraction></td>
  </tr>
  <tr class="total">
    <td><strong>Total Equity</strong></td>
    <td class="amount"></td>
    <td class="amount"><ix:nonFraction contextRef="${currentPeriodContextId}" name="uk-gaap:Equity" unitRef="GBP" decimals="0">${formatNumber(model.balance_sheet.total_equity)}</ix:nonFraction></td>
  </tr>
</table>

<div class="notes">
  <h2>Notes</h2>
  ${model.notes.accounting_policies.map(policy => `<p>${escapeXml(policy)}</p>`).join('\n')}
  
  ${model.notes.average_employees !== undefined ? `
  <p>The average number of employees during the period was ${model.notes.average_employees}.</p>
  ` : ''}
</div>

<div class="signature">
  <p>These accounts were approved by the board of directors on ${model.director_approval.approval_date} and signed on behalf of the board by:</p>
  <p><strong>${escapeXml(model.director_approval.signatory_name)}</strong></p>
  <p>${escapeXml(model.director_approval.signatory_position)}</p>
</div>

<p style="margin-top: 30px; font-size: 9pt;">
  <ix:nonNumeric contextRef="${durationContextId}" name="uk-direp:StatementThatAccountsHaveBeenPreparedInAccordanceWithProvisionsSmallCompaniesRegime">
    These accounts have been prepared in accordance with the micro-entity provisions.
  </ix:nonNumeric>
</p>

</body>
</html>`;

  return ixbrl;
}

// Generate iXBRL for CT Computation
export function generateCTComputationiXBRL(
  result: CTComputationResult,
  companyName: string,
  companyNumber: string
): string {
  const durationContextId = generateContextId('duration', result.period_start, result.period_end);
  
  const escapeXml = (text: string): string => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const formatNumber = (num: number): string => {
    return num.toFixed(0);
  };

  const ixbrl = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"
      xmlns:ixt="http://www.xbrl.org/inlineXBRL/transformation/2020-02-12"
      xmlns:xbrli="${NAMESPACES.xbrli}"
      xmlns:link="${NAMESPACES.link}"
      xmlns:xlink="${NAMESPACES.xlink}"
      xmlns:iso4217="${NAMESPACES.iso4217}"
      xmlns:ct="${NAMESPACES['uk-core']}"
      xml:lang="en">
<head>
  <title>${escapeXml(companyName)} - Corporation Tax Computation</title>
  <meta charset="UTF-8"/>
  <style type="text/css">
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { font-size: 18pt; }
    h2 { font-size: 14pt; margin-top: 20px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
    td.amount { text-align: right; }
    .total { font-weight: bold; border-top: 2px solid #000; }
    .subtotal { font-weight: bold; }
  </style>
</head>
<body>
<ix:header>
  <ix:hidden>
    <ix:nonNumeric contextRef="${durationContextId}" name="uk-bus:EntityCurrentLegalOrRegisteredName">${escapeXml(companyName)}</ix:nonNumeric>
    <ix:nonNumeric contextRef="${durationContextId}" name="uk-bus:UKCompaniesHouseRegisteredNumber">${escapeXml(companyNumber)}</ix:nonNumeric>
  </ix:hidden>
  <ix:resources>
    <xbrli:context id="${durationContextId}">
      <xbrli:entity>
        <xbrli:identifier scheme="http://www.companieshouse.gov.uk/">${companyNumber}</xbrli:identifier>
      </xbrli:entity>
      <xbrli:period>
        <xbrli:startDate>${result.period_start}</xbrli:startDate>
        <xbrli:endDate>${result.period_end}</xbrli:endDate>
      </xbrli:period>
    </xbrli:context>
    <xbrli:unit id="GBP">
      <xbrli:measure>iso4217:GBP</xbrli:measure>
    </xbrli:unit>
  </ix:resources>
</ix:header>

<h1>${escapeXml(companyName)}</h1>
<p>Company Registration Number: ${escapeXml(companyNumber)}</p>
<p>Corporation Tax Computation for the period ${result.period_start} to ${result.period_end}</p>

<h2>Reconciliation of Profit to Taxable Total Profits</h2>

<table>
  <tr>
    <th></th>
    <th class="amount">£</th>
  </tr>
  
  <tr>
    <td>Net profit per accounts</td>
    <td class="amount"><ix:nonFraction contextRef="${durationContextId}" name="ct:ProfitLossPerAccounts" unitRef="GBP" decimals="0">${formatNumber(result.accounting_profit)}</ix:nonFraction></td>
  </tr>
  
  ${result.add_backs_breakdown.length > 0 ? `
  <tr>
    <td colspan="2"><strong>Add back:</strong></td>
  </tr>
  ${result.add_backs_breakdown.map(ab => `
  <tr>
    <td style="padding-left: 20px;">${escapeXml(ab.description)}</td>
    <td class="amount">${formatNumber(ab.amount)}</td>
  </tr>
  `).join('')}
  <tr class="subtotal">
    <td>Total add-backs</td>
    <td class="amount">${formatNumber(result.total_add_backs)}</td>
  </tr>
  ` : ''}
  
  ${result.total_deductions > 0 ? `
  <tr>
    <td colspan="2"><strong>Less:</strong></td>
  </tr>
  ${result.deductions_breakdown.map(d => `
  <tr>
    <td style="padding-left: 20px;">${escapeXml(d.description)}</td>
    <td class="amount">(${formatNumber(d.amount)})</td>
  </tr>
  `).join('')}
  ` : ''}
  
  <tr>
    <td colspan="2"><strong>Capital Allowances:</strong></td>
  </tr>
  <tr>
    <td style="padding-left: 20px;">Total capital allowances</td>
    <td class="amount">(${formatNumber(result.total_capital_allowances)})</td>
  </tr>
  ${result.balancing_charges > 0 ? `
  <tr>
    <td style="padding-left: 20px;">Balancing charges</td>
    <td class="amount">${formatNumber(result.balancing_charges)}</td>
  </tr>
  ` : ''}
  
  <tr class="total">
    <td><strong>Taxable Total Profits</strong></td>
    <td class="amount"><ix:nonFraction contextRef="${durationContextId}" name="ct:TaxableTotalProfits" unitRef="GBP" decimals="0">${formatNumber(result.taxable_total_profits)}</ix:nonFraction></td>
  </tr>
</table>

<h2>Corporation Tax Calculation</h2>

<table>
  <tr>
    <th></th>
    <th class="amount">£</th>
  </tr>
  
  <tr>
    <td>Taxable total profits</td>
    <td class="amount">${formatNumber(result.taxable_total_profits)}</td>
  </tr>
  
  <tr>
    <td>Corporation tax at ${(result.effective_rate * 100).toFixed(2)}%</td>
    <td class="amount">${formatNumber(result.tax_at_main_rate)}</td>
  </tr>
  
  ${result.marginal_relief_amount > 0 ? `
  <tr>
    <td>Less: Marginal relief</td>
    <td class="amount">(${formatNumber(result.marginal_relief_amount)})</td>
  </tr>
  ` : ''}
  
  <tr class="total">
    <td><strong>Corporation Tax Payable</strong></td>
    <td class="amount"><ix:nonFraction contextRef="${durationContextId}" name="ct:CorporationTaxPayable" unitRef="GBP" decimals="0">${formatNumber(result.corporation_tax_due)}</ix:nonFraction></td>
  </tr>
</table>

${result.pools_summary.length > 0 ? `
<h2>Capital Allowances Summary</h2>

<table>
  <tr>
    <th>Pool</th>
    <th class="amount">Opening WDV</th>
    <th class="amount">Additions</th>
    <th class="amount">Disposals</th>
    <th class="amount">Allowances</th>
    <th class="amount">Closing WDV</th>
  </tr>
  ${result.pools_summary.map((pool: any) => `
  <tr>
    <td>${pool.pool_name || pool.pool_type}</td>
    <td class="amount">${formatNumber(pool.opening_wdv)}</td>
    <td class="amount">${formatNumber(pool.additions)}</td>
    <td class="amount">${formatNumber(pool.disposals)}</td>
    <td class="amount">${formatNumber(pool.aia_claimed + pool.fya_claimed + pool.full_expensing_claimed + pool.wda_claimed)}</td>
    <td class="amount">${formatNumber(pool.closing_wdv)}</td>
  </tr>
  `).join('')}
</table>
` : ''}

</body>
</html>`;

  return ixbrl;
}

// Generate hash for artefact
export async function generateArtefactHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Save filing artefact
export async function saveFilingArtefact(
  organizationId: string,
  filingId: string,
  artefactType: 'IXBRL_ACCOUNTS' | 'IXBRL_CT_COMPUTATION' | 'CT600_XML' | 'CH_ACCOUNTS_XML' | 'PDF_ACCOUNTS' | 'PDF_CT_COMPUTATION',
  content: string,
  taxonomyVersion?: string
): Promise<string> {
  const { supabase } = await import("@/integrations/supabase/client");
  
  const contentHash = await generateArtefactHash(content);
  
  const { data, error } = await supabase
    .from('filing_artefacts')
    .insert({
      organization_id: organizationId,
      filing_id: filingId,
      artefact_type: artefactType,
      content,
      content_hash: contentHash,
      taxonomy_version: taxonomyVersion,
      generator_version: '1.0.0',
    })
    .select()
    .single();

  if (error) throw error;
  return data.id;
}
