-- Fix snr column type to accept decimal values
ALTER TABLE public.syslog_entries 
ALTER COLUMN snr TYPE NUMERIC USING snr::NUMERIC;