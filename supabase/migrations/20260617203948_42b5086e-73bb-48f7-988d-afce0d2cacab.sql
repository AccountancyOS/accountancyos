CREATE OR REPLACE FUNCTION public.get_check_constraint_values(constraint_name text)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_def text;
  v_inner text;
  v_values text[];
BEGIN
  SELECT pg_get_constraintdef(c.oid)
    INTO v_def
  FROM pg_constraint c
  JOIN pg_namespace n ON n.oid = c.connamespace
  WHERE c.conname = constraint_name
    AND n.nspname = 'public'
    AND c.contype = 'c'
  LIMIT 1;

  IF v_def IS NULL THEN
    RETURN NULL;
  END IF;

  -- Extract text inside ARRAY[ ... ] (covers the common `= ANY (ARRAY[...])` pattern)
  v_inner := substring(v_def from 'ARRAY\[(.*)\]');
  IF v_inner IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;

  -- Pull each single-quoted literal out of the array body, ignoring ::text casts.
  SELECT array_agg(m[1] ORDER BY ord)
    INTO v_values
  FROM regexp_matches(v_inner, $re$'([^']*)'$re$, 'g') WITH ORDINALITY AS t(m, ord);

  RETURN COALESCE(v_values, ARRAY[]::text[]);
END;
$$;

REVOKE ALL ON FUNCTION public.get_check_constraint_values(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_check_constraint_values(text) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.get_check_constraint_values(text) IS
  'Read-only introspection helper. Returns the allowed string literals of a public-schema CHECK constraint defined with `= ANY (ARRAY[...])`. Used by scripts/smoke-test.ts to detect DB/UI vocabulary drift.';