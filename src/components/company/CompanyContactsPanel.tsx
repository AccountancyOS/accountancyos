import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Mail, Plus, ShieldCheck, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { formatOfficerRole } from "@/lib/ch-sync-service";
import { canBeSignatory, signatoryCapReached } from "@/lib/company-signatory-model";
import { LinkSaClientDialog } from "./LinkSaClientDialog";
import { GrantPortalAccessDialog } from "./GrantPortalAccessDialog";
import { AddCompanyContactDialog } from "./AddCompanyContactDialog";

interface CompanyContactsPanelProps {
  companyId: string;
}

/** Minimal shape of a company_persons row as selected by this panel. */
type PersonLite = {
  id: string;
  first_name: string;
  last_name: string;
  title: string | null;
  email: string | null;
  linked_client_id: string | null;
};

/**
 * `is_signatory` (company_officers) and `person_id` (contacts) were added in
 * 20260720190000_company_profile_person_fields.sql and aren't in the
 * generated types yet — select flat column lists (no embedded joins, so the
 * select-string type inference stays simple) and cast each query's result to
 * a narrow local type here, rather than sprinkling `as any` at every access
 * site. Mirrors the pattern already used in CompanyProfilePanel.tsx.
 */
type OfficerLite = {
  id: string;
  role: string;
  resigned_at: string | null;
  is_signatory: boolean;
  person_id: string;
};

type ContactLite = {
  id: string;
  role: string | null;
  person_id: string | null;
};

interface ContactPanelRow {
  kind: "officer" | "contact";
  personId: string;
  officerId: string | null;
  name: string;
  roleLabel: string;
  email: string | null;
  linkedClientId: string | null;
  resignedAt: string | null;
  isSignatory: boolean;
}

function fullName(p: PersonLite): string {
  return [p.title, p.first_name, p.last_name].filter(Boolean).join(" ");
}

const panelQueryKey = (companyId: string) => ["company-contacts-panel", companyId];

/**
 * Combined contact-management panel for a company: active officers
 * (company_officers where resigned_at IS NULL) union non-officer contacts
 * (contacts where person_id is set), each resolved to their company_persons
 * record. Drives the four Phase-4 RPCs: set_primary_contact, set_signatory,
 * link_person_to_sa_client, grant_person_portal_access.
 */
