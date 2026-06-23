-- ============================================================
-- Fix: add templates.category + templates.is_active (quote-send was erroring)
-- ============================================================
-- The current lifecycle_send_quote selects an email template with
--   WHERE ... (category = 'quote' OR name ILIKE '%quote%' ...)
--           AND COALESCE(is_active, true) = true
-- but public.templates has neither `category` nor `is_active` (it uses `status`),
-- so sending a quote failed with "column category does not exist".
--
-- Add both columns additively so the query resolves. Forward-compatible: the
-- name-ILIKE fallback still selects the quote template, is_active defaults true
-- (so existing templates remain selectable), and `category` is available for the
-- intended template-categorisation. Done as a small additive migration rather
-- than editing lifecycle_send_quote, which is being actively rewritten upstream.
-- ============================================================

ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

COMMENT ON COLUMN public.templates.category IS
  'Optional template category (e.g. quote/engagement). Used by lifecycle_send_quote template selection.';
