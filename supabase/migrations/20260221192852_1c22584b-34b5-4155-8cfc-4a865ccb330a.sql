
-- Create net_sessions table for tracking check-in nets
CREATE TABLE public.net_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Check-in Net',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ended_at TIMESTAMP WITH TIME ZONE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.net_sessions ENABLE ROW LEVEL SECURITY;

-- Public read/write (no auth in this app)
CREATE POLICY "Anyone can read net sessions"
ON public.net_sessions FOR SELECT USING (true);

CREATE POLICY "Anyone can insert net sessions"
ON public.net_sessions FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update net sessions"
ON public.net_sessions FOR UPDATE USING (true);

CREATE POLICY "Anyone can delete net sessions"
ON public.net_sessions FOR DELETE USING (true);

-- Timestamp trigger
CREATE TRIGGER update_net_sessions_updated_at
BEFORE UPDATE ON public.net_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
