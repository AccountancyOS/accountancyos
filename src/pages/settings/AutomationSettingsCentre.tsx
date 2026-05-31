import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Link } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";

type CategoryDef = { key: string; label: string; description: string; sales: boolean };

const CATEGORIES: CategoryDef[] = [
  { key: "crm_sales", label: "CRM & Sales", description: "Lead follow-up, quote chasers, dormant leads.", sales: true },
  { key: "onboarding", label: "Onboarding", description: "Welcome, portal invite, onboarding checklist.", sales: false },
  { key: "engagement_letters", label: "Engagement Letters", description: "Send, chase, re-sign on fee change.", sales: false },
  { key: "kyc_aml", label: "KYC / AML", description: "ID verification and source-of-funds checks.", sales: false },
  { key: "hmrc_authorisation", label: "HMRC Authorisation", description: "Agent authorisation requests and chasers.", sales: false },
  { key: "services", label: "Services", description: "Service activate / deactivate / fee change.", sales: false },
  { key: "jobs_records", label: "Jobs & Records", description: "Records requests, partial-records chasers.", sales: false },
  { key: "questionnaires", label: "Questionnaires", description: "Send and chase client questionnaires.", sales: false },
  { key: "workpapers", label: "Workpapers", description: "Workpaper create / approve / lock notifications.", sales: false },
  { key: "deadlines_payments", label: "Deadlines & Payments", description: "Deadline risk, payment reminders.", sales: false },
  { key: "documents_signatures", label: "Documents & Signatures", description: "Upload, signature requests, archive.", sales: false },
  { key: "messages_slas", label: "Messages & SLAs", description: "Inbound message SLA, response chasers.", sales: false },
  { key: "billing_revenue", label: "Billing & Revenue", description: "Recurring invoices, payment failed, revenue events.", sales: false },
  { key: "compliance_suppression", label: "Compliance / Suppression", description: "Unsubscribes, suppressions, audit log.", sales: false },
];

export default function AutomationSettingsCentre() {
  const { organization } = useOrganization();
  const [seedReport, setSeedReport] = useState<any>(null);
  const [counts, setCounts] = useState<Record<string, { rules: number; chasers: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organization?.id) return;
    (async () => {
      setLoading(true);
      const [{ data: rules }, { data: chasers }, { data: report }] = await Promise.all([
        supabase.from("automation_rules").select("id, category").eq("organization_id", organization.id),
        supabase.from("automation_chaser_policies").select("id, category").eq("organization_id", organization.id),
        supabase.rpc("seed_org_automation_defaults", { p_org_id: organization.id, p_dry_run: true }),
      ]);
      const agg: Record<string, { rules: number; chasers: number }> = {};
      CATEGORIES.forEach((c) => (agg[c.key] = { rules: 0, chasers: 0 }));
      rules?.forEach((r: any) => { if (r.category && agg[r.category]) agg[r.category].rules++; });
      chasers?.forEach((c: any) => { if (c.category && agg[c.category]) agg[c.category].chasers++; });
      setCounts(agg);
      setSeedReport(report);
      setLoading(false);
    })();
  }, [organization?.id]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Automation Settings Centre</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure every automation across CRM, onboarding, jobs, deadlines and billing in one place.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/automations">Advanced (Rules, Workflows, Chasers)</Link>
        </Button>
      </div>

      {seedReport && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="flex-row items-start gap-3 space-y-0">
            <ShieldAlert className="h-5 w-5 text-amber-500 mt-0.5" />
            <div className="flex-1">
              <CardTitle className="text-base">Migration Review</CardTitle>
              <CardDescription>
                {seedReport.rule_templates_available} system rule templates available ·{" "}
                {seedReport.existing_rules} rules · {seedReport.existing_chaser_policies} chaser policies ·{" "}
                {seedReport.existing_templates} message templates already in your practice.
                <strong className="block mt-2 text-foreground">
                  {seedReport.historic_emails_to_be_queued} historic emails will be queued. {seedReport.historic_records_to_be_activated} historic records will be activated.
                </strong>
                <span className="block mt-1">
                  External-facing automations default to <code>scope = new_records</code> and{" "}
                  <code>send_mode = draft</code>. Nothing will be sent to historic clients without explicit confirmation.
                </span>
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading categories…
        </div>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {CATEGORIES.map((cat) => {
            const c = counts[cat.key] ?? { rules: 0, chasers: 0 };
            return (
              <AccordionItem value={cat.key} key={cat.key} className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3 text-left">
                    <span className="font-medium">{cat.label}</span>
                    {cat.sales ? (
                      <Badge variant="outline" className="border-orange-500/40 text-orange-500">Sales</Badge>
                    ) : (
                      <Badge variant="outline">Service</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {c.rules} rules · {c.chasers} chasers
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-sm text-muted-foreground mb-3">{cat.description}</p>
                  <div className="text-xs text-muted-foreground">
                    Phase 1 ships the safety layer (scope, pause, suppression, idempotency, audit).
                    Individual automations for this category arrive in subsequent phases.
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}