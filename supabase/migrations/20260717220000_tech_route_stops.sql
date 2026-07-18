-- Manual String Routing: ordered stops per technician
CREATE TABLE IF NOT EXISTS tech_route_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tech_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  outage_id TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tech_user_id, outage_id)
);

CREATE INDEX IF NOT EXISTS idx_tech_route_stops_tech
  ON tech_route_stops (tech_user_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_tech_route_stops_outage
  ON tech_route_stops (outage_id);

ALTER TABLE tech_route_stops ENABLE ROW LEVEL SECURITY;
