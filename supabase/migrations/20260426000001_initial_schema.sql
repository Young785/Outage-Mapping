-- ============================================================
-- Outage Field Map — Initial Schema Migration
-- Run this in your Supabase SQL Editor (Project > SQL Editor)
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TERRITORIES (must exist before users / technicians)
-- ============================================================
CREATE TABLE IF NOT EXISTS territories (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  type         TEXT        NOT NULL DEFAULT 'zip' CHECK (type IN ('polygon', 'zip')),
  geometry     JSONB,          -- GeoJSON polygon for type='polygon'
  zip_codes    TEXT[],         -- array of zip codes for type='zip'
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        UNIQUE NOT NULL,
  name          TEXT        NOT NULL,
  phone         TEXT,
  password_hash TEXT        NOT NULL,   -- PBKDF2-SHA512: "salt:hash"
  role          TEXT        NOT NULL DEFAULT 'tech'
                              CHECK (role IN ('office', 'tech', 'admin')),
  territory_id  UUID        REFERENCES territories(id),
  is_active     BOOLEAN     DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_login    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role     ON users(role);

-- ============================================================
-- TECHNICIANS  (live status + GPS)
-- ============================================================
CREATE TABLE IF NOT EXISTS technicians (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT        NOT NULL DEFAULT 'available'
                              CHECK (status IN ('available', 'working', 'paused', 'offline')),
  current_lat   FLOAT,
  current_lng   FLOAT,
  territory_id  UUID        REFERENCES territories(id),
  current_job_id UUID,           -- FK added after jobs table via ALTER
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tech_user_id ON technicians(user_id);
CREATE INDEX IF NOT EXISTS idx_tech_status  ON technicians(status);

-- ============================================================
-- OUTAGE SNAPSHOTS  (raw + normalized for audit / replay)
-- ============================================================
CREATE TABLE IF NOT EXISTS outage_snapshots (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source           TEXT        NOT NULL CHECK (source IN ('xcel', 'connexus', 'manual', 'simulation')),
  raw_data         JSONB       NOT NULL,
  normalized_count INT         DEFAULT 0,
  error            TEXT,
  fetched_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- OUTAGES  (working state — upserted on every fetch)
-- ============================================================
CREATE TABLE IF NOT EXISTS outages (
  id               TEXT        PRIMARY KEY,   -- ArcGIS OBJECTID or UUID
  source           TEXT        NOT NULL DEFAULT 'xcel'
                                 CHECK (source IN ('xcel', 'connexus', 'user', 'manual', 'simulation')),
  lat              FLOAT       NOT NULL,
  lng              FLOAT       NOT NULL,
  street_address   TEXT,
  city             TEXT,
  county           TEXT,
  state            TEXT,
  zip_code         TEXT,
  customers        INT         DEFAULT 0,
  outage_type      TEXT        DEFAULT 'Known Electric Outage',
  cause            TEXT,
  etr              TEXT,
  crew_status      TEXT,
  outage_impact    TEXT,
  -- workflow status
  status           TEXT        NOT NULL DEFAULT 'unvisited'
                                 CHECK (status IN ('unvisited', 'investigating', 'in_progress', 'resolved')),
  priority_score   FLOAT       DEFAULT 0,
  snapshot_id      UUID        REFERENCES outage_snapshots(id),
  first_seen_at    TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at  TIMESTAMPTZ DEFAULT NOW(),
  is_active        BOOLEAN     DEFAULT TRUE,
  is_simulation    BOOLEAN     DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_outages_lat_lng    ON outages(lat, lng);
CREATE INDEX IF NOT EXISTS idx_outages_status     ON outages(status);
CREATE INDEX IF NOT EXISTS idx_outages_source     ON outages(source);
CREATE INDEX IF NOT EXISTS idx_outages_is_active  ON outages(is_active);
CREATE INDEX IF NOT EXISTS idx_outages_score      ON outages(priority_score DESC);

-- ============================================================
-- INVESTIGATIONS  (field form per outage visit)
-- ============================================================
CREATE TABLE IF NOT EXISTS investigations (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  outage_id           TEXT        REFERENCES outages(id),
  tech_id             UUID        REFERENCES users(id),
  fault_type          TEXT,       -- e.g. 'transformer', 'line_down', 'underground'
  cause_confirmed     TEXT,       -- confirmed cause
  damage_description  TEXT,
  photos              JSONB       DEFAULT '[]',   -- array of base64 or URL strings
  action_taken        TEXT,
  notes               TEXT,
  visited_at          TIMESTAMPTZ DEFAULT NOW(),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_investigations_outage ON investigations(outage_id);
CREATE INDEX IF NOT EXISTS idx_investigations_tech   ON investigations(tech_id);

-- ============================================================
-- JOBS  (office-created + outage-derived unified queue)
-- ============================================================
CREATE TABLE IF NOT EXISTS jobs (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source                  TEXT        NOT NULL DEFAULT 'office'
                                        CHECK (source IN ('office', 'outage')),
  outage_id               TEXT        REFERENCES outages(id),
  customer_name           TEXT,
  customer_address        TEXT,
  customer_phone          TEXT,
  customer_lat            FLOAT,
  customer_lng            FLOAT,
  job_type                TEXT,       -- e.g. 'repair', 'inspection', 'storm_response'
  priority                INT         DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  notes                   TEXT,
  status                  TEXT        NOT NULL DEFAULT 'pending'
                                        CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'cancelled')),
  assigned_tech_id        UUID        REFERENCES users(id),
  priority_score          FLOAT       DEFAULT 0,
  is_confirmed_opportunity BOOLEAN    DEFAULT FALSE,
  created_by              UUID        REFERENCES users(id),
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  is_simulation           BOOLEAN     DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_jobs_status       ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_tech         ON jobs(assigned_tech_id);
CREATE INDEX IF NOT EXISTS idx_jobs_score        ON jobs(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_outage       ON jobs(outage_id);

-- Add FK from technicians.current_job_id now that jobs exists
ALTER TABLE technicians
  ADD CONSTRAINT fk_tech_current_job
  FOREIGN KEY (current_job_id) REFERENCES jobs(id);

-- ============================================================
-- GEOCODE CACHE
-- ============================================================
CREATE TABLE IF NOT EXISTS geocode_cache (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lat_key           TEXT        NOT NULL,   -- rounded to 4 decimal places
  lng_key           TEXT        NOT NULL,
  formatted_address TEXT        NOT NULL,
  city              TEXT,
  county            TEXT,
  state             TEXT,
  postal_code       TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lat_key, lng_key)
);

CREATE INDEX IF NOT EXISTS idx_geocode_keys ON geocode_cache(lat_key, lng_key);

-- ============================================================
-- PRIORITY WEIGHTS  (admin-configurable scoring)
-- ============================================================
CREATE TABLE IF NOT EXISTS priority_weights (
  id                           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  customers_multiplier         FLOAT   DEFAULT 1.0,
  urgency_multiplier           FLOAT   DEFAULT 1.5,
  office_job_bonus             FLOAT   DEFAULT 50.0,
  density_bonus                FLOAT   DEFAULT 20.0,
  time_weight                  FLOAT   DEFAULT 0.1,
  confirmed_opportunity_bonus  FLOAT   DEFAULT 100.0,
  updated_by                   UUID    REFERENCES users(id),
  updated_at                   TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default weights (only if table is empty)
INSERT INTO priority_weights (
  customers_multiplier, urgency_multiplier, office_job_bonus,
  density_bonus, time_weight, confirmed_opportunity_bonus
)
SELECT 1.0, 1.5, 50.0, 20.0, 0.1, 100.0
WHERE NOT EXISTS (SELECT 1 FROM priority_weights);

-- ============================================================
-- APP SETTINGS  (key/value store for global toggles)
-- ============================================================
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT    PRIMARY KEY,
  value      JSONB   NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO app_settings (key, value) VALUES
  ('simulation_mode',          'false'::jsonb),
  ('active_sources',           '["xcel"]'::jsonb),
  ('fetch_interval_minutes',   '15'::jsonb),
  ('connexus_enabled',         'false'::jsonb),
  ('storm_phase',              '"phase_1"'::jsonb),
  ('temp_out_mode',            'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- TEST SCENARIOS  (storm simulation presets)
-- ============================================================
CREATE TABLE IF NOT EXISTS test_scenarios (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT    NOT NULL DEFAULT 'Default Storm Simulation',
  outages    JSONB   NOT NULL DEFAULT '[]',
  techs      JSONB   NOT NULL DEFAULT '[]',
  jobs       JSONB   NOT NULL DEFAULT '[]',
  is_active  BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert a default storm simulation scenario
INSERT INTO test_scenarios (name, outages, techs, jobs) VALUES (
  'Minneapolis Metro Storm',
  '[
    {"id":"sim-1","lat":44.9778,"lng":-93.265,"city":"Minneapolis","county":"Hennepin","customers":450,"cause":"Storm damage","status":"unvisited"},
    {"id":"sim-2","lat":44.9537,"lng":-93.090,"city":"St. Paul","county":"Ramsey","customers":320,"cause":"Equipment failure","status":"unvisited"},
    {"id":"sim-3","lat":44.8500,"lng":-93.470,"city":"Eden Prairie","county":"Hennepin","customers":180,"cause":"Tree contact","status":"unvisited"},
    {"id":"sim-4","lat":45.0100,"lng":-93.300,"city":"Brooklyn Park","county":"Hennepin","customers":620,"cause":"Storm damage","status":"unvisited"},
    {"id":"sim-5","lat":44.9200,"lng":-93.400,"city":"Edina","county":"Hennepin","customers":280,"cause":"Wire down","status":"unvisited"},
    {"id":"sim-6","lat":44.9800,"lng":-93.180,"city":"NE Minneapolis","county":"Hennepin","customers":150,"cause":"Transformer issue","status":"unvisited"},
    {"id":"sim-7","lat":45.0500,"lng":-93.150,"city":"Columbia Heights","county":"Anoka","customers":390,"cause":"Storm damage","status":"unvisited"},
    {"id":"sim-8","lat":44.8000,"lng":-93.350,"city":"Bloomington","county":"Hennepin","customers":520,"cause":"Equipment failure","status":"unvisited"}
  ]'::jsonb,
  '[
    {"id":"simtech-1","name":"Tech A","lat":44.9700,"lng":-93.300,"status":"available"},
    {"id":"simtech-2","name":"Tech B","lat":44.9200,"lng":-93.100,"status":"available"},
    {"id":"simtech-3","name":"Tech C","lat":45.0200,"lng":-93.250,"status":"working"}
  ]'::jsonb,
  '[
    {"id":"simjob-1","customer_name":"Smith Residence","customer_address":"123 Elm St, Minneapolis, MN","job_type":"repair","priority":8},
    {"id":"simjob-2","customer_name":"Oak Street Apt","customer_address":"456 Oak Ave, St Paul, MN","job_type":"inspection","priority":5},
    {"id":"simjob-3","customer_name":"City Hall","customer_address":"350 S 5th St, Minneapolis, MN","job_type":"storm_response","priority":10}
  ]'::jsonb
) ON CONFLICT DO NOTHING;

-- ============================================================
-- ROW LEVEL SECURITY
-- All reads/writes go through the service role key on the
-- server side, so we disable public access but allow service role.
-- ============================================================
ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE technicians        ENABLE ROW LEVEL SECURITY;
ALTER TABLE outages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE outage_snapshots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE investigations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE territories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE geocode_cache      ENABLE ROW LEVEL SECURITY;
ALTER TABLE priority_weights   ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_scenarios     ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically. No extra policies needed.
-- If you want anon reads on some tables, add policies here:
-- CREATE POLICY "public read outages" ON outages FOR SELECT USING (true);
