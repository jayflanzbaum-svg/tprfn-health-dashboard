
-- Drop the existing RESTRICTIVE write policies on hub_callsigns and replace with auth-required ones
DROP POLICY IF EXISTS "Anyone can insert hub callsigns" ON public.hub_callsigns;
DROP POLICY IF EXISTS "Anyone can delete hub callsigns" ON public.hub_callsigns;

CREATE POLICY "Authenticated users can insert hub callsigns"
ON public.hub_callsigns FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete hub callsigns"
ON public.hub_callsigns FOR DELETE
TO authenticated
USING (true);

-- Drop the existing RESTRICTIVE write policies on station_locations and replace with auth-required ones
DROP POLICY IF EXISTS "Anyone can insert station locations" ON public.station_locations;
DROP POLICY IF EXISTS "Anyone can update station locations" ON public.station_locations;

CREATE POLICY "Authenticated users can insert station locations"
ON public.station_locations FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update station locations"
ON public.station_locations FOR UPDATE
TO authenticated
USING (true);
