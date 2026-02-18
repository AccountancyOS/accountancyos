/**
 * FRS105 Accounts Editor — Main orchestrator for ACCOUNTS_FRS105 filings.
 * Reads/writes draft_schedule_data_json typed as AccountsDraftScheduleData.
 */
import { useState, useCallback, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle, Save } from "lucide-react";
import type { AccountsDraftScheduleData, FRS105BalanceSheetDraft } from "@/types/filing-schemas";
import { createDefaultDisclosures, createDefaultBalanceSheet, recomputeBalanceSheetTotals } from "@/lib/frs105-disclosure-engine";
import { BalanceSheetGrid } from "./BalanceSheetGrid";
import { DisclosureManager } from "./DisclosureManager";
import { DirectorsEditor } from "./DirectorsEditor";
import { ApprovalSection } from "./ApprovalSection";
import { IXBRLPreviewPanel } from "./IXBRLPreviewPanel";

interface FRS105AccountsEditorProps {
  draft: AccountsDraftScheduleData;
  onSave: (data: AccountsDraftScheduleData) => Promise<void>;
  readonly?: boolean;
  filingId: string;
  organizationId: string;
}

function ensureDraft(raw: any): AccountsDraftScheduleData {
  return {
    company: raw?.company || { company_name: '', company_number: '', period_start: '', period_end: '' },
    tb_source: raw?.tb_source || 'manual',
    balance_sheet: raw?.balance_sheet || createDefaultBalanceSheet(),
    prior_period: raw?.prior_period || undefined,
    disclosures: raw?.disclosures || createDefaultDisclosures(),
    directors: raw?.directors || [],
    approval: raw?.approval || { approved_by_board: false },
  };
}

export function FRS105AccountsEditor({ draft: rawDraft, onSave, readonly, filingId, organizationId }: FRS105AccountsEditorProps) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<AccountsDraftScheduleData>(() => ensureDraft(rawDraft));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(ensureDraft(rawDraft));
    setDirty(false);
  }, [rawDraft]);

  const update = useCallback((patch: Partial<AccountsDraftScheduleData>) => {
    setDraft(prev => ({ ...prev, ...patch }));
    setDirty(true);
  }, []);

  const updateBalanceSheet = useCallback((bs: FRS105BalanceSheetDraft) => {
    update({ balance_sheet: recomputeBalanceSheetTotals(bs) });
  }, [update]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      setDirty(false);
      toast({ title: "Saved" });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const bs = draft.balance_sheet;
  const balances = Math.abs((bs?.net_assets ?? 0) - (bs?.total_equity ?? 0)) <= 0.01;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>FRS 105 Micro-entity Accounts</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {draft.company.company_name} ({draft.company.company_number})
            {draft.company.period_start && ` • ${draft.company.period_start} to ${draft.company.period_end}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {balances ? (
            <Badge variant="secondary" className="bg-green-500/10 text-green-700">
              <CheckCircle className="h-3 w-3 mr-1" /> Balances
            </Badge>
          ) : (
            <Badge variant="destructive">
              <AlertTriangle className="h-3 w-3 mr-1" /> Imbalanced
            </Badge>
          )}
          {!readonly && (
            <Button onClick={handleSave} disabled={saving || !dirty} size="sm">
              <Save className="h-4 w-4 mr-1" />
              {saving ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="balance_sheet">
          <TabsList className="mb-4">
            <TabsTrigger value="balance_sheet">Balance Sheet</TabsTrigger>
            <TabsTrigger value="disclosures">Disclosures</TabsTrigger>
            <TabsTrigger value="directors">Directors</TabsTrigger>
            <TabsTrigger value="approval">Approval</TabsTrigger>
            <TabsTrigger value="ixbrl">iXBRL</TabsTrigger>
          </TabsList>

          <TabsContent value="balance_sheet">
            <BalanceSheetGrid
              balanceSheet={draft.balance_sheet}
              priorPeriod={draft.prior_period}
              onChange={updateBalanceSheet}
              readonly={!!readonly}
            />
          </TabsContent>

          <TabsContent value="disclosures">
            <DisclosureManager
              disclosures={draft.disclosures}
              onChange={(d) => update({ disclosures: d })}
              readonly={!!readonly}
            />
          </TabsContent>

          <TabsContent value="directors">
            <DirectorsEditor
              directors={draft.directors}
              onChange={(d) => update({ directors: d })}
              readonly={!!readonly}
            />
          </TabsContent>

          <TabsContent value="approval">
            <ApprovalSection
              approval={draft.approval}
              onChange={(a) => update({ approval: a })}
              readonly={!!readonly}
            />
          </TabsContent>

          <TabsContent value="ixbrl">
            <IXBRLPreviewPanel
              draft={draft}
              filingId={filingId}
              organizationId={organizationId}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
