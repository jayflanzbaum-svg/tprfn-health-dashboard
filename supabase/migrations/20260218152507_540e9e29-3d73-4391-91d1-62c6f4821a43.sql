
CREATE TABLE public.hub_callsigns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  callsign text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.hub_callsigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read hub callsigns" ON public.hub_callsigns FOR SELECT USING (true);
CREATE POLICY "Anyone can insert hub callsigns" ON public.hub_callsigns FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete hub callsigns" ON public.hub_callsigns FOR DELETE USING (true);

-- Seed with the default hub callsigns
INSERT INTO public.hub_callsigns (callsign) VALUES
  ('K1AJD'), ('KD2UHN'), ('KN4LGM'), ('N2JDQ'), ('W2RTV'),
  ('KC3OL'), ('KD2YTH'), ('KO4THB'), ('N2MKI'), ('WA2JNF'),
  ('KC3QFR'), ('KE8TAS'), ('KQ4DOA'), ('N4LRG'), ('WB2JPQ'),
  ('KC3RAP'), ('KN4CQB'), ('N2BGL'), ('W1YSM')
ON CONFLICT (callsign) DO NOTHING;
