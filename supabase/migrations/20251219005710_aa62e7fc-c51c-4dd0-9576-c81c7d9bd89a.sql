-- P0 SECURITY FIX: Questionnaire Token Security - Part 2
-- Create SECURITY DEFINER RPCs with proper search_path
-- Using pgcrypto.digest explicitly

-- ============================================
-- 2A) HELPER: Hash token using pgcrypto
-- ============================================
CREATE OR REPLACE FUNCTION public._hash_token(p_token TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.digest(p_token::bytea, 'sha256'), 'hex')
$$;

-- ============================================
-- 2B) HELPER: Rate limit check
-- ============================================
CREATE OR REPLACE FUNCTION public._check_questionnaire_token_rate_limit(p_token_hash TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window TIMESTAMPTZ := date_trunc('minute', now()) - make_interval(mins => (extract(minute from now())::int % 5));
  v_count INT;
BEGIN
  INSERT INTO public.questionnaire_token_attempts(token_hash, window_start, count)
  VALUES (p_token_hash, v_window, 1)
  ON CONFLICT (token_hash, window_start)
  DO UPDATE SET count = public.questionnaire_token_attempts.count + 1
  RETURNING count INTO v_count;

  IF v_count > 30 THEN
    RAISE EXCEPTION 'Rate limit exceeded';
  END IF;
END;
$$;

-- ============================================
-- 2C) HELPER: Validate token and get link
-- ============================================
CREATE OR REPLACE FUNCTION public._require_valid_questionnaire_link(p_instance_id UUID, p_token TEXT)
RETURNS public.questionnaire_public_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT;
  v_link public.questionnaire_public_links;
BEGIN
  v_hash := public._hash_token(p_token);

  PERFORM public._check_questionnaire_token_rate_limit(v_hash);

  SELECT * INTO v_link
  FROM public.questionnaire_public_links
  WHERE questionnaire_instance_id = p_instance_id
    AND token_hash = v_hash
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.questionnaire_access_log(questionnaire_instance_id, token_hash, action)
    VALUES (p_instance_id, v_hash, 'invalid_token');
    RAISE EXCEPTION 'Invalid questionnaire link';
  END IF;

  IF v_link.revoked_at IS NOT NULL THEN
    INSERT INTO public.questionnaire_access_log(questionnaire_instance_id, token_hash, action)
    VALUES (p_instance_id, v_hash, 'revoked');
    RAISE EXCEPTION 'Questionnaire link has been revoked';
  END IF;

  IF v_link.expires_at <= now() THEN
    INSERT INTO public.questionnaire_access_log(questionnaire_instance_id, token_hash, action)
    VALUES (p_instance_id, v_hash, 'expired');
    RAISE EXCEPTION 'Questionnaire link has expired';
  END IF;

  RETURN v_link;
END;
$$;

