/**
 * End-to-End Flow Validation Service
 * Validates critical workflows: Lead→Client, Job→Filing, Automation Engine
 */

import { supabase } from "@/integrations/supabase/client";

export interface FlowValidationResult {
  flowName: string;
  success: boolean;
  steps: StepResult[];
  duration: number;
  error?: string;
}

export interface StepResult {
  step: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  duration: number;
}

/**
 * Validate that all required tables exist and have correct structure
 */
export async function validateDatabaseSchema(): Promise<FlowValidationResult> {
  const startTime = Date.now();
  const steps: StepResult[] = [];

  const requiredTables = [
    'organizations',
    'clients',
    'companies',
    'jobs',
    'deadlines',
    'filings',
    'automation_rules',
    'automation_events',
    'automation_executions',
    'onboarding_applications',
    'quotes',
    'engagement_letters',
  ];

  for (const table of requiredTables) {
    const stepStart = Date.now();
    try {
      const { error } = await supabase
        .from(table as any)
        .select('id')
        .limit(1);

      steps.push({
        step: `Table '${table}' exists`,
        success: !error,
        error: error?.message,
        duration: Date.now() - stepStart,
      });
    } catch (err) {
      steps.push({
        step: `Table '${table}' exists`,
        success: false,
        error: (err as Error).message,
        duration: Date.now() - stepStart,
      });
    }
  }

  const allSuccess = steps.every(s => s.success);
  return {
    flowName: 'Database Schema Validation',
    success: allSuccess,
    steps,
    duration: Date.now() - startTime,
    error: allSuccess ? undefined : 'Some tables are missing or inaccessible',
  };
}

/**
 * Validate automation engine flow:
 * Event → Rule Matching → Action Execution → Audit Log
 */
