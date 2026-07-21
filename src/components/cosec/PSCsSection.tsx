import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Shield, AlertCircle, CheckCircle, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatNatureOfControl, CHPSC } from "@/lib/ch-sync-service";
import { format } from "date-fns";
import { AddPersonDialog, EditPscData } from "./AddPersonDialog";

interface PSCsSectionProps {
  companyId: string;
  organizationId: string;
  chPSCs?: CHPSC[];
}

export function PSCsSection({ companyId, organizationId, chPSCs }: PSCsSectionProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingPsc, setEditingPsc] = useState<EditPscData | null>(null);
  const [deletingPsc, setDeletingPsc] = useState<{ id: string; name: string; linkedToCH: boolean } | null>(null);
  // Bumped on every open so AddPersonDialog remounts with fresh form state
  // (it stays mounted between opens, and its form state is only seeded on mount).
  const [dialogInstanceKey, setDialogInstanceKey] = useState(0);
  const queryClient = useQueryClient();

  const deletePscMutation = useMutation({
    mutationFn: async (pscId: string) => {
      const { error } = await supabase
        .from("company_pscs")
        .delete()
        .eq("id", pscId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("PSC removed from register");
      queryClient.invalidateQueries({ queryKey: ["company-pscs", companyId] });
      queryClient.invalidateQueries({ queryKey: ["ch-diff", companyId] });
      setDeletingPsc(null);
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Failed to remove PSC");
    },
  });

  const { data: pscs, isLoading } = useQuery({
    queryKey: ["company-pscs", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_pscs")
        .select(`
          id,
          nature_of_control,
          notified_at,
          ceased_at,
          ch_psc_id,
          person:company_persons(
            id,
            title,
            first_name,
            last_name,
            date_of_birth,
            nationality,
            country_of_residence,
            service_address_line_1,
            service_city,
            service_postcode
          )
        `)
        .eq("company_id", companyId)
        .order("notified_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const activePSCs = pscs?.filter(p => !p.ceased_at) || [];
  const ceasedPSCs = pscs?.filter(p => p.ceased_at) || [];

  const openAddDialog = () => {
    setEditingPsc(null);
    setShowAddDialog(true);
    setDialogInstanceKey(k => k + 1);
  };

  const openEditDialog = (psc: any) => {
    setEditingPsc({
      pscId: psc.id,
      personId: psc.person?.id,
      title: psc.person?.title ?? null,
      firstName: psc.person?.first_name ?? "",
      lastName: psc.person?.last_name ?? "",
      dateOfBirth: psc.person?.date_of_birth ?? null,
      nationality: psc.person?.nationality ?? null,
      countryOfResidence: psc.person?.country_of_residence ?? null,
      serviceAddressLine1: psc.person?.service_address_line_1 ?? null,
      serviceCity: psc.person?.service_city ?? null,
      servicePostcode: psc.person?.service_postcode ?? null,
      natureOfControl: psc.nature_of_control ?? [],
      notifiedAt: psc.notified_at,
      ceasedAt: psc.ceased_at ?? null,
    });
    setShowAddDialog(true);
    setDialogInstanceKey(k => k + 1);
  };

  // A PSC is treated as synced with CH when it carries the CH-assigned identifier
  // (populated by companies-house-sync). Fall back to a name match against the
  // freshly-fetched CH snapshot when the id is absent but a CH counterpart exists.
  const isInCH = (psc: any): boolean => {
    if (psc.ch_psc_id) return true;
    if (!chPSCs || chPSCs.length === 0) return false;
    const name = `${psc.person?.first_name ?? ""} ${psc.person?.last_name ?? ""}`.trim().toLowerCase();
    if (!name) return false;
    return chPSCs.some(chp => {
      const chName = chp.name.toLowerCase().replace(/^(mr|mrs|ms|miss|dr)\s+/i, "").trim();
      return chName === name || chName.includes(name) || name.includes(chName);
    });
  };

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading PSCs...</div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Persons with Significant Control ({activePSCs.length})
            </CardTitle>
            <Button size="sm" onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-1" />
              Add PSC
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {activePSCs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No PSCs registered. Add PSCs to the register.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Nature of Control</TableHead>
                  <TableHead>Notified</TableHead>
                  <TableHead>Nationality</TableHead>
                  <TableHead className="text-right">CH Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activePSCs.map((psc) => (
                  <TableRow key={psc.id}>
                    <TableCell className="font-medium">
                      {psc.person?.title} {psc.person?.first_name} {psc.person?.last_name}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {formatNatureOfControl(psc.nature_of_control || []).map((control, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {control}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {psc.notified_at && format(new Date(psc.notified_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>{psc.person?.nationality || "-"}</TableCell>
                    <TableCell className="text-right">
                      {isInCH(psc) ? (
                        <Badge variant="outline" className="gap-1 text-green-600 border-green-200">
                          <CheckCircle className="h-3 w-3" />
                          Synced
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-amber-600 border-amber-200">
                          <AlertCircle className="h-3 w-3" />
                          Not in CH
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(psc)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setDeletingPsc({
                              id: psc.id,
                              name: `${psc.person?.title ?? ""} ${psc.person?.first_name ?? ""} ${psc.person?.last_name ?? ""}`.trim(),
                              linkedToCH: !!psc.ch_psc_id,
                            })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Ceased PSCs */}
      {ceasedPSCs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-muted-foreground">
              Ceased PSCs ({ceasedPSCs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Nature of Control</TableHead>
                  <TableHead>Notified</TableHead>
                  <TableHead>Ceased</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ceasedPSCs.map((psc) => (
                  <TableRow key={psc.id} className="text-muted-foreground">
                    <TableCell>
                      {psc.person?.title} {psc.person?.first_name} {psc.person?.last_name}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {formatNatureOfControl(psc.nature_of_control || []).map((control, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {control}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {psc.notified_at && format(new Date(psc.notified_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      {psc.ceased_at && format(new Date(psc.ceased_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(psc)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AddPersonDialog
        key={dialogInstanceKey}
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        companyId={companyId}
        organizationId={organizationId}
        type="psc"
        editingPsc={editingPsc}
      />

      <AlertDialog open={!!deletingPsc} onOpenChange={(open) => !open && setDeletingPsc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deletingPsc?.name || "PSC"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the entry from your internal PSC register only. No PSC07 will be
              filed with Companies House.
              {deletingPsc?.linkedToCH && (
                <span className="mt-2 block text-amber-600">
                  This PSC is currently linked to Companies House. The next sync will re-import
                  it unless it has also been removed at Companies House.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePscMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletePscMutation.isPending}
              onClick={() => deletingPsc && deletePscMutation.mutate(deletingPsc.id)}
            >
              {deletePscMutation.isPending ? "Removing..." : "Remove PSC"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
