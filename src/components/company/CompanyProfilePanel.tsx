import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { differenceInDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Hash, Calendar, MapPin, Phone, User, FileText, Flag } from "lucide-react";
import { formatDate } from "@/lib/format-utils";
import { deriveCompanyStatus, type CompanyStatusLabel, type CompanyStatusInput } from "@/lib/company-status-model";
import { RegisteredOfficeCorrectionDialog } from "@/components/company/RegisteredOfficeCorrectionDialog";
import type { Tables } from "@/integrations/supabase/types";

/**
 * The Phase-2 migration (supabase/migrations/20260720190000_company_profile_person_fields.sql)
 * added trading_as / primary_contact_person_id / accounts_next_due to `companies`. The generated
 * Supabase types regenerate from the live DB, which hasn't had that migration applied yet, so
 * those columns aren't in `Tables<"companies">`. Extend the generated Row locally and cast the
 * query result, rather than sprinkling `as any` at every access site below.
 */
type CompanyProfileRow = Tables<"companies"> & {
  trading_as: string | null;
  primary_contact_person_id: string | null;
  accounts_next_due: string | null;
  registered_office_dispute_note: string | null;
};

interface CompanyProfilePanelProps {
  companyId: string;
}

const STATUS_BADGE: Record<CompanyStatusLabel, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  dormant: { label: "Dormant", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  dissolved: { label: "Dissolved", className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" },
  liquidation: { label: "Liquidation", className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  pending: { label: "Pending", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  disengaged: { label: "Disengaged", className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" },
  archived: { label: "Archived", className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" },
  unknown: { label: "Unknown", className: "bg-muted text-muted-foreground" },
};

/** Both jsonb address shapes seen in this codebase: the CH-sync shape (locality/postal_code)
 *  and the legacy flat shape used for trading_address (city/postcode). Handle either. */
type AddressJson = {
  address_line_1?: string | null;
  address_line_2?: string | null;
  locality?: string | null;
  city?: string | null;
  region?: string | null;
  county?: string | null;
  postal_code?: string | null;
  postcode?: string | null;
  country?: string | null;
} | null;

function formatAddressLines(addr: AddressJson): string[] {
  if (!addr || typeof addr !== "object") return [];
  const lines: string[] = [];
  if (addr.address_line_1) lines.push(addr.address_line_1);
  if (addr.address_line_2) lines.push(addr.address_line_2);
  const region = addr.region || addr.county;
  if (region) lines.push(region);
  const cityLine = [addr.locality || addr.city, addr.postal_code || addr.postcode].filter(Boolean).join(", ");
  if (cityLine) lines.push(cityLine);
  if (addr.country) lines.push(addr.country);
  return lines;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatYearEnd(day: number | null, month: number | null): string | null {
  if (!day || !month || month < 1 || month > 12) return null;
  return `${day} ${MONTHS[month - 1]}`;
}

type DeadlineCategory =
  | "accounts"
  | "charity_accounts"
  | "ct600"
  | "ct_payment"
  | "cs01"
  | "vat"
  | "payroll";

const DEADLINE_ORDER: DeadlineCategory[] = [
  "accounts",
  "charity_accounts",
  "ct600",
  "ct_payment",
  "cs01",
  "vat",
  "payroll",
];

const DEADLINE_LABELS: Record<DeadlineCategory, string> = {
  accounts: "Accounts",
  charity_accounts: "Charity Accounts",
  ct600: "CT600",
  ct_payment: "CT Payment",
  cs01: "Confirmation Statement",
  vat: "VAT Return",
  payroll: "Payroll",
};

const OUTSTANDING_DEADLINE_STATUSES = ["pending", "in_progress", "overdue"];

/**
 * Exact service_code -> bucket map, built from the actual codes the
 * deadline engine writes (src/lib/deadline-engine.ts). Deliberately exact
 * (not substring) matching: CHARITY_ACCOUNTS and ACCOUNTS_FILING must not
 * collapse into the same "Accounts" chip, and CT_PAYMENT (a payment
 * obligation) must not collapse into the CT600 filing chip.
 *
 * Company-scoped codes covered here: ACCOUNTS_FILING, CHARITY_ACCOUNTS,
 * CT600_FILING, CT_PAYMENT, CS01, VAT_RETURN, RTI_EPS, RTI_P60. Other codes
 * the engine emits (SA_*, CGT_60DAY) are client-scoped, not company-scoped,
 * and never appear on this panel's `deadlines` query. CIS_RETURN and
 * CHARITY_AR are company-scoped but have no dedicated chip here; they fall
 * through to the generic bucket below (unclassified, not mislabelled).
 */
const SERVICE_CODE_TO_CATEGORY: Record<string, DeadlineCategory> = {
  ACCOUNTS_FILING: "accounts",
  CHARITY_ACCOUNTS: "charity_accounts",
  CT600_FILING: "ct600",
  CT_PAYMENT: "ct_payment",
  CS01: "cs01",
  VAT_RETURN: "vat",
  RTI_EPS: "payroll",
  RTI_P60: "payroll",
};

function classifyDeadline(row: {
  service_code: string | null;
  canonical_service_code: string | null;
  deadline_type: string | null;
}): DeadlineCategory | null {
  const code = (row.service_code || row.canonical_service_code || row.deadline_type || "").toUpperCase().trim();
  if (!code) return null;

  const known = SERVICE_CODE_TO_CATEGORY[code];
  if (known) return known;

  // Generic fallback for codes outside the known set above (e.g. future
  // RTI variants, or free-text deadline_type values).
  if (code.startsWith("RTI_") || code.includes("PAYROLL")) return "payroll";
  if (code.includes("CONFIRMATION")) return "cs01";
  if (code.includes("VAT")) return "vat";
  return null;
}

function deadlineUrgencyClass(dueDateIso: string): string {
  const daysRemaining = differenceInDays(new Date(dueDateIso), new Date());
  if (daysRemaining < 0) return "border-destructive text-destructive";
  if (daysRemaining <= 14) return "border-amber-500 text-amber-700 dark:text-amber-400";
  return "";
}

/**
 * Read-only, rich company-profile panel: legal name / trading-as, derived
 * active-vs-dormant status, registered details, addresses, a deadlines
 * strip, and the primary contact. No editing here — see the existing
 * per-field editors (YearEndEditor, CompanyTextFieldEditor, etc.) on
 * CompanyDetail for that.
 */
export function CompanyProfilePanel({ companyId }: CompanyProfilePanelProps) {
  const [isFlagCorrectionOpen, setIsFlagCorrectionOpen] = useState(false);

  const { data: company, isLoading: companyLoading, refetch } = useQuery({
    queryKey: ["company-profile-panel", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select(
          "company_name, status, company_number, incorporation_date, registered_office_address, " +
            "trading_address, phone, year_end_month, year_end_day, vat_number, vat_scheme, " +
            "vat_frequency, sic_codes, ch_company_profile, trading_as, primary_contact_person_id, " +
            "accounts_next_due, registered_office_dispute_note"
        )
        .eq("id", companyId)
        .single();
      if (error) throw error;
      return data as unknown as CompanyProfileRow;
    },
    enabled: !!companyId,
  });

  const { data: primaryContact } = useQuery({
    queryKey: ["company-profile-panel-primary-contact", company?.primary_contact_person_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_persons")
        .select("first_name, last_name")
        .eq("id", company!.primary_contact_person_id as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!company?.primary_contact_person_id,
  });

  const { data: deadlineRows } = useQuery({
    queryKey: ["company-profile-panel-deadlines", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deadlines")
        .select("id, due_date, service_code, canonical_service_code, deadline_type, status")
        .eq("company_id", companyId)
        .in("status", OUTSTANDING_DEADLINE_STATUSES)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  if (companyLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-4 w-full max-w-sm" />
        </CardContent>
      </Card>
    );
  }

  if (!company) {
    return null;
  }

  const derivedStatus = deriveCompanyStatus({
    status: company.status,
    ch_company_profile: company.ch_company_profile as CompanyStatusInput["ch_company_profile"],
  });
  const statusBadge = STATUS_BADGE[derivedStatus];

  const registeredAddressLines = formatAddressLines(company.registered_office_address as AddressJson);
  const tradingAddressLines = formatAddressLines(company.trading_address as AddressJson);
  const yearEnd = formatYearEnd(company.year_end_day, company.year_end_month);
  const sicCodes = Array.isArray(company.sic_codes) ? (company.sic_codes as unknown as string[]) : [];
  const contactName = primaryContact
    ? [primaryContact.first_name, primaryContact.last_name].filter(Boolean).join(" ")
    : null;
  const vatSummary = company.vat_number
    ? [company.vat_number, company.vat_scheme, company.vat_frequency].filter(Boolean).join(" · ")
    : null;

  // Accounts due date prefers the CH-sourced accounts_next_due column; the
  // deadlines table is the source for the other statutory categories.
  const deadlineByCategory = new Map<DeadlineCategory, string>();
  if (company.accounts_next_due) {
    deadlineByCategory.set("accounts", company.accounts_next_due);
  }
  for (const row of deadlineRows ?? []) {
    const category = classifyDeadline(row);
    if (!category || deadlineByCategory.has(category)) continue;
    deadlineByCategory.set(category, row.due_date);
  }
  const deadlineChips = DEADLINE_ORDER.map((category) => {
    const dueDate = deadlineByCategory.get(category);
    return dueDate ? { category, label: DEADLINE_LABELS[category], dueDate } : null;
  }).filter((d): d is { category: DeadlineCategory; label: string; dueDate: string } => d !== null);

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{company.company_name}</CardTitle>
            {company.trading_as && <CardDescription>Trading as {company.trading_as}</CardDescription>}
          </div>
          <Badge className={statusBadge.className}>{statusBadge.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          {company.company_number && (
            <div>
              <p className="text-muted-foreground flex items-center gap-1">
                <Hash className="h-3.5 w-3.5" /> Company Number
              </p>
              <p className="font-medium">{company.company_number}</p>
            </div>
          )}
          {company.incorporation_date && (
            <div>
              <p className="text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> Incorporated
              </p>
              <p className="font-medium">{formatDate(company.incorporation_date, "dayMonthYear")}</p>
            </div>
          )}
          {yearEnd && (
            <div>
              <p className="text-muted-foreground">Year End</p>
              <p className="font-medium">{yearEnd}</p>
            </div>
          )}
          {vatSummary && (
            <div>
              <p className="text-muted-foreground">VAT</p>
              <p className="font-medium">{vatSummary}</p>
            </div>
          )}
          {sicCodes.length > 0 && (
            <div>
              <p className="text-muted-foreground">SIC Codes</p>
              <p className="font-medium">{sicCodes.join(", ")}</p>
            </div>
          )}
          {company.phone && (
            <div>
              <p className="text-muted-foreground flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" /> Phone
              </p>
              <p className="font-medium">{company.phone}</p>
            </div>
          )}
          {contactName && (
            <div>
              <p className="text-muted-foreground flex items-center gap-1">
                <User className="h-3.5 w-3.5" /> Primary Contact
              </p>
              <p className="font-medium">{contactName}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t">
          <div>
            <div className="flex items-center justify-between gap-1 mb-1">
              <p className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> Registered office &mdash; from Companies House
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0"
                title="Flag a correction"
                onClick={() => setIsFlagCorrectionOpen(true)}
              >
                <Flag className="h-3 w-3" />
              </Button>
            </div>
            {registeredAddressLines.length > 0 ? (
              registeredAddressLines.map((line, i) => (
                <p key={i} className="text-sm">
                  {line}
                </p>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Not set</p>
            )}
            {company.registered_office_dispute_note && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1">
                <Flag className="h-3 w-3" /> Flagged &mdash; see note
              </p>
            )}
          </div>
          {tradingAddressLines.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1 mb-1">
                <MapPin className="h-3.5 w-3.5" /> Trading Address
              </p>
              {tradingAddressLines.map((line, i) => (
                <p key={i} className="text-sm">
                  {line}
                </p>
              ))}
            </div>
          )}
        </div>

        {deadlineChips.length > 0 && (
          <div className="pt-4 border-t">
            <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Upcoming Deadlines</p>
            <div className="flex flex-wrap gap-2">
              {deadlineChips.map((d) => (
                <Badge
                  key={d.category}
                  variant="outline"
                  className={`flex items-center gap-1.5 font-normal ${deadlineUrgencyClass(d.dueDate)}`}
                >
                  <FileText className="h-3 w-3" />
                  {d.label}
                  <span className="text-muted-foreground">{formatDate(d.dueDate, "dayMonthYear")}</span>
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>

    <RegisteredOfficeCorrectionDialog
      companyId={companyId}
      currentNote={company.registered_office_dispute_note}
      open={isFlagCorrectionOpen}
      onOpenChange={setIsFlagCorrectionOpen}
      onSaved={() => refetch()}
    />
    </>
  );
}
