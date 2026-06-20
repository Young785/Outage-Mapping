-- Custom map marker color per technician (optional override of status color)
ALTER TABLE technicians
  ADD COLUMN IF NOT EXISTS map_color TEXT;

COMMENT ON COLUMN technicians.map_color IS 'Optional hex color for tech vehicle icon on live map';
