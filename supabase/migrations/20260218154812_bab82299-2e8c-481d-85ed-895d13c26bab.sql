
-- Drop the restrictive policies
DROP POLICY IF EXISTS "Anyone can read hub callsigns" ON public.hub_callsigns;
DROP POLICY IF EXISTS "Anyone can insert hub callsigns" ON public.hub_callsigns;
DROP POLICY IF EXISTS "Anyone can delete hub callsigns" ON public.hub_callsigns;

-- Recreate as PERMISSIVE (explicit)
CREATE POLICY "Anyone can read hub callsigns" ON public.hub_callsigns AS PERMISSIVE FOR SELECT USING (true);
CREATE POLICY "Anyone can insert hub callsigns" ON public.hub_callsigns AS PERMISSIVE FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete hub callsigns" ON public.hub_callsigns AS PERMISSIVE FOR DELETE USING (true);
