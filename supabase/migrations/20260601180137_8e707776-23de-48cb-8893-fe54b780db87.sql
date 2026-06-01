-- Normalise reminder cadences so the UI never has to choose between
-- "7 days" and "1 week" as different options. Anything stored as WEEK is
-- converted into DAY * 7. Existing DAY/MONTH rows are left untouched.

UPDATE public.automation_chaser_policies
SET
  frequency_interval = frequency_interval * 7,
  frequency_unit = 'DAY'
WHERE frequency_unit = 'WEEK';

UPDATE public.automation_chaser_runs
SET
  frequency_interval = frequency_interval * 7,
  frequency_unit = 'DAY'
WHERE frequency_unit = 'WEEK';

-- Also tidy the bounds: any min/max stored using a WEEK convention is
-- already in the same units as frequency_interval, so multiplying the
-- frequency above is sufficient. No bound changes required.
