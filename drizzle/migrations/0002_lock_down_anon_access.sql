REVOKE ALL ON public.sms_recipients, public.sms_log, public.station_alert_configs, public.station_alert_events, public.support_requests FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.app_settings, public.hub_callsigns, public.hub_profiles, public.net_sessions, public.station_locations, public.syslog_entries FROM anon;
GRANT SELECT ON public.app_settings, public.hub_callsigns, public.hub_profiles, public.net_sessions, public.station_locations, public.syslog_entries TO anon;
GRANT ALL ON public.sms_recipients, public.sms_log, public.station_alert_configs, public.station_alert_events, public.support_requests TO service_role;
DROP POLICY IF EXISTS "Anyone can insert support requests" ON public.support_requests;