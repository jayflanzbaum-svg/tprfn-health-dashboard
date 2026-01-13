-- Add is_paused column to station_locations table
ALTER TABLE public.station_locations 
ADD COLUMN is_paused BOOLEAN NOT NULL DEFAULT false;

-- Add paused_at timestamp to track when station was paused
ALTER TABLE public.station_locations 
ADD COLUMN paused_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;