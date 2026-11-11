-- DEF-028 — every portal bookkeeping write fails with 42703
--
-- public.stamp_portal_provenance() resolved the writing contact by selecting a
-- contact id off public.portal_access. That column does not exist and never
-- has, so the statement raised
--     42703: column "contact_id" does not exist
-- The function was authored this way in 20260608112113, so this has been true
-- for every portal write since the bookkeeping portal shipped.
--
-- Blast radius — four BEFORE INSERT OR UPDATE triggers, all enabled:
--   invoices          trg_portal_provenance_invoices
--   bills             trg_portal_provenance_bills
--   bank_transactions trg_portal_provenance_bank_tx
--   receipts          trg_portal_provenance_receipts
-- The function returns early for non-portal callers, so the broken statement is
-- never reached by accountant writes — which is why this survived undetected.
-- For portal users it means invoice creation, bill creation, receipt upload and
-- transaction explanation have NEVER worked. The capabilities
-- allow_invoice_create / allow_bill_create / allow_receipt_upload /
-- allow_transaction_explain have been unusable in practice.
--
-- The repair removes an impossible lookup rather than substituting a column,
-- because no table in the schema links an authenticated user to a contacts row.
-- See the body comment for what was considered and rejected, and the receipt
-- for the open product decision on portal contact attribution.
--
-- Body re-issued from the LIVE definition (md5 f67d2205) with exactly two edits
-- applied programmatically against asserted anchors. Nothing else is retyped or
-- reordered. Triggers are untouched: replacing the function body leaves all four
-- attachments in place.

BEGIN;

CREATE OR REPLACE FUNCTION public.stamp_portal_provenance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_portal boolean := public.is_portal_user();
  v_contact uuid;
  v_require boolean := false;
  v_mode public.bk_mode;
BEGIN
  IF NOT v_is_portal THEN
    -- Accountant write: keep defaults
    RETURN NEW;
  END IF;

  -- Contact attribution is UNRESOLVABLE in the current schema, and that is the
  -- defect (DEF-028). This is where the function used to read a contact id off
  -- public.portal_access keyed by auth.uid(). That table has no such column and
  -- never has, so the statement raised 42703 on every portal write from the day
  -- the function was created in 20260608112113.
  --
  -- There is no correct column to substitute. No table links an authenticated
  -- user to a contacts row: portal_access carries user_id, client_id, company_id
  -- and role; contacts carries no user_id.
  --
  -- v_contact is therefore left NULL. That is not a silent downgrade: because
  -- the lookup always raised, created_by_contact_id has never been populated on
  -- any row, so nothing that works today is lost. Actor attribution is
  -- unaffected and still durable — bookkeeping_audit_log.actor_id records
  -- auth.uid(), and created_by_portal / source = 'portal' still mark provenance.
  --
  -- Deliberately NOT done: matching a portal user to a contact by email or name.
  -- Identity by name-match is forbidden by the governance design
  -- (docs/superpowers/specs/2026-07-22-data-governance-architecture-design.md).
  -- It would attribute writes to the wrong person, which is worse than NULL.
  --
  -- Whether portal_access should carry a real contact FK is an open product
  -- decision for the owner, tracked on the DEF-028 receipt. The COALESCE below
  -- is kept so an explicitly supplied value still wins, and so that populating
  -- v_contact later needs no other change here.
  v_contact := NULL;

  IF TG_TABLE_NAME = 'bank_transactions' THEN
    NEW.updated_by_portal := true;
    NEW.source := 'portal';
    NEW.created_by_contact_id := COALESCE(NEW.created_by_contact_id, v_contact);
  ELSE
    IF TG_OP = 'INSERT' THEN
      NEW.created_by_portal := true;
      NEW.source := 'portal';
      NEW.created_by_contact_id := COALESCE(NEW.created_by_contact_id, v_contact);
    END IF;
  END IF;

  -- Resolve review mode from portal_visibility_settings
  SELECT client_bookkeeping_mode,
         CASE TG_TABLE_NAME
           WHEN 'invoices' THEN require_review_for_invoice_sending
           WHEN 'bills' THEN require_review_for_bill_approval
           WHEN 'bank_transactions' THEN require_review_for_transaction_explanations
           WHEN 'receipts' THEN require_review_for_receipt_matching
           ELSE false
         END
  INTO v_mode, v_require
  FROM public.portal_visibility_settings
  WHERE (NEW.client_id IS NOT NULL AND client_id = NEW.client_id)
     OR (NEW.company_id IS NOT NULL AND company_id = NEW.company_id)
  LIMIT 1;

  IF v_mode = 'review_required' OR v_require THEN
    IF TG_OP = 'INSERT' THEN
      NEW.review_status := 'pending_review';
    END IF;
  END IF;

  -- Audit log
  INSERT INTO public.bookkeeping_audit_log(
    organization_id, entity_type, entity_id, action, actor_id, actor_role,
    before_state, after_state, metadata
  ) VALUES (
    NEW.organization_id,
    TG_TABLE_NAME,
    NEW.id,
    TG_OP,
    auth.uid(),
    'portal',
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW),
    jsonb_build_object('source','portal','contact_id', v_contact,
      'contact_attribution',
      CASE WHEN v_contact IS NULL THEN 'unresolved_no_portal_contact_link' ELSE 'resolved' END)
  );

  RETURN NEW;
END $function$;

-- Self-verifying: assert the end state in-transaction so a partial apply aborts.
DO $def028$
DECLARE
  v_oid oid;
  v_src text;
  v_triggers integer;
BEGIN
  SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'stamp_portal_provenance';
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'DEF-028: stamp_portal_provenance is missing after replace';
  END IF;
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_oid;

  -- The defect itself: the executable lookup must be gone. Matched on the
  -- statement, not on the table name, which still appears in the body comment.
  IF v_src LIKE '%INTO v_contact FROM%' THEN
    RAISE EXCEPTION 'DEF-028: the impossible contact lookup survived';
  END IF;

  -- Gone because it was removed, not because the body was truncated.
  IF v_src NOT LIKE '%bookkeeping_audit_log%'
     OR v_src NOT LIKE '%portal_visibility_settings%'
     OR v_src NOT LIKE '%created_by_contact_id%' THEN
    RAISE EXCEPTION 'DEF-028: the replacement body lost functionality it must keep';
  END IF;

  -- All four attachments must still be present and enabled.
  SELECT count(*) INTO v_triggers
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND t.tgfoid = v_oid
     AND NOT t.tgisinternal
     AND t.tgenabled <> 'D';
  IF v_triggers <> 4 THEN
    RAISE EXCEPTION 'DEF-028: expected 4 enabled provenance triggers, found %', v_triggers;
  END IF;
END
$def028$;

COMMIT;