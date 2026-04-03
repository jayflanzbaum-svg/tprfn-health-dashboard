-- Drop the overly permissive insert policy
DROP POLICY IF EXISTS "Service role can insert syslog entries" ON public.syslog_entries;

-- Create a properly restricted insert policy for service role only
CREATE POLICY "Service role can insert syslog entries"
ON public.syslog_entries
FOR INSERT
TO service_role
WITH CHECK (true);