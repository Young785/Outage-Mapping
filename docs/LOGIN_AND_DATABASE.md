# Login & Database Setup (Dev / Prod)

## Default login credentials (local dev seed)

After running `supabase/seed.sql` on your **local** database (password for all accounts: **`password123`**):

| Email | Role | Field dispatch role |
|-------|------|---------------------|
| `owner@outage-mapping.com` | owner | — |
| `admin@outage-mapping.com` | admin | — |
| `office@outage-mapping.com` | office | — |
| `tech@outage-mapping.com` | tech | Hunter (default) |
| `tech2@outage-mapping.com` | tech | Hunter |
| `tech3@outage-mapping.com` | tech | Hunter |
| `seller@outage-mapping.com` | tech | Seller |
| `installer@outage-mapping.com` | tech | Installer |
| `finisher@outage-mapping.com` | tech | Finisher |

Legacy shorthand (same password):

| Email | Password | Role |
|-------|----------|------|
| `admin@outage-mapping.com` | `password123` | admin |
| `office@outage-mapping.com` | `password123` | office |
| `tech@outage-mapping.com` | `password123` | tech |

**Seed command (local Postgres):**
```bash
# 1. Start local Supabase
supabase start

# 2. Apply migrations (SQL Editor at http://127.0.0.1:54323 or supabase db reset)

# 3. Load seed users
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/seed.sql
```

If login fails, you either have not run the seed or `.env.local` still points at production Supabase instead of local (`APP_ENV=development` + `SUPABASE_URL_DEV`).

---

## What is “Login”?

Login is **email + password** authentication against the `users` table in your database (via Supabase/Postgres). It is **not** Supabase Auth UI — the app uses its own auth API.

### Flow
1. Browser sends `POST /api/auth` with `{ action: "login", email, password }`.
2. Server looks up `users.email`, verifies `password_hash` (PBKDF2).
3. Server returns a **JWT token** (7-day expiry) and user profile `{ id, email, name, role }`.
4. Browser stores:
   - `fieldmap_token` — sent as `Authorization: Bearer …` on API calls
   - `fieldmap_user` — cached profile for the UI

### Register
- `action: "register"` with email, password, name, optional phone, role (`tech`, `office`, `admin`, `owner`).
- Field techs also get a `technicians` row automatically.

### Roles
| Role | Typical use |
|------|-------------|
| `tech` | Map investigations, limited admin |
| `office` | Dispatch, territories, admin panel |
| `admin` | Full settings |
| `owner` | Same as admin |

---

## Database: Postgres (not MySQL / phpMyAdmin)

This app uses **PostgreSQL** through **Supabase**.  
**phpMyAdmin** is for **MySQL** and will not connect to this database natively.

For a phpMyAdmin-like experience with Postgres, use:
- **Supabase Studio** (local: `http://127.0.0.1:54323` after `supabase start`)
- **pgAdmin** with `DATABASE_URL_DEV`

---

## Environment: Development vs Production

Copy `.env.example` → `.env.local` and set `APP_ENV`:

| APP_ENV | Active keys | Use case |
|---------|-------------|----------|
| `development` | `*_DEV` | Local machine, local Supabase |
| `production` | `*_PROD` | Deployed app, hosted Supabase |

Required per environment:
- `SUPABASE_URL_DEV` / `SUPABASE_URL_PROD`
- `SUPABASE_SERVICE_ROLE_KEY_DEV` / `SUPABASE_SERVICE_ROLE_KEY_PROD`
- `SUPABASE_ANON_KEY_DEV` / `SUPABASE_ANON_KEY_PROD`
- `JWT_SECRET_DEV` / `JWT_SECRET_PROD`
- `DATABASE_URL_DEV` / `DATABASE_URL_PROD` (for SQL tools / migrations)

The app reads credentials in `lib/env.ts` and connects in `lib/supabase.ts`.

---

## Local database setup (development)

### 1. Install Supabase CLI
```bash
npm install -g supabase
```

### 2. Start local stack
From project root:
```bash
supabase start
supabase status
```
Copy **API URL**, **anon key**, and **service_role key** into `.env.local` as `SUPABASE_URL_DEV`, etc.

### 3. Apply schema
Run SQL from `supabase/migrations/` in order:
- `20260426000001_initial_schema.sql`
- `20260528000100_dispatch_guardrails.sql`

Either:
- Paste into **Supabase Studio** → SQL Editor (local `http://127.0.0.1:54323`), or
- `supabase db reset` (applies migrations folder if linked)

### 4. Seed (optional)
```bash
# If seed.sql exists
psql "$(grep DATABASE_URL_DEV .env.local | cut -d= -f2-)" -f supabase/seed.sql
```

### 5. Run the app
```bash
APP_ENV=development npm run dev
```

### 6. Create first user
- Open app → **Create account** → pick **Admin** or **Office** for setup user.

---

## Production database

1. Create a project at [supabase.com](https://supabase.com).
2. Run the same migration SQL in the project **SQL Editor**.
3. Set in hosting (Vercel, etc.):
   ```
   APP_ENV=production
   SUPABASE_URL_PROD=...
   SUPABASE_SERVICE_ROLE_KEY_PROD=...
   SUPABASE_ANON_KEY_PROD=...
   JWT_SECRET_PROD=long-random-string
   ```
4. Never commit real `.env` files.

---

## Migrating from an existing remote DB to local

1. Export data from hosted Supabase (Table Editor → Export CSV, or `pg_dump` with connection string).
2. Start local Supabase (`supabase start`).
3. Apply migrations on local.
4. Import CSV via Studio or `psql` copy.
5. Point `.env.local` `APP_ENV=development` at local keys.
6. Log in with a user that exists in local `users` (or register fresh).

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| “Supabase not configured” | Set `SUPABASE_URL_DEV` + `SUPABASE_SERVICE_ROLE_KEY_DEV` and `APP_ENV=development` |
| Invalid email or password | User missing in `users` or wrong password hash |
| Map blank | Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` |
| phpMyAdmin won’t connect | Use Postgres tools (Studio/pgAdmin), not MySQL phpMyAdmin |
