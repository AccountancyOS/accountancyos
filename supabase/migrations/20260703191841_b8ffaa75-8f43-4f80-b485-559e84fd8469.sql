-- ============================================================
-- Invoicing Stage 4 — private bucket for generated invoice PDFs
-- ============================================================
-- The send-invoice edge function stores the generated PDF here and emails the customer a
-- long-lived SIGNED URL to it (customers are external + unauthenticated, so a signed URL
-- works where auth-gated access can't). Private bucket; the function reads/writes via
-- service role and mints signed URLs — no end-user RLS needed.
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-pdfs', 'invoice-pdfs', false)
ON CONFLICT (id) DO NOTHING;
