-- TrueLayer scheduled bank sync: every 30 minutes -> every 2 hours (owner decision, 2026-11-11).
-- Manual refresh (truelayer-sync, user-triggered) is unchanged and stays on demand.
--
-- First migration on the single-project path: applied to London with `supabase db push` after the
-- migration-history repair. Idempotent — a re-run finds the schedule already set, changes nothing,
-- and still asserts the end state. Only the schedule changes: command, owner and active flag are
-- left exactly as they are (cron.alter_job with schedule only).

DO $truelayer_cadence$
DECLARE
  v_jobid    bigint;
  v_schedule text;
  v_command  text;
  v_active   boolean;
BEGIN
  SELECT jobid, schedule, command, active
    INTO v_jobid, v_schedule, v_command, v_active
    FROM cron.job
   WHERE jobname = 'truelayer-sync-scheduled';

  IF v_jobid IS NULL THEN
    RAISE EXCEPTION 'truelayer cadence: cron job "truelayer-sync-scheduled" does not exist';
  END IF;

  IF v_schedule IS DISTINCT FROM '0 */2 * * *' THEN
    PERFORM cron.alter_job(job_id := v_jobid, schedule := '0 */2 * * *');
  END IF;

  -- Post-assertions: the schedule landed, and nothing else about the job moved.
  IF (SELECT schedule FROM cron.job WHERE jobid = v_jobid) IS DISTINCT FROM '0 */2 * * *' THEN
    RAISE EXCEPTION 'truelayer cadence: schedule is not 0 */2 * * * after alter';
  END IF;
  IF (SELECT command FROM cron.job WHERE jobid = v_jobid) IS DISTINCT FROM v_command
     OR (SELECT active FROM cron.job WHERE jobid = v_jobid) IS DISTINCT FROM v_active THEN
    RAISE EXCEPTION 'truelayer cadence: the job command or active flag changed unexpectedly';
  END IF;
  IF (SELECT count(*) FROM cron.job WHERE jobname = 'truelayer-sync-scheduled') <> 1 THEN
    RAISE EXCEPTION 'truelayer cadence: expected exactly one truelayer-sync-scheduled job';
  END IF;
END
$truelayer_cadence$;
