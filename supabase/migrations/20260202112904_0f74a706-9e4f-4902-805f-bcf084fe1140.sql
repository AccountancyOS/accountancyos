-- Add UTR and NINO columns to clients table for SA clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS utr TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS nino TEXT;

-- Add index on UTR for lookups
CREATE INDEX IF NOT EXISTS idx_clients_utr ON clients(utr) WHERE utr IS NOT NULL;