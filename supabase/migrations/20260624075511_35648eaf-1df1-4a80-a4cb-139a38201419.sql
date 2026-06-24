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