export function CompanyContactsPanel({ companyId }: CompanyContactsPanelProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();

  const [addContactOpen, setAddContactOpen] = useState(false);
  const [linkSaClientFor, setLinkSaClientFor] = useState<ContactPanelRow | null>(null);
  const [portalAccessFor, setPortalAccessFor] = useState<ContactPanelRow | null>(null);
  const [pendingOfficerId, setPendingOfficerId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: panelQueryKey(companyId),
    queryFn: async () => {
      const [companyRes, officersRes, contactsRes] = await Promise.all([
        supabase.from("companies").select("id, primary_contact_person_id").eq("id", companyId).single(),
        supabase
          .from("company_officers")
          .select("id, role, resigned_at, is_signatory, person_id")
          .eq("company_id", companyId)
          .is("resigned_at", null)
          .order("appointed_at", { ascending: true }),
        supabase
          .from("contacts")
          .select("id, role, person_id")
          .eq("company_id", companyId)
          .not("person_id", "is", null),
      ]);
      if (companyRes.error) throw companyRes.error;
      if (officersRes.error) throw officersRes.error;
      if (contactsRes.error) throw contactsRes.error;

      const officers = (officersRes.data ?? []) as unknown as OfficerLite[];
      const contacts = (contactsRes.data ?? []) as unknown as ContactLite[];

      const personIds = Array.from(
        new Set([...officers.map((o) => o.person_id), ...contacts.map((c) => c.person_id as string)])
      );

      let persons: PersonLite[] = [];
      if (personIds.length > 0) {
        const { data: personsData, error: personsError } = await supabase
          .from("company_persons")
          .select("id, first_name, last_name, title, email, linked_client_id")
          .in("id", personIds);
        if (personsError) throw personsError;
        persons = personsData ?? [];
      }
      const personsById = new Map(persons.map((p) => [p.id, p]));

      const rows: ContactPanelRow[] = [];
      const seen = new Set<string>();

      for (const o of officers) {
        const person = personsById.get(o.person_id);
        if (!person) continue;
        seen.add(o.person_id);
        rows.push({
          kind: "officer",
          personId: o.person_id,
          officerId: o.id,
          name: fullName(person),
          roleLabel: formatOfficerRole(o.role),
          email: person.email,
          linkedClientId: person.linked_client_id,
          resignedAt: o.resigned_at,
          isSignatory: o.is_signatory,
        });
      }
      for (const c of contacts) {
        if (!c.person_id || seen.has(c.person_id)) continue;
        const person = personsById.get(c.person_id);
        if (!person) continue;
        seen.add(c.person_id);
        rows.push({
          kind: "contact",
          personId: c.person_id,
          officerId: null,
          name: fullName(person),
          roleLabel: c.role || "Contact",
          email: person.email,
          linkedClientId: person.linked_client_id,
          resignedAt: null,
          isSignatory: false,
        });
      }

      const companyRow = companyRes.data as unknown as { id: string; primary_contact_person_id: string | null };

      return { rows, primaryContactPersonId: companyRow.primary_contact_person_id };
    },
    enabled: !!companyId,
  });

  const rows = data?.rows ?? [];
  const activeSignatoryCount = rows.filter((r) => r.kind === "officer" && r.isSignatory).length;

  const invalidatePanel = () => queryClient.invalidateQueries({ queryKey: panelQueryKey(companyId) });

  const setPrimaryMutation = useMutation({
    mutationFn: async (personId: string) => {
      const { error } = await supabase.rpc("set_primary_contact" as any, {
        p_company_id: companyId,
        p_person_id: personId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Primary contact updated");
      invalidatePanel();
    },
    onError: (error: any) => {
      toast.error("Failed to set primary contact", { description: error.message });
    },
  });

  // The set_signatory trigger can silently auto-demote (resigned officer) or
  // RAISE (10-signatory cap race) — never trust `p_on` optimistically.
  // Always refetch so the row reflects the true post-trigger DB state.
  const setSignatoryMutation = useMutation({
    mutationFn: async ({ officerId, on }: { officerId: string; on: boolean }) => {
      const { data: result, error } = await supabase.rpc("set_signatory" as any, {
        p_officer_id: officerId,
        p_on: on,
      });
      if (error) throw error;
      return { requested: on, result: result as unknown as { is_signatory: boolean } };
    },
    onSuccess: ({ requested, result }) => {
      if (requested && !result.is_signatory) {
        toast.warning("Could not set as signatory", {
          description: "This officer has since resigned, so they can't be a signatory.",
        });
      }
      invalidatePanel();
    },
    onError: (error: any) => {
      toast.error("Failed to update signatory status", { description: error.message });
      invalidatePanel();
    },
    onSettled: () => setPendingOfficerId(null),
  });

  const handleSignatoryToggle = (row: ContactPanelRow, checked: boolean) => {
    if (!row.officerId) return;
    setPendingOfficerId(row.officerId);
    setSignatoryMutation.mutate({ officerId: row.officerId, on: checked });
  };

  const canToggleSignatory = (row: ContactPanelRow): boolean => {
    if (row.kind !== "officer" || !row.officerId) return false;
    if (!canBeSignatory({ resigned_at: row.resignedAt })) return false;
    if (row.isSignatory) return true;
    return !signatoryCapReached(activeSignatoryCount);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-destructive">
          Failed to load contacts: {(error as Error).message}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-5 w-5" />
            Contacts
          </CardTitle>
          <CardDescription>
            Active officers and other contacts for this company. Designate a primary contact, active
            signatories (max 10), and link people to their own SA client or portal login.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setAddContactOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Contact
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No contacts yet. Officers appear here automatically; add a non-officer contact above.
          </p>
        ) : (
          <RadioGroup
            value={data?.primaryContactPersonId ?? undefined}
            onValueChange={(personId) => setPrimaryMutation.mutate(personId)}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-center">Primary</TableHead>
                  <TableHead className="text-center">Signatory</TableHead>
                  <TableHead>SA Client</TableHead>
                  <TableHead className="text-right">Portal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.personId}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <UserRound className="h-4 w-4 text-muted-foreground" />
                        {row.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.kind === "officer" ? "secondary" : "outline"}>{row.roleLabel}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <RadioGroupItem
                        value={row.personId}
                        disabled={setPrimaryMutation.isPending}
                        aria-label={`Set ${row.name} as primary contact`}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={row.isSignatory}
                        disabled={!canToggleSignatory(row) || (setSignatoryMutation.isPending && pendingOfficerId === row.officerId)}
                        onCheckedChange={(checked) => handleSignatoryToggle(row, checked === true)}
                        aria-label={`Toggle signatory status for ${row.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      {row.linkedClientId ? (
                        <Badge variant="outline" className="gap-1 text-green-700 border-green-200 dark:text-green-400">
                          <Link2 className="h-3 w-3" />
                          Linked
                        </Badge>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setLinkSaClientFor(row)}>
                          <Link2 className="h-3.5 w-3.5 mr-1" />
                          Link SA client
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setPortalAccessFor(row)}>
                        <Mail className="h-3.5 w-3.5 mr-1" />
                        Portal access
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </RadioGroup>
        )}

        {activeSignatoryCount > 0 && (
          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            {activeSignatoryCount} of 10 active signatory slots used.
          </p>
        )}
      </CardContent>

      {organization?.id && (
        <AddCompanyContactDialog
          open={addContactOpen}
          onOpenChange={setAddContactOpen}
          companyId={companyId}
          organizationId={organization.id}
        />
      )}

      {organization?.id && linkSaClientFor && (
        <LinkSaClientDialog
          open={!!linkSaClientFor}
          onOpenChange={(open) => !open && setLinkSaClientFor(null)}
          companyId={companyId}
          organizationId={organization.id}
          personId={linkSaClientFor.personId}
          personName={linkSaClientFor.name}
        />
      )}

      {portalAccessFor && (
        <GrantPortalAccessDialog
          open={!!portalAccessFor}
          onOpenChange={(open) => !open && setPortalAccessFor(null)}
          companyId={companyId}
          personId={portalAccessFor.personId}
          personName={portalAccessFor.name}
          defaultEmail={portalAccessFor.email}
        />
      )}
    </Card>
  );
}
