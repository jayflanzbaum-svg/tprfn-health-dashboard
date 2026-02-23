
CREATE OR REPLACE FUNCTION public.distinct_syslog_callsigns()
RETURNS TABLE(callsign text)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT DISTINCT cs AS callsign FROM (
    SELECT upper(regexp_replace(e.callsign, '-[0-9A-Z]+$', '')) AS cs
    FROM public.syslog_entries e
    UNION
    SELECT upper(regexp_replace(e.remote_callsign, '-[0-9A-Z]+$', '')) AS cs
    FROM public.syslog_entries e
    WHERE e.remote_callsign IS NOT NULL AND e.remote_callsign <> ''
  ) raw
  WHERE cs ~ '^[A-Z0-9]{1,3}[0-9][A-Z]{1,4}$'
  ORDER BY cs;
$$;
