-- Proposal Phase 1 — Task 5a: canonical UK VAT period generator (pure calculator).
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
  v_ms         date;
  v_pe         date;
  v_ps         date;
  v_target_mod integer;
  v_year       integer;
BEGIN
  IF v_freq = 'annual_accounting' THEN
    v_freq := 'annual';
  END IF;

  IF v_freq NOT IN ('monthly', 'quarterly', 'annual') THEN
    RAISE EXCEPTION 'generate_vat_periods: unknown p_frequency %, expected monthly|quarterly|annual(_accounting)', p_frequency;
  END IF;

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
    v_target_mod := (p_stagger + 2) % 3;
    v_ms := date_trunc('month', p_from)::date;
    WHILE v_ms <= p_to LOOP
      IF (EXTRACT(MONTH FROM v_ms)::integer % 3) = v_target_mod THEN
        v_pe := (v_ms + INTERVAL '1 month' - INTERVAL '1 day')::date;
        v_ps := (v_ms - INTERVAL '2 months')::date;
        IF v_pe >= p_from AND v_pe <= p_to THEN
          period_start := v_ps;
          period_end   := v_pe;
          period_label := 'VAT Q/E ' || to_char(v_pe, 'DD Mon YYYY');
          RETURN NEXT;
        END IF;
      END IF;
      v_ms := (v_ms + INTERVAL '1 month')::date;
    END LOOP;

  ELSE
    IF p_stagger IS NULL OR p_stagger < 1 OR p_stagger > 12 THEN
      RAISE EXCEPTION 'generate_vat_periods: annual requires p_stagger as an end-month 1..12, got %', p_stagger;
    END IF;
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