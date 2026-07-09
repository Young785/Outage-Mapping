-- Customer email + photo attachments for office intake / map markers

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]';

ALTER TABLE outages ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE outages ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]';

COMMENT ON COLUMN jobs.customer_email IS 'Customer email from office intake';
COMMENT ON COLUMN jobs.photos IS 'Array of photo data URLs or storage URLs';
COMMENT ON COLUMN outages.customer_email IS 'Customer email mirrored from office job or investigation';
COMMENT ON COLUMN outages.photos IS 'Array of photo data URLs or storage URLs';
