CREATE OR REPLACE FUNCTION public.hub_uptime_days(p_hubs text[], p_start timestamptz, p_end timestamptz)
RETURNS TABLE(callsign text, days bigint, last_seen timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH hubs AS (
    SELECT upper(unnest(p_hubs)) AS cs
  ),
  events AS (
    SELECT upper(s.callsign) AS cs, s.timestamp
      FROM public.syslog_entries s
     WHERE s.timestamp >= p_start AND s.timestamp <= p_end
       AND upper(s.callsign) IN (SELECT cs FROM hubs)
    UNION ALL
    SELECT upper(s.remote_callsign) AS cs, s.timestamp
      FROM public.syslog_entries s
     WHERE s.timestamp >= p_start AND s.timestamp <= p_end
       AND upper(s.remote_callsign) IN (SELECT cs FROM hubs)
  )
  SELECT h.cs AS callsign,
         COALESCE(COUNT(DISTINCT (e.timestamp AT TIME ZONE 'UTC')::date), 0) AS days,
         MAX(e.timestamp) AS last_seen
    FROM hubs h
    LEFT JOIN events e ON e.cs = h.cs
   GROUP BY h.cs;
$$;

GRANT EXECUTE ON FUNCTION public.hub_uptime_days(text[], timestamptz, timestamptz) TO anon, authenticated, service_role;