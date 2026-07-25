import { useState, useEffect, useRef } from "react";
import { useOrganization } from "@/lib/organization-context";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { getDefaultServiceCodesForLeadType, isIncludedLine } from "@/lib/quote-defaults";
import {
  isSaServiceCode,
  buildSaLines,
  saStartYearFromLabel,
  recentTaxYearStartYears,
} from "@/lib/proposal/sa-periods";
import {
  isMtdServiceCode,
  isMtdQuarterServiceCode,
  buildMtdQuarterLines,
  buildMtdFinalLines,
  mtdStartYearFromLabel,
} from "@/lib/proposal/mtd-periods";
import {
  isAccountsServiceCode,
  nextAccountsPeriodFromCH,
  accountsPeriodFromEnd,
  previousAccountsPeriod,
  type AccountsPeriod,
} from "@/lib/proposal/accounts-periods";
import {
  isVatServiceCode,
  buildVatLines,
  vatGeneratorArgs,
  defaultVatWindow,
  isVatConfigComplete,
  isVatGroupValid,
  vatConfigFromCompany,
  type VatPeriod,
  type VatConfig,
  type VatFrequency,
} from "@/lib/proposal/vat-periods";
import { Badge } from "@/components/ui/badge";

/**
 * Proposal Phase 1 T5b — per-VAT-service group state. The frequency/stagger and
 * ongoing-work choices are group-level (not per line): the generator is called
 * once per group and each SELECTED period becomes its own vat_return line.
 */
interface VatGroup extends VatConfig {
  /** Whether ongoing VAT work (not just historic catch-up) is being proposed. */
  ongoing: boolean;
  /** The label of the period marked as the FIRST ongoing VAT period. */
  ongoingStartLabel: string | null;
}

const EMPTY_VAT_GROUP: VatGroup = {
  frequency: null,
  staggerGroup: null,
  annualEndMonth: null,
  ongoing: true,
  ongoingStartLabel: null,
};

const VAT_MONTHS: { value: number; label: string }[] = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

/**
 * Reconcile the VAT lines for one service to exactly `selectedPeriods`, one
 * period-carrying line per period (deduped/sorted by `buildVatLines`). Existing
 * price/billing for a surviving period is preserved. When the selection is
 * empty a single bare "anchor" line is kept so the group's config UI stays
 * visible. The rebuilt group is kept where the first existing line for that
 * service sat.
 */
function reconcileVatLines(
  prev: QuoteLine[],
  serviceId: string,
  defaultPrice: number,
  selectedPeriods: VatPeriod[]
): QuoteLine[] {
  const priceByLabel = new Map<string, { unit_price: number; billing_frequency: "now" | "monthly" }>();
  prev.forEach((l) => {
    if (l.service_id === serviceId && l.period_label) {
      priceByLabel.set(l.period_label, {
        unit_price: l.unit_price,
        billing_frequency: l.billing_frequency,
      });
    }
  });

  const built: QuoteLine[] = buildVatLines(
    { service_id: serviceId, default_price: defaultPrice },
    selectedPeriods
  ).map((b) => {
    const existing = priceByLabel.get(b.period_label);
    return existing
      ? { ...b, unit_price: existing.unit_price, billing_frequency: existing.billing_frequency }
      : b;
  });

  const group: QuoteLine[] =
    built.length > 0
      ? built
      : [
          {
            service_id: serviceId,
            quantity: 1,
            unit_price: defaultPrice,
            billing_frequency: "monthly",
            period_start: null,
            period_end: null,
            period_label: null,
          },
        ];

  const others = prev.filter((l) => l.service_id !== serviceId);
  const firstIdx = prev.findIndex((l) => l.service_id === serviceId);
  if (firstIdx === -1) return [...others, ...group];
  const precedingOthers = prev.slice(0, firstIdx).filter((l) => l.service_id !== serviceId).length;
  const result = [...others];
  result.splice(precedingOthers, 0, ...group);
  return result;
}

interface CreateQuoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLeadId?: string;
}

interface QuoteLine {
  service_id: string;
  quantity: number;
  unit_price: number;
  billing_frequency: "now" | "monthly";
  // Proposal Phase 1 T3: exact compliance period carried per line (SA tax year, etc.).
  // The materialize engine COALESCEs these over its computed fallback → one job per period.
  period_start?: string | null;
  period_end?: string | null;
  period_label?: string | null;
  // Proposal Phase 1 T4: a CH-prefilled company_accounts period must be
  // explicitly confirmed by the accountant before the quote can be created.
  // UI-only — never persisted (the engine keys on the period fields, not this).
  period_confirmed?: boolean;
}

/**
 * Reconcile the SA lines for one service to exactly `selectedStartYears`, one
 * period-carrying line per year. Prices/billing already set for a year that
 * survives the change are preserved; new years default to the service price.
 * The rebuilt group is kept where the first existing line for that service sat.
 */
