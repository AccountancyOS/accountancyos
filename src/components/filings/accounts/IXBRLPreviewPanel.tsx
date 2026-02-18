/**
 * iXBRL Preview Panel — Sandboxed iframe preview with generation + download.
 * Hard-gates on disclosure completeness before generation.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Download, Eye, Loader2, AlertTriangle } from "lucide-react";
import type { AccountsDraftScheduleData } from "@/types/filing-schemas";
import { draftToFlatBalanceSheet, priorPeriodToFlatBalanceSheet } from "@/lib/frs105-accounts-model";
import type { FRS105AccountsModel } from "@/lib/frs105-accounts-model";
import { generateFRS105iXBRL, generateArtefactHash, saveFilingArtefact } from "@/lib/ixbrl-generator";

interface IXBRLPreviewPanelProps {
  draft: AccountsDraftScheduleData;
  filingId: string;
  organizationId: string;
}

export function IXBRLPreviewPanel({ draft, filingId, organizationId }: IXBRLPreviewPanelProps) {
  const { toast } = useToast();
  const [html, setHtml] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      // Build canonical model from draft
      const model: FRS105AccountsModel = {
        company_id: '',
        company_name: draft.company.company_name,
        company_number: draft.company.company_number,
        period_start: draft.company.period_start,
        period_end: draft.company.period_end,
        balance_sheet: draftToFlatBalanceSheet(draft.balance_sheet),
        prior_period_balance_sheet: draft.prior_period ? priorPeriodToFlatBalanceSheet(draft.prior_period) : null,
        disclosures: draft.disclosures,
        director_approval: {
          approved_by_board: draft.approval.approved_by_board,
          approval_date: draft.approval.approval_date || new Date().toISOString().split('T')[0],
          signatory_name: draft.approval.signatory_name || '',
          signatory_position: draft.approval.signatory_role || 'Director',
        },
        contexts: {
          current_period_instant: draft.company.period_end,
          current_period_duration_start: draft.company.period_start,
          current_period_duration_end: draft.company.period_end,
          ...(draft.prior_period ? {
            prior_period_instant: draft.prior_period.period_end,
            prior_period_duration_start: draft.prior_period.period_start,
            prior_period_duration_end: draft.prior_period.period_end,
          } : {}),
        },
        units: { currency: 'GBP', decimals: 0 },
        is_dormant: false,
        has_audit_exemption: true,
        taxonomy_version: 'FRS105-2022',
        generator_version: '2.0.0',
        snapshot_hash: '',
      };

      // This will throw if disclosures are incomplete (hard gate)
      const ixbrlHtml = generateFRS105iXBRL(model);
      const artefactHash = await generateArtefactHash(ixbrlHtml);

      // Save artefact
      await saveFilingArtefact(organizationId, filingId, 'IXBRL_ACCOUNTS', ixbrlHtml, 'FRS105-2022');

      setHtml(ixbrlHtml);
      setHash(artefactHash);
      toast({ title: "iXBRL generated and saved" });
    } catch (err: any) {
      setError(err.message);
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${draft.company.company_number}_FRS105_accounts.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button onClick={handleGenerate} disabled={generating}>
          {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
          Generate iXBRL
        </Button>
        {html && (
          <Button variant="outline" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-1" /> Download
          </Button>
        )}
        {hash && (
          <Badge variant="outline" className="font-mono text-xs">
            SHA-256: {hash.substring(0, 16)}…
          </Badge>
        )}
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {html && (
        <iframe
          srcDoc={html}
          sandbox="allow-same-origin"
          className="w-full border rounded-lg bg-white"
          style={{ height: '600px' }}
          title="iXBRL Preview"
        />
      )}
    </div>
  );
}
