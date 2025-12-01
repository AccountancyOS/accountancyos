-- Enable required extensions for cron-based email processing
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Schedule email queue processing job (runs every 1 minute)
SELECT cron.schedule(
  'process-email-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://moxpdejnucjjcplleefn.supabase.co/functions/v1/send-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1veHBkZWpudWNqamNwbGxlZWZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwNzg1NDEsImV4cCI6MjA3OTY1NDU0MX0.h90FqnzVKqsxpMO9W2aWC1aCogvVswk4mb65VsUFeQ0'
    ),
    body := '{"mode": "process_queue"}'::jsonb
  ) AS request_id;
  $$
);