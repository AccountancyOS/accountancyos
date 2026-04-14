import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit-service";
import { PAY_RUN_STATUSES, type PayRunStatus, type PayFrequency } from "@/lib/payroll-constants";
import { calculatePayslip, type PayslipInput } from "@/lib/payroll-calculation-engine";
import { postToLedger, type LedgerEntry, type PostingContext } from "@/lib/posting-service";

// Valid status transitions
export const PAY_RUN_TRANSITIONS: Record<PayRunStatus, PayRunStatus[]> = {
  [PAY_RUN_STATUSES.DRAFT]: [PAY_RUN_STATUSES.CALCULATED],
  [PAY_RUN_STATUSES.CALCULATED]: [PAY_RUN_STATUSES.READY_FOR_REVIEW, PAY_RUN_STATUSES.DRAFT],
  [PAY_RUN_STATUSES.READY_FOR_REVIEW]: [PAY_RUN_STATUSES.APPROVED, PAY_RUN_STATUSES.CALCULATED],
  [PAY_RUN_STATUSES.APPROVED]: [PAY_RUN_STATUSES.SUBMITTED, PAY_RUN_STATUSES.CALCULATED],
  [PAY_RUN_STATUSES.SUBMITTED]: [],
};

function canTransition(from: PayRunStatus, to: PayRunStatus): boolean {
  return PAY_RUN_TRANSITIONS[from]?.includes(to) ?? false;
}

interface ServiceResult {
  success: boolean;
  error?: string;
  data?: any;
}

/**
 * Fetch pay run with validation
 */
async function getPayRun(payRunId: string) {
  const { data, error } = await supabase
    .from("pay_runs")
    .select(`
      *,
      paye_schemes (
        id,
        name,
        employer_paye_reference,
        accounts_office_reference,
        company_id,
        client_id,
        organization_id
      )
    `)
    .eq("id", payRunId)
    .single();
  
  if (error) throw new Error(`Pay run not found: ${error.message}`);
  return data;
}

/**
 * Calculate payslips for all employees in a pay run
 */
