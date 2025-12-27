-- Create updated_at function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create station_locations table to cache callsign locations
CREATE TABLE public.station_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  callsign TEXT NOT NULL UNIQUE,
  latitude NUMERIC,
  longitude NUMERIC,
  grid_square TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  is_manual_override BOOLEAN NOT NULL DEFAULT false,
  last_fetched_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.station_locations ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read station locations (public data)
CREATE POLICY "Anyone can read station locations"
ON public.station_locations
FOR SELECT
USING (true);

-- Allow anyone to insert station locations
CREATE POLICY "Anyone can insert station locations"
ON public.station_locations
FOR INSERT
WITH CHECK (true);

-- Allow anyone to update station locations
CREATE POLICY "Anyone can update station locations"
ON public.station_locations
FOR UPDATE
USING (true);

-- Create index for callsign lookups
CREATE INDEX idx_station_locations_callsign ON public.station_locations(callsign);

-- Create trigger for updated_at
CREATE TRIGGER update_station_locations_updated_at
BEFORE UPDATE ON public.station_locations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();