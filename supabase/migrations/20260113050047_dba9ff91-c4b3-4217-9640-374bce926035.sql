-- Add resume_at column for automatic un-pausing after a set duration
ALTER TABLE public.station_locations 
ADD COLUMN resume_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;