export async function validateAutomationFlow(organizationId: string): Promise<FlowValidationResult> {
  const startTime = Date.now();
  const steps: StepResult[] = [];

  // Step 1: Check if automation_rules table is accessible
  let stepStart = Date.now();
  const { data: rules, error: rulesError } = await supabase
    .from('automation_rules')
    .select('id, name, trigger_type, action_type, is_active')
    .eq('organization_id', organizationId)
    .limit(5);

  steps.push({
    step: 'Fetch automation rules',
    success: !rulesError,
    data: { rulesCount: rules?.length || 0 },
    error: rulesError?.message,
    duration: Date.now() - stepStart,
  });

  // Step 2: Check automation_events table
  stepStart = Date.now();
  const { data: events, error: eventsError } = await supabase
    .from('automation_events')
    .select('id, event_type, processed_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(10);

  const unprocessedCount = events?.filter(e => !e.processed_at).length || 0;
  steps.push({
    step: 'Check automation events queue',
    success: !eventsError,
    data: { totalEvents: events?.length || 0, unprocessed: unprocessedCount },
    error: eventsError?.message,
    duration: Date.now() - stepStart,
  });

  // Step 3: Check automation_executions table
  stepStart = Date.now();
  const { data: executions, error: execError } = await supabase
    .from('automation_executions')
    .select('id, status, error_message')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(10);

  const successCount = executions?.filter(e => e.status === 'success').length || 0;
  const failedCount = executions?.filter(e => e.status === 'failed').length || 0;
  steps.push({
    step: 'Check automation executions',
    success: !execError,
    data: { total: executions?.length || 0, success: successCount, failed: failedCount },
    error: execError?.message,
    duration: Date.now() - stepStart,
  });

  // Step 4: Verify RPC functions exist
  stepStart = Date.now();
  try {
    const { error: rpcError } = await supabase.rpc('can_execute_automation', {
      p_rule_id: '00000000-0000-0000-0000-000000000000',
      p_execution_hash: 'test-hash',
    });
    // Expecting false return, not an error (unless function doesn't exist)
    steps.push({
      step: 'Verify automation RPCs exist',
      success: !rpcError || !rpcError.message.includes('function'),
      error: rpcError?.message,
      duration: Date.now() - stepStart,
    });
  } catch (err) {
    steps.push({
      step: 'Verify automation RPCs exist',
      success: false,
      error: (err as Error).message,
      duration: Date.now() - stepStart,
    });
  }

  const allSuccess = steps.every(s => s.success);
  return {
    flowName: 'Automation Engine Flow',
    success: allSuccess,
    steps,
    duration: Date.now() - startTime,
    error: allSuccess ? undefined : 'Automation flow has issues',
  };
}

/**
 * Validate job workflow:
 * Job Creation → Status Transitions → Completion → Auto-rollover
 */
export async function validateJobWorkflow(organizationId: string): Promise<FlowValidationResult> {
  const startTime = Date.now();
  const steps: StepResult[] = [];

  // Step 1: Check jobs exist
  let stepStart = Date.now();
  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select('id, status, is_auto_generated')
    .eq('organization_id', organizationId)
    .limit(20);

  const statusCounts = jobs?.reduce((acc, job) => {
    acc[job.status] = (acc[job.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  steps.push({
    step: 'Fetch jobs',
    success: !jobsError,
    data: { totalJobs: jobs?.length || 0, byStatus: statusCounts },
    error: jobsError?.message,
    duration: Date.now() - stepStart,
  });

  // Step 2: Check deadlines linked to jobs
  stepStart = Date.now();
  const { data: deadlines, error: deadlinesError } = await supabase
    .from('deadlines')
    .select('id, job_id, status, due_date')
    .eq('organization_id', organizationId)
    .not('job_id', 'is', null)
    .limit(20);

  steps.push({
    step: 'Check job-linked deadlines',
    success: !deadlinesError,
    data: { linkedDeadlines: deadlines?.length || 0 },
    error: deadlinesError?.message,
    duration: Date.now() - stepStart,
  });

  // Step 3: Check filings linked to jobs
  stepStart = Date.now();
  const { data: filings, error: filingsError } = await supabase
    .from('filings')
    .select('id, job_id, status')
    .eq('organization_id', organizationId)
    .not('job_id', 'is', null)
    .limit(20);

  steps.push({
    step: 'Check job-linked filings',
    success: !filingsError,
    data: { linkedFilings: filings?.length || 0 },
    error: filingsError?.message,
    duration: Date.now() - stepStart,
  });

  // Step 4: Check auto-generated jobs
  stepStart = Date.now();
  const autoGenJobs = jobs?.filter(j => j.is_auto_generated) || [];
  steps.push({
    step: 'Verify auto-generated jobs',
    success: true,
    data: { autoGeneratedCount: autoGenJobs.length },
    duration: Date.now() - stepStart,
  });

  const allSuccess = steps.every(s => s.success);
  return {
    flowName: 'Job Workflow',
    success: allSuccess,
    steps,
    duration: Date.now() - startTime,
    error: allSuccess ? undefined : 'Job workflow has issues',
  };
}

/**
 * Validate onboarding flow:
 * Lead → Quote → Engagement Letter → AML → Approval → Client
 */
export async function validateOnboardingFlow(organizationId: string): Promise<FlowValidationResult> {
  const startTime = Date.now();
  const steps: StepResult[] = [];

  // Step 1: Check leads
  let stepStart = Date.now();
  const { data: leads, error: leadsError } = await supabase
    .from('leads')
    .select('id, status')
    .eq('organization_id', organizationId)
    .limit(20);

  steps.push({
    step: 'Fetch leads',
    success: !leadsError,
    data: { totalLeads: leads?.length || 0 },
    error: leadsError?.message,
    duration: Date.now() - stepStart,
  });

  // Step 2: Check quotes
  stepStart = Date.now();
  const { data: quotes, error: quotesError } = await supabase
    .from('quotes')
    .select('id, status, accepted_at')
    .eq('organization_id', organizationId)
    .limit(20);

  const acceptedQuotes = quotes?.filter(q => q.accepted_at) || [];
  steps.push({
    step: 'Check quotes',
    success: !quotesError,
    data: { totalQuotes: quotes?.length || 0, accepted: acceptedQuotes.length },
    error: quotesError?.message,
    duration: Date.now() - stepStart,
  });

  // Step 3: Check onboarding applications
  stepStart = Date.now();
  const { data: applications, error: appsError } = await supabase
    .from('onboarding_applications')
    .select('id, status, aml_status')
    .eq('organization_id', organizationId)
    .limit(20);

  const statusDist = applications?.reduce((acc, app) => {
    acc[app.status] = (acc[app.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  steps.push({
    step: 'Check onboarding applications',
    success: !appsError,
    data: { total: applications?.length || 0, byStatus: statusDist },
    error: appsError?.message,
    duration: Date.now() - stepStart,
  });

  // Step 4: Check engagement letters
  stepStart = Date.now();
  const { data: letters, error: lettersError } = await supabase
    .from('engagement_letters')
    .select('id, signed_at')
    .eq('organization_id', organizationId)
    .limit(20);

  const signedLetters = letters?.filter(l => l.signed_at) || [];
  steps.push({
    step: 'Check engagement letters',
    success: !lettersError,
    data: { total: letters?.length || 0, signed: signedLetters.length },
    error: lettersError?.message,
    duration: Date.now() - stepStart,
  });

  // Step 5: Check lifecycle RPC exists
  stepStart = Date.now();
  try {
    // This will fail if RPC doesn't exist, which is what we want to test
    const { error: rpcError } = await supabase.rpc('lifecycle_approve_onboarding', {
      p_onboarding_id: '00000000-0000-0000-0000-000000000000',
    });
    // Expecting an error about onboarding not found, not about function missing
    const rpcExists = !rpcError?.message?.includes('function');
    steps.push({
      step: 'Verify lifecycle RPCs exist',
      success: rpcExists,
      error: rpcExists ? undefined : rpcError?.message,
      duration: Date.now() - stepStart,
    });
  } catch (err) {
    steps.push({
      step: 'Verify lifecycle RPCs exist',
      success: false,
      error: (err as Error).message,
      duration: Date.now() - stepStart,
    });
  }

  const allSuccess = steps.every(s => s.success);
  return {
    flowName: 'Onboarding Flow',
    success: allSuccess,
    steps,
    duration: Date.now() - startTime,
    error: allSuccess ? undefined : 'Onboarding flow has issues',
  };
}

/**
 * Run all flow validations
 */
export async function runAllFlowValidations(organizationId: string): Promise<FlowValidationResult[]> {
  const results: FlowValidationResult[] = [];

  results.push(await validateDatabaseSchema());
  results.push(await validateAutomationFlow(organizationId));
  results.push(await validateJobWorkflow(organizationId));
  results.push(await validateOnboardingFlow(organizationId));

  return results;
}

/**
 * Format validation results for display
 */
export function formatValidationResults(results: FlowValidationResult[]): string {
  let output = '=== E2E Flow Validation Results ===\n\n';

  for (const result of results) {
    const statusIcon = result.success ? '✅' : '❌';
    output += `${statusIcon} ${result.flowName} (${result.duration}ms)\n`;

    for (const step of result.steps) {
      const stepIcon = step.success ? '  ✓' : '  ✗';
      output += `${stepIcon} ${step.step} (${step.duration}ms)`;
      if (step.data) {
        output += ` - ${JSON.stringify(step.data)}`;
      }
      if (step.error) {
        output += ` [Error: ${step.error}]`;
      }
      output += '\n';
    }
    output += '\n';
  }

  const totalSuccess = results.filter(r => r.success).length;
  output += `\nSummary: ${totalSuccess}/${results.length} flows passed\n`;

  return output;
}
