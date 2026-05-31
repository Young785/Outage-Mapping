-- Storm event sessions (admin storm history)
CREATE TABLE IF NOT EXISTS storm_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL DEFAULT 'Storm Event',
  notes       TEXT,
  started_at  TIMESTAMPTZ DEFAULT NOW(),
  ended_at    TIMESTAMPTZ,
  created_by  UUID        REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_storm_events_started ON storm_events(started_at DESC);

ALTER TABLE storm_events ENABLE ROW LEVEL SECURITY;
