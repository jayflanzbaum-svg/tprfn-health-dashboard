INSERT INTO public.hub_profiles (full_callsign, base_callsign, notes)
SELECT 'AA5AF', 'AA5AF', 'Placeholder entry - details pending'
WHERE NOT EXISTS (
  SELECT 1 FROM public.hub_profiles WHERE upper(base_callsign) = 'AA5AF'
);