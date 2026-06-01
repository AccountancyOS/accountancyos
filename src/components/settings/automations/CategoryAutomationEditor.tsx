import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Activity } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";

interface ChaserPolicy {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  send_mode: "auto" | "draft" | "task_only" | "disabled";
  scope: "new_records" | "all_records";
  is_enabled: boolean;
  paused_at: string | null;
  trigger_type: string;
  frequency_interval: number;
  frequency_unit: string;
}

interface Props {
  categoryKey: string;
  categoryLabel: string;
}

interface PolicyRun {
  id: string;
  status: string;
  next_send_at: string | null;
  last_sent_at: string | null;
  send_count: number;
  subject_type: string | null;
  subject_id: string | null;
  job_id: string | null;
  created_at: string;
}

function PolicyActivityDrawer({ policyId, policyName, orgId }: { policyId: string; policyName: string; orgId: string }) {
  const [runs, setRuns] = useState<PolicyRun[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("automation_chaser_runs")
      .select("id, status, next_send_at, last_sent_at, send_count, subject_type, subject_id, job_id, created_at")
      .eq("organization_id", orgId)
      .eq("policy_id", policyId)
      .order("created_at", { ascending: false })
      .limit(50);
    setRuns((data ?? []) as PolicyRun[]);
    setLoading(false);
  }

  return (
    <Sheet onOpenChange={(open) => { if (open) void load(); }}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 px-2">
          <Activity className="h-3.5 w-3.5" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">Activity — {policyName}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-2">
          {loading && (
            <div className="flex items-center text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading
            </div>
          )}
          {!loading && runs.length === 0 && (
            <div className="text-sm text-muted-foreground border border-dashed rounded-md p-4">
              No runs yet. When this policy is enabled and an Owner has flipped Send Mode to Auto, runs will appear here.
            </div>
          )}
          {runs.map((r) => (
            <div key={r.id} className="border rounded-md p-2 text-xs space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                <span className="text-muted-foreground">
                  {r.subject_type || (r.job_id ? "job" : "—")}
                </span>
                <span className="text-muted-foreground">Sends: {r.send_count}</span>
              </div>
              <div className="text-muted-foreground">
                Next: {r.next_send_at ? new Date(r.next_send_at).toLocaleString() : "—"}
              </div>
              <div className="text-muted-foreground">
                Last Sent: {r.last_sent_at ? new Date(r.last_sent_at).toLocaleString() : "—"}
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function CategoryAutomationEditor({ categoryKey, categoryLabel }: Props) {
  const { organization } = useOrganization();
  const [policies, setPolicies] = useState<ChaserPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!organization?.id) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id, categoryKey]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("automation_chaser_policies")
      .select("id, name, description, category, send_mode, scope, is_enabled, paused_at, trigger_type, frequency_interval, frequency_unit")
      .eq("organization_id", organization!.id)
      .eq("category", categoryKey)
      .order("name", { ascending: true });
    if (error) {
      toast({ title: "Failed to load policies", description: error.message, variant: "destructive" });
    }
    setPolicies((data ?? []) as ChaserPolicy[]);
    setLoading(false);
  }

  async function update(id: string, patch: Partial<ChaserPolicy>) {
    setSavingId(id);
    const { error } = await supabase
      .from("automation_chaser_policies")
      .update(patch)
      .eq("id", id);
    setSavingId(null);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    setPolicies((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } as ChaserPolicy : p)));
  }

  if (loading) {
    return (
      <div className="flex items-center text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading {categoryLabel} Policies…
      </div>
    );
  }

  if (policies.length === 0) {
    return (
      <div className="text-sm text-muted-foreground border border-dashed rounded-md p-4">
        No chaser policies configured for {categoryLabel} yet. Seed defaults from the Migration Review banner above or create one via Advanced.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {policies.map((p) => {
        const isPaused = !!p.paused_at;
        return (
          <div key={p.id} className="border rounded-md p-3 flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{p.name}</span>
                <Badge variant="outline" className="text-xs">{p.trigger_type}</Badge>
                <Badge variant="outline" className="text-xs">
                  Every {p.frequency_interval} {p.frequency_unit.toLowerCase()}
                </Badge>
                <Badge variant={p.scope === "new_records" ? "outline" : "secondary"} className="text-xs">
                  {p.scope === "new_records" ? "New Records Only" : "All Records"}
                </Badge>
                {isPaused && <Badge variant="destructive" className="text-xs">Paused</Badge>}
              </div>
              {p.description && (
                <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <PolicyActivityDrawer policyId={p.id} policyName={p.name} orgId={organization!.id} />
              <div className="flex flex-col items-end gap-1">
                <span className="text-[10px] uppercase text-muted-foreground">Send Mode</span>
                <Select
                  value={p.send_mode}
                  onValueChange={(v) => update(p.id, { send_mode: v as ChaserPolicy["send_mode"] })}
                  disabled={savingId === p.id}
                >
                  <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft For Review</SelectItem>
                    <SelectItem value="auto">Auto Send</SelectItem>
                    <SelectItem value="task_only">Create Task</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-[10px] uppercase text-muted-foreground">Active</span>
                <Switch
                  checked={!isPaused && p.is_enabled}
                  disabled={savingId === p.id}
                  onCheckedChange={(checked) =>
                    update(p.id, {
                      is_enabled: checked,
                      paused_at: checked ? null : new Date().toISOString(),
                    })
                  }
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}