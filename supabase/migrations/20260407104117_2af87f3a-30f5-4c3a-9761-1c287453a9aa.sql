
CREATE OR REPLACE FUNCTION public.role_level(r text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE r
    WHEN 'owner' THEN 3
    WHEN 'admin' THEN 2
    WHEN 'staff' THEN 1
    ELSE 0
  END;
$$;
