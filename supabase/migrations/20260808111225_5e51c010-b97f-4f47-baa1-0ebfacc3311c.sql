REVOKE ALL ON FUNCTION public.refresh_hub_last_heard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_hub_last_heard() TO service_role;