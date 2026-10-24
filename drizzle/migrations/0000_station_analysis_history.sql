CREATE OR REPLACE FUNCTION public.station_analysis_history(p_stations text[], p_end timestamptz, p_start timestamptz DEFAULT NULL)
RETURNS TABLE(station text, bucket_kind text, bucket text, partner text, samples bigint, avg_sn numeric, good_sn_pct numeric, connect_events bigint, normal_disconnects bigint, timeouts bigint, avg_bitrate numeric, peak_bitrate integer, sent_bytes numeric, first_seen timestamptz, last_seen timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public SET statement_timeout = '60s'
AS $$
WITH normalized AS (
 SELECT s.*, upper(regexp_replace(s.callsign, '-[0-9A-Z]+$', '')) cs,
 upper(regexp_replace(coalesce(s.remote_callsign,''), '-[0-9A-Z]+$', '')) rc
 FROM public.syslog_entries s
 WHERE s.timestamp <= p_end AND (p_start IS NULL OR s.timestamp >= p_start)
 AND (upper(regexp_replace(s.callsign, '-[0-9A-Z]+$', '')) = ANY(p_stations)
 OR upper(regexp_replace(coalesce(s.remote_callsign,''), '-[0-9A-Z]+$', '')) = ANY(p_stations))
), endpoints AS (
 SELECT n.*, e.station, CASE WHEN e.station = n.cs THEN n.rc ELSE n.cs END peer
 FROM normalized n CROSS JOIN LATERAL (SELECT DISTINCT v AS station FROM (VALUES(n.cs),(n.rc)) x(v) WHERE v = ANY(p_stations)) e
), buckets AS (
 SELECT e.*, b.kind, b.label, b.partner FROM endpoints e
 CROSS JOIN LATERAL (VALUES
 ('month', to_char(e.timestamp AT TIME ZONE 'UTC','YYYY-MM'), ''),
 ('week', to_char(date_trunc('week',e.timestamp AT TIME ZONE 'UTC'),'YYYY-MM-DD'), ''),
 ('hour', to_char(e.timestamp AT TIME ZONE 'UTC','HH24'), ''),
 ('partner_month', to_char(e.timestamp AT TIME ZONE 'UTC','YYYY-MM'), e.peer),
 ('frequency_month', to_char(e.timestamp AT TIME ZONE 'UTC','YYYY-MM'), coalesce(e.frequency::text,'unknown'))
 ) b(kind,label,partner)
)
SELECT station, kind, label, partner,
 count(*) FILTER(WHERE event_type='sn_report' AND snr IS NOT NULL AND peer<>''),
 round(avg(snr) FILTER(WHERE event_type='sn_report' AND peer<>''),2),
 round(100.0*count(*) FILTER(WHERE event_type='sn_report' AND snr>=5 AND peer<>'') / nullif(count(*) FILTER(WHERE event_type='sn_report' AND snr IS NOT NULL AND peer<>''),0),2),
 count(*) FILTER(WHERE event_type IN ('connect_in','connect_out') AND peer<>''),
 count(*) FILTER(WHERE event_type='disconnect'), count(*) FILTER(WHERE event_type='disconnect_timeout'),
 round(avg(bitrate) FILTER(WHERE event_type IN ('disconnect','disconnect_timeout') AND bitrate>0),2),
 max(bitrate) FILTER(WHERE event_type IN ('disconnect','disconnect_timeout') AND bitrate>0),
 coalesce(sum(bytes_sent) FILTER(WHERE event_type IN ('disconnect','disconnect_timeout') AND cs=station),0),
 min(timestamp), max(timestamp)
FROM buckets GROUP BY station,kind,label,partner ORDER BY station,kind,label,partner;
$$;
REVOKE ALL ON FUNCTION public.station_analysis_history(text[],timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.station_analysis_history(text[],timestamptz,timestamptz) TO service_role;