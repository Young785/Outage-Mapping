-- Downtown Minneapolis should be an exclusion zone, not an assignable territory.
-- Fixes duplicate polygon row that was incorrectly typed as "territory".
UPDATE territories
SET geometry = jsonb_set(
  COALESCE(geometry, '{}'::jsonb),
  '{properties,zoneType}',
  '"exclusion"'::jsonb,
  true
)
WHERE lower(name) LIKE '%downtown%minneap%'
  AND COALESCE(geometry->'properties'->>'zoneType', 'territory') = 'territory';

-- Clear any tech assignments pointing at exclusion/priority zones.
UPDATE technicians t
SET territory_id = NULL,
    updated_at = NOW()
FROM territories z
WHERE t.territory_id = z.id
  AND COALESCE(z.geometry->'properties'->>'zoneType', 'territory') IN ('exclusion', 'priority');
