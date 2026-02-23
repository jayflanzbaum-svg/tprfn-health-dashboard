
-- Create support_requests table to store contact form submissions
CREATE TABLE public.support_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  request_type TEXT NOT NULL, -- 'hub_callsign' or 'station_location' or 'general'
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;

-- Anyone can submit a support request
CREATE POLICY "Anyone can insert support requests"
ON public.support_requests FOR INSERT
WITH CHECK (true);

-- Only authenticated users can view support requests
CREATE POLICY "Authenticated users can read support requests"
ON public.support_requests FOR SELECT
TO authenticated
USING (true);
