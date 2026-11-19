CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

DROP POLICY "Authenticated users can update app settings" ON public.app_settings;
CREATE POLICY "Admins can update app settings"
ON public.app_settings FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY "Authenticated users can insert hub callsigns" ON public.hub_callsigns;
CREATE POLICY "Admins can insert hub callsigns"
ON public.hub_callsigns FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY "Authenticated users can delete hub callsigns" ON public.hub_callsigns;
CREATE POLICY "Admins can delete hub callsigns"
ON public.hub_callsigns FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY "Authenticated users can insert hub profiles" ON public.hub_profiles;
CREATE POLICY "Admins can insert hub profiles"
ON public.hub_profiles FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY "Authenticated users can update hub profiles" ON public.hub_profiles;
CREATE POLICY "Admins can update hub profiles"
ON public.hub_profiles FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY "Authenticated users can delete hub profiles" ON public.hub_profiles;
CREATE POLICY "Admins can delete hub profiles"
ON public.hub_profiles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY "Authenticated users can insert net sessions" ON public.net_sessions;
CREATE POLICY "Admins can insert net sessions"
ON public.net_sessions FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY "Authenticated users can update net sessions" ON public.net_sessions;
CREATE POLICY "Admins can update net sessions"
ON public.net_sessions FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY "Authenticated users can delete net sessions" ON public.net_sessions;
CREATE POLICY "Admins can delete net sessions"
ON public.net_sessions FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY "Authenticated users can insert station locations" ON public.station_locations;
CREATE POLICY "Admins can insert station locations"
ON public.station_locations FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY "Authenticated users can update station locations" ON public.station_locations;
CREATE POLICY "Admins can update station locations"
ON public.station_locations FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY "Authenticated users can read sms recipients" ON public.sms_recipients;
CREATE POLICY "Admins can read sms recipients"
ON public.sms_recipients FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY "Authenticated users can remove sms recipients" ON public.sms_recipients;
CREATE POLICY "Admins can remove sms recipients"
ON public.sms_recipients FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY "Authenticated users can read sms log" ON public.sms_log;
CREATE POLICY "Admins can read sms log"
ON public.sms_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY "Authenticated users can read station alert configs" ON public.station_alert_configs;
CREATE POLICY "Admins can read station alert configs"
ON public.station_alert_configs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY "Authenticated users can insert station alert configs" ON public.station_alert_configs;
CREATE POLICY "Admins can insert station alert configs"
ON public.station_alert_configs FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY "Authenticated users can update station alert configs" ON public.station_alert_configs;
CREATE POLICY "Admins can update station alert configs"
ON public.station_alert_configs FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY "Authenticated users can delete station alert configs" ON public.station_alert_configs;
CREATE POLICY "Admins can delete station alert configs"
ON public.station_alert_configs FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY "Authenticated users can read station alert events" ON public.station_alert_events;
CREATE POLICY "Admins can read station alert events"
ON public.station_alert_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY "Authenticated users can read support requests" ON public.support_requests;
CREATE POLICY "Admins can read support requests"
ON public.support_requests FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));