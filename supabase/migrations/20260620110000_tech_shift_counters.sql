-- Technician shift tracking and completion counters (used by /api/techs and dispatch scoring)
ALTER TABLE technicians
  ADD COLUMN IF NOT EXISTS working_since TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS return_trip_count INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN technicians.working_since IS 'When tech entered working status — used for overtime guardrails';
COMMENT ON COLUMN technicians.completed_count IS 'Jobs marked complete this shift';
COMMENT ON COLUMN technicians.return_trip_count IS 'Return trips logged this shift';
