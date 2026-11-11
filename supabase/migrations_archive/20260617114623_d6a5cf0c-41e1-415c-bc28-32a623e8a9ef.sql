-- ============================================================
-- Sprint 1 — Increment 3
-- Onboarding access-token (IDOR groundwork) — additive + non-breaking
-- ============================================================
-- Adds a per-application secret access_token (+ expiry) to
-- onboarding_applications so the public onboarding endpoints can later be
-- gated on a random secret instead of a guessable bare UUID. This increment
-- ONLY provisions and protects the token; it does NOT yet require the token
-- in any RPC (that enforcement is the next increment), so existing /onboard
-- flows keep working unchanged.
--
-- Safety:
--  * New columns; no drops, no rewrites of business data.
--  * Every existing row is backfilled with a unique token, so the column can
--    be NOT NULL without breaking historic applications.
--  * A column DEFAULT means every future application (created by any RPC)
--    gets a token automatically — no RPC creation paths are touched.
--  * public_get_onboarding is redefined identically EXCEPT that it strips the
--    new secret from its anon-facing response, so adding the column does not
--    leak the token. No new parameters; signature unchanged; fully backward
--    compatible.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Token generator (pgcrypto lives in the `extensions` schema here)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gen_onboarding_access_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.gen_random_bytes(32), 'hex');
$$;

-- ------------------------------------------------------------
-- 2. Additive columns
-- ------------------------------------------------------------
ALTER TABLE public.onboarding_applications
  ADD COLUMN IF NOT EXISTS access_token            text,
  ADD COLUMN IF NOT EXISTS access_token_expires_at timestamptz;

-- ------------------------------------------------------------
-- 3. Backfill existing rows (unique secret per row; volatile -> per-row eval)
-- ------------------------------------------------------------
UPDATE public.onboarding_applications
   SET access_token = encode(extensions.gen_random_bytes(32), 'hex')
 WHERE access_token IS NULL;

UPDATE public.onboarding_applications
   SET access_token_expires_at = now() + interval '90 days'
 WHERE access_token_expires_at IS NULL;

-- ------------------------------------------------------------
-- 4. Enforce invariants now that every row has a token
-- ------------------------------------------------------------
ALTER TABLE public.onboarding_applications
  ALTER COLUMN access_token SET DEFAULT public.gen_onboarding_access_token(),
  ALTER COLUMN access_token SET NOT NULL;

ALTER TABLE public.onboarding_applications
  ALTER COLUMN access_token_expires_at SET DEFAULT (now() + interval '90 days');

CREATE UNIQUE INDEX IF NOT EXISTS onboarding_applications_access_token_key
  ON public.onboarding_applications (access_token);

-- ------------------------------------------------------------
-- 5. Stop the public read endpoint leaking the new secret
--    (identical to the current definition except the application JSON has
--     the token fields removed; no enforcement added this increment)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.public_get_onboarding(p_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_app record;
  v_org record;
  v_brand record;
  v_quote record;
  v_docs jsonb;
  v_engagement record;
  v_has_connect boolean;
  v_display_name text;
BEGIN
  SELECT * INTO v_app FROM public.onboarding_applications WHERE id = p_application_id;
  IF v_app IS NULL THEN RAISE EXCEPTION 'Onboarding application not found' USING ERRCODE='P0002'; END IF;

  SELECT id, name, logo_url, stripe_connect_account_id INTO v_org
    FROM public.organizations WHERE id = v_app.organization_id;
  v_has_connect := v_org.stripe_connect_account_id IS NOT NULL;

  SELECT trading_name, legal_name INTO v_brand
    FROM public.organization_branding WHERE organization_id = v_app.organization_id;

  v_display_name := COALESCE(NULLIF(v_brand.trading_name, ''), NULLIF(v_brand.legal_name, ''), v_org.name);

  SELECT id, quote_number, accepted_snapshot, currency
    INTO v_quote FROM public.quotes WHERE id = v_app.quote_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'document_type', document_type, 'file_name', file_name,
    'file_path', file_path, 'created_at', created_at
  ) ORDER BY created_at), '[]'::jsonb) INTO v_docs
    FROM public.onboarding_documents WHERE application_id = p_application_id;

  SELECT id, signed_at, sent_at, document_content INTO v_engagement
    FROM public.engagement_letters
   WHERE onboarding_application_id = p_application_id
   ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'application', to_jsonb(v_app) - 'access_token' - 'access_token_expires_at',
    'organization', jsonb_build_object(
      'id', v_org.id,
      'name', v_display_name,
      'logo_url', v_org.logo_url,
      'has_stripe_connect', v_has_connect
    ),
    'quote', to_jsonb(v_quote),
    'documents', v_docs,
    'engagement_letter', to_jsonb(v_engagement)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.public_get_onboarding(uuid) TO anon, authenticated;
