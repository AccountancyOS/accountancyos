-- Add billing frequency to quote lines
ALTER TABLE quote_lines 
ADD COLUMN billing_frequency text NOT NULL DEFAULT 'now' CHECK (billing_frequency IN ('now', 'monthly'));