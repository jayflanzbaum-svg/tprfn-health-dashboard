ALTER TABLE public.hub_profiles ADD COLUMN IF NOT EXISTS last_heard_at timestamptz;

CREATE OR REPLACE FUNCTION public.refresh_hub_last_heard()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  updated_count integer;
BEGIN
  WITH bases AS (
    SELECT DISTINCT upper(base_callsign) AS cs FROM public.hub_profiles
  ),
  events AS (
    SELECT upper(regexp_replace(s.callsign, '-[0-9A-Z]+$', '')) AS cs, s.timestamp
      FROM public.syslog_entries s
     WHERE upper(regexp_replace(s.callsign, '-[0-9A-Z]+$', '')) IN (SELECT cs FROM bases)
    UNION ALL
    SELECT upper(regexp_replace(s.remote_callsign, '-[0-9A-Z]+$', '')) AS cs, s.timestamp
      FROM public.syslog_entries s
     WHERE s.remote_callsign IS NOT NULL AND s.remote_callsign <> ''
       AND upper(regexp_replace(s.remote_callsign, '-[0-9A-Z]+$', '')) IN (SELECT cs FROM bases)
  ),
  latest AS (
    SELECT cs, max(timestamp) AS last_seen FROM events GROUP BY cs
  )
  UPDATE public.hub_profiles h
     SET last_heard_at = l.last_seen
    FROM latest l
   WHERE upper(h.base_callsign) = l.cs
     AND (h.last_heard_at IS DISTINCT FROM l.last_seen);

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_hub_last_heard() TO service_role;

SELECT public.refresh_hub_last_heard();