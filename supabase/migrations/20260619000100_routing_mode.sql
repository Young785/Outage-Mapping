-- Platform routing mode toggle (complicated vs simple)

INSERT INTO app_settings (key, value) VALUES
  ('routing_mode', '"simple"'::jsonb)
ON CONFLICT (key) DO NOTHING;
