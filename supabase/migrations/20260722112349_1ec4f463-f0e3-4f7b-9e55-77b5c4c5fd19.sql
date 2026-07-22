-- ============================================================
-- Schedule process-email-queue (outbound mail was never being drained)
-- ============================================================
DO $$
DECLARE
  v_due int;
  v_threshold constant int := 200;
BEGIN
  SELECT count(*) INTO v_due
  FROM public.email_queue
  WHERE status = 'pending'
    AND scheduled_at <= now();

  IF v_due > v_threshold THEN
    RAISE EXCEPTION
      'Refusing to schedule process-email-queue: % pending emails are already due and would all send at once (threshold %). Review the backlog and cancel stale rows or raise the bound before scheduling.',
      v_due, v_threshold;
  END IF;

  RAISE NOTICE 'process-email-queue backlog preflight OK: % due row(s).', v_due;
END $$;

DO $$ BEGIN PERFORM cron.unschedule('process-email-queue'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'process-email-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/process-email-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ============================================================
-- connected_mailboxes_safe: expose token_expires_at + restore security_invoker
-- ============================================================
CREATE OR REPLACE VIEW public.connected_mailboxes_safe AS
  SELECT
    id, organization_id, user_id, provider, email_address,
    status, last_sync_at, mailbox_type,
    sync_enabled, error_message, token_expires_at, created_at, updated_at
  FROM public.connected_mailboxes;

-- ============================================================
-- Fix public_accept_quote_by_token: leads.status -> leads.pipeline_stage
-- ============================================================
CREATE OR REPLACE FUNCTION public.public_accept_quote_by_token(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tok record;
  v_quote record;
  v_lead record;
  v_org uuid;
  v_canonical boolean;
  v_client_id uuid;
  v_company_id uuid;
  v_partnership_id uuid;
  v_has_individual boolean := false;
  v_has_company boolean := false;
  v_has_partnership boolean := false;
  v_has_cgt boolean := false;
  v_is_mtd boolean := false;
  v_company_name text;
  v_company record;
  v_today date := current_date;
  v_tax_year_start date;
  v_tax_year_end date;
  v_token_uuid uuid;
  v_director record;
  v_sa_first text;
  v_sa_last text;
  v_sa_email text;
  v_sa_phone text;
  v_sa_blocked boolean := false;
BEGIN
  BEGIN
    v_token_uuid := p_token::uuid;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('error','invalid');
  END;

  SELECT * INTO v_tok FROM public.quote_acceptance_tokens WHERE token = v_token_uuid;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','invalid'); END IF;
  IF v_tok.used_at IS NOT NULL THEN RETURN jsonb_build_object('error','used'); END IF;
  IF v_tok.expires_at IS NOT NULL AND v_tok.expires_at < now() THEN
    RETURN jsonb_build_object('error','expired');
  END IF;

  SELECT * INTO v_quote FROM public.quotes WHERE id = v_tok.quote_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','invalid'); END IF;

  IF v_quote.status = 'accepted' THEN
    UPDATE public.quote_acceptance_tokens SET used_at = now() WHERE token = v_token_uuid AND used_at IS NULL;
    RETURN jsonb_build_object('success', true, 'client_id', v_quote.ported_to_client_id, 'company_id', v_quote.ported_to_company_id, 'replay', true);
  END IF;

  IF v_quote.status NOT IN ('draft','sent') THEN
    RETURN jsonb_build_object('error','not_open');
  END IF;

  v_org := v_quote.organization_id;
  v_canonical := public.is_canonical_lifecycle_enabled(v_org);

  SELECT
    bool_or(sc.entity_scope = 'individual') OR bool_or(sc.code IN ('sa_mtd','sa_non_mtd','cgt_60_day')),
    bool_or(sc.entity_scope = 'company'),
    bool_or(sc.entity_scope = 'partnership'),
    bool_or(sc.code = 'sa_mtd'),
    bool_or(sc.code = 'cgt_60_day')
  INTO v_has_individual, v_has_company, v_has_partnership, v_is_mtd, v_has_cgt
  FROM public.quote_lines ql
  JOIN public.services_catalog sc ON sc.id = ql.service_id
  WHERE ql.quote_id = v_quote.id;

  v_has_individual := COALESCE(v_has_individual, false);
  v_has_company := COALESCE(v_has_company, false);
  v_has_partnership := COALESCE(v_has_partnership, false);
  v_has_cgt := COALESCE(v_has_cgt, false);

  IF v_quote.lead_id IS NOT NULL THEN
    SELECT * INTO v_lead FROM public.leads WHERE id = v_quote.lead_id;
  END IF;

  v_client_id := v_quote.client_id;
  v_company_id := v_quote.company_id;

  IF v_has_company AND v_company_id IS NULL AND v_lead.id IS NOT NULL THEN
    v_company_name := COALESCE(
      NULLIF(v_lead.ch_company_profile->>'company_name',''),
      NULLIF(v_lead.ch_company_profile->>'title',''),
      trim(coalesce(v_lead.first_name,'') || ' ' || coalesce(v_lead.last_name,''))
    );

    SELECT id INTO v_company_id FROM public.companies
      WHERE organization_id = v_org AND lower(email) = lower(v_lead.email)
      LIMIT 1;
    IF v_company_id IS NULL THEN
      INSERT INTO public.companies (organization_id, company_name, email, phone, company_number,
                                    ch_company_profile, status, notes)
      VALUES (v_org, v_company_name, v_lead.email, v_lead.phone,
              v_lead.ch_company_profile->>'company_number',
              v_lead.ch_company_profile, 'pending', v_lead.notes)
      RETURNING id INTO v_company_id;

      IF NOT v_canonical THEN
      INSERT INTO public.accountant_client_links (practice_id, company_id, status, initiated_by, activated_at)
      VALUES (v_org, v_company_id, 'active', 'practice', now());
      END IF;
    END IF;
  END IF;

  IF v_has_individual AND v_client_id IS NULL AND v_lead.id IS NOT NULL THEN
    IF v_has_company THEN
      SELECT * INTO v_director FROM public.resolve_company_director(v_company_id, v_quote.lead_id, v_org);
      IF v_director.first_name IS NOT NULL OR v_director.last_name IS NOT NULL THEN
        v_sa_first := v_director.first_name;
        v_sa_last  := v_director.last_name;
        v_sa_email := COALESCE(v_director.email, v_lead.email);
        v_sa_phone := COALESCE(v_director.phone, v_lead.phone);
      ELSE
        v_sa_blocked := true;
        INSERT INTO public.automation_events (organization_id, event_type, entity_type, entity_id, metadata)
        VALUES (v_org, 'SA_DIRECTOR_DETAILS_REQUIRED', 'company', v_company_id,
                jsonb_build_object(
                  'quote_id', v_quote.id,
                  'lead_id', v_quote.lead_id,
                  'reason', 'no_director_on_file'
                ));
      END IF;
    ELSE
      v_sa_first := v_lead.first_name;
      v_sa_last  := v_lead.last_name;
      v_sa_email := v_lead.email;
      v_sa_phone := v_lead.phone;
    END IF;

    IF NOT v_sa_blocked THEN
      SELECT id INTO v_client_id FROM public.clients
        WHERE organization_id = v_org AND lower(email) = lower(v_sa_email)
          AND client_type IN ('sa_non_mtd','sa_mtd')
        LIMIT 1;
      IF v_client_id IS NULL THEN
        INSERT INTO public.clients (organization_id, first_name, last_name, email, phone, client_type, status, notes)
        VALUES (v_org, v_sa_first, v_sa_last, v_sa_email, v_sa_phone,
                CASE WHEN v_is_mtd THEN 'sa_mtd' ELSE 'sa_non_mtd' END,
                'pending', v_lead.notes)
        RETURNING id INTO v_client_id;

        INSERT INTO public.client_detail_sa (client_id, organization_id, is_mtd)
        VALUES (v_client_id, v_org, v_is_mtd)
        ON CONFLICT DO NOTHING;

        IF NOT v_canonical THEN
        INSERT INTO public.accountant_client_links (practice_id, client_id, status, initiated_by, activated_at)
        VALUES (v_org, v_client_id, 'active', 'practice', now());
        END IF;
      END IF;

      IF v_has_cgt THEN
        INSERT INTO public.client_detail_cgt (client_id, organization_id)
        VALUES (v_client_id, v_org)
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END IF;

  IF v_has_partnership AND v_lead.id IS NOT NULL THEN
    SELECT id INTO v_partnership_id FROM public.clients
      WHERE organization_id = v_org AND lower(email) = lower(v_lead.email)
        AND client_type = 'partnership'
      LIMIT 1;
    IF v_partnership_id IS NULL THEN
      INSERT INTO public.clients (organization_id, first_name, last_name, email, phone, client_type, status, notes)
      VALUES (v_org, v_lead.first_name, v_lead.last_name, v_lead.email, v_lead.phone,
              'partnership', 'pending',
              coalesce(v_lead.notes,'') || E'\n[Action required] Partnership second contact required.')
      RETURNING id INTO v_partnership_id;
      INSERT INTO public.client_detail_partnership (client_id, organization_id)
      VALUES (v_partnership_id, v_org) ON CONFLICT DO NOTHING;
      IF NOT v_canonical THEN
      INSERT INTO public.accountant_client_links (practice_id, client_id, status, initiated_by, activated_at)
      VALUES (v_org, v_partnership_id, 'active', 'practice', now());
      END IF;

      INSERT INTO public.automation_events (organization_id, event_type, entity_type, entity_id, metadata)
      VALUES (v_org, 'PARTNERSHIP_SECOND_CONTACT_REQUIRED', 'client', v_partnership_id,
              jsonb_build_object('quote_id', v_quote.id, 'lead_id', v_lead.id));
    END IF;
    IF v_client_id IS NULL THEN v_client_id := v_partnership_id; END IF;
  END IF;

  IF v_company_id IS NOT NULL THEN
    SELECT * INTO v_company FROM public.companies WHERE id = v_company_id;
  ELSE
    SELECT NULL::uuid AS id,
           NULL::int  AS year_end_month,
           NULL::int  AS year_end_day
    INTO v_company;
  END IF;

  IF EXTRACT(MONTH FROM v_today) > 4
     OR (EXTRACT(MONTH FROM v_today) = 4 AND EXTRACT(DAY FROM v_today) >= 6) THEN
    v_tax_year_start := make_date(EXTRACT(YEAR FROM v_today)::int, 4, 6);
  ELSE
    v_tax_year_start := make_date(EXTRACT(YEAR FROM v_today)::int - 1, 4, 6);
  END IF;
  v_tax_year_end := v_tax_year_start + INTERVAL '1 year' - INTERVAL '1 day';

  IF NOT v_canonical THEN
    PERFORM public.lifecycle_materialize_jobs(
      v_org, v_client_id, v_company_id, v_partnership_id, v_quote.id,
      'quote_acceptance:' || v_quote.id::text);
  END IF;

  UPDATE public.quotes
     SET status = 'accepted',
         accepted_at = now(),
         sent_at = COALESCE(sent_at, now()),
         client_id = COALESCE(client_id, v_client_id),
         company_id = COALESCE(company_id, v_company_id),
         ported_to_client_id = COALESCE(ported_to_client_id, v_client_id),
         ported_to_company_id = COALESCE(ported_to_company_id, v_company_id),
         ported_at = COALESCE(ported_at, now())
   WHERE id = v_quote.id;

  IF v_quote.lead_id IS NOT NULL THEN
    UPDATE public.leads SET pipeline_stage = 'won', updated_at = now() WHERE id = v_quote.lead_id;
  END IF;

  UPDATE public.quote_acceptance_tokens SET used_at = now() WHERE token = v_token_uuid;

  INSERT INTO public.automation_events (organization_id, event_type, entity_type, entity_id, metadata)
  VALUES (v_org, 'QUOTE_ACCEPTED', 'quote', v_quote.id,
          jsonb_build_object('client_id', v_client_id, 'company_id', v_company_id, 'partnership_id', v_partnership_id));

  RETURN jsonb_build_object('success', true, 'client_id', v_client_id, 'company_id', v_company_id, 'partnership_id', v_partnership_id);
END;
$function$;

-- ============================================================
-- Standardise automation_workflow_instances.status on UPPERCASE 7-value vocabulary
-- ============================================================
UPDATE public.automation_workflow_instances
SET status = upper(status)
WHERE status <> upper(status);

DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.automation_workflow_instances
  WHERE status NOT IN ('QUEUED','RUNNING','WAITING','PAUSED','CANCELLED','COMPLETED','FAILED');
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'Cannot set status CHECK: % automation_workflow_instances row(s) hold a status outside the canonical set.', v_bad;
  END IF;
END $$;

ALTER TABLE public.automation_workflow_instances
  DROP CONSTRAINT IF EXISTS automation_workflow_instances_status_check;
ALTER TABLE public.automation_workflow_instances
  ADD CONSTRAINT automation_workflow_instances_status_check
  CHECK (status IN ('QUEUED','RUNNING','WAITING','PAUSED','CANCELLED','COMPLETED','FAILED'));

ALTER TABLE public.automation_workflow_instances
  ALTER COLUMN status SET DEFAULT 'QUEUED';

DROP INDEX IF EXISTS public.idx_workflow_instances_tick;
CREATE INDEX IF NOT EXISTS idx_workflow_instances_tick
  ON public.automation_workflow_instances (status, next_run_at)
  WHERE status IN ('QUEUED','RUNNING');

-- ============================================================
-- Drop redundant onboarding welcome email (keep staff notification)
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_onboarding_approved()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_recipient_name text;
BEGIN
  IF NEW.status = 'approved' AND COALESCE(OLD.status,'') <> 'approved' THEN
    v_recipient_name := COALESCE(
      NULLIF(TRIM(CONCAT_WS(' ', NEW.first_name, NEW.last_name)), ''),
      NEW.company_name,
      'there'
    );

    INSERT INTO notifications (organization_id, user_id, type, title, message, entity_type, entity_id)
    SELECT
      NEW.organization_id, om.user_id,
      'onboarding_approved',
      'Client activated',
      v_recipient_name || ' has been approved and activated.',
      'onboarding', NEW.id
    FROM public.organization_users om
    WHERE om.organization_id = NEW.organization_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================
-- add_service_to_client RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_service_to_client(
  p_client_id uuid,
  p_company_id uuid,
  p_service_id uuid,
  p_period_start date,
  p_period_end date,
  p_period_label text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_service_code text;
  v_service_name text;
  v_billing_frequency text;
  v_frequency text;
  v_engagement_id uuid;
  v_job_id uuid;
BEGIN
  IF (p_client_id IS NULL) = (p_company_id IS NULL) THEN
    RAISE EXCEPTION 'Provide exactly one of client or company';
  END IF;

  IF p_company_id IS NOT NULL THEN
    SELECT organization_id INTO v_org FROM public.companies WHERE id = p_company_id;
  ELSE
    SELECT organization_id INTO v_org FROM public.clients WHERE id = p_client_id;
  END IF;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Entity not found';
  END IF;
  IF NOT public.user_has_organization_access(v_org) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT code, name, billing_model
    INTO v_service_code, v_service_name, v_billing_frequency
    FROM public.services_catalog WHERE id = p_service_id;
  IF v_service_code IS NULL THEN
    RAISE EXCEPTION 'Service not found';
  END IF;
  v_frequency := CASE WHEN v_billing_frequency = 'monthly' THEN 'monthly' ELSE 'one_off' END;

  SELECT id INTO v_engagement_id
    FROM public.engagements
    WHERE service_id = p_service_id
      AND client_id IS NOT DISTINCT FROM p_client_id
      AND company_id IS NOT DISTINCT FROM p_company_id
    LIMIT 1;
  IF v_engagement_id IS NULL THEN
    INSERT INTO public.engagements
      (organization_id, client_id, company_id, service_id, frequency, start_date, status, activated_at)
    VALUES
      (v_org, p_client_id, p_company_id, p_service_id, v_frequency, CURRENT_DATE, 'active', now())
    RETURNING id INTO v_engagement_id;
  ELSE
    UPDATE public.engagements
      SET status = 'active', activated_at = COALESCE(activated_at, now())
      WHERE id = v_engagement_id;
  END IF;

  v_job_id := public.lifecycle_upsert_job_with_deadlines(
    v_org, p_client_id, p_company_id, v_engagement_id,
    v_service_code, v_service_name, p_period_start, p_period_end, p_period_label,
    'manual_add_service'
  );

  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_service_to_client(uuid, uuid, uuid, date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_service_to_client(uuid, uuid, uuid, date, date, text) TO authenticated, service_role;

-- ============================================================
-- Security publish blockers
-- ============================================================
DROP POLICY IF EXISTS "Org admins can manage sessions" ON public.user_sessions;
CREATE POLICY "Org admins can manage sessions" ON public.user_sessions
  FOR ALL
  USING (public.user_has_role_at_least(auth.uid(), organization_id, 'admin'))
  WITH CHECK (public.user_has_role_at_least(auth.uid(), organization_id, 'admin'));

DROP POLICY IF EXISTS "Anyone with the token can read live tokens" ON public.quote_acceptance_tokens;
REVOKE SELECT ON public.quote_acceptance_tokens FROM anon;
ALTER TABLE public.quote_acceptance_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members read their quote tokens" ON public.quote_acceptance_tokens;
CREATE POLICY "Org members read their quote tokens"
  ON public.quote_acceptance_tokens
  FOR SELECT
  TO authenticated
  USING (public.user_has_organization_access(organization_id));

ALTER VIEW public.connected_mailboxes_safe SET (security_invoker = on);

-- ============================================================
-- Fix partner_in_charge / staff_in_charge
-- ============================================================
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_partner_in_charge_fkey;
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_staff_in_charge_fkey;

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS partner_in_charge uuid;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS staff_in_charge uuid;

-- ============================================================
-- Company-profile + person-model schema fields + signatory rules
-- ============================================================
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS trading_as text,
  ADD COLUMN IF NOT EXISTS primary_contact_person_id uuid REFERENCES public.company_persons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accounts_next_made_up_to date,
  ADD COLUMN IF NOT EXISTS accounts_next_due date;

ALTER TABLE public.company_officers
  ADD COLUMN IF NOT EXISTS is_signatory boolean NOT NULL DEFAULT false;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.company_persons(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS portal_access_unique_company_user
  ON public.portal_access (organization_id, company_id, user_id)
  WHERE company_id IS NOT NULL AND is_active;

CREATE OR REPLACE FUNCTION public.enforce_signatory_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_signatory THEN
    IF NEW.resigned_at IS NOT NULL THEN
      NEW.is_signatory := false;
    ELSIF (
      SELECT count(*) FROM public.company_officers
      WHERE company_id = NEW.company_id AND is_signatory AND id <> NEW.id
    ) >= 10 THEN
      RAISE EXCEPTION 'A company can have at most 10 signatories';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_signatory_rules ON public.company_officers;
CREATE TRIGGER trg_enforce_signatory_rules
BEFORE INSERT OR UPDATE ON public.company_officers
FOR EACH ROW
EXECUTE FUNCTION public.enforce_signatory_rules();

CREATE UNIQUE INDEX IF NOT EXISTS company_persons_org_ch_officer_uq
  ON public.company_persons (organization_id, ch_officer_id);

CREATE UNIQUE INDEX IF NOT EXISTS company_officers_company_ch_appointment_uq
  ON public.company_officers (company_id, ch_appointment_id);

-- ============================================================
-- Person-model management RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_primary_contact(p_company_id uuid, p_person_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organization_id uuid;
  v_associated boolean;
BEGIN
  SELECT organization_id INTO v_organization_id
  FROM public.companies WHERE id = p_company_id;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Company not found: %', p_company_id;
  END IF;

  IF NOT public.user_has_organization_access(v_organization_id) THEN
    RAISE EXCEPTION 'Access denied to organization';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.company_officers
    WHERE company_id = p_company_id AND person_id = p_person_id
  ) OR EXISTS (
    SELECT 1 FROM public.contacts
    WHERE company_id = p_company_id AND person_id = p_person_id
  ) INTO v_associated;

  IF NOT v_associated THEN
    RAISE EXCEPTION 'Person % is not associated with company % (no officer or contacts row)', p_person_id, p_company_id;
  END IF;

  UPDATE public.companies
  SET primary_contact_person_id = p_person_id
  WHERE id = p_company_id;

  RETURN jsonb_build_object(
    'ok', true,
    'company_id', p_company_id,
    'primary_contact_person_id', p_person_id
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_primary_contact(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_signatory(p_officer_id uuid, p_on boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organization_id uuid;
  v_is_signatory boolean;
BEGIN
  SELECT co.organization_id INTO v_organization_id
  FROM public.company_officers o
  JOIN public.companies co ON co.id = o.company_id
  WHERE o.id = p_officer_id;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Officer not found: %', p_officer_id;
  END IF;

  IF NOT public.user_has_organization_access(v_organization_id) THEN
    RAISE EXCEPTION 'Access denied to organization';
  END IF;

  UPDATE public.company_officers
  SET is_signatory = p_on
  WHERE id = p_officer_id
  RETURNING is_signatory INTO v_is_signatory;

  RETURN jsonb_build_object(
    'ok', true,
    'officer_id', p_officer_id,
    'is_signatory', v_is_signatory
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_signatory(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.link_person_to_sa_client(p_person_id uuid, p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organization_id uuid;
  v_client_org_id uuid;
BEGIN
  SELECT organization_id INTO v_organization_id
  FROM public.company_persons WHERE id = p_person_id;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Person not found: %', p_person_id;
  END IF;

  IF NOT public.user_has_organization_access(v_organization_id) THEN
    RAISE EXCEPTION 'Access denied to organization';
  END IF;

  SELECT organization_id INTO v_client_org_id
  FROM public.clients WHERE id = p_client_id;

  IF v_client_org_id IS NULL THEN
    RAISE EXCEPTION 'Client not found: %', p_client_id;
  END IF;

  IF v_client_org_id <> v_organization_id THEN
    RAISE EXCEPTION 'Client % belongs to a different organization than person %', p_client_id, p_person_id;
  END IF;

  UPDATE public.company_persons
  SET linked_client_id = p_client_id
  WHERE id = p_person_id;

  RETURN jsonb_build_object(
    'ok', true,
    'person_id', p_person_id,
    'linked_client_id', p_client_id
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.link_person_to_sa_client(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.grant_person_portal_access(p_person_id uuid, p_user_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organization_id uuid;
  v_linked_client_id uuid;
  v_target_user_id uuid;
  v_company record;
  v_granted int := 0;
  v_skipped int := 0;
  v_already_active boolean;
BEGIN
  SELECT organization_id, linked_client_id
  INTO v_organization_id, v_linked_client_id
  FROM public.company_persons WHERE id = p_person_id;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Person not found: %', p_person_id;
  END IF;

  IF NOT public.user_has_organization_access(v_organization_id) THEN
    RAISE EXCEPTION 'Access denied to organization';
  END IF;

  SELECT id INTO v_target_user_id FROM auth.users WHERE email = p_user_email LIMIT 1;

  IF v_linked_client_id IS NOT NULL THEN
    v_already_active := false;
    IF v_target_user_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.portal_access
        WHERE client_id = v_linked_client_id
          AND user_id = v_target_user_id
          AND is_active
          AND status <> 'revoked'
      ) INTO v_already_active;
    END IF;

    IF v_already_active THEN
      v_skipped := v_skipped + 1;
    ELSE
      PERFORM public.lifecycle_grant_portal_access('client', v_linked_client_id, p_user_email);
      v_granted := v_granted + 1;
    END IF;
  END IF;

  FOR v_company IN
    SELECT DISTINCT company_id
    FROM public.company_officers
    WHERE person_id = p_person_id AND resigned_at IS NULL
  LOOP
    v_already_active := false;
    IF v_target_user_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.portal_access
        WHERE company_id = v_company.company_id
          AND user_id = v_target_user_id
          AND is_active
          AND status <> 'revoked'
      ) INTO v_already_active;
    END IF;

    IF v_already_active THEN
      v_skipped := v_skipped + 1;
    ELSE
      PERFORM public.lifecycle_grant_portal_access('company', v_company.company_id, p_user_email);
      v_granted := v_granted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'person_id', p_person_id,
    'granted', v_granted,
    'skipped', v_skipped
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.grant_person_portal_access(uuid, text) TO authenticated;

-- ============================================================
-- Company address reconcile (backfill jsonb + dispute note)
-- ============================================================
UPDATE public.companies
SET registered_office_address = jsonb_strip_nulls(
  jsonb_build_object(
    'address_line_1', address_line_1,
    'address_line_2', address_line_2,
    'locality', city,
    'postal_code', postcode,
    'country', country
  )
)
WHERE (registered_office_address IS NULL OR registered_office_address = '{}'::jsonb)
  AND (
    coalesce(address_line_1, '') <> ''
    OR coalesce(address_line_2, '') <> ''
    OR coalesce(city, '') <> ''
    OR coalesce(postcode, '') <> ''
    OR coalesce(country, '') <> ''
  );

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS registered_office_dispute_note text;

COMMENT ON COLUMN public.companies.registered_office_dispute_note IS
  'Firm-recorded note flagging a suspected discrepancy in the Companies-House-sourced registered_office_address. Informational only.';

-- ============================================================
-- Per-person nino/utr on company_persons
-- ============================================================
ALTER TABLE public.company_persons
  ADD COLUMN IF NOT EXISTS nino text,
  ADD COLUMN IF NOT EXISTS utr text;

-- ============================================================
-- Onboarding personal_details + paye_reference + utr + ch_correction_note; save RPC
-- ============================================================
ALTER TABLE public.onboarding_applications
  ADD COLUMN IF NOT EXISTS paye_reference text,
  ADD COLUMN IF NOT EXISTS personal_details jsonb,
  ADD COLUMN IF NOT EXISTS utr text,
  ADD COLUMN IF NOT EXISTS ch_correction_note text;

COMMENT ON COLUMN public.onboarding_applications.paye_reference IS
  'Company PAYE scheme reference captured on the onboarding "Your details" step.';
COMMENT ON COLUMN public.onboarding_applications.personal_details IS
  'Per-person data captured on the onboarding "Your details" step. Shape: jsonb array of { name, role, date_of_birth, nino, utr, home_address }.';
COMMENT ON COLUMN public.onboarding_applications.utr IS
  'Company/individual UTR captured on the onboarding "Your details" step.';
COMMENT ON COLUMN public.onboarding_applications.ch_correction_note IS
  'Free-text note flagging a possible error in the CH-labelled company name/number.';

DROP FUNCTION IF EXISTS public.public_save_onboarding_details(uuid, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.public_save_onboarding_details(uuid, text, text, text, text, jsonb, text);

CREATE FUNCTION public.public_save_onboarding_details(
  p_application_id uuid,
  p_access_token text,
  p_utr text DEFAULT NULL,
  p_vat_number text DEFAULT NULL,
  p_paye_reference text DEFAULT NULL,
  p_personal_details jsonb DEFAULT NULL,
  p_ch_correction_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.onboarding_applications%ROWTYPE;
BEGIN
  SELECT * INTO v_app FROM public.onboarding_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  PERFORM public.lifecycle_require_onboarding_token(p_application_id, p_access_token);
  IF v_app.status IN ('approved','rejected','cancelled') THEN
    RAISE EXCEPTION 'Onboarding is closed';
  END IF;

  UPDATE public.onboarding_applications
     SET utr = COALESCE(p_utr, utr),
         vat_number = COALESCE(p_vat_number, vat_number),
         paye_reference = COALESCE(p_paye_reference, paye_reference),
         personal_details = COALESCE(p_personal_details, personal_details),
         ch_correction_note = COALESCE(p_ch_correction_note, ch_correction_note),
         updated_at = now()
   WHERE id = p_application_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.public_save_onboarding_details(uuid, text, text, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_save_onboarding_details(uuid, text, text, text, text, jsonb, text) TO anon, authenticated;
