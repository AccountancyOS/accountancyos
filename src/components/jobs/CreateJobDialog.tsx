import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { FormFieldError } from "@/components/ui/form-field-error";

interface CreateJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When opened from a client/company screen, lock the job to that entity. */
  preselectClientId?: string;
  preselectCompanyId?: string;
  preselectName?: string;
}

const SA_CODES = new Set(["sa_mtd", "sa_non_mtd"]);

/** Tax-year start years to offer for self-assessment (current ± a few). */
function taxYearOptions(): number[] {
  const now = new Date();
  // UK tax year starts 6 April.
  const afterApr6 = now.getMonth() > 3 || (now.getMonth() === 3 && now.getDate() >= 6);
  const current = afterApr6 ? now.getFullYear() : now.getFullYear() - 1;
  return [current + 1, current, current - 1, current - 2, current - 3, current - 4];
}
const taxYearLabel = (start: number) => `${start}/${String(start + 1).slice(2)}`;

export default function CreateJobDialog({
  open,
  onOpenChange,
  preselectClientId,
  preselectCompanyId,
  preselectName,
}: CreateJobDialogProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();

  const locked = !!(preselectClientId || preselectCompanyId);
  const [entityKey, setEntityKey] = useState("");
  const [serviceCode, setServiceCode] = useState("");
  const [years, setYears] = useState<number[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setEntityKey(
      preselectClientId ? `client:${preselectClientId}` :
      preselectCompanyId ? `company:${preselectCompanyId}` : "",
    );
    setServiceCode("");
    setYears([]);
    setErrors({});
  }, [open, preselectClientId, preselectCompanyId]);

  // Canonical service list (single source of service vocabulary).
  const { data: services } = useQuery({
    queryKey: ["services_catalog", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services_catalog")
        .select("code, name")
        .order("name");
      if (error) throw error;
      // de-dup by code (org + system rows can both exist)
      const seen = new Set<string>();
      return (data ?? []).filter((s) => s.code && !seen.has(s.code) && seen.add(s.code));
    },
    enabled: open,
  });

  const { data: clients } = useQuery({
    queryKey: ["clients", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("clients").select("id, first_name, last_name")
        .eq("organization_id", organization.id).order("first_name");
      if (error) throw error;
      return data;
    },
    enabled: open && !locked && !!organization?.id,
  });
  const { data: companies } = useQuery({
    queryKey: ["companies", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("companies").select("id, company_name")
        .eq("organization_id", organization.id).order("company_name");
      if (error) throw error;
      return data;
    },
    enabled: open && !locked && !!organization?.id,
  });

  const entities = useMemo(() => [
    ...(clients?.map((c) => ({ key: `client:${c.id}`, name: `${c.first_name} ${c.last_name}`, type: "client" })) ?? []),
    ...(companies?.map((c) => ({ key: `company:${c.id}`, name: c.company_name, type: "company" })) ?? []),
  ], [clients, companies]);

  const isSA = SA_CODES.has(serviceCode);

  const toggleYear = (y: number) =>
    setYears((prev) => prev.includes(y) ? prev.filter((x) => x !== y) : [...prev, y]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const [type, id] = entityKey.split(":");
      const clientId = type === "client" ? id : null;
      const companyId = type === "company" ? id : null;
      // SA: one job per selected year; everything else: a single job (default period).
      const taxYears = isSA ? years : [null];
      const results = [];
      for (const ty of taxYears) {
        // Cast: RPC is newer than the generated Supabase types.
        const { data, error } = await (supabase as any).rpc("lifecycle_create_manual_job", {
          p_client_id: clientId,
          p_company_id: companyId,
          p_service_code: serviceCode,
          p_tax_year_start: ty,
        });
        if (error) throw error;
        results.push(data);
      }
      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["deadlines"] });
      toast.success(results.length > 1 ? `${results.length} jobs created` : "Job created");
      onOpenChange(false);
    },
    onError: (e) => toast.error("Failed to create job", { description: e instanceof Error ? e.message : undefined }),
  });

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};
    if (!entityKey) newErrors.entity = "Select a client or company";
    if (!serviceCode) newErrors.service = "Select a service";
    if (isSA && years.length === 0) newErrors.years = "Select at least one tax year";
    setErrors(newErrors);
    if (Object.keys(newErrors).length) return;
    createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Create Job</DialogTitle>
          <DialogDescription>
            Jobs and their deadlines are created by the canonical engine, so manual and
            automated jobs are identical.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Client / Company *</Label>
            {locked ? (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                {preselectName ?? (preselectClientId ? "This client" : "This company")}
              </div>
            ) : (
              <Select value={entityKey} onValueChange={setEntityKey}>
                <SelectTrigger className={errors.entity ? "border-destructive" : ""}>
                  <SelectValue placeholder="Select client or company" />
                </SelectTrigger>
                <SelectContent>
                  {entities.map((e) => (
                    <SelectItem key={e.key} value={e.key}>{e.name} ({e.type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <FormFieldError error={errors.entity} />
          </div>

          <div className="space-y-2">
            <Label>Service *</Label>
            <Select value={serviceCode} onValueChange={(v) => { setServiceCode(v); setYears([]); }}>
              <SelectTrigger className={errors.service ? "border-destructive" : ""}>
                <SelectValue placeholder="Select service" />
              </SelectTrigger>
              <SelectContent>
                {(services ?? []).map((s) => (
                  <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormFieldError error={errors.service} />
          </div>

          {isSA && (
            <div className="space-y-2">
              <Label>Tax year(s) *</Label>
              <div className="flex flex-wrap gap-2">
                {taxYearOptions().map((y) => (
                  <Button
                    key={y}
                    type="button"
                    size="sm"
                    variant={years.includes(y) ? "default" : "outline"}
                    onClick={() => toggleYear(y)}
                  >
                    {taxYearLabel(y)}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                One job per selected year, each with its 31 January filing deadline auto-created.
              </p>
              <FormFieldError error={errors.years} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating…" : "Create Job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
