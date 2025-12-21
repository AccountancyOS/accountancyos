import { serve } from "@std/http-190";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GeneratePDFRequest {
  filingId: string;
  documentType: 
    | "sa100_summary" 
    | "tax_computation" 
    | "ct600_summary" 
    | "company_accounts" 
    | "vat_summary"
    | "cs01_summary"
    | "ap01_confirmation"
    | "tm01_confirmation"
    | "sh01_statement";
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { filingId, documentType }: GeneratePDFRequest = await req.json();

    if (!filingId || !documentType) {
      return new Response(JSON.stringify({ error: "Missing filingId or documentType" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[generate-filing-pdf] Generating ${documentType} for filing ${filingId}`);

    // Fetch filing data with extended relations for CoSec
    const { data: filing, error: filingError } = await supabase
      .from("filings")
      .select(`
        *,
        clients (first_name, last_name, utr, national_insurance_number),
        companies (
          id, company_name, company_number, company_type, incorporation_date,
          registered_office_address, sic_codes,
          confirmation_statement_made_up_to, confirmation_statement_next_due
        )
      `)
      .eq("id", filingId)
      .single();

    if (filingError || !filing) {
      console.error("[generate-filing-pdf] Filing not found:", filingError);
      return new Response(JSON.stringify({ error: "Filing not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For CoSec documents, fetch additional company data
    let companyData: any = null;
    if (["cs01_summary", "ap01_confirmation", "tm01_confirmation", "sh01_statement"].includes(documentType)) {
      const companyId = filing.company_id;
      if (companyId) {
        // Fetch officers
        const { data: officers } = await supabase
          .from("company_officers")
          .select(`
            *,
            company_persons (first_name, last_name, date_of_birth, service_address_line_1, service_city, service_postcode)
          `)
          .eq("company_id", companyId)
          .is("resigned_at", null);

        // Fetch PSCs
        const { data: pscs } = await supabase
          .from("company_pscs")
          .select(`
            *,
            company_persons (first_name, last_name, date_of_birth)
          `)
          .eq("company_id", companyId)
          .is("ceased_at", null);

        // Fetch share classes
        const { data: shareClasses } = await supabase
          .from("company_share_classes")
          .select("*")
          .eq("company_id", companyId);

        // Fetch shareholders
        const { data: shareholders } = await supabase
          .from("company_shareholders")
          .select(`
            *,
            company_persons (first_name, last_name),
            company_share_classes (class_name, currency, nominal_value)
          `)
          .eq("company_id", companyId)
          .gt("shares_held", 0);

        companyData = { officers, pscs, shareClasses, shareholders };
      }
    }

    // Generate HTML based on document type
    let html: string;
    let documentName: string;

    switch (documentType) {
      case "sa100_summary":
        html = generateSA100SummaryHTML(filing);
        documentName = `SA100 Summary - ${filing.tax_year}`;
        break;
      case "tax_computation":
        html = generateTaxComputationHTML(filing);
        documentName = `Tax Computation - ${filing.tax_year}`;
        break;
      case "ct600_summary":
        html = generateCT600SummaryHTML(filing);
        documentName = `CT600 Summary - ${filing.tax_year}`;
        break;
      case "vat_summary":
        html = generateVATSummaryHTML(filing);
        documentName = `VAT Return Summary`;
        break;
      case "cs01_summary":
        html = generateCS01SummaryHTML(filing, companyData);
        documentName = `CS01 Confirmation Statement Summary`;
        break;
      case "ap01_confirmation":
        html = generateAP01ConfirmationHTML(filing, companyData);
        documentName = `AP01 Director Appointment Confirmation`;
        break;
      case "tm01_confirmation":
        html = generateTM01ConfirmationHTML(filing, companyData);
        documentName = `TM01 Director Termination Confirmation`;
        break;
      case "sh01_statement":
        html = generateSH01StatementHTML(filing, companyData);
        documentName = `SH01 Statement of Capital`;
        break;
      default:
        html = generateGenericSummaryHTML(filing);
        documentName = `Filing Summary - ${filing.tax_year}`;
    }

    // Convert HTML to base64 for storage
    const encoder = new TextEncoder();
    const htmlBytes = encoder.encode(html);
    const base64Html = btoa(String.fromCharCode(...htmlBytes));

    // Store document in filing_documents table
    const documentId = crypto.randomUUID();
    
    // Upload to storage
    const storagePath = `filings/${filingId}/${documentId}.html`;
    const { error: uploadError } = await supabase.storage
      .from("filing-documents")
      .upload(storagePath, htmlBytes, {
        contentType: "text/html",
        upsert: true,
      });

    if (uploadError) {
      console.error("[generate-filing-pdf] Upload error:", uploadError);
      // Continue without storage - we'll return the HTML directly
    }

    // Get public URL
    const { data: urlData } = await supabase.storage
      .from("filing-documents")
      .getPublicUrl(storagePath);

    // Create filing document record
    const { error: docError } = await supabase
      .from("filing_documents")
      .insert({
        id: documentId,
        filing_id: filingId,
        document_type: documentType,
        document_name: documentName,
        storage_path: storagePath,
        public_url: urlData?.publicUrl,
        mime_type: "text/html",
        generated_at: new Date().toISOString(),
      });

    if (docError) {
      console.error("[generate-filing-pdf] Document record error:", docError);
    }

    // Update filing with generated documents
    const existingDocs = (filing.generated_documents as any[]) || [];
    const newDoc = {
      id: documentId,
      name: documentName,
      type: documentType,
      url: urlData?.publicUrl,
      generated_at: new Date().toISOString(),
    };

    await supabase
      .from("filings")
      .update({
        generated_documents: [...existingDocs.filter(d => d.type !== documentType), newDoc],
      })
      .eq("id", filingId);

    console.log(`[generate-filing-pdf] Successfully generated ${documentType}`);

    return new Response(
      JSON.stringify({
        success: true,
        documentId,
        documentName,
        documentType,
        url: urlData?.publicUrl,
        html: base64Html,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[generate-filing-pdf] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

// ==================== HTML GENERATORS ====================

function generateSA100SummaryHTML(filing: any): string {
  const client = filing.clients;
  const filingData = filing.filing_data || {};
  const breakdown = filingData.tax_calculation_breakdown || {};

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Self Assessment Tax Return Summary</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    .header { border-bottom: 2px solid #1a365d; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { color: #1a365d; margin: 0; }
    .header p { color: #666; margin: 5px 0 0; }
    .section { margin-bottom: 30px; }
    .section h2 { color: #1a365d; font-size: 16px; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 8px 0; border-bottom: 1px solid #eee; }
    td:last-child { text-align: right; font-family: monospace; }
    .total-row { font-weight: bold; border-top: 2px solid #333; }
    .tax-due { color: #c53030; }
    .tax-refund { color: #2f855a; }
    .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
    .draft-watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 100px; color: rgba(0,0,0,0.05); z-index: -1; }
  </style>
</head>
<body>
  ${filing.status !== "filed" ? '<div class="draft-watermark">DRAFT</div>' : ''}
  
  <div class="header">
    <h1>Self Assessment Tax Return Summary</h1>
    <p>Tax Year: ${filing.tax_year || 'N/A'}</p>
  </div>
  
  <div class="section">
    <h2>Taxpayer Details</h2>
    <table>
      <tr><td>Name</td><td>${client?.first_name || ''} ${client?.last_name || ''}</td></tr>
      <tr><td>UTR</td><td>${client?.utr || 'Not provided'}</td></tr>
      <tr><td>NI Number</td><td>${client?.national_insurance_number || 'Not provided'}</td></tr>
    </table>
  </div>
  
  <div class="section">
    <h2>Income Summary</h2>
    <table>
      <tr><td>Employment Income</td><td>£${formatNumber(breakdown.total_employment_income || filingData.employment_income)}</td></tr>
      <tr><td>Self-Employment Profit</td><td>£${formatNumber(breakdown.total_self_employment_profit || filingData.self_employment_profit)}</td></tr>
      <tr><td>Dividends</td><td>£${formatNumber(breakdown.total_dividends || filingData.dividends)}</td></tr>
      <tr><td>Other Income</td><td>£${formatNumber(breakdown.total_other_income || filingData.other_income)}</td></tr>
      <tr class="total-row"><td>Total Income</td><td>£${formatNumber(breakdown.gross_income || filingData.total_income)}</td></tr>
    </table>
  </div>
  
  <div class="section">
    <h2>Allowances & Deductions</h2>
    <table>
      <tr><td>Personal Allowance</td><td>£${formatNumber(breakdown.available_personal_allowance || 12570)}</td></tr>
      <tr><td>Pension Contributions</td><td>£${formatNumber(filingData.pension_contributions)}</td></tr>
      <tr><td>Gift Aid</td><td>£${formatNumber(filingData.gift_aid)}</td></tr>
      <tr class="total-row"><td>Taxable Income</td><td>£${formatNumber(breakdown.taxable_income || filingData.taxable_income)}</td></tr>
    </table>
  </div>
  
  <div class="section">
    <h2>Tax Calculation</h2>
    <table>
      <tr><td>Income Tax at Basic Rate (20%)</td><td>£${formatNumber(breakdown.income_tax_basic)}</td></tr>
      <tr><td>Income Tax at Higher Rate (40%)</td><td>£${formatNumber(breakdown.income_tax_higher)}</td></tr>
      <tr><td>Income Tax at Additional Rate (45%)</td><td>£${formatNumber(breakdown.income_tax_additional)}</td></tr>
      <tr><td>Dividend Tax</td><td>£${formatNumber(breakdown.dividend_tax)}</td></tr>
      <tr class="total-row"><td>Total Income Tax</td><td>£${formatNumber(breakdown.total_income_tax || filingData.income_tax)}</td></tr>
      <tr><td>Class 2 NIC</td><td>£${formatNumber(breakdown.class2_nic)}</td></tr>
      <tr><td>Class 4 NIC</td><td>£${formatNumber(breakdown.class4_nic)}</td></tr>
      <tr class="total-row ${filing.tax_due ? 'tax-due' : 'tax-refund'}">
        <td>Total Tax ${filing.tax_due ? 'Due' : 'Refund'}</td>
        <td>£${formatNumber(filing.tax_due || filing.tax_refund || breakdown.total_tax_liability)}</td>
      </tr>
    </table>
  </div>
  
  ${breakdown.poa_first_payment ? `
  <div class="section">
    <h2>Payments on Account</h2>
    <table>
      <tr><td>First Payment on Account (31 January)</td><td>£${formatNumber(breakdown.poa_first_payment)}</td></tr>
      <tr><td>Second Payment on Account (31 July)</td><td>£${formatNumber(breakdown.poa_second_payment)}</td></tr>
    </table>
  </div>
  ` : ''}
  
  <div class="footer">
    <p>Generated: ${new Date().toLocaleString('en-GB')}</p>
    <p>Status: ${filing.status?.toUpperCase() || 'DRAFT'}</p>
    ${filing.filing_reference ? `<p>Filing Reference: ${filing.filing_reference}</p>` : ''}
  </div>
</body>
</html>
  `;
}

function generateTaxComputationHTML(filing: any): string {
  const filingData = filing.filing_data || {};
  const breakdown = filingData.tax_calculation_breakdown || {};
  const client = filing.clients;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Tax Computation</title>
  <style>
    body { font-family: 'Courier New', monospace; margin: 40px; font-size: 12px; }
    .header { text-align: center; margin-bottom: 30px; }
    .header h1 { font-size: 16px; margin: 0; }
    .line { display: flex; justify-content: space-between; padding: 2px 0; }
    .line.indent { padding-left: 20px; }
    .line.total { border-top: 1px solid #000; font-weight: bold; }
    .line.double { border-top: 2px double #000; }
    .section-title { margin-top: 20px; font-weight: bold; text-decoration: underline; }
    .amount { text-align: right; min-width: 100px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>TAX COMPUTATION</h1>
    <p>${client?.first_name || ''} ${client?.last_name || ''}</p>
    <p>Tax Year ${filing.tax_year || 'N/A'}</p>
  </div>
  
  <div class="section-title">INCOME</div>
  <div class="line"><span>Employment income</span><span class="amount">${formatNumber(breakdown.total_employment_income)}</span></div>
  <div class="line"><span>Trading profit</span><span class="amount">${formatNumber(breakdown.total_self_employment_profit)}</span></div>
  <div class="line"><span>Dividend income</span><span class="amount">${formatNumber(breakdown.total_dividends)}</span></div>
  <div class="line"><span>Interest income</span><span class="amount">${formatNumber(filingData.bank_interest)}</span></div>
  <div class="line"><span>Property income</span><span class="amount">${formatNumber(filingData.property_income)}</span></div>
  <div class="line total"><span>Total income</span><span class="amount">${formatNumber(breakdown.gross_income)}</span></div>
  
  <div class="section-title">DEDUCTIONS</div>
  <div class="line"><span>Pension contributions (gross)</span><span class="amount">(${formatNumber(filingData.pension_contributions)})</span></div>
  <div class="line"><span>Gift aid payments (gross)</span><span class="amount">(${formatNumber(filingData.gift_aid)})</span></div>
  <div class="line total"><span>Net income</span><span class="amount">${formatNumber(breakdown.adjusted_net_income)}</span></div>
  
  <div class="section-title">PERSONAL ALLOWANCES</div>
  <div class="line"><span>Personal allowance</span><span class="amount">${formatNumber(breakdown.personal_allowance)}</span></div>
  ${breakdown.personal_allowance_reduction > 0 ? `<div class="line"><span>Less: Income limit reduction</span><span class="amount">(${formatNumber(breakdown.personal_allowance_reduction)})</span></div>` : ''}
  <div class="line total"><span>Taxable income</span><span class="amount">${formatNumber(breakdown.taxable_income)}</span></div>
  
  <div class="section-title">INCOME TAX COMPUTATION</div>
  <div class="line"><span>Non-dividend income @ 20%</span><span class="amount">${formatNumber(breakdown.income_tax_basic)}</span></div>
  <div class="line"><span>Non-dividend income @ 40%</span><span class="amount">${formatNumber(breakdown.income_tax_higher)}</span></div>
  <div class="line"><span>Non-dividend income @ 45%</span><span class="amount">${formatNumber(breakdown.income_tax_additional)}</span></div>
  <div class="line"><span>Dividend income (after allowance)</span><span class="amount">${formatNumber(breakdown.dividend_tax)}</span></div>
  <div class="line total"><span>Income tax liability</span><span class="amount">${formatNumber(breakdown.total_income_tax)}</span></div>
  
  <div class="section-title">NATIONAL INSURANCE</div>
  <div class="line"><span>Class 2 contributions</span><span class="amount">${formatNumber(breakdown.class2_nic)}</span></div>
  <div class="line"><span>Class 4 contributions</span><span class="amount">${formatNumber(breakdown.class4_nic)}</span></div>
  <div class="line total"><span>Total NIC</span><span class="amount">${formatNumber(breakdown.total_nic)}</span></div>
  
  <div class="line double"><span>TOTAL TAX AND NIC PAYABLE</span><span class="amount">${formatNumber(breakdown.total_tax_liability)}</span></div>
  
  <div style="margin-top: 40px; font-size: 10px; color: #666;">
    <p>Generated: ${new Date().toLocaleString('en-GB')}</p>
  </div>
</body>
</html>
  `;
}

function generateCT600SummaryHTML(filing: any): string {
  const company = filing.companies;
  const filingData = filing.filing_data || {};
  const breakdown = filingData.tax_calculation_breakdown || {};

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Corporation Tax Return Summary</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    .header { border-bottom: 2px solid #1a365d; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { color: #1a365d; margin: 0; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 8px 0; border-bottom: 1px solid #eee; }
    td:last-child { text-align: right; font-family: monospace; }
    .total-row { font-weight: bold; border-top: 2px solid #333; }
    .section { margin-bottom: 30px; }
    .section h2 { color: #1a365d; font-size: 16px; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
    .draft-watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 100px; color: rgba(0,0,0,0.05); z-index: -1; }
  </style>
</head>
<body>
  ${filing.status !== "filed" ? '<div class="draft-watermark">DRAFT</div>' : ''}
  
  <div class="header">
    <h1>Corporation Tax Return Summary (CT600)</h1>
    <p>Accounting Period: ${filing.period_start ? new Date(filing.period_start).toLocaleDateString('en-GB') : 'N/A'} to ${filing.period_end ? new Date(filing.period_end).toLocaleDateString('en-GB') : 'N/A'}</p>
  </div>
  
  <div class="section">
    <h2>Company Details</h2>
    <table>
      <tr><td>Company Name</td><td>${company?.company_name || 'N/A'}</td></tr>
      <tr><td>Company Number</td><td>${company?.company_number || 'N/A'}</td></tr>
    </table>
  </div>
  
  <div class="section">
    <h2>Profit Computation</h2>
    <table>
      <tr><td>Accounting profit before tax</td><td>£${formatNumber(breakdown.accounting_profit || filingData.profit_before_tax)}</td></tr>
      <tr><td>Add: Depreciation</td><td>£${formatNumber(breakdown.add_depreciation || filingData.depreciation)}</td></tr>
      <tr><td>Less: Capital allowances</td><td>(£${formatNumber(breakdown.less_capital_allowances || filingData.capital_allowances)})</td></tr>
      <tr><td>Add: Disallowable expenses</td><td>£${formatNumber(breakdown.add_disallowable_expenses || filingData.disallowable_expenses)}</td></tr>
      <tr class="total-row"><td>Trading profit</td><td>£${formatNumber(breakdown.trading_profit)}</td></tr>
      <tr><td>Property income</td><td>£${formatNumber(breakdown.property_income)}</td></tr>
      <tr><td>Chargeable gains</td><td>£${formatNumber(breakdown.chargeable_gains)}</td></tr>
      <tr class="total-row"><td>Total profits</td><td>£${formatNumber(breakdown.total_profits)}</td></tr>
      <tr><td>Less: Qualifying donations</td><td>(£${formatNumber(breakdown.less_qualifying_donations)})</td></tr>
      <tr class="total-row"><td>Profits chargeable to CT</td><td>£${formatNumber(breakdown.profits_chargeable_to_ct)}</td></tr>
    </table>
  </div>
  
  <div class="section">
    <h2>Corporation Tax Calculation</h2>
    <table>
      <tr><td>Tax at main rate (${(breakdown.applicable_rate * 100 || 25)}%)</td><td>£${formatNumber(breakdown.tax_at_main_rate)}</td></tr>
      ${breakdown.marginal_relief > 0 ? `<tr><td>Less: Marginal relief</td><td>(£${formatNumber(breakdown.marginal_relief)})</td></tr>` : ''}
      <tr class="total-row"><td>Corporation tax liability</td><td>£${formatNumber(breakdown.corporation_tax_liability || filing.tax_due)}</td></tr>
    </table>
  </div>
  
  <div class="section">
    <h2>Payment Details</h2>
    <table>
      <tr><td>Payment due date</td><td>${breakdown.payment_due_date ? new Date(breakdown.payment_due_date).toLocaleDateString('en-GB') : 'N/A'}</td></tr>
      <tr><td>Amount due</td><td>£${formatNumber(filing.tax_due || breakdown.corporation_tax_liability)}</td></tr>
    </table>
  </div>
  
  <div style="margin-top: 40px; font-size: 12px; color: #666;">
    <p>Generated: ${new Date().toLocaleString('en-GB')}</p>
    <p>Status: ${filing.status?.toUpperCase() || 'DRAFT'}</p>
  </div>
</body>
</html>
  `;
}

function generateVATSummaryHTML(filing: any): string {
  const filingData = filing.filing_data || {};
  const breakdown = filingData.vat_calculation_breakdown || {};

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>VAT Return Summary</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    .header { border-bottom: 2px solid #1a365d; padding-bottom: 20px; margin-bottom: 30px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 10px; border: 1px solid #ddd; }
    td:first-child { background: #f5f5f5; font-weight: bold; width: 60%; }
    td:last-child { text-align: right; font-family: monospace; }
    .highlight { background: #e6f3ff !important; }
  </style>
</head>
<body>
  <div class="header">
    <h1>VAT Return Summary</h1>
    <p>Period: ${filing.period_start ? new Date(filing.period_start).toLocaleDateString('en-GB') : 'N/A'} to ${filing.period_end ? new Date(filing.period_end).toLocaleDateString('en-GB') : 'N/A'}</p>
  </div>
  
  <table>
    <tr><td>Box 1 - VAT due on sales</td><td>£${formatNumber(breakdown.box1_vat_due_sales || filingData.box1_vat_due_sales)}</td></tr>
    <tr><td>Box 2 - VAT due on acquisitions</td><td>£${formatNumber(breakdown.box2_vat_due_acquisitions || filingData.box2_vat_due_acquisitions)}</td></tr>
    <tr><td>Box 3 - Total VAT due</td><td>£${formatNumber(breakdown.box3_total_vat_due || filingData.box3_total_vat_due)}</td></tr>
    <tr><td>Box 4 - VAT reclaimed</td><td>£${formatNumber(breakdown.box4_vat_reclaimed || filingData.box4_vat_reclaimed)}</td></tr>
    <tr class="highlight"><td>Box 5 - Net VAT ${breakdown.vat_payable ? 'payable' : 'refundable'}</td><td>£${formatNumber(Math.abs(breakdown.box5_net_vat || filingData.box5_net_vat))}</td></tr>
    <tr><td>Box 6 - Total sales (ex VAT)</td><td>£${formatNumber(breakdown.box6_total_sales || filingData.box6_total_sales)}</td></tr>
    <tr><td>Box 7 - Total purchases (ex VAT)</td><td>£${formatNumber(breakdown.box7_total_purchases || filingData.box7_total_purchases)}</td></tr>
    <tr><td>Box 8 - Goods to EU</td><td>£${formatNumber(breakdown.box8_goods_to_eu || filingData.box8_goods_to_eu)}</td></tr>
    <tr><td>Box 9 - Goods from EU</td><td>£${formatNumber(breakdown.box9_goods_from_eu || filingData.box9_goods_from_eu)}</td></tr>
  </table>
  
  <div style="margin-top: 40px; font-size: 12px; color: #666;">
    <p>Generated: ${new Date().toLocaleString('en-GB')}</p>
    <p>Status: ${filing.status?.toUpperCase() || 'DRAFT'}</p>
  </div>
</body>
</html>
  `;
}

// ==================== COSEC HTML GENERATORS ====================

function generateCS01SummaryHTML(filing: any, companyData: any): string {
  const company = filing.companies;
  const filingData = filing.filing_data || {};
  const officers = companyData?.officers || [];
  const pscs = companyData?.pscs || [];
  const shareClasses = companyData?.shareClasses || [];
  const shareholders = companyData?.shareholders || [];
  const sicCodes = company?.sic_codes || [];
  const registeredOffice = company?.registered_office_address || {};

  const totalShares = shareClasses.reduce((sum: number, sc: any) => sum + (sc.total_shares_issued || 0), 0);
  const totalCapital = shareClasses.reduce((sum: number, sc: any) => 
    sum + ((sc.total_shares_issued || 0) * (sc.nominal_value || 0)), 0);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Confirmation Statement Summary (CS01)</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; font-size: 13px; }
    .header { border-bottom: 3px solid #00703c; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { color: #00703c; margin: 0 0 5px; font-size: 24px; }
    .header .company-number { color: #666; font-size: 14px; }
    .made-up-date { background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 30px; text-align: center; }
    .made-up-date strong { font-size: 18px; color: #00703c; }
    .section { margin-bottom: 25px; }
    .section h2 { color: #00703c; font-size: 16px; border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-bottom: 15px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f9fafb; font-weight: 600; }
    .address { line-height: 1.6; }
    .sic-codes { display: flex; flex-wrap: wrap; gap: 8px; }
    .sic-code { background: #e5e7eb; padding: 4px 10px; border-radius: 4px; font-size: 12px; }
    .capital-summary { background: #f0fdf4; padding: 15px; border-radius: 8px; margin-top: 10px; }
    .capital-summary strong { color: #166534; }
    .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 11px; color: #666; }
    .draft-watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 100px; color: rgba(0,0,0,0.05); z-index: -1; }
  </style>
</head>
<body>
  ${filing.status !== "filed" ? '<div class="draft-watermark">DRAFT</div>' : ''}
  
  <div class="header">
    <h1>${company?.company_name || 'Company Name'}</h1>
    <p class="company-number">Company Number: ${company?.company_number || 'N/A'}</p>
    <p>Company Type: ${company?.company_type || 'Private Limited Company'}</p>
  </div>
  
  <div class="made-up-date">
    <p>Confirmation Statement Made Up To:</p>
    <strong>${filingData.made_up_to_date ? new Date(filingData.made_up_to_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : company?.confirmation_statement_made_up_to ? new Date(company.confirmation_statement_made_up_to).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A'}</strong>
  </div>
  
  <div class="section">
    <h2>Registered Office Address</h2>
    <div class="address">
      ${registeredOffice.address_line_1 || 'Address Line 1'}<br>
      ${registeredOffice.address_line_2 ? registeredOffice.address_line_2 + '<br>' : ''}
      ${registeredOffice.locality || ''} ${registeredOffice.region || ''}<br>
      ${registeredOffice.postal_code || ''}<br>
      ${registeredOffice.country || 'United Kingdom'}
    </div>
  </div>
  
  <div class="section">
    <h2>Directors</h2>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Role</th>
          <th>Appointed</th>
          <th>Service Address</th>
        </tr>
      </thead>
      <tbody>
        ${officers.length > 0 ? officers.map((o: any) => `
          <tr>
            <td>${o.company_persons?.first_name || ''} ${o.company_persons?.last_name || ''}</td>
            <td>${o.role || 'Director'}</td>
            <td>${o.appointed_at ? new Date(o.appointed_at).toLocaleDateString('en-GB') : 'N/A'}</td>
            <td>${o.company_persons?.service_address_line_1 || ''}, ${o.company_persons?.service_city || ''} ${o.company_persons?.service_postcode || ''}</td>
          </tr>
        `).join('') : '<tr><td colspan="4">No officers recorded</td></tr>'}
      </tbody>
    </table>
  </div>
  
  <div class="section">
    <h2>Persons with Significant Control (PSCs)</h2>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Nature of Control</th>
          <th>Notified Date</th>
        </tr>
      </thead>
      <tbody>
        ${pscs.length > 0 ? pscs.map((p: any) => `
          <tr>
            <td>${p.company_persons?.first_name || ''} ${p.company_persons?.last_name || ''}</td>
            <td>${(p.nature_of_control || []).join(', ')}</td>
            <td>${p.notified_at ? new Date(p.notified_at).toLocaleDateString('en-GB') : 'N/A'}</td>
          </tr>
        `).join('') : '<tr><td colspan="3">No PSCs recorded</td></tr>'}
      </tbody>
    </table>
  </div>
  
  <div class="section">
    <h2>Statement of Capital</h2>
    <table>
      <thead>
        <tr>
          <th>Share Class</th>
          <th>Currency</th>
          <th>Nominal Value</th>
          <th>Shares Issued</th>
          <th>Aggregate Value</th>
        </tr>
      </thead>
      <tbody>
        ${shareClasses.length > 0 ? shareClasses.map((sc: any) => `
          <tr>
            <td>${sc.class_name || 'Ordinary'}</td>
            <td>${sc.currency || 'GBP'}</td>
            <td>£${formatNumber(sc.nominal_value)}</td>
            <td>${(sc.total_shares_issued || 0).toLocaleString()}</td>
            <td>£${formatNumber((sc.total_shares_issued || 0) * (sc.nominal_value || 0))}</td>
          </tr>
        `).join('') : '<tr><td colspan="5">No share classes recorded</td></tr>'}
      </tbody>
    </table>
    <div class="capital-summary">
      <strong>Total Shares: ${totalShares.toLocaleString()}</strong><br>
      <strong>Total Aggregate Nominal Value: £${formatNumber(totalCapital)}</strong>
    </div>
  </div>
  
  <div class="section">
    <h2>Shareholders</h2>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Share Class</th>
          <th>Shares Held</th>
        </tr>
      </thead>
      <tbody>
        ${shareholders.length > 0 ? shareholders.map((sh: any) => `
          <tr>
            <td>${sh.company_persons?.first_name || ''} ${sh.company_persons?.last_name || ''}</td>
            <td>${sh.company_share_classes?.class_name || 'Ordinary'}</td>
            <td>${(sh.shares_held || 0).toLocaleString()}</td>
          </tr>
        `).join('') : '<tr><td colspan="3">No shareholders recorded</td></tr>'}
      </tbody>
    </table>
  </div>
  
  <div class="section">
    <h2>SIC Codes</h2>
    <div class="sic-codes">
      ${Array.isArray(sicCodes) && sicCodes.length > 0 
        ? sicCodes.map((code: string) => `<span class="sic-code">${code}</span>`).join('')
        : '<span>No SIC codes recorded</span>'}
    </div>
  </div>
  
  <div class="footer">
    <p>Generated: ${new Date().toLocaleString('en-GB')}</p>
    <p>Status: ${filing.status?.toUpperCase() || 'DRAFT'}</p>
    ${filing.filing_reference ? `<p>Companies House Reference: ${filing.filing_reference}</p>` : ''}
    <p style="margin-top: 15px; font-style: italic;">This document is a summary for review purposes. The official confirmation statement is filed with Companies House.</p>
  </div>
</body>
</html>
  `;
}

function generateAP01ConfirmationHTML(filing: any, companyData: any): string {
  const company = filing.companies;
  const filingData = filing.filing_data || {};
  const appointmentData = filingData.appointment_details || filingData;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Director Appointment Confirmation (AP01)</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 50px; color: #333; line-height: 1.6; }
    .letterhead { border-bottom: 2px solid #1a365d; padding-bottom: 20px; margin-bottom: 40px; }
    .letterhead h1 { color: #1a365d; margin: 0; font-size: 20px; }
    .letterhead p { margin: 5px 0 0; color: #666; }
    .title { text-align: center; margin: 30px 0; }
    .title h2 { color: #1a365d; font-size: 18px; margin: 0; text-transform: uppercase; letter-spacing: 1px; }
    .details-box { background: #f8fafc; padding: 25px; border-radius: 8px; margin: 25px 0; }
    .details-box h3 { color: #1a365d; margin: 0 0 15px; font-size: 14px; text-transform: uppercase; }
    .detail-row { display: flex; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { width: 180px; font-weight: 600; color: #4b5563; }
    .detail-value { flex: 1; }
    .confirmation-text { margin: 30px 0; padding: 20px; background: #f0fdf4; border-left: 4px solid #22c55e; }
    .signature-section { margin-top: 60px; }
    .signature-line { border-top: 1px solid #333; width: 250px; margin-top: 60px; padding-top: 5px; }
    .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 11px; color: #666; }
    .draft-watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 100px; color: rgba(0,0,0,0.05); z-index: -1; }
  </style>
</head>
<body>
  ${filing.status !== "filed" ? '<div class="draft-watermark">DRAFT</div>' : ''}
  
  <div class="letterhead">
    <h1>${company?.company_name || 'Company Name'}</h1>
    <p>Company Number: ${company?.company_number || 'N/A'}</p>
  </div>
  
  <div class="title">
    <h2>Director Appointment Confirmation</h2>
    <p style="color: #666; margin-top: 5px;">Form AP01 - Appointment of Director</p>
  </div>
  
  <div class="details-box">
    <h3>Director Details</h3>
    <div class="detail-row">
      <span class="detail-label">Full Name:</span>
      <span class="detail-value">${appointmentData.title || ''} ${appointmentData.first_name || ''} ${appointmentData.middle_names || ''} ${appointmentData.last_name || ''}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Date of Birth:</span>
      <span class="detail-value">${appointmentData.date_of_birth ? new Date(appointmentData.date_of_birth).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A'}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Nationality:</span>
      <span class="detail-value">${appointmentData.nationality || 'British'}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Occupation:</span>
      <span class="detail-value">${appointmentData.occupation || 'N/A'}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Country of Residence:</span>
      <span class="detail-value">${appointmentData.country_of_residence || 'United Kingdom'}</span>
    </div>
  </div>
  
  <div class="details-box">
    <h3>Service Address</h3>
    <div class="detail-row">
      <span class="detail-label">Address:</span>
      <span class="detail-value">
        ${appointmentData.service_address_line_1 || ''}<br>
        ${appointmentData.service_address_line_2 ? appointmentData.service_address_line_2 + '<br>' : ''}
        ${appointmentData.service_city || ''} ${appointmentData.service_postcode || ''}<br>
        ${appointmentData.service_country || 'United Kingdom'}
      </span>
    </div>
  </div>
  
  <div class="details-box">
    <h3>Appointment Details</h3>
    <div class="detail-row">
      <span class="detail-label">Appointment Date:</span>
      <span class="detail-value"><strong>${appointmentData.appointment_date ? new Date(appointmentData.appointment_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Role:</span>
      <span class="detail-value">${appointmentData.role || 'Director'}</span>
    </div>
  </div>
  
  <div class="confirmation-text">
    <strong>Consent Confirmation:</strong><br>
    I confirm that I consent to act as a director of ${company?.company_name || 'the company'} and that I am not disqualified from acting as a director.
  </div>
  
  <div class="signature-section">
    <p><strong>Signed by the Director:</strong></p>
    <div class="signature-line">
      <p>Name: ${appointmentData.first_name || ''} ${appointmentData.last_name || ''}</p>
      <p>Date: ________________</p>
    </div>
  </div>
  
  <div class="footer">
    <p>Generated: ${new Date().toLocaleString('en-GB')}</p>
    <p>Status: ${filing.status?.toUpperCase() || 'DRAFT'}</p>
    ${filing.filing_reference ? `<p>Companies House Reference: ${filing.filing_reference}</p>` : ''}
  </div>
</body>
</html>
  `;
}

function generateTM01ConfirmationHTML(filing: any, companyData: any): string {
  const company = filing.companies;
  const filingData = filing.filing_data || {};
  const terminationData = filingData.termination_details || filingData;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Director Termination Confirmation (TM01)</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 50px; color: #333; line-height: 1.6; }
    .letterhead { border-bottom: 2px solid #1a365d; padding-bottom: 20px; margin-bottom: 40px; }
    .letterhead h1 { color: #1a365d; margin: 0; font-size: 20px; }
    .letterhead p { margin: 5px 0 0; color: #666; }
    .title { text-align: center; margin: 30px 0; }
    .title h2 { color: #b91c1c; font-size: 18px; margin: 0; text-transform: uppercase; letter-spacing: 1px; }
    .details-box { background: #f8fafc; padding: 25px; border-radius: 8px; margin: 25px 0; }
    .details-box h3 { color: #1a365d; margin: 0 0 15px; font-size: 14px; text-transform: uppercase; }
    .detail-row { display: flex; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { width: 180px; font-weight: 600; color: #4b5563; }
    .detail-value { flex: 1; }
    .termination-notice { margin: 30px 0; padding: 20px; background: #fef2f2; border-left: 4px solid #dc2626; }
    .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 11px; color: #666; }
    .draft-watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 100px; color: rgba(0,0,0,0.05); z-index: -1; }
  </style>
</head>
<body>
  ${filing.status !== "filed" ? '<div class="draft-watermark">DRAFT</div>' : ''}
  
  <div class="letterhead">
    <h1>${company?.company_name || 'Company Name'}</h1>
    <p>Company Number: ${company?.company_number || 'N/A'}</p>
  </div>
  
  <div class="title">
    <h2>Director Termination Confirmation</h2>
    <p style="color: #666; margin-top: 5px;">Form TM01 - Termination of Appointment of Director</p>
  </div>
  
  <div class="details-box">
    <h3>Director Details</h3>
    <div class="detail-row">
      <span class="detail-label">Full Name:</span>
      <span class="detail-value">${terminationData.director_name || `${terminationData.first_name || ''} ${terminationData.last_name || ''}`}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Role:</span>
      <span class="detail-value">${terminationData.role || 'Director'}</span>
    </div>
  </div>
  
  <div class="details-box">
    <h3>Termination Details</h3>
    <div class="detail-row">
      <span class="detail-label">Date of Resignation:</span>
      <span class="detail-value"><strong>${terminationData.resignation_date ? new Date(terminationData.resignation_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A'}</strong></span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Reason:</span>
      <span class="detail-value">${terminationData.reason || 'Resigned'}</span>
    </div>
  </div>
  
  <div class="termination-notice">
    <strong>Notice:</strong><br>
    The above-named person has ceased to be a director of ${company?.company_name || 'the company'} with effect from the date stated above. This termination has been notified to Companies House.
  </div>
  
  ${terminationData.notes ? `
  <div class="details-box">
    <h3>Additional Notes</h3>
    <p>${terminationData.notes}</p>
  </div>
  ` : ''}
  
  <div class="footer">
    <p>Generated: ${new Date().toLocaleString('en-GB')}</p>
    <p>Status: ${filing.status?.toUpperCase() || 'DRAFT'}</p>
    ${filing.filing_reference ? `<p>Companies House Reference: ${filing.filing_reference}</p>` : ''}
  </div>
</body>
</html>
  `;
}

function generateSH01StatementHTML(filing: any, companyData: any): string {
  const company = filing.companies;
  const filingData = filing.filing_data || {};
  const allotmentData = filingData.allotment_details || filingData;
  const shareClasses = companyData?.shareClasses || [];

  // Calculate totals
  const totalSharesBefore = shareClasses.reduce((sum: number, sc: any) => sum + (sc.total_shares_issued || 0), 0);
  const sharesAllotted = allotmentData.shares_allotted || 0;
  const totalSharesAfter = totalSharesBefore + sharesAllotted;
  const nominalValue = allotmentData.nominal_value || allotmentData.price_per_share || 1;
  const totalCapitalAfter = shareClasses.reduce((sum: number, sc: any) => {
    const shares = sc.class_name === allotmentData.share_class_name 
      ? (sc.total_shares_issued || 0) + sharesAllotted
      : (sc.total_shares_issued || 0);
    return sum + (shares * (sc.nominal_value || 0));
  }, 0);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Statement of Capital (SH01)</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 50px; color: #333; line-height: 1.6; }
    .letterhead { border-bottom: 2px solid #1a365d; padding-bottom: 20px; margin-bottom: 40px; }
    .letterhead h1 { color: #1a365d; margin: 0; font-size: 20px; }
    .letterhead p { margin: 5px 0 0; color: #666; }
    .title { text-align: center; margin: 30px 0; }
    .title h2 { color: #1a365d; font-size: 18px; margin: 0; text-transform: uppercase; letter-spacing: 1px; }
    .details-box { background: #f8fafc; padding: 25px; border-radius: 8px; margin: 25px 0; }
    .details-box h3 { color: #1a365d; margin: 0 0 15px; font-size: 14px; text-transform: uppercase; }
    .detail-row { display: flex; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { width: 200px; font-weight: 600; color: #4b5563; }
    .detail-value { flex: 1; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { padding: 10px; text-align: left; border: 1px solid #e5e7eb; }
    th { background: #f3f4f6; font-weight: 600; }
    td:last-child, th:last-child { text-align: right; }
    .capital-summary { background: #f0fdf4; padding: 20px; border-radius: 8px; margin-top: 25px; }
    .capital-summary h3 { color: #166534; margin: 0 0 15px; }
    .capital-total { font-size: 18px; font-weight: bold; color: #166534; }
    .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 11px; color: #666; }
    .draft-watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 100px; color: rgba(0,0,0,0.05); z-index: -1; }
  </style>
</head>
<body>
  ${filing.status !== "filed" ? '<div class="draft-watermark">DRAFT</div>' : ''}
  
  <div class="letterhead">
    <h1>${company?.company_name || 'Company Name'}</h1>
    <p>Company Number: ${company?.company_number || 'N/A'}</p>
  </div>
  
  <div class="title">
    <h2>Statement of Capital</h2>
    <p style="color: #666; margin-top: 5px;">Form SH01 - Return of Allotment of Shares</p>
  </div>
  
  <div class="details-box">
    <h3>Allotment Details</h3>
    <div class="detail-row">
      <span class="detail-label">Date of Allotment:</span>
      <span class="detail-value"><strong>${allotmentData.allotment_date ? new Date(allotmentData.allotment_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Share Class:</span>
      <span class="detail-value">${allotmentData.share_class_name || 'Ordinary'}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Number of Shares Allotted:</span>
      <span class="detail-value"><strong>${sharesAllotted.toLocaleString()}</strong></span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Nominal Value per Share:</span>
      <span class="detail-value">£${formatNumber(nominalValue)}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Price Paid per Share:</span>
      <span class="detail-value">£${formatNumber(allotmentData.price_per_share || nominalValue)}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Total Consideration:</span>
      <span class="detail-value"><strong>£${formatNumber(allotmentData.total_consideration || (sharesAllotted * (allotmentData.price_per_share || nominalValue)))}</strong></span>
    </div>
  </div>
  
  <div class="details-box">
    <h3>Allottee / Subscriber</h3>
    <div class="detail-row">
      <span class="detail-label">Name:</span>
      <span class="detail-value">${allotmentData.shareholder_name || 'N/A'}</span>
    </div>
  </div>
  
  <div class="details-box">
    <h3>Statement of Capital (After Allotment)</h3>
    <table>
      <thead>
        <tr>
          <th>Share Class</th>
          <th>Currency</th>
          <th>Nominal Value</th>
          <th>Shares Issued</th>
          <th>Aggregate Value</th>
        </tr>
      </thead>
      <tbody>
        ${shareClasses.length > 0 ? shareClasses.map((sc: any) => {
          const shares = sc.class_name === allotmentData.share_class_name 
            ? (sc.total_shares_issued || 0) + sharesAllotted
            : (sc.total_shares_issued || 0);
          return `
          <tr>
            <td>${sc.class_name || 'Ordinary'}${sc.class_name === allotmentData.share_class_name ? ' *' : ''}</td>
            <td>${sc.currency || 'GBP'}</td>
            <td>£${formatNumber(sc.nominal_value)}</td>
            <td>${shares.toLocaleString()}</td>
            <td>£${formatNumber(shares * (sc.nominal_value || 0))}</td>
          </tr>
        `;}).join('') : `
          <tr>
            <td>${allotmentData.share_class_name || 'Ordinary'} *</td>
            <td>GBP</td>
            <td>£${formatNumber(nominalValue)}</td>
            <td>${sharesAllotted.toLocaleString()}</td>
            <td>£${formatNumber(sharesAllotted * nominalValue)}</td>
          </tr>
        `}
      </tbody>
    </table>
    <p style="font-size: 12px; color: #666;">* Share class affected by this allotment</p>
  </div>
  
  <div class="capital-summary">
    <h3>Capital Summary</h3>
    <div class="detail-row">
      <span class="detail-label">Total Shares Before:</span>
      <span class="detail-value">${totalSharesBefore.toLocaleString()}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Shares Allotted:</span>
      <span class="detail-value">+ ${sharesAllotted.toLocaleString()}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Total Shares After:</span>
      <span class="detail-value capital-total">${totalSharesAfter.toLocaleString()}</span>
    </div>
    <div class="detail-row" style="margin-top: 15px; padding-top: 15px; border-top: 2px solid #166534;">
      <span class="detail-label">Total Aggregate Nominal Value:</span>
      <span class="detail-value capital-total">£${formatNumber(totalCapitalAfter || (totalSharesAfter * nominalValue))}</span>
    </div>
  </div>
  
  <div class="footer">
    <p>Generated: ${new Date().toLocaleString('en-GB')}</p>
    <p>Status: ${filing.status?.toUpperCase() || 'DRAFT'}</p>
    ${filing.filing_reference ? `<p>Companies House Reference: ${filing.filing_reference}</p>` : ''}
  </div>
</body>
</html>
  `;
}

function generateGenericSummaryHTML(filing: any): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Filing Summary</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    .header { border-bottom: 2px solid #1a365d; padding-bottom: 20px; margin-bottom: 30px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 8px 0; border-bottom: 1px solid #eee; }
    td:last-child { text-align: right; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Filing Summary</h1>
    <p>Type: ${filing.filing_type || 'N/A'}</p>
    <p>Tax Year: ${filing.tax_year || 'N/A'}</p>
  </div>
  
  <table>
    <tr><td>Status</td><td>${filing.status?.toUpperCase() || 'DRAFT'}</td></tr>
    <tr><td>Tax Due</td><td>£${formatNumber(filing.tax_due)}</td></tr>
    <tr><td>Tax Refund</td><td>£${formatNumber(filing.tax_refund)}</td></tr>
    <tr><td>Created</td><td>${filing.created_at ? new Date(filing.created_at).toLocaleDateString('en-GB') : 'N/A'}</td></tr>
  </table>
  
  <div style="margin-top: 40px; font-size: 12px; color: #666;">
    <p>Generated: ${new Date().toLocaleString('en-GB')}</p>
  </div>
</body>
</html>
  `;
}

function formatNumber(value: any): string {
  if (value === null || value === undefined) return "0.00";
  const num = typeof value === "number" ? value : parseFloat(value);
  if (isNaN(num)) return "0.00";
  return num.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

serve(handler);
