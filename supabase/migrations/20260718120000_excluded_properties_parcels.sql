-- Permanent excluded properties + MetroGIS parcel land-use cache
-- Used for address-level exclusions and R1/R2/R3 residential targeting.

CREATE TABLE IF NOT EXISTS excluded_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT,
  address_key TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  radius_meters NUMERIC NOT NULL DEFAULT 30,
  county_pin TEXT,
  use_class TEXT,
  reason TEXT NOT NULL DEFAULT 'manual',
  source TEXT NOT NULL DEFAULT 'manual', -- manual | parcel_landuse | investigation
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_excluded_properties_active
  ON excluded_properties (is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_excluded_properties_address_key
  ON excluded_properties (address_key)
  WHERE address_key IS NOT NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_excluded_properties_pin
  ON excluded_properties (county_pin)
  WHERE county_pin IS NOT NULL AND is_active = true;

CREATE TABLE IF NOT EXISTS parcel_land_use_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lat_round NUMERIC(9, 5) NOT NULL,
  lng_round NUMERIC(9, 5) NOT NULL,
  county_pin TEXT,
  use_class1 TEXT,
  use_class2 TEXT,
  use_class3 TEXT,
  use_class4 TEXT,
  num_units INTEGER,
  dwell_type TEXT,
  street_address TEXT,
  is_target_residential BOOLEAN NOT NULL DEFAULT false,
  exclude_reason TEXT,
  raw_attrs JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lat_round, lng_round)
);

CREATE INDEX IF NOT EXISTS idx_parcel_cache_pin
  ON parcel_land_use_cache (county_pin)
  WHERE county_pin IS NOT NULL;

ALTER TABLE excluded_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcel_land_use_cache ENABLE ROW LEVEL SECURITY;

-- Feature flag (office can toggle in Admin → settings upsert)
INSERT INTO app_settings (key, value)
VALUES ('parcel_auto_exclude', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING; -- boolean JSON true