export async function calculatePayRun(
  payRunId: string,
  userId: string
): Promise<ServiceResult> {
  try {
    const payRun = await getPayRun(payRunId);
    const currentStatus = payRun.status as PayRunStatus;
    
    if (!canTransition(currentStatus, PAY_RUN_STATUSES.CALCULATED)) {
      return { 
        success: false, 
        error: `Cannot calculate pay run from status "${currentStatus}". Must be in "draft" status.` 
      };
    }

    const organizationId = payRun.paye_schemes?.organization_id || payRun.organization_id;
    const payeSchemeId = payRun.paye_scheme_id;

    // Get all employees for this PAYE scheme
    const { data: employees, error: empError } = await supabase
      .from("employees")
      .select("*")
      .eq("paye_scheme_id", payeSchemeId)
      .eq("status", "active");

    if (empError) throw new Error(`Failed to fetch employees: ${empError.message}`);
    if (!employees?.length) {
      return { success: false, error: "No active employees found for this PAYE scheme" };
    }

    // Get YTD data for each employee from previous payslips this tax year
    const { data: ytdPayslips } = await supabase
      .from("payslips")
      .select("employee_id, gross_pay, taxable_pay, paye_tax, employee_nic, employer_nic, student_loan, employee_pension, employer_pension")
      .eq("tax_year", payRun.tax_year)
      .neq("pay_run_id", payRunId)
      .in("employee_id", employees.map(e => e.id));

    // Calculate YTD totals per employee
    const ytdByEmployee: Record<string, { 
      grossPay: number; 
      taxablePay: number;
      taxPaid: number; 
      employeeNIC: number;
      employerNIC: number;
      employeePension: number;
      employerPension: number;
      studentLoan: number;
    }> = {};
    
    ytdPayslips?.forEach(p => {
      if (!ytdByEmployee[p.employee_id]) {
        ytdByEmployee[p.employee_id] = { 
          grossPay: 0, taxablePay: 0, taxPaid: 0, 
          employeeNIC: 0, employerNIC: 0,
          employeePension: 0, employerPension: 0, studentLoan: 0
        };
      }
      ytdByEmployee[p.employee_id].grossPay += p.gross_pay || 0;
      ytdByEmployee[p.employee_id].taxablePay += p.taxable_pay || 0;
      ytdByEmployee[p.employee_id].taxPaid += p.paye_tax || 0;
      ytdByEmployee[p.employee_id].employeeNIC += p.employee_nic || 0;
      ytdByEmployee[p.employee_id].employerNIC += p.employer_nic || 0;
      ytdByEmployee[p.employee_id].employeePension += p.employee_pension || 0;
      ytdByEmployee[p.employee_id].employerPension += p.employer_pension || 0;
      ytdByEmployee[p.employee_id].studentLoan += p.student_loan || 0;
    });

    // Calculate each employee's payslip
    const payslipInserts: any[] = [];
    let totalGross = 0, totalPaye = 0, totalEmployeeNic = 0, totalEmployerNic = 0;
    let totalStudentLoan = 0, totalPension = 0, totalNet = 0;

    for (const employee of employees) {
      const ytd = ytdByEmployee[employee.id] || { 
        grossPay: 0, taxablePay: 0, taxPaid: 0, 
        employeeNIC: 0, employerNIC: 0,
        employeePension: 0, employerPension: 0, studentLoan: 0
      };
      
      // Calculate monthly pay from annual salary (use basic_salary or default)
      const annualSalary = (employee as any).annual_salary || (employee as any).basic_salary || 30000;
      const monthlyPay = annualSalary / 12;
      
      // Build the PayslipInput
      const input: PayslipInput = {
        employee: {
          taxCode: employee.tax_code || "1257L",
          nicCategory: (employee.nic_category || "A") as any,
          isDirector: employee.is_director || false,
          directorNICMethod: employee.director_nic_method as any,
          studentLoanPlan: ((employee as any).student_loan_plan || "none") as any,
          hasPostgraduateLoan: (employee as any).has_postgraduate_loan || false,
          pensionEmployeeRate: employee.pension_employee_rate_override || 0.05,
          pensionEmployerRate: employee.pension_employer_rate_override || 0.03,
          salarySacrificePension: false,
          pensionOptedOut: !!employee.pension_opt_out_date,
          pensionSchemeType: "qualifying_earnings",
        },
        payRun: {
          payFrequency: payRun.pay_frequency as PayFrequency,
          taxPeriod: payRun.tax_period || 1,
          taxYear: payRun.tax_year,
          paymentDate: payRun.payment_date,
          periodStart: payRun.period_start,
          periodEnd: payRun.period_end,
          taxBasis: "cumulative",
        },
        earnings: {
          basicPay: monthlyPay,
        },
        deductions: {},
        ytdFigures: ytd,
      };

      const result = calculatePayslip(input);

      payslipInserts.push({
        pay_run_id: payRunId,
        employee_id: employee.id,
        organization_id: organizationId,
        tax_year: payRun.tax_year,
        tax_period: payRun.tax_period,
        payment_date: payRun.payment_date,
        pay_frequency: payRun.pay_frequency,
        basic_pay: monthlyPay,
        gross_pay: result.grossPay,
        taxable_pay: result.taxablePay,
        paye_tax: result.paye.taxDueThisPeriod,
        employee_nic: result.nic.employeeNIC,
        employer_nic: result.nic.employerNIC,
        student_loan: result.studentLoan.totalStudentLoanDeduction,
        employee_pension: result.pension.employeePensionContribution,
        employer_pension: result.pension.employerPensionContribution,
        net_pay: result.netPay,
        calculation_breakdown: {
          paye: result.paye,
          nic: result.nic,
          pension: result.pension,
          studentLoan: result.studentLoan,
        },
        status: "calculated",
      });

      totalGross += result.grossPay;
      totalPaye += result.paye.taxDueThisPeriod;
      totalEmployeeNic += result.nic.employeeNIC;
      totalEmployerNic += result.nic.employerNIC;
      totalStudentLoan += result.studentLoan.totalStudentLoanDeduction;
      totalPension += result.pension.employeePensionContribution;
      totalNet += result.netPay;
    }

    // Delete existing payslips for this pay run and insert new ones
    await supabase.from("payslips").delete().eq("pay_run_id", payRunId);
    
    const { error: insertError } = await supabase
      .from("payslips")
      .insert(payslipInserts);

    if (insertError) throw new Error(`Failed to create payslips: ${insertError.message}`);

    // Update pay run with totals and status
    const { error: updateError } = await supabase
      .from("pay_runs")
      .update({
        status: PAY_RUN_STATUSES.CALCULATED,
        employee_count: employees.length,
        total_gross_pay: totalGross,
        total_paye: totalPaye,
        total_employee_nic: totalEmployeeNic,
        total_employer_nic: totalEmployerNic,
        total_student_loan: totalStudentLoan,
        total_employee_pension: totalPension,
        total_net_pay: totalNet,
        prepared_at: new Date().toISOString(),
        prepared_by: userId,
      })
      .eq("id", payRunId);

    if (updateError) throw new Error(`Failed to update pay run: ${updateError.message}`);

    // Log audit
    await logAudit({
      organizationId,
      entityType: "pay_run",
      entityId: payRunId,
      action: "calculate",
      fieldName: "status",
      oldValue: currentStatus,
      newValue: PAY_RUN_STATUSES.CALCULATED,
      metadata: { employee_count: employees.length, total_gross: totalGross },
    });

    return { success: true, data: { employeeCount: employees.length, totalGross, totalNet } };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Mark pay run as ready for review
 */
export async function markReadyForReview(
  payRunId: string,
  userId: string
): Promise<ServiceResult> {
  try {
    const payRun = await getPayRun(payRunId);
    const currentStatus = payRun.status as PayRunStatus;
    
    if (!canTransition(currentStatus, PAY_RUN_STATUSES.READY_FOR_REVIEW)) {
      return { 
        success: false, 
        error: `Cannot mark ready from status "${currentStatus}". Must be in "calculated" status.` 
      };
    }

    const { error } = await supabase
      .from("pay_runs")
      .update({ status: PAY_RUN_STATUSES.READY_FOR_REVIEW })
      .eq("id", payRunId);

    if (error) throw new Error(error.message);

    await logAudit({
      organizationId: payRun.organization_id,
      entityType: "pay_run",
      entityId: payRunId,
      action: "status_change",
      fieldName: "status",
      oldValue: currentStatus,
      newValue: PAY_RUN_STATUSES.READY_FOR_REVIEW,
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Create ledger entries for payroll journal
 */
async function createPayrollLedgerEntries(
  journalId: string,
  payRun: any,
  organizationId: string
): Promise<void> {
  // Get chart of accounts to find appropriate accounts
  const entityId = payRun.paye_schemes?.company_id || payRun.paye_schemes?.client_id;
  const entityType: "client" | "company" = payRun.paye_schemes?.company_id ? 'company' : 'client';

  const { data: accounts } = await supabase
    .from("bookkeeping_accounts")
    .select("id, code, name, account_type")
    .eq("organization_id", organizationId)
    .eq(entityType === 'company' ? 'company_id' : 'client_id', entityId);

  // Find or use default accounts
  const findAccount = (codePrefix: string, fallbackType: string) => {
    return accounts?.find(a => a.code.startsWith(codePrefix)) 
      || accounts?.find(a => a.account_type === fallbackType);
  };

  const wagesAccount = findAccount("7", "expense");
  const payeAccount = findAccount("2210", "liability");
  const nicAccount = findAccount("2220", "liability");
  const pensionAccount = findAccount("2230", "liability");
  const netPayAccount = findAccount("2200", "liability");

  if (!wagesAccount || !netPayAccount) {
    console.warn("Could not find required accounts for payroll journal");
    return;
  }

  const entries: LedgerEntry[] = [];
  const paymentDate = payRun.payment_date;

  // DR: Wages Expense (Gross Pay + Employer NIC + Employer Pension)
  const totalWagesExpense = 
    (payRun.total_gross_pay || 0) + 
    (payRun.total_employer_nic || 0) + 
    (payRun.total_employer_pension || 0);

  if (totalWagesExpense > 0) {
    entries.push({
      accountId: wagesAccount.id,
      debit: totalWagesExpense,
      credit: null,
      description: `Wages expense - Period ${payRun.tax_period}`,
    });
  }

  // CR: PAYE Liability
  if ((payRun.total_paye || 0) > 0 && payeAccount) {
    entries.push({
      accountId: payeAccount.id,
      debit: null,
      credit: payRun.total_paye,
      description: `PAYE liability - Period ${payRun.tax_period}`,
    });
  }

  // CR: NIC Liability (Employee + Employer)
  const totalNic = (payRun.total_employee_nic || 0) + (payRun.total_employer_nic || 0);
  if (totalNic > 0 && nicAccount) {
    entries.push({
      accountId: nicAccount.id,
      debit: null,
      credit: totalNic,
      description: `NIC liability - Period ${payRun.tax_period}`,
    });
  }

  // CR: Pension Liability (Employee + Employer)
  const totalPension = (payRun.total_employee_pension || 0) + (payRun.total_employer_pension || 0);
  if (totalPension > 0 && pensionAccount) {
    entries.push({
      accountId: pensionAccount.id,
      debit: null,
      credit: totalPension,
      description: `Pension liability - Period ${payRun.tax_period}`,
    });
  }

  // CR: Net Pay Liability
  if ((payRun.total_net_pay || 0) > 0) {
    entries.push({
      accountId: netPayAccount.id,
      debit: null,
      credit: payRun.total_net_pay,
      description: `Net wages payable - Period ${payRun.tax_period}`,
    });
  }

  // Post via canonical postToLedger RPC
  if (entries.length > 0) {
    const postingContext: PostingContext = {
      organizationId,
      entityType,
      entityId,
      transactionDate: paymentDate,
      reference: `PAYROLL-${payRun.tax_year}-P${payRun.tax_period}`,
      sourceType: "JOURNAL",
      sourceId: payRun.id,
      userId: payRun.approved_by || undefined,
    };

    const result = await postToLedger(postingContext, entries);
    if (!result.success) {
      console.error("Failed to create payroll ledger entries via postToLedger:", result.error);
    }
  }
}

/**
 * Approve pay run and create journal
 */
export async function approvePayRun(
  payRunId: string,
  userId: string
): Promise<ServiceResult> {
  try {
    const payRun = await getPayRun(payRunId);
    const currentStatus = payRun.status as PayRunStatus;
    
    if (!canTransition(currentStatus, PAY_RUN_STATUSES.APPROVED)) {
      return { 
        success: false, 
        error: `Cannot approve from status "${currentStatus}". Must be in "ready_for_review" status.` 
      };
    }

    // Only create journal if one doesn't exist (idempotent)
    let journalId = payRun.journal_id;
    if (!journalId) {
      // Create payroll journal
      const entityId = payRun.paye_schemes?.company_id || payRun.paye_schemes?.client_id;
      const entityType = payRun.paye_schemes?.company_id ? 'company' : 'client';
      
      const { data: journal, error: journalError } = await supabase
        .from("journals")
        .insert({
          organization_id: payRun.organization_id,
          company_id: entityType === 'company' ? entityId : null,
          client_id: entityType === 'client' ? entityId : null,
          journal_date: payRun.payment_date,
          reference: `PAYROLL-${payRun.tax_year}-P${payRun.tax_period}`,
          description: `Payroll journal for period ${payRun.tax_period} - ${payRun.tax_year}`,
          source: "payroll",
          source_id: payRunId,
          status: "posted",
        })
        .select("id")
        .single();

      if (journalError) {
        console.error("Failed to create journal:", journalError);
        // Don't block approval, but note the error
      } else {
        journalId = journal.id;
        
        // Create the ledger entries for the journal
        await createPayrollLedgerEntries(journalId, payRun, payRun.organization_id);
      }
    }

    const { error } = await supabase
      .from("pay_runs")
      .update({ 
        status: PAY_RUN_STATUSES.APPROVED,
        approved_at: new Date().toISOString(),
        approved_by: userId,
        journal_id: journalId,
      })
      .eq("id", payRunId);

    if (error) throw new Error(error.message);

    await logAudit({
      organizationId: payRun.organization_id,
      entityType: "pay_run",
      entityId: payRunId,
      action: "approve",
      fieldName: "status",
      oldValue: currentStatus,
      newValue: PAY_RUN_STATUSES.APPROVED,
      metadata: { journal_id: journalId },
    });

    return { success: true, data: { journalId } };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Submit RTI (FPS/EPS) to HMRC via filing spine
 * Per CTO: All filings go through filing spine → provider → edge function
 */
export async function submitPayRunRTI(
  payRunId: string,
  userId: string,
  submitFPS: boolean = true,
  submitEPS: boolean = false
): Promise<ServiceResult> {
  try {
    // Import filing service functions
    const { createRTIFilingFromPayRun, submitPayrollFiling } = await import("@/lib/filing-service");
    
    const payRun = await getPayRun(payRunId);
    const currentStatus = payRun.status as PayRunStatus;
    
    if (currentStatus !== PAY_RUN_STATUSES.APPROVED) {
      return { 
        success: false, 
        error: `Cannot submit RTI from status "${currentStatus}". Must be in "approved" status.` 
      };
    }

    const filingResults: { type: string; filingId: string; reference?: string; success: boolean }[] = [];

    // Create and submit FPS filing via filing spine
    if (submitFPS) {
      // Step 1: Create filing with status "draft"
      const createResult = await createRTIFilingFromPayRun(payRunId, 'RTI_FPS');
      if (!createResult.success || !createResult.filingId) {
        return { success: false, error: createResult.error || "Failed to create FPS filing" };
      }

      // Step 2: Submit via filing spine (draft → ready_to_file → provider → filed)
      const submitResult = await submitPayrollFiling(createResult.filingId, userId);
      
      filingResults.push({ 
        type: "RTI_FPS", 
        filingId: createResult.filingId, 
        reference: submitResult.filingReference,
        success: submitResult.success 
      });

      if (!submitResult.success) {
        return { success: false, error: submitResult.error || "FPS submission failed" };
      }
    }

    // Create and submit EPS filing via filing spine
    if (submitEPS) {
      const createResult = await createRTIFilingFromPayRun(payRunId, 'RTI_EPS');
      if (!createResult.success || !createResult.filingId) {
        return { success: false, error: createResult.error || "Failed to create EPS filing" };
      }

      const submitResult = await submitPayrollFiling(createResult.filingId, userId);
      
      filingResults.push({ 
        type: "RTI_EPS", 
        filingId: createResult.filingId,
        reference: submitResult.filingReference,
        success: submitResult.success 
      });

      if (!submitResult.success) {
        // FPS already submitted, but note EPS failure
        console.warn("EPS submission failed:", submitResult.error);
      }
    }

    // Update pay run status to submitted
    const { error: updateError } = await supabase
      .from("pay_runs")
      .update({ 
        status: PAY_RUN_STATUSES.SUBMITTED,
        fps_filing_id: filingResults.find(f => f.type === "RTI_FPS")?.filingId,
      })
      .eq("id", payRunId);

    if (updateError) throw new Error(updateError.message);

    await logAudit({
      organizationId: payRun.organization_id,
      entityType: "pay_run",
      entityId: payRunId,
      action: "submit_rti",
      fieldName: "status",
      oldValue: currentStatus,
      newValue: PAY_RUN_STATUSES.SUBMITTED,
      metadata: { filings: filingResults },
    });

    return { success: true, data: { filings: filingResults } };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Reopen an approved pay run
 */
export async function reopenPayRun(
  payRunId: string,
  userId: string,
  reason: string
): Promise<ServiceResult> {
  try {
    const payRun = await getPayRun(payRunId);
    const currentStatus = payRun.status as PayRunStatus;
    
    // Can only reopen approved pay runs (not submitted)
    if (currentStatus !== PAY_RUN_STATUSES.APPROVED) {
      return { 
        success: false, 
        error: `Cannot reopen from status "${currentStatus}". Only "approved" pay runs can be reopened.` 
      };
    }

    const { error } = await supabase
      .from("pay_runs")
      .update({ 
        status: PAY_RUN_STATUSES.CALCULATED,
        approved_at: null,
        approved_by: null,
        // Keep journal_id for audit trail but allow new journal on re-approval
      })
      .eq("id", payRunId);

    if (error) throw new Error(error.message);

    await logAudit({
      organizationId: payRun.organization_id,
      entityType: "pay_run",
      entityId: payRunId,
      action: "reopen",
      fieldName: "status",
      oldValue: currentStatus,
      newValue: PAY_RUN_STATUSES.CALCULATED,
      metadata: { reason, reopened_by: userId },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Check if a pay run is locked (approved or submitted)
 */
export function isPayRunLocked(status: PayRunStatus): boolean {
  return status === PAY_RUN_STATUSES.APPROVED || status === PAY_RUN_STATUSES.SUBMITTED;
}
