-- =====================================================================================
-- DEF-010 (pricing half): an unset price must be UNSET, never £0.00.
-- =====================================================================================
-- Owner ruling, 2026-07-28. Zero is not a neutral default in this product: throughout the
-- quote builder, the totals and the Stripe line-item builders, a zero unit price means
-- INCLUDED (isIncludedLine in src/lib/quote-defaults.ts) — a contractual commitment to do
-- the work for nothing. Three catalogue services sat at 0.00 and were therefore quoting
-- themselves as free of charge:
--
--   * LLP accounts production      -> £1000.00
--   * Sole trader accounts         ->  £250.00
--   * Trust Registration Service   ->  £250.00
--
-- Those prices are the owner's, not invented here.
--
-- (A) makes `default_price` NULLABLE so "not yet priced" is representable at all. Until
--     now the column's NOT NULL default forced every unpriced service to claim it was
--     free. NULL means unpriced; it must never serialise or render as £0.00.
-- (B) sets the three owner-supplied prices, matched by name per organization.
--
-- Deliberately NOT done here: converting other 0.00 services to NULL. Zero is a legitimate
-- value meaning "included at no charge", and only these three were identified as unpriced.
-- Rewriting every zero would silently change the commercial meaning of services nobody
-- reviewed.
--
-- The send-time guard the ruling also calls for — block sending until each line is priced,
-- explicitly Included, or explicitly No charge — needs a line-level treatment field to
-- distinguish "Included" from "No charge", and is its own increment. This migration closes
-- the immediate exposure (the three services now carry real prices) and makes the unpriced
-- state expressible, which that guard depends on.
-- =====================================================================================

-- (A) Allow "unpriced" to exist ----------------------------------------------------------
ALTER TABLE public.services_catalog
  ALTER COLUMN default_price DROP NOT NULL;

ALTER TABLE public.services_catalog
  ALTER COLUMN default_price DROP DEFAULT;

COMMENT ON COLUMN public.services_catalog.default_price IS
  'Default price for this service, in the organization''s currency. NULL means NOT YET '
  'PRICED and must never be rendered or serialised as 0.00 — a zero unit price on a quote '
  'line means INCLUDED (free of charge) everywhere in this product, so the two must not be '
  'conflated (DEF-010).';

-- (B) The owner's prices for the three unpriced services ---------------------------------
-- Matched on name because `code` varies by organization for these rows. Guarded on the
-- current value so a practice that has already priced one is never overwritten.
UPDATE public.services_catalog
   SET default_price = 1000.00, updated_at = now()
 WHERE name ILIKE 'LLP accounts production'
   AND COALESCE(default_price, 0) = 0;

UPDATE public.services_catalog
   SET default_price = 250.00, updated_at = now()
 WHERE name ILIKE 'Sole trader accounts'
   AND COALESCE(default_price, 0) = 0;

UPDATE public.services_catalog
   SET default_price = 250.00, updated_at = now()
 WHERE name ILIKE 'Trust Registration Service'
   AND COALESCE(default_price, 0) = 0;
