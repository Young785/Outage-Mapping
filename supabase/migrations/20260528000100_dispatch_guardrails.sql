-- Dispatch guardrail settings for load/overtime-aware auto-assignment.
INSERT INTO app_settings (key, value)
VALUES
  ('max_jobs_per_tech', '4'::jsonb),
  ('overtime_hours_soft_limit', '10'::jsonb),
  ('overtime_hours_hard_limit', '14'::jsonb)
ON CONFLICT (key) DO NOTHING;

