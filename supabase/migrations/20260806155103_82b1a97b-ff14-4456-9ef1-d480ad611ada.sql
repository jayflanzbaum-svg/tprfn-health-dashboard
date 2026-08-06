INSERT INTO public.station_locations (callsign, latitude, longitude, city, state, country, source, is_manual_override, last_fetched_at)
SELECT hp.base_callsign, hp.latitude, hp.longitude, hp.city, hp.state, hp.country, 'hub_directory', true, now()
FROM public.hub_profiles hp
WHERE hp.latitude IS NOT NULL AND hp.longitude IS NOT NULL
ON CONFLICT (callsign) DO UPDATE
SET latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    city = COALESCE(EXCLUDED.city, public.station_locations.city),
    state = COALESCE(EXCLUDED.state, public.station_locations.state),
    country = COALESCE(EXCLUDED.country, public.station_locations.country),
    source = 'hub_directory',
    is_manual_override = true,
    updated_at = now();