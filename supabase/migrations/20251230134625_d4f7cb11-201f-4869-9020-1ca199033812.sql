-- Enable realtime for syslog_entries table to support live connection visualization
ALTER PUBLICATION supabase_realtime ADD TABLE public.syslog_entries;