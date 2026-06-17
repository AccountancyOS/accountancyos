-- ============================================================
-- Sprint 1 — Regression safety net
-- quote_acceptance_tokens.organization_id auto-backfill trigger
-- ============================================================
-- Background: quote_acceptance_tokens.organization_id is NOT NULL. The fixed
-- lifecycle_send_quote body (which passed organization_id) was later clobbered
-- by a stale CREATE OR REPLACE that inserted only (token, quote_id,
-- expires_at), so sending a quote failed with a NOT NULL violation.
--
-- Fix strategy: rather than re-paste the ~200-line lifecycle_send_quote to
-- restore one line (the same large-RPC-rewrite that caused the regression and
-- that a future stale rewrite could undo again), install a BEFORE INSERT
-- trigger that derives organization_id from the parent quote whenever it is
-- omitted. This:
--   * fixes the live failure (inserts succeed again),
--   * cannot recur even if a future migration ships another stale insert,
--   * is a no-op for the call sites that already pass organization_id.
--
-- Safety: additive only. No existing rows are affected (a NOT NULL column
-- means the regression produced failed inserts, not bad data). The trigger
-- only fills a NULL organization_id; it never overrides a supplied value.
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_quote_acceptance_token_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT q.organization_id
      INTO NEW.organization_id
      FROM public.quotes q
     WHERE q.id = NEW.quote_id;

    IF NEW.organization_id IS NULL THEN
      RAISE EXCEPTION
        'quote_acceptance_tokens: cannot derive organization_id; quote % not found or has no organization',
        NEW.quote_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quote_acceptance_tokens_set_org ON public.quote_acceptance_tokens;
CREATE TRIGGER quote_acceptance_tokens_set_org
  BEFORE INSERT ON public.quote_acceptance_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_quote_acceptance_token_org();
