CREATE TABLE public.sms_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_callsign text NOT NULL,
  phone text NOT NULL,
  name text,
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by text NOT NULL DEFAULT 'self',
  confirmed_at timestamptz,
  opted_out_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hub_callsign, phone),
  CONSTRAINT sms_recipients_status_chk CHECK (status IN ('pending','active','opted_out'))
);
GRANT SELECT, DELETE ON public.sms_recipients TO authenticated;
GRANT ALL ON public.sms_recipients TO service_role;
ALTER TABLE public.sms_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read sms recipients" ON public.sms_recipients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can remove sms recipients" ON public.sms_recipients FOR DELETE TO authenticated USING (true);

CREATE TABLE public.sms_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL DEFAULT 'outbound',
  phone text NOT NULL,
  hub_callsign text,
  message_type text NOT NULL,
  body text,
  status text NOT NULL,
  twilio_sid text,
  error_message text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sms_log_phone_created_idx ON public.sms_log (phone, created_at DESC);
CREATE INDEX sms_log_ip_created_idx ON public.sms_log (ip, created_at DESC);
GRANT SELECT ON public.sms_log TO authenticated;
GRANT ALL ON public.sms_log TO service_role;
ALTER TABLE public.sms_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read sms log" ON public.sms_log FOR SELECT TO authenticated USING (true);

CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read app settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Authenticated users can update app settings" ON public.app_settings FOR UPDATE TO authenticated USING (true);
INSERT INTO public.app_settings (key, value) VALUES ('sms_sending_enabled', 'false'::jsonb);

COMMENT ON COLUMN public.station_alert_configs.sms_recipients IS 'DEPRECATED: replaced by public.sms_recipients (Twilio double opt-in)';