-- ============================================
-- 2D) PUBLIC RPC: Get questionnaire by token
-- ============================================
CREATE OR REPLACE FUNCTION public.get_questionnaire_by_token(p_instance_id UUID, p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.questionnaire_public_links;
  v_instance RECORD;
  v_hash TEXT;
BEGIN
  v_link := public._require_valid_questionnaire_link(p_instance_id, p_token);
  v_hash := public._hash_token(p_token);

  SELECT
    id, name, questions, status, period_label, submitted_at
  INTO v_instance
  FROM public.questionnaire_instances
  WHERE id = p_instance_id
  LIMIT 1;

  INSERT INTO public.questionnaire_access_log(questionnaire_instance_id, token_hash, action)
  VALUES (p_instance_id, v_hash, 'view');

  RETURN jsonb_build_object(
    'id', v_instance.id,
    'name', v_instance.name,
    'questions', v_instance.questions,
    'status', v_instance.status,
    'period_label', v_instance.period_label,
    'submitted_at', v_instance.submitted_at
  );
END;
$$;

-- ============================================
-- 2E) PUBLIC RPC: Get existing responses by token
-- ============================================
CREATE OR REPLACE FUNCTION public.get_questionnaire_responses_by_token(p_instance_id UUID, p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.questionnaire_public_links;
  v_responses JSONB;
BEGIN
  v_link := public._require_valid_questionnaire_link(p_instance_id, p_token);

  SELECT jsonb_agg(jsonb_build_object(
    'id', id,
    'question_id', question_id,
    'answer_text', answer_text,
    'answer_number', answer_number,
    'answer_boolean', answer_boolean,
    'answer_date', answer_date,
    'answer_array', answer_array
  ))
  INTO v_responses
  FROM public.questionnaire_responses
  WHERE questionnaire_instance_id = p_instance_id;

  RETURN COALESCE(v_responses, '[]'::jsonb);
END;
$$;

-- ============================================
-- 2F) PUBLIC RPC: Save questionnaire answer by token
-- ============================================
CREATE OR REPLACE FUNCTION public.save_questionnaire_answer_by_token(
  p_instance_id UUID,
  p_token TEXT,
  p_question_id TEXT,
  p_answer_text TEXT DEFAULT NULL,
  p_answer_number NUMERIC DEFAULT NULL,
  p_answer_boolean BOOLEAN DEFAULT NULL,
  p_answer_date DATE DEFAULT NULL,
  p_answer_array TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.questionnaire_public_links;
  v_hash TEXT;
BEGIN
  v_link := public._require_valid_questionnaire_link(p_instance_id, p_token);
  v_hash := public._hash_token(p_token);

  -- Check instance is not already submitted
  IF EXISTS (
    SELECT 1 FROM public.questionnaire_instances 
    WHERE id = p_instance_id AND status = 'submitted'
  ) THEN
    RAISE EXCEPTION 'Questionnaire already submitted';
  END IF;

  INSERT INTO public.questionnaire_responses(
    questionnaire_instance_id, 
    question_id, 
    answer_text, 
    answer_number, 
    answer_boolean, 
    answer_date, 
    answer_array
  )
  VALUES (
    p_instance_id, 
    p_question_id, 
    p_answer_text, 
    p_answer_number, 
    p_answer_boolean, 
    p_answer_date, 
    p_answer_array
  )
  ON CONFLICT (questionnaire_instance_id, question_id)
  DO UPDATE SET 
    answer_text = EXCLUDED.answer_text,
    answer_number = EXCLUDED.answer_number,
    answer_boolean = EXCLUDED.answer_boolean,
    answer_date = EXCLUDED.answer_date,
    answer_array = EXCLUDED.answer_array;

  -- Update instance status to in_progress if it was sent
  UPDATE public.questionnaire_instances
  SET status = 'in_progress'
  WHERE id = p_instance_id AND status = 'sent';

  INSERT INTO public.questionnaire_access_log(questionnaire_instance_id, token_hash, action)
  VALUES (p_instance_id, v_hash, 'save');

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================
-- 2G) PUBLIC RPC: Submit questionnaire by token
-- ============================================
CREATE OR REPLACE FUNCTION public.submit_questionnaire_by_token(
  p_instance_id UUID,
  p_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.questionnaire_public_links;
  v_hash TEXT;
BEGIN
  v_link := public._require_valid_questionnaire_link(p_instance_id, p_token);
  v_hash := public._hash_token(p_token);

  -- Check not already submitted
  IF EXISTS (
    SELECT 1 FROM public.questionnaire_instances 
    WHERE id = p_instance_id AND status = 'submitted'
  ) THEN
    RAISE EXCEPTION 'Questionnaire already submitted';
  END IF;

  UPDATE public.questionnaire_instances
  SET status = 'submitted',
      submitted_at = COALESCE(submitted_at, now())
  WHERE id = p_instance_id;

  -- Revoke link after submit to prevent reuse
  UPDATE public.questionnaire_public_links
  SET revoked_at = now()
  WHERE id = v_link.id;

  INSERT INTO public.questionnaire_access_log(questionnaire_instance_id, token_hash, action)
  VALUES (p_instance_id, v_hash, 'submit');

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================
-- 2H) ORG-MEMBER RPC: Create public link
-- ============================================
CREATE OR REPLACE FUNCTION public.create_questionnaire_public_link(
  p_instance_id UUID,
  p_expires_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID := auth.uid();
  v_token TEXT;
  v_hash TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.questionnaire_instances
  WHERE id = p_instance_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Questionnaire not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE user_id = v_user_id
      AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Generate secure random token (48 hex chars = 24 bytes)
  v_token := encode(gen_random_bytes(24), 'hex');
  v_hash := encode(extensions.digest(v_token::bytea, 'sha256'), 'hex');

  -- Revoke any existing non-revoked links for this instance
  UPDATE public.questionnaire_public_links
  SET revoked_at = now()
  WHERE questionnaire_instance_id = p_instance_id
    AND revoked_at IS NULL;

  INSERT INTO public.questionnaire_public_links(questionnaire_instance_id, token_hash, expires_at)
  VALUES (p_instance_id, v_hash, p_expires_at);

  -- Update instance status to 'sent' if it was draft
  UPDATE public.questionnaire_instances
  SET status = 'sent'
  WHERE id = p_instance_id AND status = 'draft';

  -- Return raw token ONCE to caller to build URL; never store raw token
  RETURN jsonb_build_object(
    'instance_id', p_instance_id,
    'token', v_token,
    'expires_at', p_expires_at
  );
END;
$$;