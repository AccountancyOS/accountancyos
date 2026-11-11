-- ============================================================
-- Sprint 1 — Increment 1 / Task 1
-- Per-org canonical-lifecycle feature flag + server-side reader (DORMANT)
-- ============================================================
-- Adds the opt-in flag that gates the entire canonical engagement-letter
-- lifecycle. Default FALSE => every existing org keeps today's behaviour; the
-- evaluator and the hardened approval guard (later tasks) are no-ops until an
-- org is explicitly switched on. Additive and safe: one defaulted NOT NULL
-- column + one read-only helper. No data changes.
-- ============================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS canonical_lifecycle_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_canonical_lifecycle_enabled(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT canonical_lifecycle_enabled FROM public.organizations WHERE id = p_org_id),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_canonical_lifecycle_enabled(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_canonical_lifecycle_enabled(uuid) TO authenticated, service_role;

COMMENT ON COLUMN public.organizations.canonical_lifecycle_enabled IS
  'Sprint 1: when true, the canonical engagement-letter lifecycle (gate evaluator + hardened approval) is enforced for this org. Default false = legacy behaviour.';
