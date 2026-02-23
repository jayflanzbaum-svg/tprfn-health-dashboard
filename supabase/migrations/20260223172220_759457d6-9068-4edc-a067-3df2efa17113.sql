
CREATE OR REPLACE FUNCTION public.distinct_syslog_callsigns()
RETURNS TABLE(callsign text)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT DISTINCT upper(regexp_replace(e.callsign, '-\d+$', '')) AS callsign
  FROM public.syslog_entries e
  UNION
  SELECT DISTINCT upper(regexp_replace(e.remote_callsign, '-\d+$', '')) AS callsign
  FROM public.syslog_entries e
  WHERE e.remote_callsign IS NOT NULL AND e.remote_callsign <> ''
  ORDER BY callsign;
$$;
