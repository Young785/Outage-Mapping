-- V1 default: simple operational routing (nearest eligible + status priority)

UPDATE app_settings
SET value = '"simple"'::jsonb, updated_at = NOW()
WHERE key = 'routing_mode';

INSERT INTO app_settings (key, value)
VALUES ('routing_mode', '"simple"'::jsonb)
ON CONFLICT (key) DO NOTHING;
