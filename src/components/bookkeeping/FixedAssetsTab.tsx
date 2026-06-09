import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Plus, Play, ArchiveX } from "lucide-react";
import { BookkeepingEmptyState } from "./BookkeepingEmptyState";
import type { BookkeepingEntity } from "./EntitySelector";

interface Props { entity: BookkeepingEntity | null; }

const fmt = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("en-GB", { style: "currency", currency: "GBP" });

export function FixedAssetsTab({ entity }: Props) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [disposeAsset, setDisposeAsset] = useState<any | null>(null);
  const [runOpen, setRunOpen] = useState(false);
  const [periodEnd, setPeriodEnd] = useState(() => {
    const d = new Date(); d.setDate(0); return d.toISOString().slice(0, 10);
  });

  if (!entity || entity.type !== "company") {
    return (
      <BookkeepingEmptyState
        icon={ArchiveX}
        title="Fixed assets require a company"
        description="Select a company entity to manage its fixed asset register."
      />
    );
  }

  const { data: assets, isLoading } = useQuery({
    queryKey: ["fixed-assets", entity.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fixed_assets")
        .select("*")
        .eq("company_id", entity.id)
        .order("acquisition_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["fixed-assets", entity.id] });

  const runDepreciation = async () => {
    const { data, error } = await (supabase.rpc as any)("run_monthly_depreciation", {
      p_organization_id: (assets?.[0] as any)?.organization_id,
      p_company_id: entity.id,
      p_period_end: periodEnd,
    });
    if (error) { toast({ title: "Depreciation failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Depreciation posted", description: `Processed ${(data as any)?.results?.length ?? 0} assets for ${periodEnd}` });
    setRunOpen(false); refresh();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Fixed Asset Register</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setRunOpen(true)} disabled={!assets?.length}>
              <Play className="h-4 w-4 mr-2" /> Run Monthly Depreciation
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add Asset
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !assets?.length ? (
            <p className="text-sm text-muted-foreground">No fixed assets yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Acquired</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Accum. Dep.</TableHead>
                  <TableHead className="text-right">NBV</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((a: any) => {
                  const nbv = Number(a.cost ?? 0) - Number(a.accumulated_depreciation ?? 0);
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.asset_name}</TableCell>
                      <TableCell>{a.asset_category}</TableCell>
                      <TableCell>{a.acquisition_date}</TableCell>
                      <TableCell className="text-right">{fmt(Number(a.cost))}</TableCell>
                      <TableCell className="text-right">{fmt(Number(a.accumulated_depreciation))}</TableCell>
                      <TableCell className="text-right">{fmt(nbv)}</TableCell>
                      <TableCell>{a.depreciation_method}</TableCell>
                      <TableCell>
                        <Badge variant={a.status === "active" ? "default" : "secondary"}>{a.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {a.status === "active" && (
                          <Button variant="ghost" size="sm" onClick={() => setDisposeAsset(a)}>Dispose</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {addOpen && (
        <AddAssetDialog
          companyId={entity.id}
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); refresh(); }}
        />
      )}

      {disposeAsset && (
        <DisposeDialog
          asset={disposeAsset}
          onClose={() => setDisposeAsset(null)}
          onSaved={() => { setDisposeAsset(null); refresh(); }}
        />
      )}

      <Dialog open={runOpen} onOpenChange={setRunOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Run Monthly Depreciation</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Period End</Label>
            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Re-running for the same month is a no-op (idempotent per asset).
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRunOpen(false)}>Cancel</Button>
            <Button onClick={runDepreciation}>Run</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddAssetDialog({ companyId, onClose, onSaved }: { companyId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    asset_name: "",
    asset_category: "Plant & Machinery",
    acquisition_date: new Date().toISOString().slice(0, 10),
    cost: 0,
    residual_value: 0,
    depreciation_method: "SL" as "SL" | "RB" | "NONE",
    useful_life_months: 60,
    depreciation_rate_pct: 25,
    depreciation_start_date: new Date().toISOString().slice(0, 10),
    default_pool_type: "MAIN_POOL",
  });

  const save = async () => {
    const { data: org } = await supabase.from("companies").select("organization_id").eq("id", companyId).single();
    if (!org) { toast({ title: "Company not found", variant: "destructive" }); return; }
    const { error } = await supabase.from("fixed_assets").insert({
      company_id: companyId,
      organization_id: (org as any).organization_id,
      asset_name: form.asset_name,
      asset_category: form.asset_category,
      acquisition_date: form.acquisition_date,
      cost: form.cost,
      residual_value: form.residual_value,
      depreciation_method: form.depreciation_method,
      useful_life_months: form.depreciation_method === "SL" ? form.useful_life_months : null,
      depreciation_rate_pct: form.depreciation_method === "RB" ? form.depreciation_rate_pct : null,
      depreciation_start_date: form.depreciation_start_date,
      default_pool_type: form.default_pool_type,
      is_car: false,
      business_use_percentage: 100,
    } as any);
    if (error) { toast({ title: "Failed to add asset", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Asset added" });
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add Fixed Asset</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Name</Label><Input value={form.asset_name} onChange={(e) => setForm({ ...form, asset_name: e.target.value })} /></div>
          <div><Label>Category</Label><Input value={form.asset_category} onChange={(e) => setForm({ ...form, asset_category: e.target.value })} /></div>
          <div><Label>Acquisition Date</Label><Input type="date" value={form.acquisition_date} onChange={(e) => setForm({ ...form, acquisition_date: e.target.value })} /></div>
          <div><Label>Cost</Label><Input type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: parseFloat(e.target.value) || 0 })} /></div>
          <div><Label>Residual Value</Label><Input type="number" step="0.01" value={form.residual_value} onChange={(e) => setForm({ ...form, residual_value: parseFloat(e.target.value) || 0 })} /></div>
          <div><Label>Method</Label>
            <Select value={form.depreciation_method} onValueChange={(v: any) => setForm({ ...form, depreciation_method: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SL">Straight Line</SelectItem>
                <SelectItem value="RB">Reducing Balance</SelectItem>
                <SelectItem value="NONE">None</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Depreciation Start</Label><Input type="date" value={form.depreciation_start_date} onChange={(e) => setForm({ ...form, depreciation_start_date: e.target.value })} /></div>
          {form.depreciation_method === "SL" && (
            <div><Label>Useful Life (months)</Label><Input type="number" value={form.useful_life_months} onChange={(e) => setForm({ ...form, useful_life_months: parseInt(e.target.value) || 0 })} /></div>
          )}
          {form.depreciation_method === "RB" && (
            <div><Label>Rate (% per year)</Label><Input type="number" step="0.01" value={form.depreciation_rate_pct} onChange={(e) => setForm({ ...form, depreciation_rate_pct: parseFloat(e.target.value) || 0 })} /></div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!form.asset_name || !form.cost}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DisposeDialog({ asset, onClose, onSaved }: { asset: any; onClose: () => void; onSaved: () => void }) {
  const [disposalDate, setDisposalDate] = useState(new Date().toISOString().slice(0, 10));
  const [proceeds, setProceeds] = useState(0);
  const [proceedsAccountId, setProceedsAccountId] = useState<string>("");
  const [reason, setReason] = useState("");

  const { data: accounts } = useQuery({
    queryKey: ["bookkeeping-accounts-bank", asset.organization_id, asset.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("bookkeeping_accounts")
        .select("id, account_code, account_name, account_subtype")
        .eq("organization_id", asset.organization_id)
        .eq("is_active", true)
        .order("account_code");
      return data ?? [];
    },
  });

  const dispose = async () => {
    const { data, error } = await (supabase.rpc as any)("dispose_fixed_asset", {
      p_asset_id: asset.id,
      p_disposal_date: disposalDate,
      p_proceeds: proceeds,
      p_proceeds_account_id: proceedsAccountId,
      p_reason: reason || null,
    });
    if (error) { toast({ title: "Disposal failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Asset disposed", description: `Gain/(Loss): ${fmt((data as any)?.gain_loss)}` });
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Dispose {asset.asset_name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Disposal Date</Label><Input type="date" value={disposalDate} onChange={(e) => setDisposalDate(e.target.value)} /></div>
          <div><Label>Proceeds</Label><Input type="number" step="0.01" value={proceeds} onChange={(e) => setProceeds(parseFloat(e.target.value) || 0)} /></div>
          <div>
            <Label>Proceeds Account (bank / receivable)</Label>
            <Select value={proceedsAccountId} onValueChange={setProceedsAccountId}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {accounts?.map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>{a.account_code} — {a.account_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={dispose} disabled={!proceedsAccountId}>Post Disposal</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}