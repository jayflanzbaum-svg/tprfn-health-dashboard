-- Fix RLS so anon/authenticated clients can actually read rows
-- The previous policy was RESTRICTIVE (permissive = false), which effectively blocks access when no permissive SELECT policy exists.

DO $$
BEGIN
  -- Drop and recreate as PERMISSIVE
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'syslog_entries'
      AND policyname = 'Anyone can read syslog entries'
  ) THEN
    EXECUTE 'DROP POLICY "Anyone can read syslog entries" ON public.syslog_entries';
  END IF;
END $$;

CREATE POLICY "Anyone can read syslog entries"
ON public.syslog_entries
FOR SELECT
TO anon, authenticated
USING (true);

-- Keep existing insert policy as-is (service role bypasses RLS anyway), but ensure it exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'syslog_entries'
      AND policyname = 'Service role can insert syslog entries'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role can insert syslog entries" ON public.syslog_entries FOR INSERT TO service_role WITH CHECK (true)';
  END IF;
END $$;