CREATE TABLE public.station_alert_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  callsign text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  threshold_hours integer NOT NULL DEFAULT 24,
  email_recipients text[] NOT NULL DEFAULT '{}',
  sms_recipients text[] NOT NULL DEFAULT '{}',
  notify_recovery boolean NOT NULL DEFAULT true,
  current_state text NOT NULL DEFAULT 'up',
  last_alert_sent_at timestamp with time zone,
  last_recovery_sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.station_alert_configs TO authenticated;
GRANT ALL ON public.station_alert_configs TO service_role;

ALTER TABLE public.station_alert_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read station alert configs"
  ON public.station_alert_configs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert station alert configs"
  ON public.station_alert_configs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update station alert configs"
  ON public.station_alert_configs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete station alert configs"
  ON public.station_alert_configs FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_station_alert_configs_updated_at
  BEFORE UPDATE ON public.station_alert_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.station_alert_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  callsign text NOT NULL,
  alert_type text NOT NULL,
  channel text NOT NULL,
  recipient text NOT NULL,
  last_heard_at timestamp with time zone,
  status text NOT NULL DEFAULT 'sent',
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.station_alert_events TO authenticated;
GRANT ALL ON public.station_alert_events TO service_role;

ALTER TABLE public.station_alert_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read station alert events"
  ON public.station_alert_events FOR SELECT TO authenticated USING (true);

CREATE INDEX idx_station_alert_events_created_at ON public.station_alert_events (created_at DESC);
CREATE INDEX idx_station_alert_events_callsign ON public.station_alert_events (callsign);