function reconcileSaLines(
  prev: QuoteLine[],
  serviceId: string,
  defaultPrice: number,
  selectedStartYears: number[]
): QuoteLine[] {
  const priceByYear = new Map<number, { unit_price: number; billing_frequency: "now" | "monthly" }>();
  prev.forEach((l) => {
    if (l.service_id === serviceId && l.period_label) {
      priceByYear.set(saStartYearFromLabel(l.period_label), {
        unit_price: l.unit_price,
        billing_frequency: l.billing_frequency,
      });
    }
  });

  const built: QuoteLine[] = buildSaLines({ service_id: serviceId, default_price: defaultPrice }, selectedStartYears).map(
    (b) => {
      const existing = priceByYear.get(saStartYearFromLabel(b.period_label));
      return existing ? { ...b, unit_price: existing.unit_price, billing_frequency: existing.billing_frequency } : b;
    }
  );

  const others = prev.filter((l) => l.service_id !== serviceId);
  if (built.length === 0) return others;

  const firstIdx = prev.findIndex((l) => l.service_id === serviceId);
  if (firstIdx === -1) return [...others, ...built];
  const precedingOthers = prev.slice(0, firstIdx).filter((l) => l.service_id !== serviceId).length;
  const result = [...others];
  result.splice(precedingOthers, 0, ...built);
  return result;
}

/**
 * Reconcile the MTD lines for one service to exactly `selectedStartYears`. A
 * quarterly (`mtd_quarter`) service expands to FOUR period-carrying lines per
 * year; a final-declaration (`mtd_itsa_final`) service to ONE per year. Existing
 * price/billing for a surviving period (keyed by `period_label`) is preserved.
 * The rebuilt group is kept where the first existing line for that service sat.
 */
function reconcileMtdLines(
  prev: QuoteLine[],
  serviceId: string,
  defaultPrice: number,
  isQuarter: boolean,
  selectedStartYears: number[]
): QuoteLine[] {
  const priceByLabel = new Map<string, { unit_price: number; billing_frequency: "now" | "monthly" }>();
  prev.forEach((l) => {
    if (l.service_id === serviceId && l.period_label) {
      priceByLabel.set(l.period_label, {
        unit_price: l.unit_price,
        billing_frequency: l.billing_frequency,
      });
    }
  });

  const drafts = isQuarter
    ? buildMtdQuarterLines({ service_id: serviceId, default_price: defaultPrice }, selectedStartYears)
    : buildMtdFinalLines({ service_id: serviceId, default_price: defaultPrice }, selectedStartYears);

  const built: QuoteLine[] = drafts.map((b) => {
    const existing = priceByLabel.get(b.period_label);
    return existing ? { ...b, unit_price: existing.unit_price, billing_frequency: existing.billing_frequency } : b;
  });

  const others = prev.filter((l) => l.service_id !== serviceId);
  if (built.length === 0) return others;

  const firstIdx = prev.findIndex((l) => l.service_id === serviceId);
  if (firstIdx === -1) return [...others, ...built];
  const precedingOthers = prev.slice(0, firstIdx).filter((l) => l.service_id !== serviceId).length;
  const result = [...others];
  result.splice(precedingOthers, 0, ...built);
  return result;
}

