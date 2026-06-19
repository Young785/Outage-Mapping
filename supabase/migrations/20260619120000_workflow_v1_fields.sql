-- Workflow V1: no-contact flag on opportunities + manual queue ordering

ALTER TABLE outages
  ADD COLUMN IF NOT EXISTS no_contact_made BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN outages.no_contact_made IS 'Opportunity confirmed but no customer contact — high-priority Seller target (purple marker)';

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS sort_order INT;

CREATE INDEX IF NOT EXISTS idx_jobs_sort_order ON jobs(sort_order NULLS LAST);
