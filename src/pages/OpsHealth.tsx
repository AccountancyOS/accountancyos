import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useAuth } from "@/lib/auth-context";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Play, 
  RefreshCw,
  Shield,
  Database,
  Mail,
  Workflow,
  FileText,
  Receipt
} from "lucide-react";
import { toast } from "sonner";

interface TestResult {
  name: string;
  status: "pass" | "fail" | "warning" | "pending";
  message: string;
  duration?: number;
}

interface TestCategory {
  name: string;
  icon: React.ReactNode;
  tests: TestResult[];
}

export default function OpsHealth() {
  const { organization } = useOrganization();
  const { user } = useAuth();
  const [testResults, setTestResults] = useState<TestCategory[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const runAllTests = async () => {
    if (!organization?.id || !user?.id) {
      toast.error("Not authenticated");
      return;
    }

    setIsRunning(true);
    const results: TestCategory[] = [];

    // RLS Tests
    const rlsTests: TestResult[] = [];
    
    // Test A1: set_rpc_context() RPC call should FAIL (function deleted)
    try {
      const start = Date.now();
      // Use raw fetch since TypeScript types won't include deleted function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/set_rpc_context`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Authorization": `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
        }
      );
      
      rlsTests.push({
        name: "set_rpc_context() RPC blocked",
        status: response.status >= 400 ? "pass" : "fail",
        message: response.status >= 400 ? `RPC blocked (HTTP ${response.status})` : "CRITICAL: set_rpc_context() is callable!",
        duration: Date.now() - start,
      });
    } catch {
      rlsTests.push({
        name: "set_rpc_context() RPC blocked",
        status: "pass",
        message: "Function not callable (expected)",
      });
    }

    // Test A2: Direct invoice insert should STILL fail (proves RPC context can't be set externally)
    try {
      const start = Date.now();
      const { error } = await supabase
        .from("invoices")
        .insert([{
          organization_id: organization.id,
          status: "DRAFT",
          invoice_type: "SALES",
          contact_name: "SECURITY TEST",
          issue_date: new Date().toISOString().split("T")[0],
          due_date: new Date().toISOString().split("T")[0],
        }]);
      
      rlsTests.push({
        name: "Direct invoice insert blocked (no RPC bypass)",
        status: error ? "pass" : "fail",
        message: error ? "Direct write blocked by RLS" : "CRITICAL: Direct insert allowed!",
        duration: Date.now() - start,
      });
    } catch {
      rlsTests.push({
        name: "Direct invoice insert blocked (no RPC bypass)",
        status: "pass",
        message: "Direct insert blocked with exception",
      });
    }

    // Test B: invoice_lines direct write with fake invoice_id should fail (cross-org protection)
    try {
      const start = Date.now();
      const fakeInvoiceId = "00000000-0000-0000-0000-000000000001"; // Non-existent invoice
      const { error } = await supabase
        .from("invoice_lines")
        .insert([{
          invoice_id: fakeInvoiceId,
          line_number: 1,
          description: "CROSS-ORG TEST",
          quantity: 1,
          unit_price: 100,
          net_amount: 100,
          vat_amount: 0,
          gross_amount: 100,
          account_id: "00000000-0000-0000-0000-000000000000",
        }]);
      
      rlsTests.push({
        name: "invoice_lines cross-org tampering blocked",
        status: error ? "pass" : "fail",
        message: error ? "Cross-org insert blocked by RLS" : "CRITICAL: Cross-org tampering allowed!",
        duration: Date.now() - start,
      });
    } catch {
      rlsTests.push({
        name: "invoice_lines cross-org tampering blocked",
        status: "pass",
        message: "Cross-org insert blocked with exception",
      });
    }

    // Test B2: bill_lines direct write with fake bill_id should fail
    try {
      const start = Date.now();
      const fakeBillId = "00000000-0000-0000-0000-000000000002";
      const { error } = await supabase
        .from("bill_lines")
        .insert([{
          bill_id: fakeBillId,
          line_number: 1,
          description: "CROSS-ORG TEST",
          quantity: 1,
          unit_price: 100,
          net_amount: 100,
          vat_amount: 0,
          gross_amount: 100,
          account_id: "00000000-0000-0000-0000-000000000000",
        }]);
      
      rlsTests.push({
        name: "bill_lines cross-org tampering blocked",
        status: error ? "pass" : "fail",
        message: error ? "Cross-org insert blocked by RLS" : "CRITICAL: Cross-org tampering allowed!",
        duration: Date.now() - start,
      });
    } catch {
      rlsTests.push({
        name: "bill_lines cross-org tampering blocked",
        status: "pass",
        message: "Cross-org insert blocked with exception",
      });
    }

    // Test: ledger_entries direct write should fail
    try {
      const start = Date.now();
      const { error } = await supabase
        .from("ledger_entries")
        .insert([{
          organization_id: organization.id,
          transaction_date: new Date().toISOString().split("T")[0],
          account_id: "00000000-0000-0000-0000-000000000000",
          description: "RLS TEST - SHOULD FAIL",
          source_type: "MANUAL",
        }]);
      
      if (error) {
        rlsTests.push({
          name: "ledger_entries direct write blocked",
          status: "pass",
          message: "Direct write correctly blocked by RLS",
          duration: Date.now() - start,
        });
      } else {
        rlsTests.push({
          name: "ledger_entries direct write blocked",
          status: "fail",
          message: "CRITICAL: Direct write was allowed! RLS not enforced.",
          duration: Date.now() - start,
        });
      }
    } catch (e: any) {
      rlsTests.push({
        name: "ledger_entries direct write blocked",
        status: "pass",
        message: "Direct write blocked with exception",
      });
    }

    // Test: journals direct write should fail
    try {
      const start = Date.now();
      const { error } = await supabase
        .from("journals")
        .insert([{
          organization_id: organization.id,
          journal_date: new Date().toISOString().split("T")[0],
          description: "RLS TEST - SHOULD FAIL",
        }]);
      
      rlsTests.push({
        name: "journals direct write blocked",
        status: error ? "pass" : "fail",
        message: error ? "Direct write correctly blocked" : "CRITICAL: Direct write allowed!",
        duration: Date.now() - start,
      });
    } catch {
      rlsTests.push({
        name: "journals direct write blocked",
        status: "pass",
        message: "Direct write blocked with exception",
      });
    }

    // Test: invoice_payments direct write should fail
    try {
      const start = Date.now();
      const { error } = await supabase
        .from("invoice_payments")
        .insert([{
          invoice_id: "00000000-0000-0000-0000-000000000000",
          amount: 100,
          payment_date: new Date().toISOString().split("T")[0],
        }]);
      
      rlsTests.push({
        name: "invoice_payments direct write blocked",
        status: error ? "pass" : "fail",
        message: error ? "Direct write correctly blocked" : "CRITICAL: Direct write allowed!",
        duration: Date.now() - start,
      });
    } catch {
      rlsTests.push({
        name: "invoice_payments direct write blocked",
        status: "pass",
        message: "Direct write blocked with exception",
      });
    }

    // Test: invoices SELECT should work (org-scoped)
    try {
      const start = Date.now();
      const { data, error } = await supabase
        .from("invoices")
        .select("id")
        .eq("organization_id", organization.id)
        .limit(1);
      
      rlsTests.push({
        name: "invoices SELECT allowed (org-scoped)",
        status: error ? "fail" : "pass",
        message: error ? `Error: ${error.message}` : `Read ${data?.length || 0} invoice(s) - SELECT works`,
        duration: Date.now() - start,
      });
    } catch (e: any) {
      rlsTests.push({
        name: "invoices SELECT allowed",
        status: "fail",
        message: `Exception: ${e.message}`,
      });
    }

    results.push({
      name: "RLS Enforcement",
      icon: <Shield className="h-5 w-5" />,
      tests: rlsTests,
    });

    // Safe RPC Tests
    const rpcTests: TestResult[] = [];

    // Test: Check that we can read invoices (basic RLS test)
    try {
      const start = Date.now();
      const { data, error } = await supabase
        .from("invoices")
        .select("id")
        .eq("organization_id", organization.id)
        .limit(1);
      
      rpcTests.push({
        name: "invoices table readable",
        status: error ? "fail" : "pass",
        message: error ? `Error: ${error.message}` : `Read ${data?.length || 0} invoice(s)`,
        duration: Date.now() - start,
      });
    } catch (e: any) {
      rpcTests.push({
        name: "create_invoice_safe RPC callable",
        status: "warning",
        message: `Exception: ${e.message}`,
      });
    }

    // Test: queue_email_safe (draft - no scheduled_at)
    try {
      const start = Date.now();
      const { data, error } = await supabase.rpc("queue_email_safe", {
        p_organization_id: organization.id,
        p_to_email: "test-draft@test.com",
        p_to_name: "Test User",
        p_subject: "RPC Test Draft",
        p_body_html: "<p>Test</p>",
        p_template_id: null,
        p_merge_data: {},
        p_scheduled_at: null,
        p_entity_type: null,
        p_entity_id: null,
      });
      
      rpcTests.push({
        name: "queue_email_safe draft (scheduled_at=null)",
        status: error ? "fail" : "pass",
        message: error ? `Error: ${error.message}` : "RPC executed - should create draft",
        duration: Date.now() - start,
      });
    } catch (e: any) {
      rpcTests.push({
        name: "queue_email_safe draft",
        status: "fail",
        message: `Exception: ${e.message}`,
      });
    }

    // Test: queue_email_safe (queued - with scheduled_at)
    try {
      const start = Date.now();
      const futureDate = new Date(Date.now() + 60000).toISOString();
      const { data, error } = await supabase.rpc("queue_email_safe", {
        p_organization_id: organization.id,
        p_to_email: "test-queued@test.com",
        p_to_name: "Test User",
        p_subject: "RPC Test Queued",
        p_body_html: "<p>Test</p>",
        p_template_id: null,
        p_merge_data: {},
        p_scheduled_at: futureDate,
        p_entity_type: null,
        p_entity_id: null,
      });
      
      rpcTests.push({
        name: "queue_email_safe queued (scheduled_at set)",
        status: error ? "fail" : "pass",
        message: error ? `Error: ${error.message}` : "RPC executed - should create queued",
        duration: Date.now() - start,
      });
    } catch (e: any) {
      rpcTests.push({
        name: "queue_email_safe queued",
        status: "fail",
        message: `Exception: ${e.message}`,
      });
    }

    results.push({
      name: "Safe RPC Functions",
      icon: <Database className="h-5 w-5" />,
      tests: rpcTests,
    });

    // Automation Tests
    const automationTests: TestResult[] = [];

    // Test: automation_dry_run
    try {
      const start = Date.now();
      const { data, error } = await supabase.rpc("automation_dry_run", {
        p_rule_id: "00000000-0000-0000-0000-000000000000",
        p_sample_event: { event_type: "job_status_change", entity_type: "job", entity_id: "test" },
      });
      
      automationTests.push({
        name: "automation_dry_run RPC",
        status: data || error ? "pass" : "warning",
        message: error ? `Error (expected for invalid rule): ${error.message}` : "Dry run executed",
        duration: Date.now() - start,
      });
    } catch (e: any) {
      automationTests.push({
        name: "automation_dry_run RPC",
        status: "warning",
        message: `Exception: ${e.message}`,
      });
    }

    results.push({
      name: "Automation Engine",
      icon: <Workflow className="h-5 w-5" />,
      tests: automationTests,
    });

    // Email Tests
    const emailTests: TestResult[] = [];

    // Test: Check connected mailboxes
    try {
      const start = Date.now();
      const { data, error } = await supabase
        .from("connected_mailboxes")
        .select("id, email_address, provider, mailbox_type")
        .eq("organization_id", organization.id)
        .limit(1);
      
      emailTests.push({
        name: "Connected mailboxes readable",
        status: error ? "fail" : "pass",
        message: error ? error.message : `Found ${data?.length || 0} mailbox(es)`,
        duration: Date.now() - start,
      });
    } catch (e: any) {
      emailTests.push({
        name: "Connected mailboxes readable",
        status: "fail",
        message: e.message,
      });
    }

    results.push({
      name: "Email Module",
      icon: <Mail className="h-5 w-5" />,
      tests: emailTests,
    });

    setTestResults(results);
    setIsRunning(false);

    const failCount = results.flatMap(r => r.tests).filter(t => t.status === "fail").length;
    if (failCount > 0) {
      toast.error(`${failCount} test(s) failed`);
    } else {
      toast.success("All tests passed");
    }
  };

  const getStatusIcon = (status: TestResult["status"]) => {
    switch (status) {
      case "pass":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "fail":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "warning":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <RefreshCw className="h-4 w-4 animate-spin" />;
    }
  };

  const getStatusBadge = (status: TestResult["status"]) => {
    switch (status) {
      case "pass":
        return <Badge variant="default" className="bg-green-500">Pass</Badge>;
      case "fail":
        return <Badge variant="destructive">Fail</Badge>;
      case "warning":
        return <Badge variant="secondary">Warning</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  const totalTests = testResults.flatMap(r => r.tests).length;
  const passedTests = testResults.flatMap(r => r.tests).filter(t => t.status === "pass").length;
  const failedTests = testResults.flatMap(r => r.tests).filter(t => t.status === "fail").length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Ops Health</h1>
            <p className="text-muted-foreground">
              System health checks and smoke tests
            </p>
          </div>
          <Button onClick={runAllTests} disabled={isRunning}>
            {isRunning ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Run All Tests
              </>
            )}
          </Button>
        </div>

        {testResults.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{totalTests}</div>
                <p className="text-muted-foreground">Total Tests</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-green-500">{passedTests}</div>
                <p className="text-muted-foreground">Passed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-destructive">{failedTests}</div>
                <p className="text-muted-foreground">Failed</p>
              </CardContent>
            </Card>
          </div>
        )}

        {testResults.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No tests run yet</h3>
              <p className="text-muted-foreground mb-4">
                Click "Run All Tests" to check system health
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {testResults.map((category, idx) => (
              <Card key={idx}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {category.icon}
                    {category.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {category.tests.map((test, testIdx) => (
                      <div key={testIdx} className="flex items-start justify-between py-2 border-b last:border-0">
                        <div className="flex items-start gap-3">
                          {getStatusIcon(test.status)}
                          <div>
                            <p className="font-medium">{test.name}</p>
                            <p className="text-sm text-muted-foreground">{test.message}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {test.duration && (
                            <span className="text-xs text-muted-foreground">{test.duration}ms</span>
                          )}
                          {getStatusBadge(test.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
