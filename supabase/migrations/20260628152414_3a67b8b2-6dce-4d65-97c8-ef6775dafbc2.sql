CREATE INDEX IF NOT EXISTS idx_syslog_base_callsign
  ON public.syslog_entries (upper(regexp_replace(callsign, '-[0-9A-Z]+$', '')));

CREATE INDEX IF NOT EXISTS idx_syslog_base_remote
  ON public.syslog_entries (upper(regexp_replace(remote_callsign, '-[0-9A-Z]+$', '')))
  WHERE remote_callsign IS NOT NULL AND remote_callsign <> '';

CREATE OR REPLACE FUNCTION public.hub_uptime_days(p_hubs text[], p_start timestamptz, p_end timestamptz)
RETURNS TABLE(callsign text, days bigint, last_seen timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
  WITH hubs AS (
    SELECT upper(unnest(p_hubs)) AS cs
  ),
  events AS (
    SELECT upper(regexp_replace(s.callsign, '-[0-9A-Z]+$', '')) AS cs, s.timestamp
      FROM public.syslog_entries s
     WHERE s.timestamp >= p_start AND s.timestamp <= p_end
       AND upper(regexp_replace(s.callsign, '-[0-9A-Z]+$', '')) IN (SELECT cs FROM hubs)
    UNION ALL
    SELECT upper(regexp_replace(s.remote_callsign, '-[0-9A-Z]+$', '')) AS cs, s.timestamp
      FROM public.syslog_entries s
     WHERE s.timestamp >= p_start AND s.timestamp <= p_end
       AND s.remote_callsign IS NOT NULL AND s.remote_callsign <> ''
       AND upper(regexp_replace(s.remote_callsign, '-[0-9A-Z]+$', '')) IN (SELECT cs FROM hubs)
  )
  SELECT h.cs AS callsign,
         COALESCE(COUNT(DISTINCT (e.timestamp AT TIME ZONE 'UTC')::date), 0) AS days,
         MAX(e.timestamp) AS last_seen
    FROM hubs h
    LEFT JOIN events e ON e.cs = h.cs
   GROUP BY h.cs;
$$;

GRANT EXECUTE ON FUNCTION public.hub_uptime_days(text[], timestamptz, timestamptz) TO anon, authenticated, service_role;