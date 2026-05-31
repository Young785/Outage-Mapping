-- Extended outage workflow statuses + office marker columns + owner role

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('office', 'tech', 'admin', 'owner'));

ALTER TABLE outages DROP CONSTRAINT IF EXISTS outages_status_check;
ALTER TABLE outages ADD CONSTRAINT outages_status_check CHECK (status IN (
  'unvisited', 'investigating', 'in_progress', 'resolved',
  'no_opportunity', 'opportunity', 'door_hanger', 'wants_to_proceed',
  'customer_thinking', 'sold', 'job_started', 'temp_power', 'grounding', 'completed'
));

ALTER TABLE outages ADD COLUMN IF NOT EXISTS lead_source TEXT;
ALTER TABLE outages ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE outages ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE outages ADD COLUMN IF NOT EXISTS assigned_tech_name TEXT;
ALTER TABLE outages ADD COLUMN IF NOT EXISTS office_notes TEXT;
ALTER TABLE outages ADD COLUMN IF NOT EXISTS external_job_status TEXT;

-- Allow storm-app marker sources (office / user / self-generated)
ALTER TABLE outages DROP CONSTRAINT IF EXISTS outages_source_check;
ALTER TABLE outages ADD CONSTRAINT outages_source_check CHECK (source IN (
  'xcel', 'connexus', 'user', 'manual', 'simulation', 'office', 'self_generated'
));