const CreateQuoteDialog = ({ open, onOpenChange, initialLeadId }: CreateQuoteDialogProps) => {
  const { organization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [leadId, setLeadId] = useState(initialLeadId || "");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [showPricing, setShowPricing] = useState(true);
  const [lines, setLines] = useState<QuoteLine[]>([
    { service_id: "", quantity: 1, unit_price: 0, billing_frequency: "now" },
  ]);
  const autoPopulatedRef = useRef(false);

  // Proposal Phase 1 T5b — VAT frequency/stagger + generated-period selection.
  // Group-level config keyed by service_id; generated candidates cached per group.
  const [vatGroups, setVatGroups] = useState<Record<string, VatGroup>>({});
  const [vatCandidates, setVatCandidates] = useState<Record<string, VatPeriod[]>>({});
  const [vatLoading, setVatLoading] = useState<Record<string, boolean>>({});
  const vatFetchKeyRef = useRef<Record<string, string>>({});
  // A stable ~2yr-back → ~1yr-forward candidate window for this dialog session.
  const vatWindow = useRef(defaultVatWindow()).current;

  const { data: leads } = useQuery({
    queryKey: ["leads", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("leads")
        .select("id, first_name, last_name, email, lead_type, ch_company_profile")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id && open,
  });

  const { data: services } = useQuery({
    queryKey: ["services", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("services_catalog")
        .select("*")
        .eq("organization_id", organization.id)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id && open,
  });

  // Reset selected lead when dialog opens with a new initialLeadId
  useEffect(() => {
    if (open) {
      setLeadId(initialLeadId || "");
      autoPopulatedRef.current = false;
    }
  }, [open, initialLeadId]);

  // Auto-populate default service lines once leads + services + initialLeadId are available
  useEffect(() => {
    if (!open || autoPopulatedRef.current) return;
    if (!initialLeadId || !leads || !services) return;
    const lead = leads.find((l) => l.id === initialLeadId);
    if (!lead) return;
    const defaults = getDefaultServiceCodesForLeadType((lead as any).lead_type);
    if (defaults.length === 0) {
      autoPopulatedRef.current = true;
      return;
    }
    // Only overwrite the initial single empty line — don't clobber user edits
    const isInitial =
      lines.length === 1 && !lines[0].service_id && lines[0].unit_price === 0;
    if (!isInitial) {
      autoPopulatedRef.current = true;
      return;
    }
    const newLines: QuoteLine[] = [];
    for (const def of defaults) {
      const svc = services.find((s: any) => s.canonical_service_code === def.code);
      if (!svc) continue;
      newLines.push({
        service_id: svc.id,
        quantity: 1,
        unit_price: svc.default_price ?? 0,
        billing_frequency: def.billing_frequency,
      });
    }
    if (newLines.length > 0) setLines(newLines);
    autoPopulatedRef.current = true;
  }, [open, initialLeadId, leads, services, lines]);

  // Proposal Phase 1 T5b — generate candidate VAT periods whenever a group's
  // config becomes complete (or its args change). The DB function
  // `generate_vat_periods` is the SOLE source of the stagger math + labels;
  // we never re-implement it here. The name is not yet in the generated
  // Supabase types, so the call is cast (repo pattern: `(supabase as any).rpc`).
  useEffect(() => {
    Object.entries(vatGroups).forEach(([serviceId, group]) => {
      const args = vatGeneratorArgs(group, vatWindow.from, vatWindow.to);
      if (!args) return;
      const key = JSON.stringify(args);
      if (vatFetchKeyRef.current[serviceId] === key) return;
      vatFetchKeyRef.current[serviceId] = key;
      void (async () => {
        setVatLoading((s) => ({ ...s, [serviceId]: true }));
        const { data, error } = await (supabase as any).rpc("generate_vat_periods", args);
        setVatLoading((s) => ({ ...s, [serviceId]: false }));
        if (error) {
          toast({
            title: "Could not generate VAT periods",
            description: error.message,
            variant: "destructive",
          });
          return;
        }
        setVatCandidates((s) => ({ ...s, [serviceId]: (data ?? []) as VatPeriod[] }));
      })();
    });
  }, [vatGroups, vatWindow, toast]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error("No organization");

      // Generate quote number
      const { data: quoteNumber, error: fnError } = await supabase.rpc(
        "generate_quote_number",
        { org_id: organization.id }
      );
      if (fnError) throw fnError;

      // Calculate total
      const total = lines.reduce(
        (sum, line) => sum + line.quantity * line.unit_price,
        0
      );

      // Create quote
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .insert({
          organization_id: organization.id,
          quote_number: quoteNumber,
          lead_id: leadId || null,
          total_amount: total,
          valid_until: validUntil || null,
          notes: notes || null,
          status: "draft",
        })
        .select()
        .single();

      if (quoteError) throw quoteError;

      // Create quote lines
      const quoteLines = lines.map((line, index) => {
        const svc = services?.find((s) => s.id === line.service_id);
        return {
          organization_id: organization.id,
          quote_id: quote.id,
          service_id: line.service_id,
          canonical_service_code: svc?.canonical_service_code ?? null,
          quantity: line.quantity,
          unit_price: line.unit_price,
          subtotal: line.quantity * line.unit_price,
          billing_frequency: line.billing_frequency,
          line_order: index,
          // Proposal Phase 1 T3: per-line exact period (SA tax year). Null for
          // non-period lines — the engine falls back to its computed period.
          period_start: line.period_start ?? null,
          period_end: line.period_end ?? null,
          period_label: line.period_label ?? null,
        };
      });

      const { error: linesError } = await supabase
        .from("quote_lines")
        .insert(quoteLines);

      if (linesError) throw linesError;

      return quote;
    },
    onSuccess: (quote) => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast({ title: "Quote created successfully" });
      onOpenChange(false);
      navigate(`/quotes/${quote.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error creating quote",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addLine = () => {
    setLines([...lines, { service_id: "", quantity: 1, unit_price: 0, billing_frequency: "now" }]);
  };

  const removeLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  // Recent tax years to offer for SA selection: current tax year + previous 6.
  const saYearOptions = recentTaxYearStartYears(7);

  const selectedSaYears = (serviceId: string): number[] =>
    lines
      .filter((l) => l.service_id === serviceId && l.period_label)
      .map((l) => saStartYearFromLabel(l.period_label as string));

  const toggleSaYear = (serviceId: string, defaultPrice: number, year: number) => {
    const current = selectedSaYears(serviceId);
    const next = current.includes(year) ? current.filter((y) => y !== year) : [...current, year];
    setLines((prev) => reconcileSaLines(prev, serviceId, defaultPrice, next));
  };

  // Proposal Phase 1 T6b-3 — MTD ITSA tax-year selection (mirrors SA). The same
  // chip multiselect drives both `mtd_quarter` (4 lines/year) and
  // `mtd_itsa_final` (1 line/year); the selected years are reconstructed from
  // each MTD line's `period_label` (`MTD … YYYY/YY`).
  const selectedMtdYears = (serviceId: string): number[] => {
    const years = lines
      .filter((l) => l.service_id === serviceId && l.period_label)
      .map((l) => mtdStartYearFromLabel(l.period_label as string))
      .filter((y) => !Number.isNaN(y));
    return Array.from(new Set(years));
  };

  const toggleMtdYear = (serviceId: string, defaultPrice: number, isQuarter: boolean, year: number) => {
    const current = selectedMtdYears(serviceId);
    const next = current.includes(year) ? current.filter((y) => y !== year) : [...current, year];
    setLines((prev) => reconcileMtdLines(prev, serviceId, defaultPrice, isQuarter, next));
  };

  // The selected lead carries the raw Companies House profile (limited_company /
  // llp leads) — the source for the accounts-period prefill.
  const selectedLead = leads?.find((l) => l.id === leadId);
  const chAccountsPeriod = selectedLead
    ? nextAccountsPeriodFromCH(selectedLead as any)
    : null;

  /** The oldest confirmed/prefilled accounts period currently on this service. */
  const earliestAccountsPeriod = (serviceId: string): AccountsPeriod | null => {
    const periods = lines
      .filter((l) => l.service_id === serviceId && l.period_end && l.period_label)
      .map((l) => accountsPeriodFromEnd(l.period_end as string, l.period_start ?? null));
    if (periods.length === 0) return null;
    return periods.reduce((oldest, p) => (p.period_end < oldest.period_end ? p : oldest));
  };

  /** Edit an accounts line's year-end: recompute label + derive start if blank. */
  const updateAccountsPeriodEnd = (index: number, periodEnd: string) => {
    setLines((prev) => {
      const next = [...prev];
      const line = next[index];
      if (!periodEnd) {
        next[index] = { ...line, period_end: periodEnd, period_label: null };
        return next;
      }
      const period = accountsPeriodFromEnd(periodEnd, line.period_start ?? null);
      next[index] = {
        ...line,
        period_start: line.period_start ?? period.period_start,
        period_end: period.period_end,
        period_label: period.period_label,
      };
      return next;
    });
  };

  const updateAccountsPeriodStart = (index: number, periodStart: string) => {
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], period_start: periodStart || null };
      return next;
    });
  };

  const confirmAccountsPeriod = (index: number, confirmed: boolean) => {
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], period_confirmed: confirmed };
      return next;
    });
  };

  /**
   * Add an earlier ("catch-up") accounts period as its own line, one year before
   * the current oldest period for that service. Each becomes a separate
   * company_accounts line → a separate Accounts job.
   */
  const addCatchUpAccountsPeriod = (serviceId: string, defaultPrice: number) => {
    const oldest = earliestAccountsPeriod(serviceId);
    const period = oldest
      ? previousAccountsPeriod(oldest)
      : chAccountsPeriod
      ? accountsPeriodFromEnd(chAccountsPeriod.period_end, chAccountsPeriod.period_start)
      : null;
    if (!period) return;
    setLines((prev) => {
      // Insert after the last line of this service group so periods stay grouped.
      let lastIdx = -1;
      prev.forEach((l, i) => {
        if (l.service_id === serviceId) lastIdx = i;
      });
      const catchUpLine: QuoteLine = {
        service_id: serviceId,
        quantity: 1,
        unit_price: defaultPrice,
        billing_frequency: "monthly",
        period_start: period.period_start,
        period_end: period.period_end,
        period_label: period.period_label,
        // The accountant explicitly created this earlier period — treat the
        // deliberate click as confirmation (still editable below).
        period_confirmed: true,
      };
      const next = [...prev];
      next.splice(lastIdx + 1, 0, catchUpLine);
      return next;
    });
  };

  // ── Proposal Phase 1 T5b — VAT period selection helpers ──────────────────
  const vatDefaultPrice = (serviceId: string): number =>
    services?.find((s) => s.id === serviceId)?.default_price ?? 0;

  /** The periods currently selected for a VAT service, reconstructed from lines. */
  const selectedVatPeriods = (serviceId: string): VatPeriod[] =>
    lines
      .filter((l) => l.service_id === serviceId && l.period_label && l.period_start && l.period_end)
      .map((l) => ({
        period_start: l.period_start as string,
        period_end: l.period_end as string,
        period_label: l.period_label as string,
      }));

  const selectedVatLabels = (serviceId: string): string[] =>
    selectedVatPeriods(serviceId).map((p) => p.period_label);

  /** Add/remove one generated candidate period from a VAT service group. */
  const toggleVatPeriod = (serviceId: string, period: VatPeriod) => {
    const current = selectedVatPeriods(serviceId);
    const has = current.some((p) => p.period_label === period.period_label);
    const next = has
      ? current.filter((p) => p.period_label !== period.period_label)
      : [...current, period];
    setLines((prev) => reconcileVatLines(prev, serviceId, vatDefaultPrice(serviceId), next));
    // If the removed period was the designated first ongoing period, clear it.
    if (has) {
      setVatGroups((g) => {
        const group = g[serviceId];
        if (group && group.ongoingStartLabel === period.period_label) {
          return { ...g, [serviceId]: { ...group, ongoingStartLabel: null } };
        }
        return g;
      });
    }
  };

  /** Change frequency: reset stagger/month + selected periods + candidates. */
  const setVatFrequency = (serviceId: string, frequency: VatFrequency) => {
    setVatGroups((g) => ({
      ...g,
      [serviceId]: {
        ...(g[serviceId] ?? EMPTY_VAT_GROUP),
        frequency,
        staggerGroup: null,
        annualEndMonth: null,
        ongoingStartLabel: null,
      },
    }));
    setVatCandidates((s) => ({ ...s, [serviceId]: [] }));
    setLines((prev) => reconcileVatLines(prev, serviceId, vatDefaultPrice(serviceId), []));
  };

  const setVatStagger = (serviceId: string, staggerGroup: 1 | 2 | 3) => {
    setVatGroups((g) => ({
      ...g,
      [serviceId]: { ...(g[serviceId] ?? EMPTY_VAT_GROUP), staggerGroup, ongoingStartLabel: null },
    }));
    setLines((prev) => reconcileVatLines(prev, serviceId, vatDefaultPrice(serviceId), []));
  };

  const setVatAnnualMonth = (serviceId: string, annualEndMonth: number) => {
    setVatGroups((g) => ({
      ...g,
      [serviceId]: { ...(g[serviceId] ?? EMPTY_VAT_GROUP), annualEndMonth, ongoingStartLabel: null },
    }));
    setLines((prev) => reconcileVatLines(prev, serviceId, vatDefaultPrice(serviceId), []));
  };

  const setVatOngoing = (serviceId: string, ongoing: boolean) => {
    setVatGroups((g) => ({
      ...g,
      [serviceId]: {
        ...(g[serviceId] ?? EMPTY_VAT_GROUP),
        ongoing,
        ongoingStartLabel: ongoing ? g[serviceId]?.ongoingStartLabel ?? null : null,
      },
    }));
  };

  const setVatOngoingStart = (serviceId: string, ongoingStartLabel: string) => {
    setVatGroups((g) => ({
      ...g,
      [serviceId]: { ...(g[serviceId] ?? EMPTY_VAT_GROUP), ongoingStartLabel },
    }));
  };

  const updateLine = (index: number, field: keyof QuoteLine, value: any) => {
    // Selecting an SA service turns the line into a per-tax-year group: default to
    // the current tax year (one line/one job) and reveal the tax-year multiselect.
    if (field === "service_id") {
      const service = services?.find((s) => s.id === value);
      // Company Accounts: prefill the first outstanding CH accounts period as an
      // editable/confirmable row (one company_accounts line per period).
      if (service && isAccountsServiceCode((service as any).code)) {
        setLines((prev) => {
          const next = [...prev];
          const prefill = chAccountsPeriod
            ? accountsPeriodFromEnd(chAccountsPeriod.period_end, chAccountsPeriod.period_start)
            : null;
          next[index] = {
            ...next[index],
            service_id: service.id,
            unit_price: service.default_price,
            period_start: prefill?.period_start ?? null,
            period_end: prefill?.period_end ?? null,
            period_label: prefill?.period_label ?? null,
            // Require the accountant to confirm the auto-prefilled period.
            period_confirmed: false,
          };
          return next;
        });
        return;
      }
      // VAT Return: turn the line into a frequency/stagger-driven period group.
      // Prefill the config best-effort from a linked company's VAT settings, but
      // require the accountant to confirm/complete it and select every period.
      if (service && isVatServiceCode((service as any).code)) {
        const seed = vatConfigFromCompany(selectedLead as any);
        setVatGroups((g) => ({
          ...g,
          [service.id]: {
            ...EMPTY_VAT_GROUP,
            frequency: seed.frequency,
            staggerGroup: seed.staggerGroup,
            annualEndMonth: seed.annualEndMonth,
          },
        }));
        setVatCandidates((s) => ({ ...s, [service.id]: [] }));
        setLines((prev) => {
          const seeded = [...prev];
          seeded[index] = {
            ...seeded[index],
            service_id: service.id,
            unit_price: service.default_price,
            period_start: null,
            period_end: null,
            period_label: null,
            period_confirmed: undefined,
          };
          return reconcileVatLines(seeded, service.id, service.default_price, []);
        });
        return;
      }
      if (service && isSaServiceCode((service as any).code)) {
        const existing = selectedSaYears(service.id);
        const years = existing.length > 0 ? existing : [recentTaxYearStartYears(1)[0]];
        setLines((prev) => {
          // Point the just-edited line at the SA service, then reconcile the group.
          const seeded = [...prev];
          seeded[index] = { ...seeded[index], service_id: service.id, unit_price: service.default_price };
          return reconcileSaLines(seeded, service.id, service.default_price, years);
        });
        return;
      }
      // MTD ITSA (quarterly or final): same tax-year chip multiselect as SA;
      // default to the current tax year, then expand to 4 (quarter) or 1 (final)
      // period-carrying lines per selected year.
      if (service && isMtdServiceCode((service as any).code)) {
        const isQuarter = isMtdQuarterServiceCode((service as any).code);
        const existing = selectedMtdYears(service.id);
        const years = existing.length > 0 ? existing : [recentTaxYearStartYears(1)[0]];
        setLines((prev) => {
          const seeded = [...prev];
          seeded[index] = { ...seeded[index], service_id: service.id, unit_price: service.default_price };
          return reconcileMtdLines(seeded, service.id, service.default_price, isQuarter, years);
        });
        return;
      }
    }

    const newLines = [...lines];
    newLines[index] = { ...newLines[index], [field]: value };

    // Auto-populate unit price when a (non-SA/non-accounts) service is selected,
    // and clear any stale period fields carried over from a previous selection.
    if (field === "service_id") {
      const service = services?.find((s) => s.id === value);
      if (service) {
        newLines[index].unit_price = service.default_price;
      }
      newLines[index].period_start = null;
      newLines[index].period_end = null;
      newLines[index].period_label = null;
      newLines[index].period_confirmed = undefined;
    }

    setLines(newLines);
  };

  const payableNow = lines
    .filter((line) => line.billing_frequency === "now" && !isIncludedLine(line))
    .reduce((sum, line) => sum + line.quantity * line.unit_price, 0);

  const payableMonthly = lines
    .filter((line) => line.billing_frequency === "monthly" && !isIncludedLine(line))
    .reduce((sum, line) => sum + line.quantity * (line.unit_price / 12), 0);

  const totalAmount = payableNow + payableMonthly;

  // Every CH-prefilled/edited company_accounts line must have a confirmed,
  // labelled period before the quote can be created.
  const unconfirmedAccountsLine = lines.some((l) => {
    const svc = services?.find((s) => s.id === l.service_id);
    return (
      svc &&
      isAccountsServiceCode((svc as any).code) &&
      (!l.period_label || !l.period_end || l.period_confirmed !== true)
    );
  });

  // Proposal Phase 1 T5b — block submit if a VAT service is added but its
  // frequency/stagger is unset, no period is selected, or ongoing VAT work is
  // proposed without an identified first ongoing period.
  const vatGroupInvalid = Object.entries(vatGroups).some(([serviceId, group]) => {
    if (!lines.some((l) => l.service_id === serviceId)) return false;
    return !isVatGroupValid({
      config: group,
      selectedLabels: selectedVatLabels(serviceId),
      ongoing: group.ongoing,
      ongoingStartLabel: group.ongoingStartLabel,
    });
  });

  const canSubmit =
    lines.every((l) => l.service_id && l.quantity > 0) &&
    !unconfirmedAccountsLine &&
    !vatGroupInvalid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Quote</DialogTitle>
          <DialogDescription>
            Build a quote for a lead with services from your catalog
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="lead">Lead (Optional)</Label>
            <Select value={leadId} onValueChange={setLeadId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a lead..." />
              </SelectTrigger>
              <SelectContent>
                {leads?.map((lead) => (
                  <SelectItem key={lead.id} value={lead.id}>
                    {lead.first_name} {lead.last_name} ({lead.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="valid_until">Valid Until</Label>
            <Input
              id="valid_until"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Quote Lines</Label>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="show-pricing"
                    checked={showPricing}
                    onCheckedChange={setShowPricing}
                  />
                  <Label htmlFor="show-pricing" className="text-sm cursor-pointer">
                    {showPricing ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    <span className="ml-1">Show pricing details</span>
                  </Label>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Line
                </Button>
              </div>
            </div>

            {lines.map((line, index) => {
              const service = services?.find((s) => s.id === line.service_id);
              const included = isIncludedLine(line);
              const isSa = !!service && isSaServiceCode((service as any).code);
              // Render the tax-year multiselect once, on the first line of each SA group.
              const isSaGroupHead =
                isSa &&
                lines.findIndex((l) => l.service_id === line.service_id) === index;
              const isAccounts = !!service && isAccountsServiceCode((service as any).code);
              // The head line of each company_accounts group owns the "add catch-up" control.
              const isAccountsGroupHead =
                isAccounts &&
                lines.findIndex((l) => l.service_id === line.service_id) === index;
              const isVat = !!service && isVatServiceCode((service as any).code);
              // The head line of each VAT group owns the frequency/stagger + period picker.
              const isVatGroupHead =
                isVat &&
                lines.findIndex((l) => l.service_id === line.service_id) === index;
              const isMtd = !!service && isMtdServiceCode((service as any).code);
              const isMtdQuarter = !!service && isMtdQuarterServiceCode((service as any).code);
              // The head line of each MTD group owns the tax-year chip multiselect.
              const isMtdGroupHead =
                isMtd &&
                lines.findIndex((l) => l.service_id === line.service_id) === index;
              const vatGroup = isVat ? vatGroups[line.service_id] ?? EMPTY_VAT_GROUP : null;
              const monthlyPrice = line.billing_frequency === "monthly"
                ? line.unit_price / 12
                : line.unit_price;
              const displaySubtotal = line.billing_frequency === "monthly"
                ? (line.quantity * monthlyPrice)
                : (line.quantity * line.unit_price);

              return (
                <div key={index} className="space-y-2">
                {isSaGroupHead && service && (
                  <div className="rounded-md border bg-muted/40 p-3 space-y-2">
                    <div className="text-sm font-medium">
                      Which tax years? ({service.name})
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Each selected year becomes its own return, line and job — priced independently.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(new Set([...saYearOptions, ...selectedSaYears(service.id)]))
                        .sort((a, b) => b - a)
                        .map((year) => {
                          const active = selectedSaYears(service.id).includes(year);
                          const label = `${year}/${String(year + 1).slice(-2).padStart(2, "0")}`;
                          return (
                            <Button
                              key={year}
                              type="button"
                              size="sm"
                              variant={active ? "default" : "outline"}
                              onClick={() => toggleSaYear(service.id, service.default_price, year)}
                            >
                              {label}
                            </Button>
                          );
                        })}
                    </div>
                  </div>
                )}
                {isMtdGroupHead && service && (
                  <div className="rounded-md border bg-muted/40 p-3 space-y-2">
                    <div className="text-sm font-medium">
                      Which tax years? ({service.name})
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {isMtdQuarter
                        ? "Each selected tax year expands to its four MTD quarters — each its own line and job, priced independently."
                        : "Each selected tax year becomes its own final declaration, line and job."}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(new Set([...saYearOptions, ...selectedMtdYears(service.id)]))
                        .sort((a, b) => b - a)
                        .map((year) => {
                          const active = selectedMtdYears(service.id).includes(year);
                          const label = `${year}/${String(year + 1).slice(-2).padStart(2, "0")}`;
                          return (
                            <Button
                              key={year}
                              type="button"
                              size="sm"
                              variant={active ? "default" : "outline"}
                              onClick={() =>
                                toggleMtdYear(service.id, service.default_price, isMtdQuarter, year)
                              }
                            >
                              {label}
                            </Button>
                          );
                        })}
                    </div>
                  </div>
                )}
                {isAccounts && service && (
                  <div className="rounded-md border bg-muted/40 p-3 space-y-3">
                    {isAccountsGroupHead && (
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium">
                            Accounts period ({service.name})
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Prefilled from Companies House — confirm or correct it. Add earlier
                            periods to catch up; each period becomes its own Accounts job.
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            addCatchUpAccountsPeriod(service.id, service.default_price)
                          }
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add catch-up accounts period
                        </Button>
                      </div>
                    )}
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Period start</Label>
                        <Input
                          type="date"
                          className="w-40"
                          value={line.period_start ?? ""}
                          onChange={(e) => updateAccountsPeriodStart(index, e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Year-end (made up to)</Label>
                        <Input
                          type="date"
                          className="w-40"
                          value={line.period_end ?? ""}
                          onChange={(e) => updateAccountsPeriodEnd(index, e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Period</Label>
                        <div className="h-10 flex items-center px-3 border rounded-md bg-background text-sm font-medium">
                          {line.period_label ?? "—"}
                        </div>
                      </div>
                      {isAccountsGroupHead &&
                        chAccountsPeriod?.overdue &&
                        line.period_end === chAccountsPeriod.period_end && (
                          <Badge variant="destructive" className="mb-2">
                            Overdue at Companies House
                          </Badge>
                        )}
                      <div className="flex items-center gap-2 mb-2">
                        <Switch
                          id={`confirm-acc-${index}`}
                          checked={line.period_confirmed === true}
                          onCheckedChange={(v) => confirmAccountsPeriod(index, v)}
                        />
                        <Label
                          htmlFor={`confirm-acc-${index}`}
                          className="text-xs cursor-pointer"
                        >
                          {line.period_confirmed ? "Period confirmed" : "Confirm period"}
                        </Label>
                      </div>
                    </div>
                    {!line.period_end && (
                      <p className="text-xs text-amber-600">
                        No Companies House accounts date found — enter the year-end manually.
                      </p>
                    )}
                  </div>
                )}
                {isVatGroupHead && service && vatGroup && (
                  <div className="rounded-md border bg-muted/40 p-3 space-y-3">
                    <div>
                      <div className="text-sm font-medium">VAT periods ({service.name})</div>
                      <p className="text-xs text-muted-foreground">
                        Choose the VAT frequency and stagger, then select every exact period —
                        including catch-up returns. Each selected period becomes its own VAT line
                        and job, priced independently.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-end gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Frequency</Label>
                        <Select
                          value={vatGroup.frequency ?? ""}
                          onValueChange={(v) => setVatFrequency(service.id, v as VatFrequency)}
                        >
                          <SelectTrigger className="w-48" aria-label="VAT frequency">
                            <SelectValue placeholder="Select frequency..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="quarterly">Quarterly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="annual_accounting">Annual accounting</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {vatGroup.frequency === "quarterly" && (
                        <div className="space-y-1">
                          <Label className="text-xs">Stagger group</Label>
                          <Select
                            value={vatGroup.staggerGroup ? String(vatGroup.staggerGroup) : ""}
                            onValueChange={(v) =>
                              setVatStagger(service.id, Number(v) as 1 | 2 | 3)
                            }
                          >
                            <SelectTrigger className="w-56" aria-label="VAT stagger group">
                              <SelectValue placeholder="Select stagger..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">Group 1 — Mar/Jun/Sep/Dec</SelectItem>
                              <SelectItem value="2">Group 2 — Apr/Jul/Oct/Jan</SelectItem>
                              <SelectItem value="3">Group 3 — May/Aug/Nov/Feb</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {vatGroup.frequency === "annual_accounting" && (
                        <div className="space-y-1">
                          <Label className="text-xs">Annual period-end month</Label>
                          <Select
                            value={vatGroup.annualEndMonth ? String(vatGroup.annualEndMonth) : ""}
                            onValueChange={(v) => setVatAnnualMonth(service.id, Number(v))}
                          >
                            <SelectTrigger className="w-44" aria-label="VAT annual period-end month">
                              <SelectValue placeholder="Select month..." />
                            </SelectTrigger>
                            <SelectContent>
                              {VAT_MONTHS.map((m) => (
                                <SelectItem key={m.value} value={String(m.value)}>
                                  {m.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    {!isVatConfigComplete(vatGroup) && (
                      <p className="text-xs text-amber-600">
                        Set the VAT frequency
                        {vatGroup.frequency === "quarterly"
                          ? " and stagger group"
                          : vatGroup.frequency === "annual_accounting"
                          ? " and period-end month"
                          : ""}{" "}
                        to list selectable periods.
                      </p>
                    )}

                    {isVatConfigComplete(vatGroup) && (
                      <div className="space-y-2">
                        <div className="text-xs font-medium">
                          Select every VAT period to file{" "}
                          {vatLoading[service.id] ? "(loading…)" : ""}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(vatCandidates[service.id] ?? []).map((p) => {
                            const active = selectedVatLabels(service.id).includes(p.period_label);
                            return (
                              <Button
                                key={p.period_label}
                                type="button"
                                size="sm"
                                variant={active ? "default" : "outline"}
                                onClick={() => toggleVatPeriod(service.id, p)}
                              >
                                {p.period_label}
                              </Button>
                            );
                          })}
                          {!vatLoading[service.id] &&
                            (vatCandidates[service.id] ?? []).length === 0 && (
                              <span className="text-xs text-muted-foreground">
                                No periods generated for this window.
                              </span>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-4 pt-1">
                          <div className="flex items-center gap-2">
                            <Switch
                              id={`vat-ongoing-${index}`}
                              checked={vatGroup.ongoing}
                              onCheckedChange={(v) => setVatOngoing(service.id, v)}
                            />
                            <Label
                              htmlFor={`vat-ongoing-${index}`}
                              className="text-xs cursor-pointer"
                            >
                              Proposing ongoing VAT work
                            </Label>
                          </div>

                          {vatGroup.ongoing && (
                            <div className="flex items-center gap-2">
                              <Label className="text-xs">First ongoing period</Label>
                              <Select
                                value={vatGroup.ongoingStartLabel ?? ""}
                                onValueChange={(v) => setVatOngoingStart(service.id, v)}
                              >
                                <SelectTrigger
                                  className="w-56"
                                  aria-label="First ongoing VAT period"
                                >
                                  <SelectValue placeholder="Identify first ongoing period..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {selectedVatPeriods(service.id).map((p) => (
                                    <SelectItem key={p.period_label} value={p.period_label}>
                                      {p.period_label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>

                        {vatGroup.ongoing && !vatGroup.ongoingStartLabel && (
                          <p className="text-xs text-amber-600">
                            Identify the first ongoing VAT period to continue.
                          </p>
                        )}
                        {selectedVatLabels(service.id).length === 0 && (
                          <p className="text-xs text-amber-600">
                            Select at least one VAT period.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-2 items-end">
                  <div className="flex-1 space-y-2">
                    <Label>Service</Label>
                    <Select
                      value={line.service_id}
                      onValueChange={(value) => updateLine(index, "service_id", value)}
                    >
                      <SelectTrigger aria-label={`Service for line ${index + 1}`}>
                        <SelectValue placeholder="Select service..." />
                      </SelectTrigger>
                      <SelectContent>
                        {services?.map((service) => (
                          <SelectItem key={service.id} value={service.id}>
                            {service.name} - £{service.default_price.toFixed(2)}/year
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="w-32 space-y-2">
                    <Label>Billing</Label>
                    <Select
                      value={line.billing_frequency}
                      onValueChange={(value: "now" | "monthly") =>
                        updateLine(index, "billing_frequency", value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="now">Bill Now</SelectItem>
                        <SelectItem value="monthly">Bill Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {showPricing && (
                    <>
                      {isSa ? (
                        <div className="w-24 space-y-2">
                          <Label>Tax Year</Label>
                          <div className="h-10 flex items-center px-3 border rounded-md bg-muted font-medium text-sm">
                            {line.period_label ?? "—"}
                          </div>
                        </div>
                      ) : isAccounts ? (
                        <div className="w-28 space-y-2">
                          <Label>Period</Label>
                          <div className="h-10 flex items-center px-3 border rounded-md bg-muted font-medium text-sm">
                            {line.period_label ?? "—"}
                          </div>
                        </div>
                      ) : isVat ? (
                        <div className="w-44 space-y-2">
                          <Label>VAT period</Label>
                          <div className="h-10 flex items-center px-3 border rounded-md bg-muted font-medium text-sm">
                            {line.period_label ?? "—"}
                          </div>
                        </div>
                      ) : isMtd ? (
                        <div className="w-44 space-y-2">
                          <Label>MTD period</Label>
                          <div className="h-10 flex items-center px-3 border rounded-md bg-muted font-medium text-sm">
                            {line.period_label ?? "—"}
                          </div>
                        </div>
                      ) : (
                        <div className="w-24 space-y-2">
                          <Label>Qty</Label>
                          <Input
                            type="number"
                            min="1"
                            step="0.1"
                            value={line.quantity}
                            onChange={(e) =>
                              updateLine(index, "quantity", parseFloat(e.target.value))
                            }
                          />
                        </div>
                      )}

                      <div className="w-32 space-y-2">
                        <Label>Annual Price</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unit_price}
                          onChange={(e) =>
                            updateLine(index, "unit_price", parseFloat(e.target.value))
                          }
                        />
                      </div>

                      <div className="w-32 space-y-2">
                        <Label>
                          {included ? "Included" : line.billing_frequency === "monthly" ? "Monthly" : "Now"}
                        </Label>
                        <div className="h-10 flex items-center px-3 border rounded-md bg-muted font-medium">
                          {included ? (
                            <span className="text-emerald-700 text-sm">Included</span>
                          ) : (
                            <>£{displaySubtotal.toFixed(2)}</>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {!showPricing && service && (
                    <div className="flex-1 text-sm text-muted-foreground italic">
                      {service.name}
                    </div>
                  )}

                  {lines.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeLine(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t space-y-3">
            <div className="flex justify-between items-center">
              <div className="text-sm font-medium">Payable Now</div>
              <div className="text-lg font-semibold">
                £{payableNow.toFixed(2)}
              </div>
            </div>
            <div className="flex justify-between items-center">
              <div className="text-sm font-medium">Payable Monthly</div>
              <div className="text-lg font-semibold">
                £{payableMonthly.toFixed(2)}
              </div>
            </div>
            <div className="flex justify-between items-center pt-3 border-t">
              <div className="text-sm text-muted-foreground">Total Amount</div>
              <div className="text-2xl font-semibold">
                £{totalAmount.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any additional notes for this quote..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!canSubmit || createMutation.isPending}
            >
              Create Quote
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateQuoteDialog;
