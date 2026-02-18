ALTER TABLE vat_codes ADD COLUMN IF NOT EXISTS is_common BOOLEAN NOT NULL DEFAULT false;
UPDATE vat_codes SET is_common = true WHERE code IN ('T1', 'T20', 'T0', 'T9', 'OS');