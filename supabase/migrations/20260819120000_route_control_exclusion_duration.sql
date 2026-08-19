-- Per-technician AUTO vs MANUAL routing (independent of other techs).
ALTER TABLE technicians
  ADD COLUMN IF NOT EXISTS route_control TEXT NOT NULL DEFAULT 'auto';

ALTER TABLE technicians
  DROP CONSTRAINT IF EXISTS technicians_route_control_check;

ALTER TABLE technicians
  ADD CONSTRAINT technicians_route_control_check
  CHECK (route_control IN ('auto', 'manual'));

CREATE INDEX IF NOT EXISTS idx_technicians_route_control
  ON technicians (route_control);

-- GIS exclusion duration (permanent vs temporary) for Office audit.
ALTER TABLE excluded_properties
  ADD COLUMN IF NOT EXISTS duration TEXT NOT NULL DEFAULT 'permanent';

ALTER TABLE excluded_properties
  DROP CONSTRAINT IF EXISTS excluded_properties_duration_check;

ALTER TABLE excluded_properties
  ADD CONSTRAINT excluded_properties_duration_check
  CHECK (duration IN ('permanent', 'temporary'));
