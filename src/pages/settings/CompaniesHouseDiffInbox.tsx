import { useEffect, useState } from "react";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { listPendingDiffs, decideDiff, type ChDiff } from "@/lib/ch-diff-service";
import { Loader2 } from "lucide-react";

function renderValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

export default function CompaniesHouseDiffInbox() {
  const { organization } = useOrganization();
  const [diffs, setDiffs] = useState<ChDiff[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    if (!organization?.id) return;
    setLoading(true);
    try {
      setDiffs(await listPendingDiffs(organization.id));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [organization?.id]);

  const decide = async (id: string, d: "accept" | "reject") => {
    setBusy(id);
    try {
      await decideDiff(id, d);
      toast({ title: d === "accept" ? "Change Applied" : "Change Rejected" });
      await refresh();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Companies House Diff Inbox</h1>
        <p className="text-sm text-muted-foreground mt-1">
          All pending Companies House changes across the practice. Nothing is written until you accept.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending Changes ({diffs.length})</CardTitle>
          <CardDescription>Review and accept or reject each proposed change.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : diffs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending changes.</p>
          ) : (
            <div className="space-y-3">
              {diffs.map((d) => (
                <div key={d.id} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">
                      {d.company_number} · {d.field_path}
                    </div>
                    <Badge variant="outline">{d.source}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="text-muted-foreground mb-1">Current</div>
                      <div className="font-mono break-words">{renderValue(d.current_value)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-1">Incoming</div>
                      <div className="font-mono break-words">{renderValue(d.incoming_value)}</div>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={() => decide(d.id, "accept")} disabled={busy === d.id}>
                      Accept
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => decide(d.id, "reject")} disabled={busy === d.id}>
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}