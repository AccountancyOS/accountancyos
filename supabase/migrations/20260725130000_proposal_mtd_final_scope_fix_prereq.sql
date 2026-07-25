-- Proposal Phase 1 — Task 6a (SAFE ADDITIVE half only).
--
-- Three additive, idempotent, low-risk changes. NO function is created or replaced here;
-- the canonical-deadline bridge (materialize setting canonical_service_code/job_template_code)
-- and all UI wiring are a separate later task (Task 6b).
--
--   1. Add the MTD annual/final-declaration service to services_catalog (code
--      `mtd_itsa_final`), one row per organization that already has the `sa_mtd`
--      (Self-Assessment MTD) service, mirroring sa_mtd's conventions. It binds to the
--      pre-existing canonical rule `mtd_itsa_final_declaration` in canonical_deadline_rules
--      so a later bridge can generate the rich final-declaration deadline.
--   2. Fix the mis-scoped `sole_trader_accounts` catalog row: it is an INDIVIDUAL service
--      but was seeded with entity_scope='company'.
--   3. Add a nullable, self-referencing `jobs.prerequisite_job_id` (distinct from the
--      existing `jobs.source_job_id`) to model the CT600 ← Accounts dependency. No behaviour
--      change until a caller sets it.

-- 1. MTD final-declaration service — org-scoped, one row per practice that has sa_mtd.
--    NOT-NULL columns copied/mirrored from the org's own sa_mtd row: organization_id,
--    billing_model, default_price, entity_scope (overridden to 'individual'), plus is_recurring
--    and is_bookkeeping_related. Idempotent via NOT EXISTS on (organization_id, code).
INSERT INTO public.services_catalog (
  organization_id,
  code,
  name,
  description,
  billing_model,
  default_price,
  is_bookkeeping_related,
  active,
  is_recurring,
  entity_scope,
  canonical_service_code
)
SELECT
  sc.organization_id,
  'mtd_itsa_final',
  'MTD Final Declaration',
  'Annual MTD for ITSA final declaration (end-of-year crystallisation)',
  sc.billing_model,
  sc.default_price,
  sc.is_bookkeeping_related,
  true,
  sc.is_recurring,
  'individual',
  'mtd_itsa_final_declaration'
FROM public.services_catalog sc
WHERE sc.code = 'sa_mtd'
  AND NOT EXISTS (
    SELECT 1
    FROM public.services_catalog existing
    WHERE existing.organization_id = sc.organization_id
      AND existing.code = 'mtd_itsa_final'
  );

-- 2. Correct the mis-scoped sole trader accounts service (individual, not company).
UPDATE public.services_catalog
SET entity_scope = 'individual'
WHERE code = 'sole_trader_accounts'
  AND entity_scope = 'company';

-- 3. CT600 ← Accounts dependency link. Nullable, self-referencing; inert until set.
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS prerequisite_job_id uuid REFERENCES public.jobs(id);

CREATE INDEX IF NOT EXISTS idx_jobs_prerequisite ON public.jobs(prerequisite_job_id);
