-- v6: Add aftermovie video URL to events
ALTER TABLE events ADD COLUMN IF NOT EXISTS video_url TEXT;
