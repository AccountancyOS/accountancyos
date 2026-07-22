// Shared shapes for the onboarding "Your details" step (Increment C of the
// client-data-collection design). Mirrors the jsonb shape the backend RPC
// (public_save_onboarding_details) persists on onboarding_applications.personal_details:
//   [{ name, role, date_of_birth, nino, utr, home_address }]
// `_key` is a client-only React key, stripped before the record is sent to the RPC.

export interface HomeAddress {
  line1: string;
  line2: string;
  city: string;
  county: string;
  postcode: string;
  country: string;
}

export interface PersonDetail {
  _key: string;
  name: string;
  role: string;
  date_of_birth: string;
  nino: string;
  utr: string;
  home_address: HomeAddress;
}

export const emptyAddress = (): HomeAddress => ({
  line1: "",
  line2: "",
  city: "",
  county: "",
  postcode: "",
  country: "United Kingdom",
});

export const emptyPerson = (name = "", role = ""): PersonDetail => ({
  _key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name,
  role,
  date_of_birth: "",
  nino: "",
  utr: "",
  home_address: emptyAddress(),
});

// Strips the client-only _key before the record is persisted via the RPC.
export function toPersistedPerson(p: PersonDetail) {
  const { _key, ...rest } = p;
  return rest;
}

export function isAddressComplete(a: HomeAddress | undefined | null): boolean {
  return !!(a && a.line1?.trim() && a.city?.trim() && a.postcode?.trim());
}

export function isPersonComplete(p: PersonDetail): boolean {
  return !!(
    p.date_of_birth?.trim() &&
    p.nino?.trim() &&
    p.utr?.trim() &&
    isAddressComplete(p.home_address)
  );
}

export interface ServiceFlags {
  vat: boolean;
  payroll: boolean;
}

// Best-effort service-awareness derivation. The anon onboarding session cannot read
// services_catalog or the canonical_service_code / requires_vat_settings /
// requires_payroll_settings flags on canonical_services (services_catalog RLS is
// `TO authenticated` only, and the quote's accepted_snapshot freezes service_code /
// service_name text but not a canonical code) -- see the frontend report for detail.
// This keyword-matches the *real* service names/codes captured on the client's actual
// accepted quote line items; it is not hardcoded to any specific service id.
export function deriveServiceFlags(lines: any[]): ServiceFlags {
  const text = (lines ?? [])
    .map((l) => `${l?.service_name ?? ""} ${l?.service_code ?? ""}`.toLowerCase())
    .join(" | ");
  return {
    vat: /\bvat\b/.test(text),
    payroll: /payroll|\bpaye\b/.test(text),
  };
}
