/**
 * Friendly display labels for common VAT codes.
 * Used across all bookkeeping VAT code dropdowns.
 */
const FRIENDLY_LABELS: Record<string, string> = {
  T1: "20% Sales",
  T20: "20% Purchases",
  T0: "Zero Rated",
  T9: "Exempt",
  OS: "No VAT",
};

export function getVatCodeLabel(v: {
  code: string;
  rate?: number | null;
  description?: string | null;
}): string {
  const friendly = FRIENDLY_LABELS[v.code];
  if (friendly) return `${v.code} – ${friendly}`;
  if (v.description?.trim()) return `${v.code} – ${v.description}`;
  if (v.rate != null) return `${v.code} – ${v.rate}%`;
  return v.code;
}
