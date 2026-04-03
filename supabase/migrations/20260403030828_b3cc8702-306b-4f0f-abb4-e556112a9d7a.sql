-- Restrict net_sessions write operations to authenticated users only
DROP POLICY IF EXISTS "Anyone can insert net sessions" ON public.net_sessions;
DROP POLICY IF EXISTS "Anyone can update net sessions" ON public.net_sessions;
DROP POLICY IF EXISTS "Anyone can delete net sessions" ON public.net_sessions;

CREATE POLICY "Authenticated users can insert net sessions"
ON public.net_sessions FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update net sessions"
ON public.net_sessions FOR UPDATE TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete net sessions"
ON public.net_sessions FOR DELETE TO authenticated
USING (true);