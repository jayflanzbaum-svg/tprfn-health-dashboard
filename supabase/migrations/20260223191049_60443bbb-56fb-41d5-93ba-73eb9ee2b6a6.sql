
CREATE OR REPLACE FUNCTION public.distinct_syslog_callsigns()
RETURNS TABLE(callsign text)
LANGUAGE sql
STABLE
SET search_path TO 'public'
SET statement_timeout TO '30s'
AS $$
  SELECT DISTINCT cs AS callsign FROM (
    SELECT upper(regexp_replace(e.callsign, '-[0-9A-Z]+$', '')) AS cs
    FROM public.syslog_entries e
    UNION
    SELECT upper(regexp_replace(e.remote_callsign, '-[0-9A-Z]+$', '')) AS cs
    FROM public.syslog_entries e
    WHERE e.remote_callsign IS NOT NULL AND e.remote_callsign <> ''
  ) raw
  WHERE cs ~ '^[A-Z]{1,2}[0-9][A-Z]{1,3}$'
     OR cs ~ '^[0-9][A-Z][0-9][A-Z]{1,3}$'
  ORDER BY cs;
$$;
