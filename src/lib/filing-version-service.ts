// Filing Version Service
// Creates immutable snapshots from draft data + TB + COA state, increments version

import { supabase } from "@/integrations/supabase/client";
import { computeSnapshotHash } from "@/lib/filing-snapshot-service";
import { logAudit } from "@/lib/audit-service";

export interface CreateVersionParams {
  filingId: string;
  lockReason?: string;
  includeTbSnapshot?: boolean;
  includeCoaSnapshot?: boolean;
}

export interface VersionResult {
  success: boolean;
  snapshotId?: string;
  version?: number;
  error?: string;
}

/**
 * Create a new immutable version snapshot from the current filing draft.
 * Captures draft_schedule_data_json + optionally TB and COA state.
 */
export async function createFilingVersion(params: CreateVersionParams): Promise<VersionResult> {
  try {
    // 1. Fetch filing with current draft data
    const { data: filing, error: filingErr } = await supabase
      .from("filings")
      .select("*, clients(id), companies(id)")
      .eq("id", params.filingId)
      .single();

    if (filingErr || !filing) {
      return { success: false, error: "Filing not found" };
    }

    const draftData = (filing as any).draft_schedule_data_json || (filing as any).filing_data || {};

    // 2. Determine next version number
    const { data: latestSnapshot } = await supabase
      .from("filing_model_snapshots")
      .select("version")
      .eq("filing_id", params.filingId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = ((latestSnapshot as any)?.version || 0) + 1;

    // 3. Optionally capture TB snapshot
    let tbSnapshot: Record<string, unknown> | null = null;
    if (params.includeTbSnapshot) {
      tbSnapshot = await captureTbSnapshot(filing.organization_id, filing.company_id, filing.client_id);
    }

    // 4. Optionally capture COA snapshot
    let coaSnapshot: Record<string, unknown> | null = null;
    if (params.includeCoaSnapshot) {
      coaSnapshot = await captureCoaSnapshot(filing.organization_id, filing.company_id, filing.client_id);
    }

    // 5. Build snapshot data (self-contained)
    const snapshotData: Record<string, unknown> = {
      schedule_data: draftData,
      filing_type: filing.filing_type,
      tax_year: filing.tax_year,
      period_start: filing.period_start,
      period_end: filing.period_end,
      tax_due: filing.tax_due,
      tax_refund: filing.tax_refund,
    };

    if (tbSnapshot) {
      snapshotData.tb_snapshot = tbSnapshot;
    }
    if (coaSnapshot) {
      snapshotData.coa_tax_mapping_snapshot = coaSnapshot;
    }

    // 6. Compute hash
    const snapshotHash = await computeSnapshotHash(snapshotData);

    // 7. Determine snapshot type from filing_type
    const snapshotType = mapFilingTypeToSnapshotType(filing.filing_type);

    // 8. Compute mapping provenance hashes for ACCOUNTS_FRS105
    let tbSnapshotRef: string | null = null;
    let coaMappingRef: string | null = null;
    let mappingRulesVersion: string | null = null;

    if (filing.filing_type === 'ACCOUNTS_FRS105' || filing.filing_type === 'accounts_frs105') {
      if (tbSnapshot) {
        tbSnapshotRef = await computeSnapshotHash(tbSnapshot as Record<string, unknown>);
      }
      if (coaSnapshot) {
        coaMappingRef = await computeSnapshotHash(coaSnapshot as Record<string, unknown>);
      }
      // Deterministic hash of the mapping rules content
      const { FRS105_ACCOUNT_MAPPINGS } = await import("@/lib/frs105-accounts-model");
      const mappingContent = JSON.stringify(FRS105_ACCOUNT_MAPPINGS, Object.keys(FRS105_ACCOUNT_MAPPINGS).sort());
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(mappingContent));
      mappingRulesVersion = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // 9. Insert snapshot
    const { data: snapshot, error: insertErr } = await supabase
      .from("filing_model_snapshots")
      .insert({
        organization_id: filing.organization_id,
        company_id: filing.company_id || null,
        client_id: filing.client_id || null,
        snapshot_type: snapshotType,
        period_start: filing.period_start || new Date().toISOString().split("T")[0],
        period_end: filing.period_end || new Date().toISOString().split("T")[0],
        snapshot_data: snapshotData as any,
        snapshot_hash: snapshotHash,
        source_workpaper_id: filing.workpaper_instance_id || null,
        generator_version: "2.0.0",
        version: nextVersion,
        lock_reason: params.lockReason || null,
        filing_id: params.filingId,
        tb_snapshot: tbSnapshot as any,
        coa_snapshot: coaSnapshot as any,
        computed_outputs: {
          tax_due: filing.tax_due,
          tax_refund: filing.tax_refund,
        } as any,
        tb_snapshot_ref: tbSnapshotRef,
        coa_mapping_ref: coaMappingRef,
        mapping_rules_version: mappingRulesVersion,
      } as any)
      .select("id, version")
      .single();

    if (insertErr || !snapshot) {
      console.error("Failed to create version snapshot:", insertErr);
      return { success: false, error: insertErr?.message || "Insert failed" };
    }

    // 9. Update filing with current snapshot reference
    await supabase
      .from("filings")
      .update({
        current_snapshot_id: snapshot.id,
        current_version: nextVersion,
        model_snapshot_id: snapshot.id,
      } as any)
      .eq("id", params.filingId);

    // 10. Audit log
    const { data: authData } = await supabase.auth.getUser();
    await logAudit({
      organizationId: filing.organization_id,
      entityType: "filing",
      entityId: params.filingId,
      action: "create_version",
      newValue: `v${nextVersion}`,
      metadata: {
        snapshot_id: snapshot.id,
        snapshot_hash: snapshotHash,
        lock_reason: params.lockReason,
        includes_tb: !!tbSnapshot,
        includes_coa: !!coaSnapshot,
      },
      userId: authData?.user?.id,
    });

    return { success: true, snapshotId: snapshot.id, version: nextVersion };
  } catch (err: any) {
    console.error("Filing version creation error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Get version history for a filing
 */
export async function getFilingVersionHistory(filingId: string) {
  const { data, error } = await supabase
    .from("filing_model_snapshots")
    .select("id, version, created_at, lock_reason, snapshot_hash, approved_by, approved_at, generator_version")
    .eq("filing_id", filingId)
    .order("version", { ascending: false });

  if (error) {
    console.error("Failed to fetch version history:", error);
    return [];
  }

  return data || [];
}

/**
 * Get a specific version's snapshot data
 */
export async function getFilingVersionData(snapshotId: string) {
  const { data, error } = await supabase
    .from("filing_model_snapshots")
    .select("*")
    .eq("id", snapshotId)
    .single();

  if (error) {
    console.error("Failed to fetch version data:", error);
    return null;
  }

  return data;
}

// ---------- Internal helpers ----------

function mapFilingTypeToSnapshotType(filingType: string): string {
  const map: Record<string, string> = {
    self_assessment: "sa100",
    SA100: "sa100",
    sa100: "sa100",
    ct600: "ct600",
    CT600: "ct600",
    corporation_tax: "ct600",
    vat_return: "vat_return",
    VAT: "vat_return",
    accounts_frs105: "accounts_frs105",
    accounts_frs102_1a: "accounts_frs102_1a",
    CS01: "cs01",
    confirmation_statement: "cs01",
  };
  return map[filingType] || "accounts_frs105";
}

async function captureTbSnapshot(
  orgId: string,
  companyId: string | null,
  clientId: string | null
): Promise<Record<string, unknown>> {
  // Fetch trial balance entries from bookkeeping ledger
  const client = supabase as any;
  let query = client
    .from("bookkeeping_ledger_entries")
    .select("account_id, debit, credit, description, entry_date, bookkeeping_accounts(code, name, account_type, sub_type)")
    .eq("organization_id", orgId);

  if (companyId) {
    query = query.eq("company_id", companyId);
  } else if (clientId) {
    query = query.eq("client_id", clientId);
  }

  const { data } = await query;

  return {
    captured_at: new Date().toISOString(),
    entries: data || [],
    entry_count: data?.length || 0,
  };
}

async function captureCoaSnapshot(
  orgId: string,
  companyId: string | null,
  clientId: string | null
): Promise<Record<string, unknown>> {
  // Fetch chart of accounts with tax mapping
  let query = supabase
    .from("bookkeeping_accounts")
    .select("id, code, name, account_type, sub_type, tax_mapping")
    .eq("organization_id", orgId);

  if (companyId) {
    query = query.eq("company_id", companyId);
  } else if (clientId) {
    query = query.eq("client_id", clientId);
  }

  const { data } = await query;

  return {
    captured_at: new Date().toISOString(),
    accounts: data || [],
    account_count: data?.length || 0,
  };
}
