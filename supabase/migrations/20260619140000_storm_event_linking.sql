-- Link outages to storm events + track active storm in app settings

ALTER TABLE outages
  ADD COLUMN IF NOT EXISTS storm_event_id UUID REFERENCES storm_events(id);

CREATE INDEX IF NOT EXISTS idx_outages_storm_event ON outages(storm_event_id);

INSERT INTO app_settings (key, value)
VALUES ('active_storm_event_id', 'null'::jsonb)
ON CONFLICT (key) DO NOTHING;
