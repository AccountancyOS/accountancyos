import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  getLatestKycPack,
  startKycPack,
  recordSubjectProgress,
  defaultSubjectsFor,
  type KycSubjectStatus,
} from "@/lib/kyc-pack-service";
import { Loader2, ShieldCheck } from "lucide-react";

interface Props {
  clientId: string;
  clientType: string;
  contacts?: Array<{ id: string; first_name?: string | null; last_name?: string | null; role?: string | null }>;
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  documents_requested: "secondary",
  partial: "secondary",
  complete: "default",
  waived: "outline",
  failed: "destructive",
};

export default function KycPackPanel({ clientId, clientType, contacts = [] }: Props) {
  const [loading, setLoading] = useState(true);
  const [pack, setPack] = useState<any>(null);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const data = await getLatestKycPack(clientId);
    setPack(data?.pack ?? null);
    setSubjects(data?.subjects ?? []);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, [clientId]);

  const handleStart = async () => {
    setBusy(true);
    try {
      const subs = defaultSubjectsFor(clientType, contacts);
      if (subs.length === 0) {
        toast({ title: "No KYC subjects", description: "Add contacts (Directors / Authorised) first.", variant: "destructive" });
        return;
      }
      await startKycPack(clientId, subs);
      toast({ title: "KYC Pack Created" });
      await refresh();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const updateSubject = async (subjectId: string, status: KycSubjectStatus) => {
    setBusy(true);
    try {
      await recordSubjectProgress(subjectId, status);
      await refresh();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" /> KYC / AML Pack
        </CardTitle>
        <CardDescription>
          Multi-subject identity and source-of-funds checks.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !pack ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">No KYC pack yet for this client.</p>
            <Button size="sm" onClick={handleStart} disabled={busy}>
              Start KYC Pack
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Pack Status:</span>
              <Badge>{pack.status}</Badge>
            </div>
            <div className="space-y-2">
              {subjects.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                  <div className="text-sm">
                    <div className="font-medium">{s.subject_name}</div>
                    <div className="text-xs text-muted-foreground">{s.subject_type}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANTS[s.subject_status] ?? "outline"}>
                      {s.subject_status}
                    </Badge>
                    {s.subject_status !== "complete" && s.subject_status !== "waived" && (
                      <>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => updateSubject(s.id, "complete")}>
                          Mark Complete
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => updateSubject(s.id, "waived")}>
                          Waive
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}