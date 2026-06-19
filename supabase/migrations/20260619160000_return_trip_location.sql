-- Finisher routing: return-trip flag + location corrections persist on marker

ALTER TABLE outages
  ADD COLUMN IF NOT EXISTS needs_return_trip BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN outages.needs_return_trip IS 'Job started but requires a return visit — Finisher routing target';
