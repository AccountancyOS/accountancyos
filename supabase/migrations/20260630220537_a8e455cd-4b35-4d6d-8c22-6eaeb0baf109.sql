-- ============================================================
-- Bookkeeping — schedule the TrueLayer bank sync (genuinely live feed)
-- ============================================================
-- truelayer-sync-scheduled existed but was wired to no schedule, so the feed only
-- updated on a manual "Sync" click. This schedules it every 30 minutes. The sync is
-- incremental (per-account from last_synced_at) and batched, so frequent runs are cheap.
-- Adjust the cron expression to taste (manual sync remains instant either way).
--
-- Uses the project's service-role key from Vault at run time (NEVER embedded in SQL).
-- Reuses the same Vault secret as the email worker (`email_queue_service_role_key`),
-- which is the project service_role key. If it's absent the cron still runs but the
-- function returns 401 — a WARNING is raised on apply so the gap is visible.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key') THEN
    RAISE WARNING 'Vault secret "email_queue_service_role_key" is missing; TrueLayer sync cron is scheduled but will 401 until the secret is set (Dashboard > Project Settings > Vault).';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not verify Vault secret email_queue_service_role_key (%); ensure it is configured.', SQLERRM;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('truelayer-sync-scheduled');
EXCEPTION WHEN OTHERS THEN
  NULL; -- not scheduled yet
END $$;

SELECT cron.schedule(
  'truelayer-sync-scheduled',
  '*/30 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://moxpdejnucjjcplleefn.supabase.co/functions/v1/truelayer-sync-scheduled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'email_queue_service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);
