-- Proposal Phase 1 — Task 5a: canonical UK VAT period generator (pure calculator).
--
-- WHY: A proposal's VAT step must turn a company's VAT registration profile
-- (companies.vat_frequency + companies.vat_stagger_group) into the EXACT set of VAT
-- return periods across a window, so acceptance can materialize one job per period
-- (dedup key (org, service_code, entity, period_label)). This arithmetic — the UK VAT
-- stagger rules — belongs in ONE authoritative DB function, not re-derived per caller.
--
-- PURE CALCULATOR: it reads NO tables and writes NO rows (in particular it never
-- touches public.vat_periods). The caller/proposal decides which returned periods to
-- persist. Depends only on its arguments → declared STABLE, SET search_path.
--
-- UK VAT rules implemented:
--   quarterly stagger group 1 → periods ending Mar / Jun / Sep / Dec
--   quarterly stagger group 2 → periods ending Apr / Jul / Oct / Jan
--   quarterly stagger group 3 → periods ending May / Aug / Nov / Feb
--     (a quarter ending in month M starts on the 1st of month M-2)
--   monthly                   → 12 calendar-month periods per year
--   annual / annual_accounting → one period per year ending at the chosen annual
--     period-end MONTH, which is passed in p_stagger as a month number 1..12
--     (period runs the 12 months up to and including that month-end).
--
-- Labels are the human filing form and MUST stay distinct per period, because
-- lifecycle_materialize_jobs uses period_label as part of the job dedup key:
--   quarterly → 'VAT Q/E 31 Mar 2026'
--   monthly   → 'VAT M/E 31 Jan 2026'
--   annual    → 'VAT Y/E 31 Mar 2026'

CREATE OR REPLACE FUNCTION public.generate_vat_periods(
  p_frequency text,
  p_stagger integer,
  p_from date,
  p_to date
)
RETURNS TABLE(period_start date, period_end date, period_label text)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_freq       text := lower(trim(p_frequency));
  v_ms         date;   -- month-start cursor
  v_pe         date;   -- computed period end
  v_ps         date;   -- computed period start
  v_target_mod integer;
  v_year       integer;
BEGIN
  -- 'annual_accounting' is an alias of 'annual'.
  IF v_freq = 'annual_accounting' THEN
    v_freq := 'annual';
  END IF;

  IF v_freq NOT IN ('monthly', 'quarterly', 'annual') THEN
    RAISE EXCEPTION 'generate_vat_periods: unknown p_frequency %, expected monthly|quarterly|annual(_accounting)', p_frequency;
  END IF;

  -- Empty / inverted window → no periods.
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RETURN;
  END IF;

  IF v_freq = 'monthly' THEN
    v_ms := date_trunc('month', p_from)::date;
    WHILE v_ms <= p_to LOOP
      v_ps := v_ms;
      v_pe := (v_ms + INTERVAL '1 month' - INTERVAL '1 day')::date;
      IF v_pe >= p_from AND v_pe <= p_to THEN
        period_start := v_ps;
        period_end   := v_pe;
        period_label := 'VAT M/E ' || to_char(v_pe, 'DD Mon YYYY');
        RETURN NEXT;
      END IF;
      v_ms := (v_ms + INTERVAL '1 month')::date;
    END LOOP;

  ELSIF v_freq = 'quarterly' THEN
    IF p_stagger IS NULL OR p_stagger NOT IN (1, 2, 3) THEN
      RAISE EXCEPTION 'generate_vat_periods: quarterly requires p_stagger in (1,2,3), got %', p_stagger;
    END IF;
    -- Period-end months for stagger s are those with (month % 3) = ((s+2) % 3):
    --   s=1 → 0 → {3,6,9,12}; s=2 → 1 → {1,4,7,10}; s=3 → 2 → {2,5,8,11}.
    v_target_mod := (p_stagger + 2) % 3;
    v_ms := date_trunc('month', p_from)::date;
    WHILE v_ms <= p_to LOOP
      IF (EXTRACT(MONTH FROM v_ms)::integer % 3) = v_target_mod THEN
        v_pe := (v_ms + INTERVAL '1 month' - INTERVAL '1 day')::date;  -- last day of this month
        v_ps := (v_ms - INTERVAL '2 months')::date;                    -- first day, 3-month cycle
        IF v_pe >= p_from AND v_pe <= p_to THEN
          period_start := v_ps;
          period_end   := v_pe;
          period_label := 'VAT Q/E ' || to_char(v_pe, 'DD Mon YYYY');
          RETURN NEXT;
        END IF;
      END IF;
      v_ms := (v_ms + INTERVAL '1 month')::date;
    END LOOP;

  ELSE  -- annual
    IF p_stagger IS NULL OR p_stagger < 1 OR p_stagger > 12 THEN
      RAISE EXCEPTION 'generate_vat_periods: annual requires p_stagger as an end-month 1..12, got %', p_stagger;
    END IF;
    -- Iterate one year either side of the window so a boundary period-end is not missed.
    FOR v_year IN (EXTRACT(YEAR FROM p_from)::integer - 1) .. (EXTRACT(YEAR FROM p_to)::integer + 1) LOOP
      v_pe := (make_date(v_year, p_stagger, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date;
      IF v_pe >= p_from AND v_pe <= p_to THEN
        v_ps := ((v_pe + INTERVAL '1 day') - INTERVAL '1 year')::date;
        period_start := v_ps;
        period_end   := v_pe;
        period_label := 'VAT Y/E ' || to_char(v_pe, 'DD Mon YYYY');
        RETURN NEXT;
      END IF;
    END LOOP;
  END IF;

  RETURN;
END;
$function$;
