create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('check-station-alerts') where exists (select 1 from cron.job where jobname = 'check-station-alerts');

select cron.schedule(
  'check-station-alerts',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://lcrayouskoctmbecomoi.supabase.co/functions/v1/check-station-alerts',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjcmF5b3Vza29jdG1iZWNvbW9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzNDE3ODcsImV4cCI6MjA4MTkxNzc4N30.nFGL6YO4xtgedxhLwXqwgAHKsdsog_m0UBH8eZk2X84"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);