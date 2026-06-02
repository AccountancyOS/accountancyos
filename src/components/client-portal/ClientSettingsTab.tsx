import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Archive, ArchiveRestore, Trash2, UserMinus, RotateCcw } from "lucide-react";

interface Props {
  entityId: string;
  entityKind?: "client" | "company";
  status: string;
  archivedAt: string | null;
  disengagedAt: string | null;
}

export function ClientSettingsTab({ entityId, entityKind = "client", status, archivedAt, disengagedAt }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const table = entityKind === "company" ? "companies" : "clients";
  const listRoute = entityKind === "company" ? "/clients" : "/clients";
  const noun = entityKind === "company" ? "Company" : "Client";

  const run = async (label: string, fn: () => PromiseLike<any>) => {
    setBusy(true);
    try {
      const { error } = await fn();
      if (error) throw error;
      toast({ title: label, description: "Action completed successfully." });
      queryClient.invalidateQueries({ queryKey: [entityKind, entityId] });
      queryClient.invalidateQueries({ queryKey: [`${entityKind}s`] });
      queryClient.invalidateQueries({ queryKey: ["company-detail", entityId] });
    } catch (e: any) {
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const isArchived = !!archivedAt;
  const isDisengaged = !!disengagedAt;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Lifecycle Status</CardTitle>
          <CardDescription>Current state of the {noun.toLowerCase()} relationship</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Status:</span>
            <Badge variant={status === "active" ? "default" : "secondary"}>{status}</Badge>
            {isDisengaged && <Badge variant="outline">Disengaged {new Date(disengagedAt!).toLocaleDateString()}</Badge>}
            {isArchived && <Badge variant="outline">Archived {new Date(archivedAt!).toLocaleDateString()}</Badge>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manage Relationship</CardTitle>
          <CardDescription>
            Disengage when the client formally leaves. Archive to hide from active lists while preserving history.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!isDisengaged ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={busy}>
                  <UserMinus className="h-4 w-4 mr-2" /> Disengage {noun}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disengage this {noun.toLowerCase()}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This marks the engagement as ended. All active recurring jobs and deadlines will stop generating.
                    History is preserved. You can reverse this later.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      run(`${noun} Disengaged`, () =>
                        supabase
                          .from(table as any)
                          .update({ disengaged_at: new Date().toISOString(), status: "disengaged" })
                          .eq("id", entityId)
                      )
                    }
                  >Confirm Disengagement</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(`${noun} Reengaged`, () =>
                  supabase
                    .from(table as any)
                    .update({ disengaged_at: null, status: "active", activated_at: new Date().toISOString() })
                    .eq("id", entityId)
                )
              }
            >
              <RotateCcw className="h-4 w-4 mr-2" /> Reengage {noun}
            </Button>
          )}

          {!isArchived ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(`${noun} Archived`, () =>
                  supabase
                    .from(table as any)
                    .update({ archived_at: new Date().toISOString() })
                    .eq("id", entityId)
                )
              }
            >
              <Archive className="h-4 w-4 mr-2" /> Archive {noun}
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(`${noun} Restored`, () =>
                  supabase.from(table as any).update({ archived_at: null }).eq("id", entityId)
                )
              }
            >
              <ArchiveRestore className="h-4 w-4 mr-2" /> Restore {noun}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Permanently delete this {noun.toLowerCase()} and all associated data. This cannot be undone and may fail if
            historical filings or invoices reference this record.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={busy}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete {noun}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Permanently delete this {noun.toLowerCase()}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove all contacts, jobs, documents, and conversations for this {noun.toLowerCase()}.
                  For compliance reasons, we recommend archiving instead of deleting.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={async () => {
                    setBusy(true);
                    const { error } = await supabase.from(table as any).delete().eq("id", entityId);
                    setBusy(false);
                    if (error) {
                      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
                    } else {
                      toast({ title: `${noun} deleted` });
                      queryClient.invalidateQueries({ queryKey: [`${entityKind}s`] });
                      navigate(listRoute);
                    }
                  }}
                >Permanently Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}