-- Add an exact KPI aggregate helper for any date range
-- This enables accurate percentage comparisons regardless of UI preset (today/week/month/quarter/year).

CREATE OR REPLACE FUNCTION public.syslog_kpis(
  start_ts timestamptz,
  end_ts timestamptz,
  allowed_callsigns text[],
  selected_station text DEFAULT NULL
)
RETURNS TABLE (
  avg_sn numeric,
  sn_readings bigint,
  sessions bigint,
  total_data bigint,
  success_rate numeric
)
LANGUAGE sql
STABLE
SET search_path TO public
AS $$
  WITH filtered AS (
    SELECT
      upper(regexp_replace(callsign, '-\\d+$', '')) AS station,
      upper(regexp_replace(coalesce(remote_callsign, ''), '-\\d+$', '')) AS partner,
      event_type,
      snr,
      coalesce(bytes_sent, 0) AS bytes_sent,
      coalesce(bytes_received, 0) AS bytes_received
    FROM public.syslog_entries
    WHERE timestamp >= start_ts
      AND timestamp <= end_ts
      AND (
        upper(regexp_replace(callsign, '-\\d+$', '')) = ANY(allowed_callsigns)
        OR upper(regexp_replace(coalesce(remote_callsign, ''), '-\\d+$', '')) = ANY(allowed_callsigns)
      )
      AND (
        selected_station IS NULL
        OR upper(regexp_replace(callsign, '-\\d+$', '')) = selected_station
        OR upper(regexp_replace(coalesce(remote_callsign, ''), '-\\d+$', '')) = selected_station
      )
  ),
  sn AS (
    SELECT snr
    FROM filtered
    WHERE event_type = 'sn_report'
      AND snr IS NOT NULL
      AND partner <> ''
  ),
  con AS (
    SELECT 1
    FROM filtered
    WHERE event_type IN ('connect_in', 'connect_out')
      AND partner <> ''
  ),
  dis AS (
    SELECT bytes_sent, bytes_received
    FROM filtered
    WHERE event_type IN ('disconnect', 'disconnect_timeout')
  )
  SELECT
    COALESCE((SELECT avg(snr) FROM sn), 0) AS avg_sn,
    (SELECT count(*) FROM sn) AS sn_readings,
    (SELECT count(*) FROM con) AS sessions,
    COALESCE((SELECT sum(bytes_sent + bytes_received) FROM dis), 0) AS total_data,
    CASE
      WHEN (SELECT count(*) FROM sn) = 0 THEN 0
      ELSE round(((SELECT count(*) FROM sn WHERE snr >= 5)::numeric / (SELECT count(*) FROM sn)::numeric) * 100, 1)
    END AS success_rate;
$$;