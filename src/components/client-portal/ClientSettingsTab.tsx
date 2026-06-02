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
  clientId: string;
  status: string;
  archivedAt: string | null;
  disengagedAt: string | null;
}

export function ClientSettingsTab({ clientId, status, archivedAt, disengagedAt }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const run = async (label: string, fn: () => PromiseLike<any>) => {
    setBusy(true);
    try {
      const { error } = await fn();
      if (error) throw error;
      toast({ title: label, description: "Action completed successfully." });
      queryClient.invalidateQueries({ queryKey: ["client", clientId] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
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
          <CardDescription>Current state of the client relationship</CardDescription>
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
                  <UserMinus className="h-4 w-4 mr-2" /> Disengage Client
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disengage this client?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This marks the engagement as ended. All active recurring jobs and deadlines will stop generating.
                    History is preserved. You can reverse this later.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      run("Client Disengaged", () =>
                        supabase
                          .from("clients")
                          .update({ disengaged_at: new Date().toISOString(), status: "disengaged" })
                          .eq("id", clientId)
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
                run("Client Reengaged", () =>
                  supabase
                    .from("clients")
                    .update({ disengaged_at: null, status: "active", activated_at: new Date().toISOString() })
                    .eq("id", clientId)
                )
              }
            >
              <RotateCcw className="h-4 w-4 mr-2" /> Reengage Client
            </Button>
          )}

          {!isArchived ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                run("Client Archived", () =>
                  supabase
                    .from("clients")
                    .update({ archived_at: new Date().toISOString() })
                    .eq("id", clientId)
                )
              }
            >
              <Archive className="h-4 w-4 mr-2" /> Archive Client
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                run("Client Restored", () =>
                  supabase.from("clients").update({ archived_at: null }).eq("id", clientId)
                )
              }
            >
              <ArchiveRestore className="h-4 w-4 mr-2" /> Restore Client
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Permanently delete this client and all associated data. This cannot be undone and may fail if
            historical filings or invoices reference this record.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={busy}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete Client
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Permanently delete this client?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove all contacts, jobs, documents, and conversations for this client.
                  For compliance reasons, we recommend archiving instead of deleting.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={async () => {
                    setBusy(true);
                    const { error } = await supabase.from("clients").delete().eq("id", clientId);
                    setBusy(false);
                    if (error) {
                      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
                    } else {
                      toast({ title: "Client deleted" });
                      queryClient.invalidateQueries({ queryKey: ["clients"] });
                      navigate("/clients");
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