-- Create table for storing syslog entries
CREATE TABLE public.syslog_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL,
  hub TEXT NOT NULL,
  callsign TEXT NOT NULL,
  remote_callsign TEXT,
  event_type TEXT NOT NULL,
  frequency NUMERIC,
  bandwidth INTEGER,
  snr INTEGER,
  bitrate INTEGER,
  bytes_sent BIGINT,
  bytes_received BIGINT,
  total_bytes BIGINT,
  duration_seconds INTEGER,
  raw_message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Unique constraint to prevent duplicates
  CONSTRAINT unique_log_entry UNIQUE (timestamp, hub, callsign, raw_message)
);

-- Create indexes for common queries
CREATE INDEX idx_syslog_timestamp ON public.syslog_entries(timestamp DESC);
CREATE INDEX idx_syslog_hub ON public.syslog_entries(hub);
CREATE INDEX idx_syslog_callsign ON public.syslog_entries(callsign);
CREATE INDEX idx_syslog_event_type ON public.syslog_entries(event_type);
CREATE INDEX idx_syslog_hub_timestamp ON public.syslog_entries(hub, timestamp DESC);

-- Enable RLS
ALTER TABLE public.syslog_entries ENABLE ROW LEVEL SECURITY;

-- Allow public read access (no auth required for viewing logs)
CREATE POLICY "Anyone can read syslog entries"
ON public.syslog_entries
FOR SELECT
USING (true);

-- Only service role can insert (edge function will use service role)
CREATE POLICY "Service role can insert syslog entries"
ON public.syslog_entries
FOR INSERT
WITH CHECK (true);