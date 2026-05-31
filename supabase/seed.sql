-- Seed users for each role
-- Password for all users: password123

-- Delete existing users to allow fresh insert with correct hashes
DELETE FROM users WHERE email IN ('office@outage-mapping.com', 'tech@outage-mapping.com', 'admin@outage-mapping.com');

-- Office user
INSERT INTO users (email, name, password_hash, role, phone, created_at, last_login)
VALUES (
  'office@outage-mapping.com',
  'Office User',
  '2c17e8ab7c4b22d5b1ce93bf076951c5:e35f82d31f7c2611d0b9b01d650a9dd9c10f3f60f86753cf00b932881bb5dd8403290c5c792b656b89d3366fdea14b88d09117e5578ba1469d281c122b99dc02',
  'office',
  '+1234567890',
  NOW(),
  NOW()
) ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  phone = EXCLUDED.phone;

-- Tech user
INSERT INTO users (email, name, password_hash, role, phone, created_at, last_login)
VALUES (
  'tech@outage-mapping.com',
  'Tech User',
  '0c9f150abda3f41385a5fe9977fdefcb:69b9e8182c121ee5d52b092de2410529fca3013c5aa0a1cdcb32de478c319109b45e80e34e1b977a62e6488e8873dc924178059628e62b3edd67b93d188a1a7f',
  'tech',
  '+1234567891',
  NOW(),
  NOW()
) ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  phone = EXCLUDED.phone;

-- Admin user
INSERT INTO users (email, name, password_hash, role, phone, created_at, last_login)
VALUES (
  'admin@outage-mapping.com',
  'Admin User',
  'dd1a23e3e42484a4bdc0efc6d251cca2:606ad607f7e2ed9c469b8d5f6154382573e0dbfb4bc53974a67733cd5ef8913828f6098234d44afaee1156aaab07f84aafabd31ac99401ff7e8b7e347c5d2900',
  'admin',
  '+1234567892',
  NOW(),
  NOW()
) ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  phone = EXCLUDED.phone;

-- Create technician record for the tech user
INSERT INTO technicians (user_id, status, updated_at)
SELECT id, 'available', NOW()
FROM users
WHERE email = 'tech@outage-mapping.com'
AND NOT EXISTS (
  SELECT 1 FROM technicians WHERE user_id = (SELECT id FROM users WHERE email = 'tech@outage-mapping.com')
);
