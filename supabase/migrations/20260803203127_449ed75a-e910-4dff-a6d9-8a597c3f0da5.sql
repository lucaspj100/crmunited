ALTER TABLE public.team_mission_settings
  ADD COLUMN IF NOT EXISTS day_close_hour integer NOT NULL DEFAULT 21,
  ADD COLUMN IF NOT EXISTS min_sample_enrollments integer NOT NULL DEFAULT 3;

ALTER TABLE public.team_mission_settings
  ADD CONSTRAINT team_mission_settings_day_close_hour_check CHECK (day_close_hour BETWEEN 0 AND 23);