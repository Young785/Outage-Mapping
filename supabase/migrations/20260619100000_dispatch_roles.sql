-- Technician field dispatch roles (Hunter / Seller / Installer / Finisher)
ALTER TABLE technicians
  ADD COLUMN IF NOT EXISTS dispatch_role TEXT NOT NULL DEFAULT 'hunter'
    CHECK (dispatch_role IN ('hunter', 'seller', 'installer', 'finisher'));

ALTER TABLE technicians
  ADD COLUMN IF NOT EXISTS installer_fallback TEXT NOT NULL DEFAULT 'hunter'
    CHECK (installer_fallback IN ('hunter', 'seller'));

COMMENT ON COLUMN technicians.dispatch_role IS 'Field role driving Route to Next eligibility';
COMMENT ON COLUMN technicians.installer_fallback IS 'When Installer has no sold-job targets, fall back to hunter or seller routing';
