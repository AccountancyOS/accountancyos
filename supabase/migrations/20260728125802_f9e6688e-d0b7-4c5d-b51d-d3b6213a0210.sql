ALTER TABLE public.services_catalog
  ALTER COLUMN default_price DROP NOT NULL;

ALTER TABLE public.services_catalog
  ALTER COLUMN default_price DROP DEFAULT;

COMMENT ON COLUMN public.services_catalog.default_price IS
  'Default price for this service, in the organization''s currency. NULL means NOT YET '
  'PRICED and must never be rendered or serialised as 0.00 — a zero unit price on a quote '
  'line means INCLUDED (free of charge) everywhere in this product, so the two must not be '
  'conflated (DEF-010).';

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