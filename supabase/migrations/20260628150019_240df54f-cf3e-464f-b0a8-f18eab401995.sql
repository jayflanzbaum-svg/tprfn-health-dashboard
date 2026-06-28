CREATE TABLE public.hub_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_callsign text NOT NULL UNIQUE,
  base_callsign text NOT NULL,
  ssid text,
  operator text,
  city text,
  state text,
  country text,
  latitude numeric,
  longitude numeric,
  network text DEFAULT 'TPRFN',
  notes text,
  frequencies jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_hub_profiles_base_callsign ON public.hub_profiles (base_callsign);

GRANT SELECT ON public.hub_profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hub_profiles TO authenticated;
GRANT ALL ON public.hub_profiles TO service_role;

ALTER TABLE public.hub_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read hub profiles" ON public.hub_profiles FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert hub profiles" ON public.hub_profiles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update hub profiles" ON public.hub_profiles FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete hub profiles" ON public.hub_profiles FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_hub_profiles_updated_at BEFORE UPDATE ON public.hub_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();