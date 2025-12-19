-- P0 SECURITY FIX: Questionnaire Token Security - Part 1
-- Lock down RLS, create secure token infrastructure

-- Ensure pgcrypto extension for hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- 1A) DROP ALL VULNERABLE TOKEN-BASED POLICIES
-- ============================================
DROP POLICY IF EXISTS "Token-based questionnaire view access" ON public.questionnaire_instances;
DROP POLICY IF EXISTS "Token-based questionnaire update access" ON public.questionnaire_instances;
DROP POLICY IF EXISTS "Token-based response view access" ON public.questionnaire_responses;
DROP POLICY IF EXISTS "Token-based response insert access" ON public.questionnaire_responses;
DROP POLICY IF EXISTS "Token-based response update access" ON public.questionnaire_responses;

-- Also drop any other anon/public policies that might exist
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('questionnaire_instances','questionnaire_responses')
      AND policyname ILIKE '%token%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ============================================
-- 1B) ENSURE ORG-MEMBER POLICIES ARE CORRECT
-- ============================================
-- These should already exist, but ensure they're correct

-- Instances: org members can read
DROP POLICY IF EXISTS "org_members_read_questionnaire_instances" ON public.questionnaire_instances;
CREATE POLICY "org_members_read_questionnaire_instances"
ON public.questionnaire_instances
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = questionnaire_instances.organization_id
  )
);

-- Instances: org members can insert
DROP POLICY IF EXISTS "org_members_insert_questionnaire_instances" ON public.questionnaire_instances;
CREATE POLICY "org_members_insert_questionnaire_instances"
ON public.questionnaire_instances
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = questionnaire_instances.organization_id
  )
);

-- Instances: org members can update
DROP POLICY IF EXISTS "org_members_update_questionnaire_instances" ON public.questionnaire_instances;
CREATE POLICY "org_members_update_questionnaire_instances"
ON public.questionnaire_instances
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = questionnaire_instances.organization_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = questionnaire_instances.organization_id
  )
);

-- Responses: org members can read (via instance org)
DROP POLICY IF EXISTS "org_members_read_questionnaire_responses" ON public.questionnaire_responses;
CREATE POLICY "org_members_read_questionnaire_responses"
ON public.questionnaire_responses
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.questionnaire_instances qi
    JOIN public.organization_users ou
      ON ou.organization_id = qi.organization_id
    WHERE ou.user_id = auth.uid()
      AND qi.id = questionnaire_responses.questionnaire_instance_id
  )
);

-- Responses: org members can insert
DROP POLICY IF EXISTS "org_members_insert_questionnaire_responses" ON public.questionnaire_responses;
CREATE POLICY "org_members_insert_questionnaire_responses"
ON public.questionnaire_responses
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.questionnaire_instances qi
    JOIN public.organization_users ou
      ON ou.organization_id = qi.organization_id
    WHERE ou.user_id = auth.uid()
      AND qi.id = questionnaire_responses.questionnaire_instance_id
  )
);

-- Responses: org members can update
DROP POLICY IF EXISTS "org_members_update_questionnaire_responses" ON public.questionnaire_responses;
CREATE POLICY "org_members_update_questionnaire_responses"
ON public.questionnaire_responses
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.questionnaire_instances qi
    JOIN public.organization_users ou
      ON ou.organization_id = qi.organization_id
    WHERE ou.user_id = auth.uid()
      AND qi.id = questionnaire_responses.questionnaire_instance_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.questionnaire_instances qi
    JOIN public.organization_users ou
      ON ou.organization_id = qi.organization_id
    WHERE ou.user_id = auth.uid()
      AND qi.id = questionnaire_responses.questionnaire_instance_id
  )
);

-- ============================================
-- 1C) CREATE SECURE PUBLIC LINK TABLE (HASHED TOKENS)
-- ============================================
CREATE TABLE IF NOT EXISTS public.questionnaire_public_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_instance_id UUID NOT NULL REFERENCES public.questionnaire_instances(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(token_hash)
);

ALTER TABLE public.questionnaire_public_links ENABLE ROW LEVEL SECURITY;

-- No direct access to this table via anon or authenticated users
DROP POLICY IF EXISTS "no_direct_select_questionnaire_public_links" ON public.questionnaire_public_links;
CREATE POLICY "no_direct_select_questionnaire_public_links"
ON public.questionnaire_public_links
FOR SELECT
USING (false);

DROP POLICY IF EXISTS "no_direct_insert_questionnaire_public_links" ON public.questionnaire_public_links;
CREATE POLICY "no_direct_insert_questionnaire_public_links"
ON public.questionnaire_public_links
FOR INSERT
WITH CHECK (false);

DROP POLICY IF EXISTS "no_direct_update_questionnaire_public_links" ON public.questionnaire_public_links;
CREATE POLICY "no_direct_update_questionnaire_public_links"
ON public.questionnaire_public_links
FOR UPDATE
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "no_direct_delete_questionnaire_public_links" ON public.questionnaire_public_links;
CREATE POLICY "no_direct_delete_questionnaire_public_links"
ON public.questionnaire_public_links
FOR DELETE
USING (false);

-- ============================================
-- 1D) CREATE ACCESS AUDIT LOG TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.questionnaire_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_instance_id UUID NOT NULL,
  token_hash TEXT,
  action TEXT NOT NULL CHECK (action IN ('view','save','submit','invalid_token','expired','revoked')),
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.questionnaire_access_log ENABLE ROW LEVEL SECURITY;

-- No direct read/write from clients
DROP POLICY IF EXISTS "no_direct_access_questionnaire_access_log" ON public.questionnaire_access_log;
CREATE POLICY "no_direct_access_questionnaire_access_log"
ON public.questionnaire_access_log
FOR ALL
USING (false)
WITH CHECK (false);

-- ============================================
-- 1E) CREATE RATE LIMIT TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.questionnaire_token_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(token_hash, window_start)
);

ALTER TABLE public.questionnaire_token_attempts ENABLE ROW LEVEL SECURITY;

-- No direct access
DROP POLICY IF EXISTS "no_direct_access_questionnaire_token_attempts" ON public.questionnaire_token_attempts;
CREATE POLICY "no_direct_access_questionnaire_token_attempts"
ON public.questionnaire_token_attempts
FOR ALL
USING (false)
WITH CHECK (false);

-- ============================================
-- 1F) ADD UNIQUE CONSTRAINT ON RESPONSES (if not exists)
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'questionnaire_responses_instance_question_unique'
  ) THEN
    CREATE UNIQUE INDEX questionnaire_responses_instance_question_unique 
    ON public.questionnaire_responses(questionnaire_instance_id, question_id);
  END IF;
END $$;